import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to control import.meta.env.VITE_AI_PROXY_URL before importing.
// Vitest exposes import.meta.env as writable — set it before each test.

describe('analyzeReceipt (proxy mode)', () => {
  const PROXY = 'https://test-proxy.example.com';

  const mockReceipt = {
    date: '2026-01-15',
    merchant: 'Woolworths',
    amount: 42.5,
    currency: 'AUD',
    category: 'Grocery',
    items: ['milk', 'bread'],
    confidence: 85,
    is_receipt: true,
  };

  let analyzeReceipt;

  beforeEach(async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'test-user-123'),
      setItem: vi.fn(),
    });
    // Set proxy URL via env
    import.meta.env.VITE_AI_PROXY_URL = PROXY;
    // Dynamic import to pick up env
    vi.resetModules();
    const mod = await import('../ai');
    analyzeReceipt = mod.analyzeReceipt;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete import.meta.env.VITE_AI_PROXY_URL;
  });

  it('returns receipt data from proxy on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockReceipt),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await analyzeReceipt('base64data', 'image/jpeg');
    expect(result).toEqual(mockReceipt);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify request shape: POST to /api/analyze with uid, base64, mediaType, fileType
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${PROXY}/api/analyze`);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.uid).toBe('test-user-123');
    expect(body.base64).toBe('base64data');
    expect(body.mediaType).toBe('image/jpeg');
    expect(body.fileType).toBe('image');
  });

  it('sends fileType "pdf" for PDF media', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    }));

    await analyzeReceipt('base64data', 'application/pdf', 'pdf');
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body.fileType).toBe('pdf');
    expect(body.mediaType).toBe('application/pdf');
  });

  it('strips _quota metadata from response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ...mockReceipt,
        _quota: { used: 5, limit: 100, remaining: 95 },
      }),
    }));

    const result = await analyzeReceipt('base64data', 'image/jpeg');
    expect(result._quota).toBeUndefined();
    expect(result.merchant).toBe('Woolworths');
  });

  it('throws specific message on 429 rate limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('rate limited'),
    }));

    await expect(analyzeReceipt('data', 'image/jpeg')).rejects.toThrow('额度已用完');
  });

  it('throws with detail on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve(JSON.stringify({ message: 'model overloaded' })),
    }));

    await expect(analyzeReceipt('data', 'image/jpeg')).rejects.toThrow('代理识别失败 (500)');
  });

  it('throws on non-200 with plain text error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: () => Promise.resolve('upstream error'),
    }));

    await expect(analyzeReceipt('data', 'image/jpeg')).rejects.toThrow('代理识别失败 (502)');
  });

  // ─── Input validation ────────────────────────────────────────────────────

  it('throws if proxy URL is not configured', async () => {
    import.meta.env.VITE_AI_PROXY_URL = '';
    vi.resetModules();
    const mod = await import('../ai');

    await expect(mod.analyzeReceipt('data', 'image/jpeg')).rejects.toThrow('AI 代理未配置');
  });

  it('throws if base64 exceeds max size', async () => {
    const huge = 'x'.repeat(14 * 1024 * 1024 + 1);
    await expect(analyzeReceipt(huge, 'image/jpeg')).rejects.toThrow('文件过大');
  });

  it('throws on unsupported MIME type', async () => {
    await expect(analyzeReceipt('data', 'image/gif')).rejects.toThrow('不支持的文件类型');
  });

  it('accepts image/jpeg', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    }));
    const result = await analyzeReceipt('data', 'image/jpeg');
    expect(result.merchant).toBe('Woolworths');
  });

  it('accepts image/png', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    }));
    const result = await analyzeReceipt('data', 'image/png');
    expect(result.merchant).toBe('Woolworths');
  });

  it('accepts application/pdf', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReceipt),
    }));
    const result = await analyzeReceipt('data', 'application/pdf');
    expect(result.merchant).toBe('Woolworths');
  });
});
