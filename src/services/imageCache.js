/**
 * IndexedDB cache for original photo blobs.
 *
 * Lifecycle:
 *   1. Photo captured → blob saved here keyed by a temp id
 *   2. Upload to Drive succeeds → re-key from temp id to Drive file id
 *   3. AI processes → if approved (moved to validated), cache entry deleted
 *   4. If flagged for review → cache entry stays for lightbox preview
 *   5. User approves or deletes in ReviewView → cache entry deleted
 */

const DB_NAME = 'rr-image-cache';
const STORE = 'blobs';
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

/**
 * Save an image blob to cache.
 * @param {string} id - temp upload id or Drive file id
 * @param {Blob} blob - original image blob
 */
export async function cacheImage(id, blob) {
  try {
    await run('readwrite', store => store.put({ id, blob, cachedAt: Date.now() }));
  } catch (e) {
    console.warn('Image cache save failed:', e);
  }
}

/**
 * Re-key a cached image (temp upload id → Drive file id).
 * Copies the blob under the new key and removes the old one.
 */
export async function rekeyCache(oldId, newId) {
  try {
    const entry = await run('readonly', store => store.get(oldId));
    if (!entry?.blob) return;
    await run('readwrite', store => {
      store.put({ id: newId, blob: entry.blob, cachedAt: entry.cachedAt });
      store.delete(oldId);
    });
  } catch (e) {
    console.warn('Image cache rekey failed:', e);
  }
}

/**
 * Get a cached image blob URL.
 * Returns a blob: URL or null if not cached.
 */
export async function getCachedImageUrl(id) {
  try {
    const entry = await run('readonly', store => store.get(id));
    if (!entry?.blob) return null;
    return URL.createObjectURL(entry.blob);
  } catch {
    return null;
  }
}

/**
 * Remove a cached image by id.
 */
export async function removeCachedImage(id) {
  try {
    await run('readwrite', store => store.delete(id));
  } catch {}
}

/**
 * Remove multiple cached images by id array.
 */
export async function removeCachedImages(ids) {
  try {
    const db = await openDB();
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    ids.forEach(id => store.delete(id));
    await new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch {}
}
