import { useState, useEffect, useRef } from 'react';
import { T, F, FM } from '../constants/theme';
import { CAT_ICON, CAT_CLR } from '../constants';
import { readSheetRecords } from '../services/google';
import Header from '../components/Header';
import { haptic } from '../utils/haptics';

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(receipts) {
  const header =
    'Date,Merchant,Category,Amount,Currency,Confidence,Original Filename,New Filename,Processed At';
  const rows = receipts.map((r) =>
    [
      r.date || '',
      `"${(r.merchant || '').replace(/"/g, '""')}"`,
      r.category || '',
      r.amount || 0,
      r.currency || 'AUD',
      r.confidence || 0,
      `"${(r.originalName || '').replace(/"/g, '""')}"`,
      `"${(r.newName || '').replace(/"/g, '""')}"`,
      r.createdAt || '',
    ].join(',')
  );
  downloadFile(
    [header, ...rows].join('\n'),
    `receipts_${new Date().toISOString().slice(0, 10)}.csv`,
    'text/csv'
  );
}

function exportJSON(receipts) {
  downloadFile(
    JSON.stringify(receipts, null, 2),
    `receipts_backup_${new Date().toISOString().slice(0, 10)}.json`,
    'application/json'
  );
}

// ─── Time filter helper ───────────────────────────────────────────────────────

function parseReceiptDate(r) {
  // date format: "2026.03.10" or "2026-03-10"
  if (!r.date) return null;
  return new Date(r.date.replace(/\./g, '-'));
}

function filterByTime(receipts, period) {
  if (period === 'all') return receipts;
  const now = new Date();
  return receipts.filter((r) => {
    const d = parseReceiptDate(r);
    if (!d || isNaN(d)) return false;
    if (period === 'month') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === 'week') {
      return (now - d) <= 7 * 24 * 60 * 60 * 1000;
    }
    return true;
  });
}

const PERIOD_LABELS = { week: '本周', month: '本月', all: '全部' };
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function periodSub(period) {
  const now = new Date();
  if (period === 'month') return `${now.getFullYear()}年${MONTH_NAMES[now.getMonth()]}`;
  if (period === 'week') return '最近 7 天';
  return '全部记录';
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ receipts, periodLabel }) {
  const circum = 2 * Math.PI * 44; // ~276.46
  const totalAll = receipts.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const cats = [...new Set(receipts.map((r) => r.category || 'Other'))];
  const catTotals = cats
    .map((c) => ({
      cat: c,
      total: receipts
        .filter((r) => (r.category || 'Other') === c)
        .reduce((s, r) => s + parseFloat(r.amount || 0), 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  let cumulOffset = 0;
  const segments = catTotals.map(({ cat, total }) => {
    const segLen = totalAll > 0 ? (total / totalAll) * circum : 0;
    const offset = cumulOffset;
    cumulOffset += segLen;
    return { cat, total, segLen, offset };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ position: 'relative', width: 104, height: 104 }}>
        <svg
          viewBox="0 0 104 104"
          width={104}
          height={104}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background circle */}
          <circle cx={52} cy={52} r={44} fill="none" stroke={T.bdr} strokeWidth={10} />
          {/* Segments */}
          {segments.map(({ cat, segLen, offset }) => (
            <circle
              key={cat}
              cx={52}
              cy={52}
              r={44}
              fill="none"
              stroke={CAT_CLR[cat] || T.acc}
              strokeWidth={10}
              strokeDasharray={`${segLen} ${circum}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        {/* Center text — not rotated */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.tx, fontFamily: FM, lineHeight: 1 }}>
            ${totalAll.toFixed(0)}
          </span>
          <span style={{ fontSize: 10, color: T.tx3, fontFamily: F, marginTop: 2 }}>{periodLabel || '合计'}</span>
        </div>
      </div>

      {/* Category pills below donut */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
        scrollbarWidth: 'none', marginTop: 10, maxWidth: '100%',
      }}>
        {catTotals.map(({ cat, total }) => (
          <div key={cat} style={{
            flexShrink: 0,
            padding: '4px 10px',
            borderRadius: 20,
            background: `${CAT_CLR[cat] || T.acc}18`,
            border: `1px solid ${CAT_CLR[cat] || T.acc}40`,
            fontSize: 11,
            color: CAT_CLR[cat] || T.acc,
            fontFamily: F,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>
            {CAT_ICON[cat]} {cat} ${total.toFixed(0)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Swipe-to-delete row
function SwipeRow({ r, onDelete, onDetail }) {
  const [offsetX, setOffsetX] = useState(0);
  const touchStartX = useRef(null);
  const cat = r.category || 'Other';
  const catColor = CAT_CLR[cat] || T.acc;
  const isOpen = offsetX <= -60;

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx < 0) {
      setOffsetX(Math.max(dx, -72));
    } else if (offsetX < 0) {
      setOffsetX(Math.min(0, offsetX + dx));
      touchStartX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    setOffsetX(offsetX < -40 ? -72 : 0);
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14 }}>
      {/* Delete area */}
      <div style={{
        position: 'absolute',
        right: 0, top: 0, bottom: 0,
        width: 72,
        background: T.red,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '0 14px 14px 0',
      }}>
        <button
          onClick={() => { haptic('light'); onDelete(r.id); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#fff', fontSize: 20,
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          🗑️
        </button>
      </div>

      {/* Row content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => { if (!isOpen) onDetail && onDetail(r); }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: touchStartX.current ? 'none' : 'transform 0.2s ease',
          background: T.card,
          border: `1px solid ${T.bdr}`,
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        {/* Category icon square */}
        <div style={{
          width: 40, height: 40,
          borderRadius: 12,
          background: `${catColor}26`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {CAT_ICON[cat] || '📄'}
        </div>

        {/* Merchant + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: T.tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {r.merchant || r.originalName || '未知商家'}
          </div>
          <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
            {r.date || '—'} · {cat}
          </div>
        </div>

        {/* Amount */}
        <div style={{
          fontSize: 16, fontWeight: 700, color: T.tx,
          fontFamily: FM, flexShrink: 0,
        }}>
          ${parseFloat(r.amount || 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
}

export default function LogView({ receipts, onDelete, onDetail, config }) {
  const [timePeriod, setTimePeriod] = useState('month'); // week | month | all
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [sheetRecords, setSheetRecords] = useState(null); // null = not loaded, [] = empty
  const [sheetLoading, setSheetLoading] = useState(false);
  const [syncSource, setSyncSource] = useState('local'); // 'local' | 'cloud'

  // Fetch records from Sheets for multi-device sync
  useEffect(() => {
    if (config?.sheetId && config?.connected) {
      setSheetLoading(true);
      readSheetRecords(config.sheetId, config.sheetName || 'receipt_index')
        .then(records => {
          setSheetRecords(records);
          // Auto-switch to cloud view if local is empty but cloud has data
          if (receipts.length === 0 && records.length > 0) {
            setSyncSource('cloud');
          }
          setSheetLoading(false);
        })
        .catch(e => {
          console.warn('Sheets sync failed:', e);
          setSheetLoading(false);
        });
    }
  }, [config?.sheetId]);

  // Use the selected data source
  const activeReceipts = syncSource === 'cloud' && sheetRecords ? sheetRecords : receipts;

  // Apply time filter first, then category + search
  const timeFiltered = filterByTime(activeReceipts, timePeriod);

  const filtered = timeFiltered.filter((r) => {
    if (filter !== 'all' && r.category !== filter) return false;
    if (search && !(r.merchant?.toLowerCase().includes(search.toLowerCase()) || r.category?.toLowerCase().includes(search.toLowerCase())))
      return false;
    return true;
  });

  const cats = [...new Set(timeFiltered.map((r) => r.category || 'Other'))];
  const totalAll = timeFiltered.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const catTotals = cats
    .map((c) => ({
      cat: c,
      total: timeFiltered
        .filter((r) => (r.category || 'Other') === c)
        .reduce((s, r) => s + parseFloat(r.amount || 0), 0),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div style={{ padding: '0 16px 100px' }}>
      {/* Header row with export menu */}
      <div style={{ position: 'relative' }}>
        <Header title="消费记录" sub={`${timeFiltered.length} 张 · $${totalAll.toFixed(2)} · ${periodSub(timePeriod)}`} />
        {activeReceipts.length > 0 && (
          <div style={{ position: 'absolute', top: 52, right: 0 }}>
            <button
              onClick={() => setShowExport(v => !v)}
              onBlur={() => setTimeout(() => setShowExport(false), 150)}
              style={{
                width: 32, height: 32,
                borderRadius: 10,
                background: T.card,
                border: `1px solid ${T.bdr}`,
                color: T.tx2,
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ⋯
            </button>
            {showExport && (
              <div style={{
                position: 'absolute', right: 0, top: 38,
                background: T.sf,
                border: `1px solid ${T.bdr}`,
                borderRadius: 12,
                overflow: 'hidden',
                zIndex: 200,
                minWidth: 160,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                animation: 'scaleIn 0.15s ease',
              }}>
                <button
                  onClick={() => { exportCSV(receipts); setShowExport(false); }}
                  style={{
                    display: 'block', width: '100%',
                    padding: '12px 16px',
                    background: 'none', border: 'none',
                    borderBottom: `1px solid ${T.bdr}`,
                    color: T.tx, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'left', fontFamily: F,
                  }}
                >
                  📊 导出 CSV
                </button>
                <button
                  onClick={() => { exportJSON(receipts); setShowExport(false); }}
                  style={{
                    display: 'block', width: '100%',
                    padding: '12px 16px',
                    background: 'none', border: 'none',
                    color: T.tx, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'left', fontFamily: F,
                  }}
                >
                  💾 导出 JSON
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data source toggle — only show when cloud data is available */}
      {sheetRecords && sheetRecords.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, marginBottom: 10,
          background: T.sf2, borderRadius: 12, padding: 4,
        }}>
          {[
            { id: 'local', label: '📱 本设备', count: receipts.length },
            { id: 'cloud', label: '☁️ 云端记录', count: sheetRecords.length },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSyncSource(s.id)}
              style={{
                flex: 1, padding: '7px 0',
                borderRadius: 9, border: 'none', cursor: 'pointer',
                background: syncSource === s.id ? T.card : 'transparent',
                color: syncSource === s.id ? T.tx : T.tx3,
                fontSize: 12, fontWeight: syncSource === s.id ? 700 : 500,
                fontFamily: F,
                boxShadow: syncSource === s.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {s.label} ({s.count})
            </button>
          ))}
        </div>
      )}

      {sheetLoading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          padding: '8px', marginBottom: 10, fontSize: 12, color: T.tx3,
        }}>
          <div style={{
            width: 12, height: 12, border: `2px solid ${T.bdr}`,
            borderTopColor: T.acc, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          正在同步云端记录…
        </div>
      )}

      {/* Time period selector */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 12,
        background: T.sf2, borderRadius: 12, padding: 4,
      }}>
        {(['week', 'month', 'all']).map((p) => (
          <button
            key={p}
            onClick={() => { setTimePeriod(p); setFilter('all'); }}
            style={{
              flex: 1, padding: '7px 0',
              borderRadius: 9, border: 'none', cursor: 'pointer',
              background: timePeriod === p ? T.card : 'transparent',
              color: timePeriod === p ? T.tx : T.tx3,
              fontSize: 12, fontWeight: timePeriod === p ? 700 : 500,
              fontFamily: F,
              boxShadow: timePeriod === p ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Donut chart — only when no category/search filter active */}
      {timeFiltered.length > 0 && filter === 'all' && !search && (
        <div style={{
          background: T.card,
          border: `1px solid ${T.bdr}`,
          borderRadius: 20,
          padding: '20px 16px 12px',
          marginBottom: 14,
        }}>
          <DonutChart receipts={timeFiltered} periodLabel={PERIOD_LABELS[timePeriod]} />
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          placeholder="搜索商户..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px 10px 34px',
            background: T.card,
            border: `1px solid ${T.bdr}`,
            borderRadius: 11,
            color: T.tx,
            fontSize: 13,
            fontFamily: F,
            outline: 'none',
          }}
        />
        <span style={{
          position: 'absolute', left: 12, top: '50%',
          transform: 'translateY(-50%)', fontSize: 13, color: T.tx3,
        }}>
          🔍
        </span>
      </div>

      {/* Category spending pills */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto',
        paddingBottom: 10, scrollbarWidth: 'none', marginBottom: 4,
      }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            background: filter === 'all' ? T.accDim : T.sf2,
            border: `1px solid ${filter === 'all' ? T.acc : T.bdr}`,
            color: filter === 'all' ? T.acc : T.tx3,
            fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: F,
          }}
        >
          全部
        </button>
        {catTotals.map(({ cat, total }) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              background: filter === cat ? `${CAT_CLR[cat] || T.acc}20` : T.sf2,
              border: `1px solid ${filter === cat ? (CAT_CLR[cat] || T.acc) : T.bdr}`,
              color: filter === cat ? (CAT_CLR[cat] || T.acc) : T.tx3,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: F,
            }}
          >
            {CAT_ICON[cat]} {cat} ${total.toFixed(2)}
          </button>
        ))}
      </div>

      {/* Receipt list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: T.tx3, fontSize: 13 }}>
            暂无匹配
          </div>
        ) : (
          filtered.map((r) => (
            <SwipeRow
              key={r.id}
              r={r}
              onDelete={onDelete}
              onDetail={onDetail}
            />
          ))
        )}
      </div>
    </div>
  );
}
