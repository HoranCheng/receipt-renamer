const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL || '';

// SECURITY: Max payload size for AI requests (10MB base64 ≈ ~7.5MB file)
const MAX_BASE64_SIZE = 10 * 1024 * 1024;
// Allowed MIME types for receipt analysis
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

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

// ─── Direct mode REMOVED ──────────────────────────────────────────────────────
// SECURITY: Direct browser→Anthropic API was removed because it exposes the API
// key in client-side JavaScript. All AI calls MUST go through the proxy Worker.
// If PROXY_URL is not configured, analyzeReceipt() will throw a clear error.

// ─── Public API (signature unchanged) ────────────────────────────────────────

export async function analyzeReceipt(base64, mediaType, fileType = 'image') {
  // Input validation
  if (!PROXY_URL) {
    throw new Error('AI 代理未配置。请联系管理员设置 VITE_AI_PROXY_URL。');
  }
  if (base64.length > MAX_BASE64_SIZE) {
    throw new Error(`文件过大（${(base64.length / 1024 / 1024).toFixed(1)}MB），最大支持 ${MAX_BASE64_SIZE / 1024 / 1024}MB`);
  }
  if (!ALLOWED_MIME.includes(mediaType)) {
    throw new Error(`不支持的文件类型：${mediaType}。支持：JPEG、PNG、WebP、HEIC、PDF`);
  }
  return analyzeViaProxy(base64, mediaType, fileType);
}
