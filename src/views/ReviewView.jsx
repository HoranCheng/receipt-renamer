import { useState, useEffect, useRef } from 'react';
import { T, F } from '../constants/theme';
import {
  findOrCreateFolder,
  listFilesInFolder,
  renameAndMoveFile,
  updateFileMetadata,
  appendToSheet,
  deleteFile,
  getFileThumbnailUrl,
  getFileAsBlobUrl,
} from '../services/google';
import { getCachedImageUrl, removeCachedImage } from '../services/imageCache';
import Header from '../components/Header';
import Btn from '../components/Btn';
import Field from '../components/Field';
import CatChips from '../components/CatChips';
import StatusDot from '../components/StatusDot';
import { RobotWorking, RobotDone, NotReceiptBadge } from '../components/RobotScene';

// ─── Image Lightbox with pinch-to-zoom ────────────────────────────────────────

function Lightbox({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const lastDist = useRef(null);
  const lastTouch = useRef(null);
  const containerRef = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      lastDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else if (e.touches.length === 1 && scale > 1) {
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastDist.current) {
        const ratio = dist / lastDist.current;
        setScale(s => Math.min(5, Math.max(1, s * ratio)));
      }
      lastDist.current = dist;
    } else if (e.touches.length === 1 && scale > 1 && lastTouch.current) {
      const dx = e.touches[0].clientX - lastTouch.current.x;
      const dy = e.touches[0].clientY - lastTouch.current.y;
      setTranslate(t => ({ x: t.x + dx, y: t.y + dy }));
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = () => {
    lastDist.current = null;
    lastTouch.current = null;
    if (scale <= 1) setTranslate({ x: 0, y: 0 });
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={(e) => { if (e.target === containerRef.current) onClose(); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
        touchAction: 'none',
      }}
    >
      <img
        src={src}
        alt=""
        onDoubleClick={handleDoubleClick}
        style={{
          maxWidth: '92vw', maxHeight: '85vh',
          borderRadius: 8, objectFit: 'contain',
          transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
          transition: scale === 1 ? 'transform 0.2s' : 'none',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}
        draggable={false}
      />
      {/* Close button */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 16, right: 16,
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)', border: 'none',
        color: '#fff', fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}>✕</button>
      {/* Zoom hint */}
      {scale === 1 && (
        <div style={{
          position: 'absolute', bottom: 40, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.5)', borderRadius: 20,
          padding: '6px 14px', fontSize: 11, color: 'rgba(255,255,255,0.7)',
          whiteSpace: 'nowrap',
        }}>
          双击放大 · 两指缩放
        </div>
      )}
    </div>
  );
}

// ─── Main ReviewView ──────────────────────────────────────────────────────────

export default function ReviewView({ config, onReceiptProcessed }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [approving, setApproving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [reviewFolderId, setReviewFolderId] = useState(null);
  const [validFolderId, setValidFolderId] = useState(null);
  // Image preview states
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const fullSizeCache = useRef({}); // fileId → blobUrl

  const load = async () => {
    setLoading(true);
    try {
      const [reviewId, validId] = await Promise.all([
        findOrCreateFolder(config.reviewFolder || '小票待确认'),
        findOrCreateFolder(config.validatedFolder || '小票已存档'),
      ]);
      setReviewFolderId(reviewId);
      setValidFolderId(validId);
      const { files: driveFiles } = await listFilesInFolder(reviewId);
      const enriched = driveFiles.map((f) => {
        let aiData = {};
        try { aiData = JSON.parse(f.description || '{}'); } catch {}
        return { ...f, aiData };
      });
      setFiles(enriched);
    } catch (e) {
      alert('加载失败：' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (config.connected) load();
  }, []);

  // Load preview when editing starts
  useEffect(() => {
    if (!editing) { setPreviewUrl(null); return; }
    setPreviewLoading(true);
    setPreviewUrl(null);
    // Try the file's existing thumbnailLink first
    const file = files.find(f => f.id === editing.fileId);
    if (file?.thumbnailLink) {
      setPreviewUrl(file.thumbnailLink);
      setPreviewLoading(false);
    } else {
      getFileThumbnailUrl(editing.fileId).then(url => {
        setPreviewUrl(url);
        setPreviewLoading(false);
      }).catch(() => setPreviewLoading(false));
    }
  }, [editing?.fileId]);

  const handleEdit = (file) => {
    setEditing({
      fileId: file.id,
      name: file.name,
      isNotReceipt: file.aiData.reviewStatus === 'not_receipt',
      data: {
        date: file.aiData.date || '',
        merchant: file.aiData.merchant || '',
        amount: file.aiData.amount ?? '',
        category: file.aiData.category || 'Other',
        currency: file.aiData.currency || 'AUD',
        confidence: file.aiData.confidence || 0,
        reviewReason: file.aiData.reviewReason || '需要核查',
        ...file.aiData,
      },
    });
  };

  const handleApprove = async () => {
    if (!editing) return;
    setApproving(editing.fileId);
    try {
      const d = editing.data;
      const ext = editing.name.split('.').pop() || 'jpg';
      const safeDate = (d.date || 'unknown-date').replace(/-/g, '.');
      const safeMerchant = (d.merchant || 'unknown')
        .replace(/[/\\?%*:|"<>]/g, '-')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      const safeAmount = parseFloat(d.amount || 0).toFixed(2);
      const newName = `${safeDate} ${safeMerchant} ${safeAmount}.${ext}`;

      await renameAndMoveFile(editing.fileId, newName, validFolderId, reviewFolderId);
      await updateFileMetadata(editing.fileId, {
        description: JSON.stringify({ ...d, reviewStatus: 'approved', approvedAt: new Date().toISOString() }),
      });

      if (config.sheetId) {
        try {
          const link = `https://drive.google.com/file/d/${editing.fileId}/view`;
          await appendToSheet(config.sheetId, config.sheetName || 'receipt_index', [
            d.date, d.merchant, d.category, d.amount, d.currency || 'AUD', link,
          ]);
        } catch {}
      }

      // Add to local records
      try {
        onReceiptProcessed?.({
          date: d.date, merchant: d.merchant, amount: d.amount,
          category: d.category, currency: d.currency || 'AUD',
          confidence: d.confidence, originalName: editing.name,
          newName: `${safeDate} ${safeMerchant} ${safeAmount}.${ext}`,
          createdAt: new Date().toISOString(),
        });
      } catch {}

      // Clean local image cache — file is now in validated folder
      removeCachedImage(editing.fileId).catch(() => {});
      setFiles(prev => prev.filter(f => f.id !== editing.fileId));
      setEditing(null);
    } catch (e) {
      alert('操作失败：' + e.message);
    }
    setApproving(null);
  };

  const handleDelete = async (fileId) => {
    setDeleting(fileId);
    try {
      await deleteFile(fileId);
      // Clean local image cache
      removeCachedImage(fileId).catch(() => {});
      setFiles(prev => prev.filter(f => f.id !== fileId));
      if (editing?.fileId === fileId) setEditing(null);
      // Also clean from non-receipt alerts
      try {
        const key = 'rr-non-receipt-alerts';
        const alerts = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = alerts.filter(a => a.fileId !== fileId);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {}
    } catch (e) {
      alert('删除失败：' + e.message);
    }
    setDeleting(null);
  };

  if (!config.connected) {
    return (
      <div style={{ padding: '0 16px 100px' }}>
        <Header title="待审核" sub="请先连接 Google" />
      </div>
    );
  }

  // ─── Edit / Detail panel ────────────────────────────────────────────────────

  if (editing) {
    const d = editing.data;
    const isNotReceipt = editing.isNotReceipt;
    return (
      <div style={{ padding: '0 16px 100px' }}>
        <Header
          title={isNotReceipt ? '确认此图片' : '核查小票'}
          sub={isNotReceipt ? 'AI 认为这可能不是小票' : `${d.reviewReason || '需要确认'} · ${d.confidence || '?'}% 置信度`}
        />

        {/* ── Image preview ── */}
        <div style={{
          background: T.card, border: `1px solid ${T.bdr}`,
          borderRadius: 16, overflow: 'hidden', marginBottom: 14,
        }}>
          <div
            onClick={async () => {
              if (!editing?.fileId || lightboxLoading) return;
              // Check in-memory cache
              if (fullSizeCache.current[editing.fileId]) {
                setLightboxUrl(fullSizeCache.current[editing.fileId]);
                return;
              }
              setLightboxLoading(true);
              try {
                // 1. Try local IndexedDB cache (original photo blob, instant)
                const cached = await getCachedImageUrl(editing.fileId);
                if (cached) {
                  fullSizeCache.current[editing.fileId] = cached;
                  setLightboxUrl(cached);
                  setLightboxLoading(false);
                  return;
                }
                // 2. Fall back to downloading full image from Drive
                const blobUrl = await getFileAsBlobUrl(editing.fileId);
                fullSizeCache.current[editing.fileId] = blobUrl;
                setLightboxUrl(blobUrl);
              } catch {
                if (previewUrl) setLightboxUrl(previewUrl);
              }
              setLightboxLoading(false);
            }}
            style={{
              width: '100%',
              aspectRatio: '4/3',
              background: T.sf2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: previewUrl ? 'zoom-in' : 'default',
              position: 'relative',
            }}
          >
            {previewLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: T.tx3 }}>
                <div style={{
                  width: 20, height: 20, border: `2px solid ${T.bdr}`,
                  borderTopColor: T.acc, borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: 11 }}>加载图片…</span>
              </div>
            )}
            {!previewLoading && previewUrl && (
              <>
                <img src={previewUrl} alt="" referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={() => setPreviewUrl(null)}
                />
                <div style={{
                  position: 'absolute', bottom: 8, right: 8,
                  background: 'rgba(0,0,0,0.5)', borderRadius: 8,
                  padding: '4px 10px', fontSize: 10, color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {lightboxLoading ? (
                    <>
                      <div style={{
                        width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      加载原图…
                    </>
                  ) : '点击查看原图'}
                </div>
              </>
            )}
            {!previewLoading && !previewUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: T.tx3 }}>
                <svg width={32} height={32} viewBox="0 0 24 24" fill="none"
                  stroke={T.tx3} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span style={{ fontSize: 11 }}>无法加载预览</span>
              </div>
            )}
          </div>
          {/* File info strip */}
          <div style={{
            padding: '8px 12px', borderTop: `1px solid ${T.bdr}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {editing.name}
            </span>
            <a href={`https://drive.google.com/file/d/${editing.fileId}/view`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: T.acc, textDecoration: 'none', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
              Drive ↗
            </a>
          </div>
        </div>

        {/* Status indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
          padding: '8px 12px', background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 10,
        }}>
          {isNotReceipt ? (
            <>
              <NotReceiptBadge />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>AI 认为不是小票</div>
                <div style={{ fontSize: 11, color: T.tx3 }}>如果确实是小票，可以手动填写信息后通过</div>
              </div>
            </>
          ) : (
            <>
              <StatusDot level={(d.confidence || 0) >= 70 ? 'ok' : (d.confidence || 0) >= 40 ? 'warn' : 'err'} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{d.reviewReason || '需要核查'}</div>
                <div style={{ fontSize: 11, color: T.tx3 }}>置信度 {d.confidence || 0}% · 请确认信息后通过</div>
              </div>
            </>
          )}
        </div>

        {/* Editable fields */}
        <Field label="日期" icon="📅" value={d.date} type="date"
          onChange={v => setEditing(e => ({ ...e, data: { ...e.data, date: v } }))} />
        <Field label="商家" icon="🏪" value={d.merchant}
          onChange={v => setEditing(e => ({ ...e, data: { ...e.data, merchant: v } }))} />
        <Field label="金额" icon="💰" value={d.amount} type="number" mono
          onChange={v => setEditing(e => ({ ...e, data: { ...e.data, amount: v } }))} />
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: T.tx3, letterSpacing: '1px', display: 'block', marginBottom: 6 }}>
            🏷️ 分类
          </label>
          <CatChips value={d.category} onChange={v => setEditing(e => ({ ...e, data: { ...e.data, category: v } }))} />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <Btn full onClick={() => setEditing(null)} style={{ flex: 1 }}>返回</Btn>
          <Btn primary full onClick={handleApprove} disabled={!!approving} style={{ flex: 2 }}>
            {approving === editing.fileId ? '处理中…' : '✅ 通过并归档'}
          </Btn>
        </div>

        {/* Delete option — less prominent */}
        <button
          onClick={() => {
            if (window.confirm('确定从 Drive 删除这个文件？此操作不可撤销。')) {
              handleDelete(editing.fileId);
            }
          }}
          disabled={deleting === editing.fileId}
          style={{
            width: '100%', marginTop: 12, padding: '12px',
            background: 'none', border: 'none',
            color: deleting === editing.fileId ? T.tx3 : T.red,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {deleting === editing.fileId ? (
            <>
              <div style={{
                width: 12, height: 12, border: `2px solid ${T.bdr}`,
                borderTopColor: T.red, borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              删除中…
            </>
          ) : (
            <>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              删除此文件
            </>
          )}
        </button>

        {/* Lightbox */}
        {lightboxUrl && <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      </div>
    );
  }

  // ─── File list ──────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '0 16px 100px' }}>
      <Header title="待审核" sub={`${files.length} 个需要处理`} />

      <Btn small onClick={load} style={{ marginBottom: 16, width: '100%' }}>🔄 刷新</Btn>

      {loading ? (
        <RobotWorking title="正在检查待审核小票…" sub="从 Google Drive 加载中" />
      ) : files.length === 0 ? (
        <RobotDone />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {files.map(f => {
            const d = f.aiData;
            const conf = d.confidence || 0;
            const isNotReceipt = d.reviewStatus === 'not_receipt';
            const isDeletingThis = deleting === f.id;

            return (
              <div key={f.id} style={{
                background: T.card, border: `1px solid ${T.bdr}`,
                borderLeft: `3px solid ${isNotReceipt ? '#fb923c' : conf < 40 ? T.red : T.acc}`,
                borderRadius: 13, padding: '14px',
                animation: 'fadeUp 0.3s ease both',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  {f.thumbnailLink ? (
                    <img src={f.thumbnailLink} alt="" referrerPolicy="no-referrer"
                      style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: `1px solid ${T.bdr}` }} />
                  ) : (
                    <div style={{
                      width: 56, height: 56, borderRadius: 10, background: T.sf2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
                    }}>🧾</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      {isNotReceipt ? (
                        <NotReceiptBadge />
                      ) : (
                        <>
                          <StatusDot level={conf >= 70 ? 'ok' : conf >= 40 ? 'warn' : 'err'} />
                          <span style={{ fontSize: 11, color: T.tx3 }}>{conf}% · {d.reviewReason || '需要核查'}</span>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isNotReceipt ? f.name : (d.merchant || f.name)}
                    </div>
                    {!isNotReceipt && (
                      <div style={{ fontSize: 12, color: T.tx2, marginTop: 2 }}>
                        {d.date || '?'} · {d.currency || 'AUD'} {parseFloat(d.amount || 0).toFixed(2)} · {d.category || '?'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn small primary full onClick={() => handleEdit(f)} style={{ flex: 1 }}>
                    {isNotReceipt ? '查看详情 →' : '核查并通过 →'}
                  </Btn>
                  <button
                    onClick={() => {
                      if (window.confirm('确定从 Drive 删除？')) handleDelete(f.id);
                    }}
                    disabled={isDeletingThis}
                    style={{
                      flexShrink: 0, padding: '8px 14px',
                      background: 'rgba(248,113,113,0.08)',
                      border: `1px solid rgba(248,113,113,0.25)`,
                      borderRadius: 10, cursor: isDeletingThis ? 'not-allowed' : 'pointer',
                      color: isDeletingThis ? T.tx3 : '#f87171',
                      fontSize: 12, fontWeight: 700, fontFamily: F,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {isDeletingThis ? (
                      <div style={{
                        width: 12, height: 12, border: `2px solid ${T.bdr}`,
                        borderTopColor: '#f87171', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                    ) : (
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    )}
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
