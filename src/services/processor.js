/**
 * Background inbox processor
 * Polls Google Drive inbox, runs AI, moves files to validated/review.
 */
import {
  findOrCreateFolder,
  listFilesInFolder,
  getFileAsBase64,
  renameAndMoveFile,
  updateFileMetadata,
  appendToSheet,
} from './google';
import { analyzeReceipt } from './ai';
import { removeCachedImage } from './imageCache';

// Title-case a string: "WOOLWORTHS METRO" → "Woolworths Metro"
function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Format date: "2026-02-27" → "2026.02.27"
function fmtDate(d) {
  return (d || 'unknown-date').replace(/-/g, '.');
}

// Safe filename segment (remove illegal chars)
function safeName(s) {
  return s.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

let _processing = false;
let _pendingTrigger = null; // holds { config, onStatusChange, onReceiptProcessed } if a re-run is needed

export function isProcessing() {
  return _processing;
}

/**
 * Process all files in the inbox folder.
 * Fires-and-forgets — call without await.
 * @param {object} config - app config
 * @param {function} onStatusChange - (status: {processing, done, failed, total}) => void
 * @param {function} [onReceiptProcessed] - called with each processed receipt object
 */
export async function processInboxBackground(config, onStatusChange, onReceiptProcessed) {
  if (_processing) {
    // Queue a re-run after current processing finishes
    _pendingTrigger = { config, onStatusChange, onReceiptProcessed };
    return;
  }
  _processing = true;
  onStatusChange?.({ processing: true, current: 0, total: 0, done: 0, failed: 0 });

  try {
    const inboxFolder = config.inboxFolder || '00_inbox';
    const validatedFolder = config.validatedFolder || '10_validated';
    const reviewFolder = config.reviewFolder || '20_review_needed';

    const [inboxId, validId, reviewId] = await Promise.all([
      findOrCreateFolder(inboxFolder),
      findOrCreateFolder(validatedFolder),
      findOrCreateFolder(reviewFolder),
    ]);

    const { files } = await listFilesInFolder(inboxId);
    if (!files.length) {
      onStatusChange?.({ processing: false, current: 0, total: 0, done: 0, failed: 0 });
      _processing = false;
      return;
    }

    let done = 0, failed = 0;
    onStatusChange?.({ processing: true, current: 0, total: files.length, done: 0, failed: 0 });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onStatusChange?.({ processing: true, current: i + 1, total: files.length, done, failed });

      try {
        const base64 = await getFileAsBase64(file.id, file.mimeType);
        const mt = file.mimeType.includes('pdf') ? 'application/pdf'
          : file.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        const data = await analyzeReceipt(base64, mt, file.mimeType.includes('pdf') ? 'pdf' : 'image');

        // Check if it's actually a receipt — queue an in-app alert, move to review
        if (data.is_receipt === false) {
          // Move out of inbox so it won't be re-processed
          await renameAndMoveFile(file.id, file.name, reviewId, inboxId);
          await updateFileMetadata(file.id, {
            description: JSON.stringify({
              reviewStatus: 'not_receipt',
              reviewReason: '可能不是小票',
              originalName: file.name,
              processedAt: new Date().toISOString(),
            }),
          });
          // Store a persistent alert in localStorage so the user sees a prompt
          try {
            const key = 'rr-non-receipt-alerts';
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            // Avoid duplicates
            if (!existing.find(a => a.fileId === file.id)) {
              existing.push({
                fileId: file.id,
                fileName: file.name,
                driveLink: `https://drive.google.com/file/d/${file.id}/view`,
                detectedAt: Date.now(),
              });
              localStorage.setItem(key, JSON.stringify(existing));
            }
          } catch {}
          failed++;
          continue;
        }

        const confidence = data.confidence || 0;
        const ext = file.name.split('.').pop() || 'jpg';
        const safeDate = fmtDate(data.date);
        const safeCategory = safeName(data.category || 'Other');
        const safeAmount = parseFloat(data.amount || 0).toFixed(2);

        // Build receipt record for local storage
        const receiptRecord = {
          id: file.id,
          date: data.date,
          merchant: data.merchant,
          category: data.category,
          amount: data.amount,
          currency: data.currency || 'AUD',
          confidence,
          originalName: file.name,
          newName: '',
          driveId: file.id,
          driveLink: `https://drive.google.com/file/d/${file.id}/view`,
          status: confidence >= 70 ? 'validated' : 'review',
          createdAt: new Date().toISOString(),
        };

        if (confidence >= 70) {
          // High confidence → validated folder
          const newName = `${safeDate} ${safeCategory} ${safeAmount}.${ext}`;
          receiptRecord.newName = newName;
          await renameAndMoveFile(file.id, newName, validId, inboxId);
          // Clean local image cache — no longer needed for approved files
          removeCachedImage(file.id).catch(() => {});
          // Write to sheet
          if (config.sheetId) {
            try {
              await appendToSheet(config.sheetId, config.sheetName || 'receipt_index', [
                data.date, data.merchant, data.category, data.amount, data.currency || 'AUD', receiptRecord.driveLink,
              ]);
            } catch (e) {
              console.warn('Sheets sync failed:', e);
            }
          }
          done++;
        } else {
          // Low confidence → review folder
          const newName = `${safeDate} ${safeCategory} ${safeAmount}.${ext}`;
          receiptRecord.newName = newName;
          await renameAndMoveFile(file.id, newName, reviewId, inboxId);
          const reviewReason = confidence < 40 ? '置信度极低' : `置信度偏低 (${confidence}%)`;
          receiptRecord.reviewReason = reviewReason;
          await updateFileMetadata(file.id, {
            description: JSON.stringify({
              ...data, reviewReason, reviewStatus: 'pending',
              originalName: file.name, processedAt: receiptRecord.createdAt,
            }),
          });
          done++;
        }

        // Notify App to save receipt locally
        try { onReceiptProcessed?.(receiptRecord); } catch (e) { console.warn('onReceiptProcessed error:', e); }
      } catch (e) {
        console.warn(`Failed to process ${file.name}:`, e);
        failed++;
      }

      // Small delay between files to avoid rate limits
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    onStatusChange?.({ processing: false, current: files.length, total: files.length, done, failed });
  } catch (e) {
    console.warn('Inbox processing error:', e);
    onStatusChange?.({ processing: false, error: e.message });
  } finally {
    _processing = false;
    // If another upload arrived while we were busy, process again
    if (_pendingTrigger) {
      const pending = _pendingTrigger;
      _pendingTrigger = null;
      setTimeout(() => processInboxBackground(pending.config, pending.onStatusChange, pending.onReceiptProcessed), 500);
    }
  }
}
