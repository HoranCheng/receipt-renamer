/**
 * IndexedDB-backed pending upload queue.
 * Stores File blobs + thumbnails so pending photos survive tab refreshes.
 * Used when WiFi-only mode is on and device is on cellular.
 */

const DB_NAME = 'rr-pending-uploads';
const STORE = 'items';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    if (req && typeof req.onsuccess !== 'undefined') {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    }
  });
}

/** Create a small JPEG thumbnail blob from a File via canvas */
export async function createThumbnail(file, maxSize = 300) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.55);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/**
 * Save a pending item (with file blob + thumbnail) to IndexedDB.
 * item: { id, name, fileBlob, thumbnailBlob, addedAt }
 */
export async function savePending(item) {
  await run('readwrite', store => store.put(item));
}

/** Load all pending items from IndexedDB */
export async function loadPending() {
  return run('readonly', store => store.getAll());
}

/** Remove a pending item by id */
export async function removePending(id) {
  await run('readwrite', store => store.delete(id));
}

/** Clear all pending items */
export async function clearAllPending() {
  await run('readwrite', store => store.clear());
}

/**
 * Return stats about the pending queue:
 * { count, totalBytes, oldestAt, items }
 */
export async function getPendingStats() {
  const items = await loadPending();
  let totalBytes = 0;
  let oldestAt = Infinity;
  for (const item of items) {
    if (item.fileBlob?.size) totalBytes += item.fileBlob.size;
    if (item.thumbnailBlob?.size) totalBytes += item.thumbnailBlob.size;
    if (item.addedAt && item.addedAt < oldestAt) oldestAt = item.addedAt;
  }
  return {
    count: items.length,
    totalBytes,
    oldestAt: items.length ? oldestAt : null,
    items,
  };
}

/**
 * Delete pending items older than `maxAgeDays`.
 * Returns number of items deleted.
 */
export async function cleanStaleItems(maxAgeDays = 14) {
  const items = await loadPending();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const stale = items.filter(i => i.addedAt && i.addedAt < cutoff);
  for (const item of stale) {
    await removePending(item.id);
  }
  return stale.length;
}

/** Format bytes to human-readable string */
export function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Thresholds
export const WARN_BYTES = 20 * 1024 * 1024;   // 20MB — yellow warning
export const CRIT_BYTES = 45 * 1024 * 1024;   // 45MB — red (iOS Safari limit is ~50MB)
export const STALE_DAYS = 14;                  // auto-delete after 14 days
