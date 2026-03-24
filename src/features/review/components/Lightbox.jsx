import { useState, useRef } from 'react';

// ─── Image Lightbox with pinch-to-zoom ────────────────────────────────────────

export default function Lightbox({ src, onClose, onDelete }) {
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
      {/* Top bar — safe area aware */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
        zIndex: 601,
      }}>
        {/* Delete button (left) */}
        {onDelete ? (
          <button onClick={onDelete} style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(239,68,68,0.25)', border: 'none',
            color: '#f87171', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}>🗑</button>
        ) : <div style={{ width: 44 }} />}
        {/* Close button (right) */}
        <button onClick={onClose} style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)', border: 'none',
          color: '#fff', fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}>✕</button>
      </div>
      {/* Swipe-down hint */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        fontSize: 12, color: 'rgba(255,255,255,0.5)',
      }}>点击空白处关闭</div>
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
