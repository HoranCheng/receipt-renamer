import React, { useEffect, useCallback } from 'react';
import { T, F } from '../constants/theme';

/**
 * Universal modal component.
 * 
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   title: string (optional)
 *   icon: string/emoji (optional)
 *   children: content
 *   actions: [{ label, onClick, style?, disabled? }] (optional)
 *   danger: boolean — red accent (optional)
 */
export default function Modal({ open, onClose, title, icon, children, actions, danger }) {
  // ESC to close
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 800,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'modalFadeIn 0.15s ease',
      }}
    >
      <div style={{
        background: T.card, borderRadius: 20, padding: '20px 18px',
        maxWidth: 340, width: '100%',
        border: danger ? '1px solid rgba(239,68,68,0.3)' : `1px solid ${T.bdr}`,
        animation: 'modalSlideUp 0.2s ease',
      }}>
        {/* Header */}
        {(icon || title) && (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            {icon && <div style={{ fontSize: 32, marginBottom: 6 }}>{icon}</div>}
            {title && <div style={{
              fontSize: 15, fontWeight: 800,
              color: danger ? T.red : T.tx,
            }}>{title}</div>}
          </div>
        )}

        {/* Body */}
        <div style={{ fontSize: 13, color: T.tx2, lineHeight: 1.7 }}>
          {children}
        </div>

        {/* Actions */}
        {actions && actions.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={a.onClick}
                disabled={a.disabled}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 10,
                  border: i === 0 && actions.length > 1 ? `1px solid ${T.bdr}` : 'none',
                  background: i === 0 && actions.length > 1 ? 'transparent'
                    : danger ? 'rgba(239,68,68,0.85)' : T.acc,
                  color: i === 0 && actions.length > 1 ? T.tx2 : '#fff',
                  fontSize: 13, fontWeight: 700, fontFamily: F,
                  cursor: a.disabled ? 'not-allowed' : 'pointer',
                  opacity: a.disabled ? 0.5 : 1,
                  ...a.style,
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

/**
 * Convenience: Alert modal (info/error, single OK button)
 */
export function AlertModal({ open, onClose, title, message, icon, danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title} icon={icon || (danger ? '⚠️' : 'ℹ️')} danger={danger}
      actions={[{ label: '好的', onClick: onClose }]}
    >
      {message}
    </Modal>
  );
}

/**
 * Convenience: Confirm modal (cancel + confirm)
 */
export function ConfirmModal({ open, onClose, onConfirm, title, message, icon, danger, confirmLabel = '确认', cancelLabel = '取消' }) {
  return (
    <Modal open={open} onClose={onClose} title={title} icon={icon || '🤔'} danger={danger}
      actions={[
        { label: cancelLabel, onClick: onClose },
        { label: confirmLabel, onClick: () => { onConfirm?.(); onClose?.(); } },
      ]}
    >
      {message}
    </Modal>
  );
}
