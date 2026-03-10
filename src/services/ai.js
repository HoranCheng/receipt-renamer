import { CATEGORIES } from '../constants';

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL || '';
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

// ─── Proxy mode (Gemini 2.0 Flash via receipt-proxy Worker) ──────────────────

async function analyzeViaProxy(base64, mediaType, fileType) {
  const uid = localStorage.getItem('receipt_google_uid') || 'anonymous';

  const res = await fetch(`${PROXY_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, base64, mediaType, fileType }),
  });

  if (res.status === 429) {
    throw new Error('今日识别额度已用完（100张/天），请明日再试或联系管理员申请额外额度');
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let detail = errBody;
    try {
      const parsed = JSON.parse(errBody);
      detail = parsed.message || parsed.error || errBody;
    } catch {
      // Use raw error body
    }
    throw new Error(`代理识别失败 (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json();

  // Strip _quota metadata before returning receipt data
  const { _quota, ...receiptData } = data;
  return receiptData;
}

// ─── Direct mode (Anthropic Claude, legacy) ───────────────────────────────────

async function analyzeViaDirect(base64, mediaType, fileType) {
  const prompt = `You are a receipt data extractor for an Australian user. Analyze this receipt and extract structured data.

RULES:
- Dates: prefer DD/MM/YYYY (Australian). Output as YYYY-MM-DD.
- Merchant: clean name only. Remove ABN, PTY LTD, ACN, TAX INVOICE, addresses.
- Amount: the TOTAL paid. Number only, no currency symbol.
- Currency: usually AUD unless clearly otherwise.
- Category: exactly ONE of: ${CATEGORIES.join(', ')}
- Confidence: 0-100 your certainty

Respond ONLY with this JSON, no markdown, no backticks:
{"date":"YYYY-MM-DD","merchant":"Clean Name","amount":0.00,"currency":"AUD","category":"Category","items":["item1","item2"],"confidence":85}`;

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            fileType === 'pdf' || mediaType === 'application/pdf'
              ? {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64,
                  },
                }
              : {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64,
                  },
                },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let detail = errBody;
    try {
      const parsed = JSON.parse(errBody);
      detail = parsed.error?.message || errBody;
    } catch {
      // Use raw error body
    }
    throw new Error(`AI 识别失败 (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json();
  const text = data.content?.find((b) => b.type === 'text')?.text || '';

  if (!text) {
    throw new Error('AI 返回了空内容');
  }

  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error(`AI 返回了无法解析的内容: ${text.slice(0, 100)}`);
  }
}

// ─── Public API (signature unchanged) ────────────────────────────────────────

export async function analyzeReceipt(base64, mediaType, fileType = 'image') {
  if (PROXY_URL) {
    return analyzeViaProxy(base64, mediaType, fileType);
  }
  return analyzeViaDirect(base64, mediaType, fileType);
}
