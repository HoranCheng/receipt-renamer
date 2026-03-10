import { useState, useEffect } from 'react';
import { T, F } from '../constants/theme';
import { deleteFile, getFileThumbnailUrl } from '../services/google';

/**
 * Bottom-sheet for non-receipt alerts — redesigned with:
 *  - Real image thumbnail loaded from Drive
 *  - Clear button hierarchy: delete (red) / defer (ghost) / force-manual (text)
 *  - "AI 误判了" escape hatch that sends to ReviewView
 *
 * Props:
 *   alerts          — [{ fileId, fileName, driveLink, detectedAt }]
 *   onClose         — (updatedAlerts) => void
 *   onManualReview  — (item) => void  [navigates to ReviewView + removes alert]
 */
export default function NonReceiptModal({ alerts, onClose, onManualReview }) {
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const item = alerts[idx];

  // Fetch Drive thumbnail whenever the current item changes
  useEffect(() => {
    if (!item?.fileId) return;
    setThumbUrl(null);
    setThumbLoading(true);
    setThumbError(false);
    getFileThumbnailUrl(item.fileId)
      .then(url => {
        setThumbUrl(url);
        setThumbLoading(false);
      })
      .catch(() => {
        setThumbLoading(false);
        setThumbError(true);
      });
  }, [item?.fileId]);

  if (!alerts.length) return null;

  const saveAlerts = (updated) => {
    try { localStorage.setItem('rr-non-receipt-alerts', JSON.stringify(updated)); } catch {}
    onClose(updated);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await deleteFile(item.fileId); } catch {}
    setDeleting(false);
    const updated = alerts.filter(a => a.fileId !== item.fileId);
    if (updated.length) {
      setIdx(Math.min(idx, updated.length - 1));
    }
    saveAlerts(updated);
  };

  const handleLater = () => onClose(alerts); // keep alerts, hide for this session

  const handleManualReview = () => {
    const updated = alerts.filter(a => a.fileId !== item.fileId);
    try { localStorage.setItem('rr-non-receipt-alerts', JSON.stringify(updated)); } catch {}
    onManualReview?.(item); // parent handles navigation
  };

  const hasSiblings = alerts.length > 1;

  return (
    <>
      {/* Lightbox — full image preview */}
      {lightbox && thumbUrl && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <img
            src={thumbUrl}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 12, objectFit: 'contain' }}
          />
          <div style={{
            position: 'absolute', top: 20, right: 20,
            fontSize: 24, color: '#fff', cursor: 'pointer', opacity: 0.7,
          }}>✕</div>
        </div>
      )}

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={handleLater}
      >
        {/* Sheet */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 480, margin: '0 auto',
            background: T.card, borderRadius: '24px 24px 0 0',
            padding: '0 0 env(safe-area-inset-bottom, 24px)',
            animation: 'slideUp 0.25s ease',
            border: `1px solid ${T.bdr}`,
            overflow: 'hidden',
          }}
        >
          {/* Drag handle */}
          <div style={{ paddingTop: 12, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.bdr2 }} />
          </div>

          {/* ── Top: warning header ── */}
          <div style={{ padding: '16px 20px 0', textAlign: 'center' }}>
            {/* Warning icon — SVG, not emoji */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48, borderRadius: 14, marginBottom: 10,
              background: 'rgba(251,146,60,0.12)',
              border: '1px solid rgba(251,146,60,0.2)',
            }}>
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none"
                stroke="#fb923c" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, marginBottom: 4 }}>
              未识别到有效小票信息
            </div>
            <div style={{ fontSize: 12, color: T.tx3, lineHeight: 1.6 }}>
              AI 分析认为这张图片不像是消费小票
            </div>
          </div>

          {/* ── Middle: thumbnail ── */}
          <div style={{ padding: '16px 20px' }}>
            <div
              onClick={() => thumbUrl && setLightbox(true)}
              style={{
                width: '100%', aspectRatio: '16/9',
                borderRadius: 14,
                background: T.sf2,
                border: `1px solid ${T.bdr}`,
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: thumbUrl ? 'zoom-in' : 'default',
                position: 'relative',
              }}
            >
              {thumbLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: T.tx3 }}>
                  <div style={{
                    width: 20, height: 20, border: `2px solid ${T.bdr}`,
                    borderTopColor: T.acc, borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <span style={{ fontSize: 11 }}>加载图片…</span>
                </div>
              )}
              {!thumbLoading && thumbUrl && (
                <>
                  <img
                    src={thumbUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => { setThumbUrl(null); setThumbError(true); }}
                  />
                  {/* Zoom hint overlay */}
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: 'rgba(0,0,0,0.5)', borderRadius: 8,
                    padding: '3px 8px', fontSize: 10, color: '#fff',
                  }}>
                    点击放大
                  </div>
                </>
              )}
              {!thumbLoading && !thumbUrl && (
                /* No thumbnail available — show filename */
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 8, padding: 16, textAlign: 'center',
                }}>
                  <svg width={32} height={32} viewBox="0 0 24 24" fill="none"
                    stroke={T.tx3} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <div style={{ fontSize: 11, color: T.tx3, maxWidth: 180, lineHeight: 1.4 }}>
                    {item.fileName}
                  </div>
                </div>
              )}
            </div>

            {/* Drive link */}
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: T.tx3 }}>
              已存入「待确认」文件夹 ·{' '}
              <a href={item.driveLink} target="_blank" rel="noreferrer"
                style={{ color: T.acc, textDecoration: 'none', fontWeight: 600 }}>
                在 Drive 中查看 ↗
              </a>
            </div>
          </div>

          {/* Counter */}
          {hasSiblings && (
            <div style={{ textAlign: 'center', fontSize: 11, color: T.tx3, marginBottom: 8 }}>
              第 {idx + 1} 张，共 {alerts.length} 张需处理
            </div>
          )}

          {/* ── Bottom: actions ── */}
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Primary destructive */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                width: '100%', padding: '14px',
                background: deleting ? T.sf2 : 'rgba(248,113,113,0.1)',
                border: `1px solid rgba(248,113,113,${deleting ? '0.1' : '0.35'})`,
                borderRadius: 14,
                color: deleting ? T.tx3 : '#f87171',
                fontSize: 14, fontWeight: 700,
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontFamily: F,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.15s',
              }}
            >
              {deleting ? (
                <>
                  <div style={{
                    width: 14, height: 14, border: `2px solid ${T.bdr}`,
                    borderTopColor: '#f87171', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  删除中…
                </>
              ) : (
                <>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  从 Drive 删除此图片
                </>
              )}
            </button>

            {/* Secondary defer */}
            <button
              onClick={handleLater}
              style={{
                width: '100%', padding: '13px',
                background: 'none', border: `1px solid ${T.bdr}`,
                borderRadius: 14, color: T.tx2,
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: F,
              }}
            >
              稍后再决定
            </button>

            {/* Escape hatch — text link style */}
            <button
              onClick={handleManualReview}
              style={{
                width: '100%', padding: '8px',
                background: 'none', border: 'none',
                color: T.tx3, fontSize: 12,
                cursor: 'pointer', fontFamily: F,
                textDecoration: 'underline',
                textDecorationColor: T.bdr2,
                textUnderlineOffset: '3px',
              }}
            >
              AI 认错了？去手动归档 →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
