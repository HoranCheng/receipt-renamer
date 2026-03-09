import { useState } from 'react';
import { T, FM } from '../constants/theme';
import { CATEGORIES, CAT_ICON, CAT_CLR } from '../constants';
import Header from '../components/Header';
import Field from '../components/Field';
import Btn from '../components/Btn';
import CatChips from '../components/CatChips';
import StatusDot from '../components/StatusDot';

export default function DetailView({ receipt, onSave, onBack }) {
  const [edit, setEdit] = useState({ ...receipt });

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
