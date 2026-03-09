import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeReceipt } from '../ai';

describe('analyzeReceipt', () => {
  const mockResponse = {
    date: '2026-01-15',
    merchant: 'Woolworths',
    amount: 42.5,
    currency: 'AUD',
    category: 'Grocery',
    items: ['milk', 'bread'],
    confidence: 85,
  };

  beforeEach(() => {
    vi.stubGlobal('import', { meta: { env: {} } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed receipt data on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await analyzeReceipt('base64data', 'image/jpeg');
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callArgs.model).toBe('claude-sonnet-4-20250514');
    expect(callArgs.messages[0].content[0].type).toBe('image');
  });

  it('handles JSON wrapped in markdown code blocks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                type: 'text',
                text: '```json\n' + JSON.stringify(mockResponse) + '\n```',
              },
            ],
          }),
      })
    );

    const result = await analyzeReceipt('base64data', 'image/jpeg');
    expect(result.merchant).toBe('Woolworths');
  });

  it('throws on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () =>
          Promise.resolve(
            JSON.stringify({ error: { message: 'Invalid API key' } })
          ),
      })
    );

    await expect(analyzeReceipt('data', 'image/jpeg')).rejects.toThrow(
      'AI 识别失败 (401)'
    );
  });

  it('throws on empty content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      })
    );

    await expect(analyzeReceipt('data', 'image/jpeg')).rejects.toThrow(
      '空内容'
    );
  });

  it('throws on unparseable response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'not valid json at all' }],
          }),
      })
    );

    await expect(analyzeReceipt('data', 'image/jpeg')).rejects.toThrow(
      '无法解析'
    );
  });
});
