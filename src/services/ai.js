import { CATEGORIES } from '../constants';

export async function analyzeReceipt(base64, mediaType) {
  const prompt = `You are a receipt data extractor for an Australian user. Analyze this receipt and extract structured data.

RULES:
- Dates: prefer DD/MM/YYYY (Australian). Output as YYYY-MM-DD.
- Merchant: clean name only. Remove ABN, PTY LTD, ACN, TAX INVOICE, addresses.
- Amount: the TOTAL paid. Number only, no currency symbol.
- Currency: usually AUD unless clearly otherwise.
- Category: exactly ONE of: ${CATEGORIES.join(", ")}
- Confidence: 0-100 your certainty

Respond ONLY with this JSON, no markdown, no backticks:
{"date":"YYYY-MM-DD","merchant":"Clean Name","amount":0.00,"currency":"AUD","category":"Category","items":["item1","item2"],"confidence":85}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: prompt },
      ]}],
    }),
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}
