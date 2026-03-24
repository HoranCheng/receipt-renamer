import { T, F } from '../constants/theme';

// Clean SVG icons — Feather Icons style, stroke-only, 24×24
const icons = {
  // Camera — clear "scan / capture" intent
  scan: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  ),
  // Inbox tray — "items waiting for review" (not ⚠️ which implies error)
  review: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  ),
  // List with bullets — "log / records"
  log: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/>
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/>
      <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  // Sliders — "settings / preferences"
  cfg: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/>
      <line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/>
      <line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/>
      <line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  ),
};

const tabs = [
  { id: 'scan',   lb: '扫描' },
  { id: 'review', lb: '待审' },
  { id: 'log',    lb: '记录' },
  { id: 'cfg',    lb: '设置' },
];

export default function Nav({ view, set, reviewCount = 0 }) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: `${T.sf}ee`,
        borderTop: `1px solid ${T.bdr}`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '8px 0 env(safe-area-inset-bottom, 8px)',
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      {tabs.map((t) => {
        const active = view === t.id;
        const isScan = t.id === 'scan';
        return (
          <button
            key={t.id}
            onClick={() => set(t.id)}
            style={{
              background: active && isScan ? T.acc : 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: isScan ? '7px 22px' : '6px 16px',
              borderRadius: isScan ? 24 : 12,
              color: active ? (isScan ? '#18181B' : T.acc) : T.tx3,
              transition: 'all 0.2s ease',
              flex: 1,
              stroke: 'currentColor',
            }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              {icons[t.id]}
              {t.id === 'review' && reviewCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -8,
                  background: '#f87171', color: '#fff',
                  fontSize: 9, fontWeight: 800, fontFamily: F,
                  borderRadius: 10, padding: '1px 5px',
                  minWidth: 14, textAlign: 'center',
                  lineHeight: '14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}>{reviewCount > 99 ? '99+' : reviewCount}</span>
              )}
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.4px',
              fontFamily: F,
              color: active ? (isScan ? '#18181B' : T.acc) : T.tx3,
            }}>
              {t.lb}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
