/**
 * Unified receipt file naming.
 * Format: "YYYY.MM.DD Merchant Amount.ext"
 * Example: "2026.03.10 Woolworths 45.50.jpg"
 *
 * Used by: processor.js, ReviewView.jsx, InboxView.jsx
 */

function safeName(str) {
  return (str || '').replace(/[/\\?%*:|"<>]/g, '-').trim();
}

function titleCase(str) {
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Build the canonical receipt filename.
 * @param {{ date?: string, merchant?: string, category?: string, amount?: string|number }} data
 * @param {string} ext - file extension without dot (e.g. 'jpg')
 * @returns {string}
 */
export function buildReceiptName(data, ext = 'jpg') {
  const safeDate = (data.date || 'unknown-date').replace(/-/g, '.');
  const merchant = safeName(data.merchant || data.category || 'Unknown');
  const safeAmount = parseFloat(data.amount || 0).toFixed(2);
  return `${safeDate} ${titleCase(merchant)} ${safeAmount}.${ext}`;
}
