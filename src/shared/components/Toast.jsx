import { useState, useEffect, useCallback, useRef } from 'react';
import { T, F } from '../constants/theme';

/**
 * Lightweight toast notification system.
 * Usage:
 *   const { showToast, ToastContainer } = useToast();
 *   showToast('上传完成 ✅', 'success');
 *   return <><ToastContainer />...</>
 */

const ICONS = {
  success: '✅',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

const COLORS = {
  success: { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', text: '#34d399' },
  info: { bg: 'rgba(250,204,21,0.1)', border: 'rgba(250,204,21,0.25)', text: T.acc },
  warn: { bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)', text: '#fb923c' },
  error: { bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', text: '#f87171' },
};

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((message, type = 'info', durationMs = 3000) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type, entering: true }]);
    // Start exit animation
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, entering: false } : t));
    }, durationMs - 400);
    // Remove from DOM
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
  }, []);

  const ToastContainer = useCallback(() => (
    <div style={{
      position: 'fixed', top: 'env(safe-area-inset-top, 12px)',
      left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 8, paddingTop: 12,
      pointerEvents: 'none', width: '90%', maxWidth: 360,
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info;
        return (
          <div key={t.id} style={{
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 14, padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            opacity: t.entering ? 1 : 0,
            transform: t.entering ? 'translateY(0)' : 'translateY(-10px)',
            transition: 'all 0.35s ease',
            pointerEvents: 'auto',
            width: '100%',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{ICONS[t.type] || ICONS.info}</span>
            <span style={{
              fontSize: 13, fontWeight: 600, color: c.text,
              fontFamily: F, lineHeight: 1.4,
            }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  ), [toasts]);

  return { showToast, ToastContainer };
}
