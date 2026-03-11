import { useState } from 'react';
import { T, F } from '../constants/theme';
import { CAT_ICON, CAT_CLR } from '../constants';

/**
 * Expandable panel showing live AI recognition results.
 * Collapsed: shows "AI 识别中 · 2/5" pill (tap to expand)
 * Expanded: shows each result as it comes in
 */
export default function AiLivePanel({ procStatus, liveResults = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (!procStatus?.processing && liveResults.length === 0) return null;

  const total = procStatus?.total || 0;
  const done = procStatus?.done || 0;
  const failed = procStatus?.failed || 0;
  const isActive = procStatus?.processing;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Collapsed pill — tap to expand */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', padding: '12px 16px',
          background: isActive
            ? 'linear-gradient(135deg, rgba(129,140,248,0.12), rgba(250,204,21,0.08))'
            : 'rgba(52,211,153,0.08)',
          border: `1px solid ${isActive ? 'rgba(129,140,248,0.25)' : 'rgba(52,211,153,0.25)'}`,
          borderRadius: expanded ? '16px 16px 0 0' : 16,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'border-radius 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isActive ? (
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              border: '2px solid rgba(129,140,248,0.6)',
              borderTopColor: '#818cf8',
              animation: 'spin 0.8s linear infinite',
            }} />
          ) : (
            <span style={{ fontSize: 16 }}>✅</span>
          )}
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, fontFamily: F }}>
              {isActive ? `AI 识别中 · ${done}/${total}` : `识别完成 · ${done} 张`}
            </div>
            {failed > 0 && (
              <div style={{ fontSize: 11, color: T.red, marginTop: 1 }}>
                {failed} 张识别失败
              </div>
            )}
          </div>
        </div>
        <span style={{
          fontSize: 11, color: T.tx3,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
        }}>▼</span>
      </button>

      {/* Expanded results list */}
      {expanded && (
        <div style={{
          background: T.card,
          border: `1px solid ${isActive ? 'rgba(129,140,248,0.25)' : 'rgba(52,211,153,0.25)'}`,
          borderTop: 'none',
          borderRadius: '0 0 16px 16px',
          padding: '8px 12px 12px',
          maxHeight: 300,
          overflowY: 'auto',
        }}>
          {liveResults.length === 0 ? (
            <div style={{ fontSize: 12, color: T.tx3, textAlign: 'center', padding: '12px 0' }}>
              等待识别结果…
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {liveResults.map((r, i) => (
                <ResultRow key={r.id || i} result={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result }) {
  const cat = result.category || 'Other';
  const icon = CAT_ICON[cat] || '🧾';
  const color = CAT_CLR[cat] || T.tx2;
  const merchant = result.merchant || '未知商家';
  const amount = result.amount ? `$${parseFloat(result.amount).toFixed(2)}` : '';
  const isReview = result.status === 'review';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 10,
      background: isReview ? 'rgba(250,204,21,0.06)' : 'rgba(52,211,153,0.04)',
      animation: 'fadeUp 0.3s ease',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: T.tx,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {merchant}
        </div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{result.date || '?'}</span>
          <span>·</span>
          <span style={{ color }}>{cat}</span>
          {result.confidence != null && (
            <>
              <span>·</span>
              <span style={{
                color: result.confidence >= 70 ? T.grn : T.acc,
              }}>{result.confidence}%</span>
            </>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.tx }}>{amount}</div>
        {isReview && (
          <div style={{ fontSize: 9, color: T.acc, fontWeight: 700, marginTop: 1 }}>待审核</div>
        )}
      </div>
    </div>
  );
}
