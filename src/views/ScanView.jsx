import { useState, useRef, useCallback, useEffect } from 'react';
import { T, F } from '../constants/theme';
import { findOrCreateFolder, uploadToDriveFolder } from '../services/google';
import Header from '../components/Header';
import AiLivePanel from '../components/AiLivePanel';
import {
  createThumbnail,
  savePending,
  loadPending,
  removePending,
  cleanStaleItems,
  getPendingStats,
  fmtBytes,
  WARN_BYTES,
  CRIT_BYTES,
  STALE_DAYS,
} from '../services/pendingQueue';
import { cacheImage, rekeyCache } from '../services/imageCache';
import { enqueueFile } from '../services/processor';
import { enqueueToSW, isSWAvailable, sendTokenToSW } from '../services/swBridge';

// Network check (Android; iOS Safari doesn't expose connection.type)
function isWifi() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return true; // unknown → allow
  const t = conn.type;
  return !t || t === 'wifi' || t === 'ethernet' || t === 'unknown' || t === 'other';
}

// Animated circular progress ring
function ProgressRing({ status }) {
  const r = 11, c = 2 * Math.PI * r;
  if (status === 'done') return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: T.grn, fontSize: 13, fontWeight: 800 }}>✓</span>
    </div>
  );
  if (status === 'failed') return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(248,113,113,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: T.red, fontSize: 13 }}>✕</span>
    </div>
  );
  if (status === 'wifi_blocked') return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(250,204,21,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 13 }}>📶</span>
    </div>
  );
  // uploading / queued → spinning ring
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" style={{ flexShrink: 0 }}>
      <circle cx={13} cy={13} r={r} fill="none" stroke={T.bdr} strokeWidth={2.5} />
      <circle cx={13} cy={13} r={r} fill="none" stroke={status === 'uploading' ? T.acc : T.tx3}
        strokeWidth={2.5} strokeDasharray={`${c * 0.28} ${c}`} strokeLinecap="round"
        style={{ transformOrigin: 'center', animation: 'spin 0.9s linear infinite' }}
      />
    </svg>
  );
}

const MAX_RETRIES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file (aligned with AI service limit)
// Only formats validated across the full chain (select → compress → preview → base64 → AI)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/** Compress an image file on device. Returns compressed Blob or original if compression fails/isn't needed. */
async function compressImage(file, maxWidth = 1280, quality = 0.82) {
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

function QueueItem({ item: it, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const isFailed = it.status === 'failed';

  return (
    <div>
      <div
        onClick={() => isFailed && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: expanded ? '12px 12px 0 0' : 12,
          background: isFailed ? 'rgba(248,113,113,0.06)'
            : it.status === 'done' ? 'rgba(52,211,153,0.06)' : T.sf2,
          cursor: isFailed ? 'pointer' : 'default',
          transition: 'border-radius 0.15s',
        }}
      >
        {it.previewUrl ? (
          <img src={it.previewUrl} alt="" style={{
            width: 44, height: 44, borderRadius: 9, objectFit: 'cover', flexShrink: 0,
            border: `1px solid ${T.bdr}`,
          }} />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: 9, background: T.sf,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
          }}>🧾</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.name}
          </div>
          <div style={{ fontSize: 10, color: isFailed ? T.red : T.tx3, marginTop: 2 }}>
            {it.status === 'done' && '✅ 已上传到 Drive'}
            {it.status === 'uploading' && `上传中${it.retries > 0 ? `（第 ${it.retries + 1} 次重试）` : '…'}`}
            {it.status === 'queued' && '等待上传…'}
            {isFailed && `❌ 失败 · 点击查看详情`}
          </div>
        </div>
        <ProgressRing status={it.status} />
      </div>
      {/* Expanded detail for failed items */}
      {expanded && isFailed && (
        <div style={{
          background: 'rgba(248,113,113,0.04)',
          border: '1px solid rgba(248,113,113,0.15)',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 11, color: T.tx2, marginBottom: 8, lineHeight: 1.5 }}>
            <strong style={{ color: T.red }}>错误原因：</strong>{it.error || '网络错误或服务不可用'}
          </div>
          {it.previewUrl && (
            <img src={it.previewUrl} alt="" style={{
              width: '100%', maxHeight: 200, objectFit: 'contain',
              borderRadius: 8, marginBottom: 10,
              border: `1px solid ${T.bdr}`,
            }} />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); onRetry(); }} style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
              background: T.acc, color: '#000', fontSize: 12, fontWeight: 700,
              fontFamily: F, cursor: 'pointer',
            }}>↩ 重试上传</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScanView({ onUploaded, onSync, procStatus, config, onStatusChange, onReceiptProcessed, showToast, liveResults }) {
  // items: { id, name, status, retries, error, previewUrl, fromIndexedDB, fileBlob }
  const [items, setItems] = useState([]);
  const [storageAlert, setStorageAlert] = useState(null); // null | { level:'warn'|'crit', totalBytes, count, hasStale }
  const filesRef = useRef({}); // id → File (in-memory during session)
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  // On mount: auto-purge stale items, load persisted queue, check storage health, auto-resume
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. Auto-purge items older than STALE_DAYS
        await cleanStaleItems(STALE_DAYS);

        // 2. Load ALL pending items (not just wifi-blocked)
        const persisted = await loadPending();
        if (persisted.length && !cancelled) {
          const wifiOnly = config?.wifiOnlyUpload && !isWifi();
          const restored = persisted.map(p => ({
            id: p.id,
            name: p.name,
            status: wifiOnly ? 'wifi_blocked' : 'queued', // Resume as queued if wifi is OK
            retries: 0,
            error: wifiOnly ? 'WiFi 未连接时暂停的' : '',
            previewUrl: p.thumbnailBlob ? URL.createObjectURL(p.thumbnailBlob) : null,
            fromIndexedDB: true,
            fileBlob: p.fileBlob,
          }));
          setItems(prev => {
            const existingIds = new Set(prev.map(x => x.id));
            return [...prev, ...restored.filter(r => !existingIds.has(r.id))];
          });
          queueRef.current = [...queueRef.current, ...restored.filter(r =>
            !queueRef.current.find(x => x.id === r.id)
          )];

          // Auto-resume uploading if there are queued items and wifi is available
          if (!wifiOnly && restored.some(r => r.status === 'queued') && config?.connected) {
            const inboxFolder = config?.inboxFolder || 'Inbox';
            // Small delay to let UI settle
            setTimeout(() => {
              if (!cancelled) processQueue(inboxFolder);
            }, 500);
            showToast?.(`恢复 ${restored.length} 张未完成的上传`, 'info', 3000);
          }
        }

        // 3. Check storage health
        const stats = await getPendingStats();
        if (stats.count > 0) {
          const ageMs = stats.oldestAt ? Date.now() - stats.oldestAt : 0;
          const hasStale = ageMs > 3 * 24 * 60 * 60 * 1000; // >3 days old
          if (stats.totalBytes >= CRIT_BYTES) {
            setStorageAlert({ level: 'crit', totalBytes: stats.totalBytes, count: stats.count, hasStale });
          } else if (stats.totalBytes >= WARN_BYTES || hasStale) {
            setStorageAlert({ level: 'warn', totalBytes: stats.totalBytes, count: stats.count, hasStale });
          }
        }
      } catch (e) {
        console.warn('Failed to load pending queue:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateItem = useCallback((id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
    queueRef.current = queueRef.current.map(it => it.id === id ? { ...it, ...patch } : it);
    // Auto-dismiss done items after 2s + release memory
    if (patch.status === 'done') {
      setTimeout(() => {
        setItems(prev => {
          const item = prev.find(it => it.id === id);
          if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
          delete filesRef.current[id];
          return prev.filter(it => it.id !== id || it.status !== 'done');
        });
        queueRef.current = queueRef.current.filter(it => it.id !== id);
      }, 2000);
    }
  }, []);

  const processQueue = useCallback(async (inboxFolder) => {
    if (processingRef.current) return;
    processingRef.current = true;
    let uploadedAny = false;

    while (true) {
      const pending = queueRef.current.find(it => it.status === 'queued');
      if (!pending) break;

      // WiFi-only check
      if (config?.wifiOnlyUpload && !isWifi()) {
        // Block all queued items
        queueRef.current
          .filter(it => it.status === 'queued')
          .forEach(it => updateItem(it.id, { status: 'wifi_blocked', error: '' }));
        break;
      }

      updateItem(pending.id, { status: 'uploading' });

      const file = filesRef.current[pending.id] || pending.fileBlob;
      let success = false;
      let lastError = '';

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' +
            Math.random().toString(36).slice(2, 5);
          const ext = (file.type || '').includes('pdf') ? 'pdf'
            : (file.type || '').includes('png') ? 'png' : 'jpg';
          const fileName = `receipt_${ts}.${ext}`;
          const folderId = await findOrCreateFolder(inboxFolder);
          const uploaded = await uploadToDriveFolder(file, fileName, folderId, file.type || 'image/jpeg');
          // Rekey image cache: temp id → Drive file id (so ReviewView can find it)
          if (uploaded?.id) {
            rekeyCache(pending.id, uploaded.id).catch(() => {});
            // Store uploaded file info for immediate AI processing
            pending._uploadedFile = {
              id: uploaded.id,
              name: fileName,
              mimeType: file.type || 'image/jpeg',
            };
          }
          success = true;
          break;
        } catch (err) {
          lastError = err.message;
          if (attempt < MAX_RETRIES - 1) {
            updateItem(pending.id, { retries: attempt + 1 });
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      }

      if (success) {
        updateItem(pending.id, { status: 'done' });
        uploadedAny = true;
        // Every queued item is persisted to IndexedDB on add. Always remove it after
        // a successful upload, otherwise it will be restored again on next app launch.
        try { await removePending(pending.id); } catch {}
        // T-015: Immediately enqueue for AI processing after each upload
        if (pending._uploadedFile && onStatusChange) {
          // Try SW-based background processing first (survives tab switch)
          const swQueued = isSWAvailable() && enqueueToSW({
            id: pending._uploadedFile.id,
            driveFileId: pending._uploadedFile.id,
            fileName: pending._uploadedFile.name,
            mimeType: pending._uploadedFile.mimeType,
            step: 'ai', // Already uploaded, just needs AI
            proxyUrl: import.meta.env.VITE_AI_PROXY_URL || '',
            uid: localStorage.getItem('rr-current-user') || 'anonymous',
          });
          if (!swQueued) {
            // Fallback: main thread processing
            enqueueFile(pending._uploadedFile, config, onStatusChange, onReceiptProcessed);
          }
        }
      } else {
        updateItem(pending.id, { status: 'failed', error: lastError });
      }
    }

    processingRef.current = false;
    if (uploadedAny) {
      // Count results
      const doneItems = queueRef.current.filter(it => it.status === 'done').length;
      const failItems = queueRef.current.filter(it => it.status === 'failed').length;
      if (failItems > 0) {
        showToast?.(`上传完成：${doneItems} 张成功，${failItems} 张失败`, 'warn');
      } else if (doneItems > 0) {
        showToast?.(`${doneItems} 张照片已上传到 Drive ☁️`, 'success');
      }
      onUploaded?.();
      // Re-check storage health after uploads complete
      const stats = await getPendingStats();
      if (stats.count === 0) setStorageAlert(null);
    }
  }, [config, updateItem, onUploaded, showToast]);

  const handleFiles = useCallback(async (fileList) => {
    if (!fileList?.length) return;
    const rawFiles = Array.from(fileList);
    const inboxFolder = config?.inboxFolder || 'Inbox';

    // Validate files before processing
    const files = [];
    for (const file of rawFiles) {
      if (file.size > MAX_FILE_SIZE) {
        showToast?.(`文件 "${file.name}" 太大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 10MB`, 'error', 4000);
        continue;
      }
      if (file.type && !ALLOWED_TYPES.includes(file.type)) {
        showToast?.(`不支持的文件类型：${file.type}。仅支持 JPEG/PNG/PDF`, 'error', 4000);
        continue;
      }
      files.push(file);
    }
    if (!files.length) return;
    const wifiOnly = config?.wifiOnlyUpload && !isWifi();

    const newItems = await Promise.all(files.map(async (rawFile) => {
      // Compress if enabled
      const file = config?.compressImages ? await compressImage(rawFile) : rawFile;
      const id = Math.random().toString(36).slice(2) + Date.now();
      const thumbBlob = await createThumbnail(file);
      const previewUrl = thumbBlob ? URL.createObjectURL(thumbBlob) : URL.createObjectURL(file);
      filesRef.current[id] = file;
      // Cache original image blob for ReviewView lightbox
      cacheImage(id, file).catch(() => {});

      const item = {
        id, name: file.name || 'receipt.jpg',
        status: wifiOnly ? 'wifi_blocked' : 'queued',
        retries: 0, error: '',
        previewUrl, fromIndexedDB: false, fileBlob: file,
      };

      // Always persist to IndexedDB so items survive app restart
      try {
        await savePending({ id, name: item.name, fileBlob: file, thumbnailBlob: thumbBlob, addedAt: Date.now() });
      } catch (e) { console.warn('Failed to persist pending item:', e); }

      return item;
    }));

    setItems(prev => [...prev, ...newItems]);
    queueRef.current = [...queueRef.current, ...newItems];
    if (!wifiOnly) processQueue(inboxFolder);
  }, [config, processQueue]);

  const retryAll = useCallback(async () => {
    const failed = queueRef.current.filter(it =>
      it.status === 'failed' || it.status === 'wifi_blocked'
    );
    // Re-persist wifi-blocked items that need to upload now
    for (const it of failed) {
      if (it.fromIndexedDB) {
        // Already in IndexedDB, just update status
        updateItem(it.id, { status: 'queued', error: '', fromIndexedDB: false });
      } else {
        updateItem(it.id, { status: 'queued', error: '' });
      }
    }
    processQueue(config?.inboxFolder || 'Inbox');
  }, [config, updateItem, processQueue]);

  const retryOne = useCallback(async (id) => {
    updateItem(id, { status: 'queued', error: '' });
    processQueue(config?.inboxFolder || 'Inbox');
  }, [config, updateItem, processQueue]);

  const clearDone = useCallback(() => {
    const remaining = queueRef.current.filter(it => it.status !== 'done');
    // Revoke object URLs for done items
    queueRef.current.filter(it => it.status === 'done').forEach(it => {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      delete filesRef.current[it.id];
    });
    setItems(remaining);
    queueRef.current = remaining;
  }, []);

  const isConnected = Boolean(config?.connected);
  const wifiBlockedItems = items.filter(it => it.status === 'wifi_blocked');
  const pendingCount = items.filter(it => it.status === 'queued' || it.status === 'uploading').length;
  const failedCount = items.filter(it => it.status === 'failed').length;
  const doneCount = items.filter(it => it.status === 'done').length;

  if (!isConnected) {
    return (
      <div style={{ padding: '0 16px 100px' }}>
        <Header title="扫描小票" sub="请先在设置中连接 Google" />
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 14, color: T.tx2 }}>请先完成 Google 账号连接</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 100px' }}>
      <Header title="扫描小票" sub={`存至 Drive / ${config?.inboxFolder || 'Inbox'}`} />

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

      {/* WiFi-blocked pending queue — prominent banner */}
      {wifiBlockedItems.length > 0 && (
        <div style={{
          background: 'rgba(250,204,21,0.07)', border: '1px solid rgba(250,204,21,0.25)',
          borderRadius: 16, padding: '14px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.acc }}>
                📶 {wifiBlockedItems.length} 张等待 WiFi 上传
              </div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                连上 WiFi 后点"立即上传"，照片已安全存储在本地
              </div>
            </div>
            <button
              onClick={retryAll}
              style={{
                flexShrink: 0, padding: '7px 13px',
                background: T.acc, border: 'none', borderRadius: 20,
                color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}
            >
              立即上传
            </button>
          </div>
          {/* Thumbnail strip */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {wifiBlockedItems.map(it => (
              <div key={it.id} style={{ flexShrink: 0, position: 'relative' }}>
                {it.previewUrl ? (
                  <img src={it.previewUrl} alt="" style={{
                    width: 64, height: 64, borderRadius: 10, objectFit: 'cover',
                    border: `1px solid rgba(250,204,21,0.3)`,
                  }} />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: 10,
                    background: T.sf2, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 20,
                  }}>🧾</div>
                )}
                <div style={{
                  position: 'absolute', bottom: 3, right: 3,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'rgba(250,204,21,0.9)', fontSize: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>⏸</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storage health alert */}
      {storageAlert && (
        <div style={{
          borderRadius: 14, padding: '12px 14px', marginBottom: 12,
          background: storageAlert.level === 'crit'
            ? 'rgba(248,113,113,0.08)' : 'rgba(251,146,60,0.08)',
          border: `1px solid ${storageAlert.level === 'crit'
            ? 'rgba(248,113,113,0.3)' : 'rgba(251,146,60,0.3)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>
              {storageAlert.level === 'crit' ? '🚨' : '⚠️'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: storageAlert.level === 'crit' ? T.red : '#fb923c',
                marginBottom: 4,
              }}>
                {storageAlert.level === 'crit'
                  ? `本地缓存快满了（${fmtBytes(storageAlert.totalBytes)}）`
                  : `本地缓存了 ${storageAlert.count} 张照片（约 ${fmtBytes(storageAlert.totalBytes)}）`}
              </div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>
                {storageAlert.level === 'crit'
                  ? '已接近浏览器存储上限，新照片可能无法保存。请尽快上传或清理缓存。'
                  : storageAlert.hasStale
                    ? '有照片已等待超过 3 天，建议尽快处理，避免数据丢失。'
                    : '照片保存在本地，建议尽快连 WiFi 上传。'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={retryAll}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '5px 12px',
                    borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: storageAlert.level === 'crit' ? T.red : '#fb923c',
                    color: '#fff',
                  }}
                >
                  📱 用流量立即上传
                </button>
                <button
                  onClick={() => setStorageAlert(null)}
                  style={{
                    fontSize: 11, color: T.tx3, background: 'none',
                    border: `1px solid ${T.bdr}`, borderRadius: 20,
                    padding: '5px 12px', cursor: 'pointer',
                  }}
                >
                  稍后处理
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main camera card */}
      <button
        onClick={() => cameraRef.current?.click()}
        style={{
          width: '100%', padding: '52px 20px', marginBottom: 12,
          background: 'linear-gradient(135deg, rgba(250,204,21,0.14) 0%, rgba(250,204,21,0.02) 100%)',
          border: '1px solid rgba(250,204,21,0.22)', borderRadius: 24, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          transition: 'opacity 0.15s ease',
        }}
        onTouchStart={e => e.currentTarget.style.opacity = '0.8'}
        onTouchEnd={e => e.currentTarget.style.opacity = '1'}
      >
        <span style={{ fontSize: 54, lineHeight: 1 }}>📷</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: T.tx, fontFamily: F }}>拍张照片</span>
        <span style={{ fontSize: 12, color: T.tx2, fontFamily: F }}>照片即存 Drive，AI 自动识别</span>
        {pendingCount > 0 && (
          <span style={{ fontSize: 11, color: T.acc, background: T.accDim, borderRadius: 20, padding: '3px 10px' }}>
            上传中 {pendingCount} 张…
          </span>
        )}
      </button>

      {/* AI Live Results Panel — expandable */}
      <AiLivePanel procStatus={procStatus} liveResults={liveResults || []} />

      {/* Gallery pill */}
      <button
        onClick={() => galleryRef.current?.click()}
        style={{
          width: '100%', padding: '12px 20px', marginBottom: 14,
          background: T.card, border: `1px solid ${T.bdr}`,
          borderRadius: 50, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>🖼️</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx2, fontFamily: F }}>
          从相册选择 · 支持多张
        </span>
      </button>

      {/* Upload status list — only show when there are items (excluding wifi-blocked which have their own section) */}
      {items.filter(it => it.status !== 'wifi_blocked').length > 0 && (
        <div style={{
          background: T.card, border: `1px solid ${T.bdr}`,
          borderRadius: 16, padding: '12px 14px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.tx3, letterSpacing: '1px' }}>
              上传队列
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {failedCount > 0 && (
                <button onClick={retryAll} style={{ fontSize: 11, color: T.acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  ↩ 重试
                </button>
              )}
              {doneCount > 0 && (
                <button onClick={clearDone} style={{ fontSize: 11, color: T.tx3, background: 'none', border: 'none', cursor: 'pointer' }}>
                  清除已完成
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {items.filter(it => it.status !== 'wifi_blocked').map(it => (
              <QueueItem key={it.id} item={it} onRetry={() => retryOne(it.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Drive sync — compact inline button */}
      <button
        onClick={() => { if (!procStatus?.processing) onSync?.(); }}
        disabled={procStatus?.processing}
        style={{
          width: '100%', padding: '10px 16px',
          background: 'none',
          border: `1px dashed ${T.bdr2}`,
          borderRadius: 12, cursor: procStatus?.processing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          color: T.tx3, fontSize: 12, fontFamily: F,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!procStatus?.processing) e.currentTarget.style.borderColor = T.acc; }}
        onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr2}
      >
        <>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity: procStatus?.processing ? 0.3 : 1 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span style={{ opacity: procStatus?.processing ? 0.4 : 1 }}>
            在电脑上传了小票？点此同步 Drive
          </span>
        </>
      </button>
    </div>
  );
}
