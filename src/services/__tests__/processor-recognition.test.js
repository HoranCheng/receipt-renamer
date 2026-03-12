/**
 * processor-recognition.test.js
 *
 * Comprehensive tests for the receipt recognition logic in processor.js.
 *
 * Covers:
 *  - Clear receipt, high confidence  → auto-validated
 *  - Faded/blurry receipt            → review (medium confidence)
 *  - Confidence thresholds: ≥70 validated, 40–69 review, <40 review+warning
 *  - False negative (AI says not_receipt but has data) → overridden to review
 *  - True negative (not a receipt, no data) → not_receipt
 *  - PDF invoices, foreign language, handwritten receipts
 *  - reviewReason preserved from override (bug fix regression)
 *  - $0 amount treated as real data (amount=0 falsy-check bug regression)
 *  - AI error / network failure → success:false, reason:'error'
 *  - Sheets retry + outbox logging on persistent write failure
 *  - Confidence boundary values (39, 40, 69, 70)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  processInboxBackground,
  enqueueFile,
  resetProcessingStats,
} from '../processor';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../google', () => ({
  findOrCreateFolder: vi.fn(name => Promise.resolve(`${name}-id`)),
  listFilesInFolder:  vi.fn(() => Promise.resolve({ files: [] })),
  getFileAsBase64:    vi.fn(() => Promise.resolve('base64data==')),
  renameAndMoveFile:  vi.fn(() => Promise.resolve()),
  updateFileMetadata: vi.fn(() => Promise.resolve()),
  appendToSheet:      vi.fn(() => Promise.resolve()),
  createReceiptSheet: vi.fn(() => Promise.resolve('auto-sheet-id')),
}));

vi.mock('../ai', () => ({
  analyzeReceipt: vi.fn(),
}));

vi.mock('../imageCache', () => ({
  removeCachedImage: vi.fn(() => Promise.resolve()),
}));

vi.mock('../storage', () => ({
  store: vi.fn(() => Promise.resolve()),
  load:  vi.fn(() => Promise.resolve([])),
}));

// ─── Import mocked modules so we can configure them per test ──────────────────

import {
  findOrCreateFolder,
  listFilesInFolder,
  getFileAsBase64,
  renameAndMoveFile,
  updateFileMetadata,
  appendToSheet,
  createReceiptSheet,
} from '../google';

import { analyzeReceipt } from '../ai';
import { store, load } from '../storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Folder IDs produced by the mock (name → `${name}-id`) */
const FOLDER = {
  inbox:     '小票待处理-id',
  validated: '小票已存档-id',
  review:    '小票待确认-id',
};

const DEFAULT_CONFIG = {
  inboxFolder:     '小票待处理',
  validatedFolder: '小票已存档',
  reviewFolder:    '小票待确认',
  sheetId:         'sheet-123',
  sheetName:       'receipt_index',
};

/**
 * Build a fake Drive file object.
 * @param {object} overrides
 * @returns {{ id: string, name: string, mimeType: string }}
 */
function makeFile(overrides = {}) {
  return {
    id:       'file-001',
    name:     'IMG_0001.jpg',
    mimeType: 'image/jpeg',
    ...overrides,
  };
}

/**
 * Run processInboxBackground with a controlled list of files.
 * Returns a promise that resolves to the final status object when done.
 *
 * @param {object[]} files      Files to inject as inbox contents.
 * @param {object}   config     Processor config (defaults to DEFAULT_CONFIG).
 * @param {Function} onReceipt  Optional callback for processed receipts.
 */
function runWithFiles(files, config = DEFAULT_CONFIG, onReceipt = vi.fn()) {
  listFilesInFolder.mockResolvedValue({ files });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Test timeout: processing did not finish')),
      5000,
    );

    const onStatus = vi.fn(status => {
      if (!status.processing) {
        clearTimeout(timeout);
        resolve({ status, onStatus, onReceipt });
      }
    });

    processInboxBackground(config, onStatus, onReceipt);
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  resetProcessingStats();
  localStorage.clear();

  // Re-apply default mock implementations after clearAllMocks()
  findOrCreateFolder.mockImplementation(name => Promise.resolve(`${name}-id`));
  listFilesInFolder.mockResolvedValue({ files: [] });
  getFileAsBase64.mockResolvedValue('base64data==');
  renameAndMoveFile.mockResolvedValue();
  updateFileMetadata.mockResolvedValue();
  appendToSheet.mockResolvedValue();
  createReceiptSheet.mockResolvedValue('auto-sheet-id');
  store.mockResolvedValue();
  load.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Receipt recognition — high confidence (≥70) → auto-validated', () => {
  it('moves file to validated folder and calls appendToSheet', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true,
      date:       '2026-03-10',
      merchant:   'Woolworths',
      amount:     45.5,
      currency:   'AUD',
      category:   'Grocery',
      items:      ['milk', 'bread'],
      confidence: 85,
    });

    const file = makeFile();
    const onReceipt = vi.fn();
    await runWithFiles([file], DEFAULT_CONFIG, onReceipt);

    // Should be renamed and moved to the validated folder
    expect(renameAndMoveFile).toHaveBeenCalledWith(
      file.id,
      '2026.03.10 Woolworths 45.50.jpg',
      FOLDER.validated,
      FOLDER.inbox,
    );

    // Should NOT touch the review folder
    expect(renameAndMoveFile).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), FOLDER.review, expect.anything(),
    );

    // Receipt record should be validated
    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'validated', confidence: 85 }),
    );

    // Sheet row should be appended
    expect(appendToSheet).toHaveBeenCalledWith(
      'sheet-123',
      'receipt_index',
      expect.arrayContaining(['2026-03-10', 'Woolworths', 'Grocery', 45.5]),
    );
  });

  it('uses confidence exactly 70 as validated (boundary)', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'Coles',
      amount: 22.00, currency: 'AUD', category: 'Grocery',
      items: [], confidence: 70,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), FOLDER.validated, FOLDER.inbox,
    );
    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'validated' }),
    );
  });
});

describe('Receipt recognition — medium confidence (40–69) → review', () => {
  it('sends faded/blurry receipt to review folder, not validated', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true,
      date:       '2026-02-15',
      merchant:   'Coles',
      amount:     18.9,
      currency:   'AUD',
      category:   'Grocery',
      items:      [],
      confidence: 55,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), FOLDER.review, FOLDER.inbox,
    );
    expect(renameAndMoveFile).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), FOLDER.validated, expect.anything(),
    );

    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review', confidence: 55 }),
    );
    // Should NOT auto-write to sheets (not validated)
    expect(appendToSheet).not.toHaveBeenCalled();
  });

  it('sets reviewReason mentioning low confidence (40–69)', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-01', merchant: 'IGA',
      amount: 7.5, currency: 'AUD', category: 'Grocery',
      items: [], confidence: 60,
    });

    await runWithFiles([makeFile()]);

    const metaCall = updateFileMetadata.mock.calls[0];
    const desc = JSON.parse(metaCall[1].description);
    expect(desc.reviewReason).toMatch(/偏低/);
    expect(desc.reviewStatus).toBe('pending');
  });

  it('uses confidence 69 as review (boundary — just below 70)', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'Aldi',
      amount: 33.00, currency: 'AUD', category: 'Grocery',
      items: [], confidence: 69,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), FOLDER.review, FOLDER.inbox,
    );
    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review' }),
    );
  });
});

describe('Receipt recognition — very low confidence (<40) → review with warning', () => {
  it('flags confidence <40 with "极低" warning in metadata', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-01-05', merchant: 'Unknown Merchant',
      amount: 5.0, currency: 'AUD', category: 'Other',
      items: [], confidence: 25,
    });

    await runWithFiles([makeFile()]);

    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), FOLDER.review, FOLDER.inbox,
    );

    const metaCall = updateFileMetadata.mock.calls[0];
    const desc = JSON.parse(metaCall[1].description);
    expect(desc.reviewReason).toBe('置信度极低');
  });

  it('uses confidence exactly 39 as the "极低" boundary', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, merchant: 'Cafe', amount: 4.5,
      date: '2026-03-05', category: 'Dining', items: [], confidence: 39,
    });

    await runWithFiles([makeFile()]);

    const desc = JSON.parse(updateFileMetadata.mock.calls[0][1].description);
    expect(desc.reviewReason).toBe('置信度极低');
  });

  it('uses confidence exactly 40 as NOT "极低" (boundary)', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, merchant: 'Cafe', amount: 4.5,
      date: '2026-03-05', category: 'Dining', items: [], confidence: 40,
    });

    await runWithFiles([makeFile()]);

    const desc = JSON.parse(updateFileMetadata.mock.calls[0][1].description);
    expect(desc.reviewReason).not.toBe('置信度极低');
    expect(desc.reviewReason).toMatch(/偏低/);
  });

  it('treats confidence=0 as review with "极低" warning', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, merchant: '', amount: null,
      date: null, category: 'Other', items: [], confidence: 0,
    });

    await runWithFiles([makeFile()]);

    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), FOLDER.review, FOLDER.inbox,
    );
    const desc = JSON.parse(updateFileMetadata.mock.calls[0][1].description);
    expect(desc.reviewReason).toBe('置信度极低');
  });
});

describe('False negative override: AI says not_receipt but data found → review', () => {
  it('overrides is_receipt=false when merchant is present', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false,
      date:       '2026-03-08',
      merchant:   'JB Hi-Fi',
      amount:     299.0,
      currency:   'AUD',
      category:   'Shopping',
      items:      ['USB-C Cable'],
      confidence: 60,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    // Must NOT return not_receipt — must be sent to review
    expect(onReceipt).toHaveBeenCalled();
    const record = onReceipt.mock.calls[0][0];
    expect(record.status).toBe('review');

    // Confidence must be capped at ≤35 so it always goes to review
    expect(record.confidence).toBeLessThanOrEqual(35);

    // File must be moved to review folder, not rejected entirely
    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), FOLDER.review, FOLDER.inbox,
    );
  });

  it('overrides is_receipt=false when only amount is present', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false,
      date:       null,
      merchant:   null,
      amount:     12.5,
      currency:   'AUD',
      category:   'Other',
      items:      [],
      confidence: 15,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review' }),
    );
  });

  it('overrides is_receipt=false when only date is present', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: '2026-03-01', merchant: null,
      amount: null, category: 'Other', items: [], confidence: 20,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review' }),
    );
  });

  it('preserves the override reviewReason in metadata (regression: was overwritten by "极低")', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: '2026-03-01', merchant: 'Bunnings',
      amount: 45.0, category: 'Hardware & Garden', items: [], confidence: 50,
    });

    await runWithFiles([makeFile()]);

    const metaCall = updateFileMetadata.mock.calls[0];
    const desc = JSON.parse(metaCall[1].description);
    // The override reason must be the specific AI false-negative message — NOT the generic
    // '置信度极低' that used to overwrite it. This test will FAIL on the buggy code.
    expect(desc.reviewReason).toBe('AI 判断可能不是小票，但检测到交易信息，请人工确认');
  });

  it('caps overridden confidence at 35 (always forces review path)', async () => {
    // AI returned confidence 80 but said not_receipt — cap must win
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: '2026-03-01', merchant: 'Harvey Norman',
      amount: 999.0, category: 'Shopping', items: [], confidence: 80,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review', confidence: 35 }),
    );
  });
});

describe('True negative: not a receipt, no data → rejected', () => {
  it('moves file to review folder with reviewStatus=not_receipt', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false,
      date:       null,
      merchant:   null,
      amount:     null,
      currency:   'AUD',
      category:   'Other',
      items:      [],
      confidence: 5,
    });

    const onReceipt = vi.fn();
    const { status } = await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    // onReceiptProcessed should NOT be called (not a receipt)
    expect(onReceipt).not.toHaveBeenCalled();

    // Should be moved to review folder with not_receipt metadata
    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), FOLDER.review, FOLDER.inbox,
    );
    expect(updateFileMetadata).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        description: expect.stringContaining('not_receipt'),
      }),
    );

    // Stats: failed++ (not done++)
    expect(status.failed).toBe(1);
    expect(status.done).toBe(0);
  });

  it('logs file to non-receipt alerts store', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: null, merchant: null,
      amount: null, category: 'Other', items: [], confidence: 0,
    });

    load.mockResolvedValue([]); // No existing alerts

    const file = makeFile({ id: 'non-receipt-file', name: 'cat_photo.jpg' });
    await runWithFiles([file]);

    // Should have stored an alert for this file
    const storeCalls = store.mock.calls.filter(c => c[0] === 'rr-non-receipt-alerts');
    expect(storeCalls.length).toBeGreaterThan(0);
    const savedAlerts = storeCalls[0][1];
    expect(savedAlerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fileId: 'non-receipt-file', fileName: 'cat_photo.jpg' }),
      ]),
    );
  });

  it('does not add duplicate alerts for the same file', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: null, merchant: null,
      amount: null, category: 'Other', items: [], confidence: 0,
    });

    // Pre-populate with existing alert for same file
    load.mockResolvedValue([
      { fileId: 'file-001', fileName: 'IMG_0001.jpg', driveLink: '...', detectedAt: Date.now() },
    ]);

    await runWithFiles([makeFile({ id: 'file-001' })]);

    const storeCalls = store.mock.calls.filter(c => c[0] === 'rr-non-receipt-alerts');
    // Should not push a second entry for same fileId
    if (storeCalls.length > 0) {
      const savedAlerts = storeCalls[0][1];
      const countForFile = savedAlerts.filter(a => a.fileId === 'file-001').length;
      expect(countForFile).toBe(1);
    }
  });

  it('treats empty merchant string as falsy (true negative)', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: '', merchant: '', amount: null,
      category: 'Other', items: [], confidence: 0,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).not.toHaveBeenCalled();
    const desc = JSON.parse(updateFileMetadata.mock.calls[0][1].description);
    expect(desc.reviewStatus).toBe('not_receipt');
  });
});

describe('Edge case: $0 amount treated as real data', () => {
  it('treats amount=0 as "has data" (regression: 0 is falsy in JS)', async () => {
    // A free item / refunded receipt with $0 total.
    // date and merchant are explicitly null — only amount=0 should trigger the override.
    // This test FAILS with `data.amount || ...` (falsy) and PASSES with the null-check fix.
    analyzeReceipt.mockResolvedValue({
      is_receipt: false,
      date:       null,    // <-- null, so only amount=0 is the "has data" signal
      merchant:   null,
      amount:     0,
      currency:   'AUD',
      category:   'Other',
      items:      [],
      confidence: 20,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    // $0 receipt should be overridden to review, NOT treated as true negative
    // This test will FAIL if the code uses `data.amount` (falsy) instead of
    // `data.amount != null` (explicit null check).
    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review' }),
    );
  });
});

describe('Edge case: PDF invoices', () => {
  it('processes PDF invoices the same as images', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-01', merchant: 'AGL Energy',
      amount: 185.5, currency: 'AUD', category: 'Utilities',
      items: [], confidence: 80,
    });

    const pdfFile = makeFile({
      id: 'pdf-001', name: 'invoice.pdf', mimeType: 'application/pdf',
    });

    const onReceipt = vi.fn();
    await runWithFiles([pdfFile], DEFAULT_CONFIG, onReceipt);

    expect(analyzeReceipt).toHaveBeenCalledWith(
      'base64data==', 'application/pdf', 'pdf',
    );
    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'validated', merchant: 'AGL Energy' }),
    );
  });
});

describe('Edge case: foreign language receipts', () => {
  it('processes Japanese receipt (is_receipt=true, lower confidence) → review', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-05', merchant: 'セブン-イレブン',
      amount: 580, currency: 'JPY', category: 'Grocery',
      items: ['おにぎり', 'お茶'], confidence: 52,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile({ name: 'japan_receipt.jpg' })], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review', merchant: 'セブン-イレブン' }),
    );
  });

  it('processes Chinese receipt that AI falsely flags as non-receipt but has data → review', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: '2026-03-05', merchant: '全家便利商店',
      amount: 35.0, currency: 'TWD', category: 'Grocery',
      items: [], confidence: 25,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    // Override should kick in: has merchant, send to review
    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review' }),
    );
  });
});

describe('Edge case: handwritten receipts', () => {
  it('handwritten receipt with low-medium confidence goes to review', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-09', merchant: 'Local Market',
      amount: 15.0, currency: 'AUD', category: 'Grocery',
      items: ['tomatoes', 'lettuce'], confidence: 48,
    });

    const onReceipt = vi.fn();
    await runWithFiles([makeFile({ name: 'handwritten.jpg' })], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review', confidence: 48 }),
    );
  });

  it('handwritten receipt AI cannot read at all → true negative path', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: false, date: null, merchant: null,
      amount: null, category: 'Other', items: [], confidence: 5,
    });

    const onReceipt = vi.fn();
    const { status } = await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).not.toHaveBeenCalled();
    expect(status.failed).toBe(1);
  });
});

describe('AI / network errors', () => {
  it('returns success:false with reason:error when analyzeReceipt throws', async () => {
    analyzeReceipt.mockRejectedValue(new Error('Network timeout'));

    const onReceipt = vi.fn();
    const { status } = await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(onReceipt).not.toHaveBeenCalled();
    expect(status.failed).toBe(1);
    expect(status.done).toBe(0);
  });

  it('does not move or rename the file on analyzeReceipt error', async () => {
    analyzeReceipt.mockRejectedValue(new Error('502 Bad Gateway'));

    await runWithFiles([makeFile()]);

    // Nothing should have been moved
    expect(renameAndMoveFile).not.toHaveBeenCalled();
  });
});

describe('Google Sheets: retry and outbox logging', () => {
  it('retries sheet write up to 3 times on failure', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'Woolworths',
      amount: 45.5, currency: 'AUD', category: 'Grocery', items: [], confidence: 80,
    });

    // All 3 attempts fail
    appendToSheet
      .mockRejectedValueOnce(new Error('Network'))
      .mockRejectedValueOnce(new Error('Network'))
      .mockRejectedValueOnce(new Error('Network'));

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], DEFAULT_CONFIG, onReceipt);

    expect(appendToSheet).toHaveBeenCalledTimes(3);

    // Receipt is still reported as validated (sheet failure doesn't block validation)
    expect(onReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'validated', sheetSyncFailed: true }),
    );
  });

  it('logs to localStorage outbox when all sheet retries fail', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'Coles',
      amount: 22.0, currency: 'AUD', category: 'Grocery', items: [], confidence: 75,
    });
    appendToSheet.mockRejectedValue(new Error('Sheets API error'));

    await runWithFiles([makeFile({ id: 'sheet-fail-file' })]);

    // Should have written an outbox entry to localStorage
    const outboxRaw = localStorage.getItem('rr-sheets-outbox');
    if (outboxRaw) {
      const outbox = JSON.parse(outboxRaw);
      expect(outbox.length).toBeGreaterThan(0);
      expect(outbox[0].fileId).toBe('sheet-fail-file');
    } else {
      // If store() mock intercepted it, check via store calls
      const sheetOutboxCall = store.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('outbox'),
      );
      // Either localStorage or store should have been used
      // (implementation may vary — just ensure no silent data loss)
      expect(sheetOutboxCall || outboxRaw).toBeTruthy();
    }
  });

  it('does NOT write to sheet for review-status receipts', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'Kmart',
      amount: 30.0, currency: 'AUD', category: 'Shopping', items: [], confidence: 60,
    });

    await runWithFiles([makeFile()]);

    expect(appendToSheet).not.toHaveBeenCalled();
  });
});

describe('Auto-create sheet when config.sheetId is absent', () => {
  it('auto-creates receipt_index sheet when sheetId not configured', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'Woolworths',
      amount: 45.5, currency: 'AUD', category: 'Grocery', items: [], confidence: 90,
    });

    const configWithoutSheet = { ...DEFAULT_CONFIG, sheetId: null };

    const onReceipt = vi.fn();
    await runWithFiles([makeFile()], configWithoutSheet, onReceipt);

    expect(createReceiptSheet).toHaveBeenCalledWith('receipt_index');
    expect(appendToSheet).toHaveBeenCalledWith(
      'auto-sheet-id',
      'receipt_index',
      expect.any(Array),
    );
  });
});

describe('Batch processing: multiple files', () => {
  it('processes multiple receipts and tracks stats correctly', async () => {
    analyzeReceipt
      .mockResolvedValueOnce({
        is_receipt: true, date: '2026-03-01', merchant: 'Woolworths',
        amount: 45.5, category: 'Grocery', items: [], confidence: 85,
      })
      .mockResolvedValueOnce({
        is_receipt: true, date: '2026-03-02', merchant: 'Coles',
        amount: 22.0, category: 'Grocery', items: [], confidence: 55,
      })
      .mockResolvedValueOnce({
        is_receipt: false, date: null, merchant: null, amount: null,
        category: 'Other', items: [], confidence: 0,
      });

    const files = [
      makeFile({ id: 'f1', name: 'receipt1.jpg' }),
      makeFile({ id: 'f2', name: 'receipt2.jpg' }),
      makeFile({ id: 'f3', name: 'cat.jpg' }),
    ];

    const { status } = await runWithFiles(files);

    // 2 receipts processed (1 validated, 1 review), 1 failed (not_receipt)
    expect(status.total).toBe(3);
    expect(status.done).toBe(2);
    expect(status.failed).toBe(1);
    expect(status.review).toBe(1);
  });
});

describe('Receipt naming', () => {
  it('builds correct filename from extracted data', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'JB Hi-Fi',
      amount: 1299.0, currency: 'AUD', category: 'Shopping', items: [], confidence: 80,
    });

    await runWithFiles([makeFile({ name: 'receipt.jpg' })]);

    // titleCase: lowercase first, then capitalise start of each word and after dashes
    // "JB Hi-Fi" → "Jb Hi-Fi" (dash-capitalisation fix in naming.js)
    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String),
      '2026.03.10 Jb Hi-Fi 1299.00.jpg',
      FOLDER.validated,
      FOLDER.inbox,
    );
  });

  it('uses file extension from original filename', async () => {
    analyzeReceipt.mockResolvedValue({
      is_receipt: true, date: '2026-03-10', merchant: 'Bunnings',
      amount: 34.5, currency: 'AUD', category: 'Hardware & Garden', items: [], confidence: 75,
    });

    await runWithFiles([makeFile({ name: 'photo.png', mimeType: 'image/png' })]);

    expect(renameAndMoveFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/\.png$/),
      expect.any(String),
      expect.any(String),
    );
  });
});
