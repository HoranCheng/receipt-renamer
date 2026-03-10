import { useState } from 'react';
import { T, FM } from '../constants/theme';
import { CAT_ICON, CAT_CLR } from '../constants';
import { getFileThumbnailUrl, getFileAsBlobUrl } from '../services/google';
import Header from '../components/Header';
import Field from '../components/Field';
import Btn from '../components/Btn';
import CatChips from '../components/CatChips';
import StatusDot from '../components/StatusDot';

// Lightweight lightbox for receipt photo preview
function PhotoLightbox({ src, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <img src={src} alt="" style={{
        maxWidth: '92vw', maxHeight: '85vh',
        borderRadius: 8, objectFit: 'contain',
      }} />
      <button onClick={onClose} style={{
        position: 'absolute', top: 16, right: 16,
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)', border: 'none',
        color: '#fff', fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>✕</button>
    </div>
  );
}

export default function DetailView({ receipt, onSave, onBack }) {
  const [edit, setEdit] = useState({ ...receipt });
  // T-020: Photo preview state
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [fullUrl, setFullUrl] = useState(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  const handleSave = () => {
    onSave({ ...receipt, ...edit });
  };

  const confLevel =
    (edit.confidence || 0) >= 75
      ? 'ok'
      : (edit.confidence || 0) >= 50
        ? 'warn'
        : 'err';

  return (
    <div style={{ padding: '0 16px 100px' }}>
      <Header title="收据详情" sub={receipt.originalName || receipt.newName} />

      {/* Confidence badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '10px 14px',
          background: T.card,
          borderRadius: 12,
          border: `1px solid ${T.bdr}`,
        }}
      >
        <StatusDot level={confLevel} />
        <span style={{ fontSize: 12, color: T.tx2 }}>
          置信度 {receipt.confidence || 0}%
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: T.tx3,
            fontFamily: FM,
          }}
        >
          {receipt.createdAt
            ? new Date(receipt.createdAt).toLocaleDateString('zh-CN')
            : '—'}
        </span>
      </div>

      {/* Category display */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          padding: '14px 16px',
          background: `${CAT_CLR[edit.category] || CAT_CLR.Other}10`,
          border: `1px solid ${CAT_CLR[edit.category] || CAT_CLR.Other}30`,
          borderRadius: 14,
        }}
      >
        <span style={{ fontSize: 28 }}>
          {CAT_ICON[edit.category] || '📄'}
        </span>
        <div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: T.tx,
              fontFamily: FM,
            }}
          >
            ${parseFloat(edit.amount || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: T.tx2 }}>
            {edit.merchant || 'Unknown'} · {edit.date || '—'}
          </div>
        </div>
      </div>

      {/* T-020: Receipt photo preview — loads from Drive on demand, no permanent local storage */}
      {(receipt.driveId || receipt.fileId) && (
        <div style={{
          background: T.card, border: `1px solid ${T.bdr}`,
          borderRadius: 16, overflow: 'hidden', marginBottom: 14,
        }}>
          <div
            onClick={async () => {
              const fid = receipt.driveId || receipt.fileId;
              if (!fid) return;
              if (fullUrl) { setShowLightbox(true); return; }
              if (thumbUrl && !fullUrl) {
                // Load full size
                setFullLoading(true);
                try {
                  const url = await getFileAsBlobUrl(fid);
                  setFullUrl(url);
                  setShowLightbox(true);
                } catch { /* stay on thumb */ }
                setFullLoading(false);
                return;
              }
              // First click: load thumbnail
              setThumbLoading(true);
              try {
                const url = await getFileThumbnailUrl(fid);
                if (url) {
                  setThumbUrl(url);
                } else {
                  // No thumbnail, try full image directly
                  const blobUrl = await getFileAsBlobUrl(fid);
                  setFullUrl(blobUrl);
                  setShowLightbox(true);
                }
              } catch {
                // Can't load
              }
              setThumbLoading(false);
            }}
            style={{
              width: '100%', aspectRatio: thumbUrl ? '4/3' : 'auto',
              background: T.sf2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', position: 'relative',
              padding: thumbUrl ? 0 : '16px',
            }}
          >
            {thumbLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.tx3, padding: '20px' }}>
                <div style={{
                  width: 16, height: 16, border: `2px solid ${T.bdr}`,
                  borderTopColor: T.acc, borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: 12 }}>加载图片…</span>
              </div>
            )}
            {!thumbLoading && thumbUrl && (
              <>
                <img src={thumbUrl} alt="" referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                <div style={{
                  position: 'absolute', bottom: 8, right: 8,
                  background: 'rgba(0,0,0,0.5)', borderRadius: 8,
                  padding: '4px 10px', fontSize: 10, color: '#fff',
                }}>
                  {fullLoading ? '加载原图…' : '点击查看原图'}
                </div>
              </>
            )}
            {!thumbLoading && !thumbUrl && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                color: T.acc, fontSize: 13, fontWeight: 600,
              }}>
                <span>📷</span>
                <span>点击加载小票照片</span>
              </div>
            )}
          </div>
        </div>
      )}

      {showLightbox && (fullUrl || thumbUrl) && (
        <PhotoLightbox src={fullUrl || thumbUrl} onClose={() => setShowLightbox(false)} />
      )}

      {/* Editable fields */}
      <Field
        label="日期"
        icon="📅"
        value={edit.date}
        onChange={(v) => setEdit((d) => ({ ...d, date: v }))}
        type="date"
      />
      <Field
        label="商户"
        icon="🏪"
        value={edit.merchant}
        onChange={(v) => setEdit((d) => ({ ...d, merchant: v }))}
      />
      <Field
        label="金额"
        icon="💰"
        value={edit.amount}
        onChange={(v) => setEdit((d) => ({ ...d, amount: v }))}
        type="number"
        mono
      />
      <Field
        label="货币"
        icon="💱"
        value={edit.currency}
        onChange={(v) => setEdit((d) => ({ ...d, currency: v }))}
      />

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: T.tx3,
            letterSpacing: '1px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 6,
          }}
        >
          🏷️ 分类
        </label>
        <CatChips
          value={edit.category}
          onChange={(v) => setEdit((d) => ({ ...d, category: v }))}
        />
      </div>

      {/* Items list */}
      {edit.items && edit.items.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T.tx3,
              letterSpacing: '1px',
              marginBottom: 6,
              display: 'block',
            }}
          >
            📋 识别项目
          </label>
          <div
            style={{
              background: T.sf,
              border: `1px solid ${T.bdr}`,
              borderRadius: 10,
              padding: '10px 14px',
            }}
          >
            {edit.items.map((item, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: T.tx2,
                  padding: '3px 0',
                  borderBottom:
                    i < edit.items.length - 1
                      ? `1px solid ${T.bdr}`
                      : 'none',
                }}
              >
                · {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div
        style={{
          background: T.sf,
          border: `1px solid ${T.bdr}`,
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: T.tx3, marginBottom: 8 }}>
          📎 文件信息
        </div>
        {receipt.originalName && (
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 4 }}>
            原始文件名: {receipt.originalName}
          </div>
        )}
        {receipt.newName && (
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 4 }}>
            重命名为: {receipt.newName}
          </div>
        )}
        {receipt.source && (
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 4 }}>
            来源: {receipt.source === 'camera' ? '📷 拍照' : '📂 Drive'}
          </div>
        )}
        {receipt.fileId && (
          <a
            href={`https://drive.google.com/file/d/${receipt.fileId}/view`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: T.acc,
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            🔗 在 Google Drive 中打开
          </a>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn full onClick={onBack} style={{ flex: 1 }}>
          ← 返回
        </Btn>
        <Btn primary full onClick={handleSave} style={{ flex: 2 }}>
          💾 保存修改
        </Btn>
      </div>
    </div>
  );
}
