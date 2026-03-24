import { T, F } from '../constants/theme';

/** Robot working: shown during Google auth loading and review tab loading */
export function RobotWorking({ title = '正在整理小票…', sub = '请在弹出窗口确认 Google 账号' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', gap: 0,
    }}>
      {/* Robot + floating receipts */}
      <div style={{ position: 'relative', marginBottom: 24, width: 120, height: 100 }}>
        {/* Floating receipts being sorted */}
        <span style={{
          position: 'absolute', top: 0, right: 8, fontSize: 26,
          animation: 'floatRight 2.2s ease-in-out infinite',
          display: 'block',
        }}>🧾</span>
        <span style={{
          position: 'absolute', top: 12, left: 4, fontSize: 20,
          animation: 'floatLeft 2.8s ease-in-out infinite 0.6s',
          display: 'block',
        }}>📄</span>
        <span style={{
          position: 'absolute', bottom: 4, right: 0, fontSize: 16,
          animation: 'floatRight 3.2s ease-in-out infinite 1.2s',
          display: 'block', opacity: 0.6,
        }}>🗂️</span>
        {/* Robot body */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          fontSize: 64, lineHeight: 1,
          animation: 'floatUp 2.5s ease-in-out infinite',
        }}>🤖</div>
      </div>

      <div style={{ fontSize: 17, fontWeight: 700, color: T.tx, fontFamily: F, marginBottom: 8, textAlign: 'center' }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: T.tx3, fontFamily: F, textAlign: 'center', lineHeight: 1.7 }}>
        {sub}
      </div>

      {/* Animated dots */}
      <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: T.acc,
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

/** Robot done: shown in ReviewView when no items are pending */
export function RobotDone() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '70px 24px',
      animation: 'scaleIn 0.5s ease',
    }}>
      {/* Robot + success indicators */}
      <div style={{ position: 'relative', marginBottom: 24, width: 120, height: 110 }}>
        {/* Confetti-like decorations */}
        <span style={{
          position: 'absolute', top: 0, right: 6, fontSize: 22,
          animation: 'confetti 1.5s ease-out forwards',
        }}>⭐</span>
        <span style={{
          position: 'absolute', top: 0, left: 10, fontSize: 18,
          animation: 'confetti 1.8s ease-out 0.3s forwards',
        }}>✨</span>
        <span style={{
          position: 'absolute', top: 8, right: -4, fontSize: 16,
          animation: 'confetti 2s ease-out 0.6s forwards',
        }}>🎉</span>
        {/* Checkmark badge */}
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
          width: 28, height: 28, borderRadius: '50%',
          background: T.grn, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#fff',
          animation: 'scaleIn 0.4s ease 0.2s both', zIndex: 2,
          boxShadow: `0 0 12px rgba(52,211,153,0.4)`,
        }}>✓</div>
        {/* Robot */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          fontSize: 64, lineHeight: 1,
          animation: 'bounce 1s ease 0.1s both',
        }}>🤖</div>
      </div>

      <div style={{ fontSize: 20, fontWeight: 800, color: T.tx, fontFamily: F, marginBottom: 8 }}>
        全部搞定了！
      </div>
      <div style={{ fontSize: 13, color: T.tx2, fontFamily: F, textAlign: 'center', lineHeight: 1.8 }}>
        所有小票已自动识别完成<br />
        <span style={{ color: T.grn, fontWeight: 600 }}>没有遗漏</span>，继续去拍下一张吧 📷
      </div>
    </div>
  );
}

/** Not a receipt warning shown in ReviewView for is_receipt=false items */
export function NotReceiptBadge() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
      borderRadius: 20, padding: '3px 10px',
    }}>
      <span style={{ fontSize: 11 }}>⚠️</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.red }}>可能不是小票</span>
    </div>
  );
}
