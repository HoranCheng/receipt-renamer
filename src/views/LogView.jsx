import { useState } from 'react';
import { T, F } from '../constants/theme';
import { CAT_ICON, CAT_CLR } from '../constants';
import Header from '../components/Header';
import ReceiptRow from '../components/ReceiptRow';

export default function LogView({ receipts, onDelete }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const filtered = receipts.filter((r) => {
    if (filter !== 'all' && r.category !== filter) return false;
    if (search && !r.merchant?.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });
  const cats = [...new Set(receipts.map((r) => r.category || 'Other'))];

  return (
    <div style={{ padding: '0 16px 100px' }}>
      <Header
        title={'\u5168\u90E8\u8BB0\u5F55'}
        sub={`\u5171 ${receipts.length} \u6761`}
      />
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          placeholder={'\u641C\u7D22\u5546\u6237...'}
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
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 13,
            color: T.tx3,
          }}
        >
          {'\u{1F50D}'}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 5,
          overflowX: 'auto',
          paddingBottom: 10,
          scrollbarWidth: 'none',
        }}
      >
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '5px 12px',
            borderRadius: 18,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            background: filter === 'all' ? T.accDim : T.sf,
            border: `1px solid ${filter === 'all' ? T.acc : T.bdr}`,
            color: filter === 'all' ? T.acc : T.tx3,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: F,
          }}
        >
          {'\u5168\u90E8'}
        </button>
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            style={{
              padding: '5px 10px',
              borderRadius: 18,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              background: filter === c ? `${CAT_CLR[c]}15` : T.sf,
              border: `1px solid ${filter === c ? CAT_CLR[c] : T.bdr}`,
              color: filter === c ? CAT_CLR[c] : T.tx3,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: F,
            }}
          >
            {CAT_ICON[c]} {c}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '36px',
              color: T.tx3,
              fontSize: 13,
            }}
          >
            {'\u6682\u65E0\u5339\u914D'}
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} style={{ position: 'relative' }}>
              <ReceiptRow r={r} />
              <button
                onClick={() => onDelete(r.id)}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: T.red,
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {'\u2715'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
