/**
 * Unified receipt file naming.
 *
 * Format: "YYYY-MM-DD_category_N.ext"
 * Example: "2026-03-10_grocery_1.jpg"
 *
 * Category uses the English lowercase slug from AI recognition.
 * Sequence number (N) ensures uniqueness within date+category.
 *
 * Used by: processor.js, ReviewView.jsx, InboxView.jsx
 */

// ─── Category slug mapping ──────────────────────────────────────────────────

const CATEGORY_SLUGS = {
  'Grocery':            'grocery',
  'Dining':             'dining',
  'Fuel':               'fuel',
  'Medical':            'medical',
  'Hardware & Garden':  'hardware',
  'Outdoor & Camping':  'outdoor',
  'Transport':          'transport',
  'Utilities':          'utilities',
  'Entertainment':      'entertainment',
  'Shopping':           'shopping',
  'Education':          'education',
  'Insurance':          'insurance',
  'Subscription':       'subscription',
  'Other':              'other',
};

function categorySlug(category) {
  if (!category) return 'other';
  // Direct match
  if (CATEGORY_SLUGS[category]) return CATEGORY_SLUGS[category];
  // Case-insensitive match
  const lower = category.toLowerCase();
  for (const [key, slug] of Object.entries(CATEGORY_SLUGS)) {
    if (key.toLowerCase() === lower) return slug;
  }
  // Fallback: slugify the raw category
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
}

// ─── Sequence counter ───────────────────────────────────────────────────────

/**
 * In-memory counters for the current processing session.
 * Key format: "YYYY-MM-DD_slug" → next sequence number
 * Reset when a new batch starts.
 */
const _counters = new Map();

/** Reset all counters (call at start of batch processing) */
export function resetNameCounters() {
  _counters.clear();
}

/**
 * Seed counters from existing file names in the target folder.
 * Call once before processing a batch to avoid name collisions with
 * files already in Drive.
 *
 * @param {string[]} existingNames - array of file names already in the folder
 */
export function seedNameCounters(existingNames) {
  _counters.clear();
  const pattern = /^(\d{4}-\d{2}-\d{2})_([a-z][a-z0-9-]*)_(\d+)\./;
  for (const name of existingNames) {
    const m = name.match(pattern);
    if (m) {
      const key = `${m[1]}_${m[2]}`;
      const num = parseInt(m[3], 10);
      const cur = _counters.get(key) || 0;
      if (num >= cur) _counters.set(key, num + 1);
    }
  }
}

/**
 * Get next sequence number for a date+category combo.
 * Auto-increments the internal counter.
 */
function nextSeq(date, slug) {
  const key = `${date}_${slug}`;
  const n = _counters.get(key) || 1;
  _counters.set(key, n + 1);
  return n;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the canonical receipt filename.
 *
 * @param {{ date?: string, category?: string, merchant?: string, amount?: string|number }} data
 * @param {string} ext - file extension without dot (e.g. 'jpg')
 * @param {number} [seq] - explicit sequence number (overrides auto-counter)
 * @returns {string}
 */
export function buildReceiptName(data, ext = 'jpg', seq) {
  const date = data.date || new Date().toISOString().slice(0, 10);
  const slug = categorySlug(data.category);
  const n = typeof seq === 'number' ? seq : nextSeq(date, slug);
  return `${date}_${slug}_${n}.${ext}`;
}

/**
 * Parse a receipt filename back into components.
 * @param {string} name
 * @returns {{ date: string, category: string, seq: number, ext: string } | null}
 */
export function parseReceiptName(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_([a-z][a-z0-9-]*)_(\d+)\.(\w+)$/);
  if (!m) return null;
  return { date: m[1], category: m[2], seq: parseInt(m[3], 10), ext: m[4] };
}
