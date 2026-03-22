// ─── Field-level confidence scoring ───────────────────────────────────────────

export function scoreFields(data) {
  const scores = {};
  // Date: valid format and not far-future
  const dateStr = data.date || '';
  if (!dateStr) {
    scores.date = { level: 'err', hint: '日期缺失' };
  } else if (!/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(dateStr)) {
    scores.date = { level: 'warn', hint: '日期格式异常' };
  } else {
    const d = new Date(dateStr.replace(/\./g, '-'));
    const now = new Date();
    if (isNaN(d)) {
      scores.date = { level: 'warn', hint: '无法解析日期' };
    } else if (d > new Date(now.getTime() + 7 * 86400000)) {
      scores.date = { level: 'warn', hint: '日期在未来' };
    } else {
      scores.date = { level: 'ok' };
    }
  }
  // Merchant
  const m = (data.merchant || '').trim();
  if (!m) {
    scores.merchant = { level: 'err', hint: '商家缺失' };
  } else if (m.length < 2 || /^(unknown|未知|N\/A)$/i.test(m)) {
    scores.merchant = { level: 'warn', hint: '商家名可能不准确' };
  } else {
    scores.merchant = { level: 'ok' };
  }
  // Amount
  const amt = parseFloat(data.amount);
  if (data.amount === '' || data.amount == null) {
    scores.amount = { level: 'err', hint: '金额缺失' };
  } else if (isNaN(amt)) {
    scores.amount = { level: 'err', hint: '金额格式错误' };
  } else if (amt === 0) {
    scores.amount = { level: 'warn', hint: '金额为 $0' };
  } else if (amt > 10000) {
    scores.amount = { level: 'warn', hint: '金额异常高' };
  } else {
    scores.amount = { level: 'ok' };
  }
  // Category
  if (!data.category || data.category === 'Other') {
    scores.category = { level: 'warn', hint: '分类可能不准确' };
  } else {
    scores.category = { level: 'ok' };
  }
  return scores;
}

export function fieldBorder(level) {
  if (level === 'err') return 'rgba(239,68,68,0.5)';
  if (level === 'warn') return 'rgba(251,191,36,0.5)';
  return undefined; // default border
}

export function FieldHint({ score }) {
  if (!score || score.level === 'ok') return null;
  return (
    <div style={{
      fontSize: 10, marginTop: 2, fontWeight: 600,
      color: score.level === 'err' ? '#f87171' : '#fbbf24',
    }}>
      ⚠ {score.hint}
    </div>
  );
}
