import { CATEGORIES } from '../constants';

const API_BASE = import.meta.env.VITE_AI_PROXY_URL || 'https://api.anthropic.com';
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

export async function analyzeReceipt(base64, mediaType) {
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

  // Add auth header — direct browser mode or proxy mode
  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const res = await fetch(`${API_BASE}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let detail = '';
    try {
      const parsed = JSON.parse(errBody);
      detail = parsed.error?.message || errBody;
    } catch {
      detail = errBody;
    }
    throw new Error(
      `AI 识别失败 (${res.status}): ${detail || res.statusText}`
    );
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
