// ─── Network detection ────────────────────────────────────────────────────────

export function getConnection() {
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

export function isWifi() {
  const conn = getConnection();
  if (!conn) return true; // unknown → allow
  const t = conn.type;
  return !t || t === 'wifi' || t === 'ethernet' || t === 'unknown' || t === 'other';
}

export function isWeakNetwork() {
  const conn = getConnection();
  if (!conn) return false;
  const type = (conn.type || '').toLowerCase();
  const effectiveType = (conn.effectiveType || '').toLowerCase();
  return type === 'cellular' || effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
}

export function getUploadConcurrency() {
  return isWeakNetwork() ? 1 : 3;
}

export function getNetworkLabel() {
  const conn = getConnection();
  if (!conn) return '网络未知';
  const type = conn.type || '';
  const effectiveType = conn.effectiveType || '';
  if (type === 'cellular') return `移动网络${effectiveType ? ` (${effectiveType})` : ''}`;
  if (type === 'wifi' || type === 'ethernet') return 'Wi‑Fi';
  return effectiveType || type || '网络未知';
}

// ─── Upload constants ─────────────────────────────────────────────────────────

export const MAX_RETRIES = 3;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// ─── Image compression ────────────────────────────────────────────────────────

/** Compress an image file on device. Returns compressed Blob or original if compression fails/isn't needed. */
export async function compressImage(file, maxWidth = 1280, quality = 0.82) {
  if (file.type === 'application/pdf') return file; // Don't compress PDFs
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(maxWidth / img.width, 1); // Only downscale, never upscale
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              resolve(file); // Compressed is bigger → keep original
            }
          },
          'image/jpeg',
          quality
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
