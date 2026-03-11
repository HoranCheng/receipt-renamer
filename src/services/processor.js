/**
 * Background inbox processor
 * Processes files from Google Drive inbox: AI recognition → rename → move → Sheets.
 * Supports both batch processing (scan inbox) and single-file processing (after upload).
 */
import {
  findOrCreateFolder,
  listFilesInFolder,
  getFileAsBase64,
  renameAndMoveFile,
  updateFileMetadata,
  appendToSheet,
  createReceiptSheet,
} from './google';
import { analyzeReceipt } from './ai';
import { removeCachedImage } from './imageCache';
import { store, load } from './storage';
import { buildReceiptName } from '../utils/naming';

// Callback to update config from processor (e.g. when auto-creating sheet)
let _configCallback = null;
export function setConfigCallback(fn) { _configCallback = fn; }

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

// ─── Sheets failure outbox (retry later) ──────────────────────────────────────

function _getOutboxKey() {
  try {
    const userId = localStorage.getItem('rr-current-user');
    return userId ? `rr-sheets-outbox::${userId}` : 'rr-sheets-outbox';
  } catch { return 'rr-sheets-outbox'; }
}

function _logSheetFailure(fileId, row, sheetId, sheetName) {
  try {
    const key = _getOutboxKey();
    const outbox = JSON.parse(localStorage.getItem(key) || '[]');
    outbox.push({
      fileId, row, sheetId, sheetName: sheetName || 'receipt_index',
      failedAt: new Date().toISOString(),
      retries: 0,
    });
    localStorage.setItem(key, JSON.stringify(outbox));
    console.warn('Sheets write logged to outbox for retry:', fileId);
  } catch {}
}

/** Retry any failed Sheets writes from the outbox */
export async function retrySheetOutbox() {
  try {
    const key = _getOutboxKey();
    const outbox = JSON.parse(localStorage.getItem(key) || '[]');
    if (!outbox.length) return;
    const remaining = [];
    for (const item of outbox) {
      try {
        await appendToSheet(item.sheetId, item.sheetName || 'receipt_index', item.row);
        // Success — don't add to remaining
      } catch {
        item.retries = (item.retries || 0) + 1;
        if (item.retries < 10) remaining.push(item); // Give up after 10 total attempts
      }
    }
    localStorage.setItem(key, JSON.stringify(remaining));
  } catch {}
}

// ─── Processing state ─────────────────────────────────────────────────────────

// Global processing queue and state
let _queue = []; // files waiting to be processed
let _running = false;
let _statusCallback = null;
let _receiptCallback = null;
let _configRef = null;

// Accumulated stats for UI
let _stats = { processing: false, total: 0, done: 0, failed: 0, review: 0 };

function _notifyStatus() {
  _statusCallback?.({ ..._stats });
  // Persist progress for state recovery (T-018) — user-scoped
  store('rr-proc-progress', { ..._stats, updatedAt: Date.now() }).catch(() => {});
}

function _clearPersistedProgress() {
  store('rr-proc-progress', null).catch(() => {});
}

export function isProcessing() {
  return _running;
}

/** Get saved progress from last session (for T-018 state recovery) */
export async function getSavedProgress() {
  try {
    const data = await load('rr-proc-progress', null);
    if (data?.processing) return data;
    return null;
  } catch { return null; }
}

// ─── Core: process a single file ──────────────────────────────────────────────

async function _processOneFile(file, config, inboxId, validId, reviewId) {
  try {
    const base64 = await getFileAsBase64(file.id, file.mimeType);
    const mt = file.mimeType.includes('pdf') ? 'application/pdf'
      : file.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
    const data = await analyzeReceipt(base64, mt, file.mimeType.includes('pdf') ? 'pdf' : 'image');

    // Not a receipt → move to review with alert
    if (data.is_receipt === false) {
      await renameAndMoveFile(file.id, file.name, reviewId, inboxId);
      await updateFileMetadata(file.id, {
        description: JSON.stringify({
          reviewStatus: 'not_receipt',
          reviewReason: '可能不是小票',
          originalName: file.name,
          processedAt: new Date().toISOString(),
        }),
      });
      try {
        const existing = await load('rr-non-receipt-alerts', []);
        if (!existing.find(a => a.fileId === file.id)) {
          existing.push({
            fileId: file.id,
            fileName: file.name,
            driveLink: `https://drive.google.com/file/d/${file.id}/view`,
            detectedAt: Date.now(),
          });
          await store('rr-non-receipt-alerts', existing);
        }
      } catch {}
      return { success: false, reason: 'not_receipt' };
    }

    const confidence = data.confidence || 0;
    const ext = file.name.split('.').pop() || 'jpg';
    const newName = buildReceiptName(data, ext);

    const receiptRecord = {
      id: file.id,
      date: data.date,
      merchant: data.merchant,
      category: data.category,
      amount: data.amount,
      currency: data.currency || 'AUD',
      confidence,
      originalName: file.name,
      newName,
      driveId: file.id,
      driveLink: `https://drive.google.com/file/d/${file.id}/view`,
      status: confidence >= 70 ? 'validated' : 'review',
      createdAt: new Date().toISOString(),
    };

    if (confidence >= 70) {
      // High confidence → validated
      await renameAndMoveFile(file.id, newName, validId, inboxId);
      removeCachedImage(file.id).catch(() => {});
      // T-016: Auto-write to Sheets with retry + failure logging
      // Auto-create sheet if not yet configured
      if (!config.sheetId) {
        try {
          const newSheetId = await createReceiptSheet('receipt_index');
          config.sheetId = newSheetId;
          config.sheetName = 'receipt_index';
          // Notify App to persist this config change
          _configCallback?.({ sheetId: newSheetId, sheetName: 'receipt_index' });
          console.info('Auto-created receipt_index sheet:', newSheetId);
        } catch (e) {
          console.warn('Auto-create sheet failed:', e);
        }
      }
      if (config.sheetId) {
        const sheetRow = [
          data.date, data.merchant, data.category, data.amount, data.currency || 'AUD', receiptRecord.driveLink,
        ];
        let sheetOk = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await appendToSheet(config.sheetId, config.sheetName || 'receipt_index', sheetRow);
            sheetOk = true;
            break;
          } catch (e) {
            console.warn(`Sheets write attempt ${attempt + 1} failed:`, e);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
        if (!sheetOk) {
          receiptRecord.sheetSyncFailed = true;
          // Log failure for later investigation + outbox retry
          _logSheetFailure(file.id, sheetRow, config.sheetId, config.sheetName);
        }
      }
    } else {
      // Low confidence → review
      const reviewReason = confidence < 40 ? '置信度极低' : `置信度偏低 (${confidence}%)`;
      receiptRecord.reviewReason = reviewReason;
      await renameAndMoveFile(file.id, newName, reviewId, inboxId);
      await updateFileMetadata(file.id, {
        description: JSON.stringify({
          ...data, reviewReason, reviewStatus: 'pending',
          originalName: file.name, processedAt: receiptRecord.createdAt,
        }),
      });
    }

    try { _receiptCallback?.(receiptRecord); } catch (e) { console.warn('onReceiptProcessed error:', e); }
    return { success: true, receipt: receiptRecord };
  } catch (e) {
    console.warn(`Failed to process ${file.name}:`, e);
    return { success: false, reason: 'error', error: e.message };
  }
}

// ─── Queue runner ─────────────────────────────────────────────────────────────

async function _runQueue() {
  if (_running) return;
  _running = true;
  _stats.processing = true;
  _notifyStatus();

  const config = _configRef;
  const inboxFolder = config?.inboxFolder || '小票待处理';
  const validatedFolder = config?.validatedFolder || '小票已存档';
  const reviewFolder = config?.reviewFolder || '小票待确认';

  let inboxId, validId, reviewId;
  try {
    [inboxId, validId, reviewId] = await Promise.all([
      findOrCreateFolder(inboxFolder),
      findOrCreateFolder(validatedFolder),
      findOrCreateFolder(reviewFolder),
    ]);
  } catch (e) {
    console.warn('Failed to resolve folders:', e);
    _stats.processing = false;
    _running = false;
    _notifyStatus();
    return;
  }

  while (_queue.length > 0) {
    const file = _queue.shift();
    const result = await _processOneFile(file, config, inboxId, validId, reviewId);

    if (result.success) {
      _stats.done++;
      if (result.receipt?.status === 'review') _stats.review++;
    } else {
      _stats.failed++;
    }
    _notifyStatus();

    // Small delay between files to avoid rate limits
    if (_queue.length > 0) await new Promise(r => setTimeout(r, 600));
  }

  _stats.processing = false;
  _running = false;
  _notifyStatus();
  _clearPersistedProgress();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a single file for AI processing (called immediately after upload).
 * T-015: enables parallel upload + recognition.
 */
export function enqueueFile(file, config, onStatusChange, onReceiptProcessed) {
  _configRef = config;
  _statusCallback = onStatusChange;
  _receiptCallback = onReceiptProcessed;

  _stats.total++;
  _queue.push(file);
  _notifyStatus();

  // Start processing if not already running
  if (!_running) _runQueue();
}

/**
 * Process all files in the inbox folder (batch mode).
 * Used when clicking "sync from Drive" or on app resume.
 */
export async function processInboxBackground(config, onStatusChange, onReceiptProcessed) {
  _configRef = config;
  _statusCallback = onStatusChange;
  _receiptCallback = onReceiptProcessed;

  if (_running) return; // already processing

  try {
    const inboxFolder = config.inboxFolder || '小票待处理';
    const inboxId = await findOrCreateFolder(inboxFolder);
    const { files } = await listFilesInFolder(inboxId);

    if (!files.length) {
      onStatusChange?.({ processing: false, total: 0, done: 0, failed: 0, review: 0 });
      return;
    }

    // Reset stats for this batch
    _stats = { processing: true, total: files.length, done: 0, failed: 0, review: 0 };
    _notifyStatus();

    // Add all files to queue
    _queue.push(...files);
    _runQueue();
  } catch (e) {
    console.warn('Inbox processing error:', e);
    onStatusChange?.({ processing: false, error: e.message });
  }
}

/** Reset processing stats (e.g. after user dismisses) */
export function resetProcessingStats() {
  _stats = { processing: false, total: 0, done: 0, failed: 0, review: 0 };
  _clearPersistedProgress();
}
