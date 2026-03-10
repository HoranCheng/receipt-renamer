/**
 * User-scoped storage.
 * Sensitive keys (receipts, config) are prefixed with user ID to prevent
 * cross-user data leakage on shared devices.
 */

// Keys that contain user-specific sensitive data → scoped by user
const SCOPED_KEYS = ['rr-config', 'rr-receipts', 'rr-proc-progress', 'rr-non-receipt-alerts'];

// Get the current user scope prefix (Google sub ID or email hash)
function getUserScope() {
  try {
    const raw = localStorage.getItem('rr-current-user');
    return raw || '';
  } catch { return ''; }
}

export function setCurrentUser(userId) {
  try {
    localStorage.setItem('rr-current-user', userId || '');
  } catch {}
}

function scopedKey(key) {
  if (!SCOPED_KEYS.includes(key)) return key;
  const scope = getUserScope();
  return scope ? `${key}::${scope}` : key;
}

export async function store(key, val) {
  try {
    localStorage.setItem(scopedKey(key), JSON.stringify(val));
  } catch {
    console.warn('localStorage.setItem failed');
  }
}

export async function load(key, fallback) {
  try {
    const sk = scopedKey(key);
    const raw = localStorage.getItem(sk);
    if (raw) return JSON.parse(raw);

    // Migration: check for un-scoped data from before user isolation
    if (sk !== key) {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        // Migrate to scoped key
        localStorage.setItem(sk, legacy);
        localStorage.removeItem(key);
        return JSON.parse(legacy);
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Clear all data for the current user (signOut cleanup).
 * Preserves data belonging to other users.
 */
export function clearCurrentUserData() {
  const scope = getUserScope();
  if (!scope) return;
  try {
    SCOPED_KEYS.forEach(key => {
      localStorage.removeItem(`${key}::${scope}`);
    });
    // Also clear processing state
    localStorage.removeItem('rr-proc-progress');
  } catch {}
}

/**
 * Clear ALL local data (factory reset).
 */
export function clearAllData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('rr-')) keys.push(key);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}
