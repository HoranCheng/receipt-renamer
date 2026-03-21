/**
 * Lightweight in-memory debug log for diagnosing issues on mobile.
 * Stores last N entries in memory + localStorage for persistence.
 * Viewable in ConfigView's debug panel.
 */

const MAX_ENTRIES = 50;
const STORAGE_KEY = 'rr-debug-log';

let _entries = [];

// Load from localStorage on init
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) _entries = JSON.parse(raw);
} catch {}

function _save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_entries.slice(-MAX_ENTRIES)));
  } catch {}
}

/**
 * Add a debug log entry.
 * @param {'info'|'warn'|'error'} level
 * @param {string} tag - component/module name (e.g. 'upload', 'ai', 'processor')
 * @param {string} message
 * @param {object} [data] - optional structured data
 */
export function dlog(level, tag, message, data) {
  const entry = {
    t: Date.now(),
    level,
    tag,
    msg: message,
    data: data ? JSON.stringify(data).slice(0, 500) : undefined,
  };
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries = _entries.slice(-MAX_ENTRIES);
  _save();

  // Also log to console for when dev tools are available
  const prefix = `[${tag}]`;
  if (level === 'error') console.error(prefix, message, data || '');
  else if (level === 'warn') console.warn(prefix, message, data || '');
  else console.info(prefix, message, data || '');
}

/** Get all log entries (newest last) */
export function getDebugLog() {
  return [..._entries];
}

/** Clear all log entries */
export function clearDebugLog() {
  _entries = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Format a timestamp for display */
export function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0');
}
