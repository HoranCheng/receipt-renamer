import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store, load } from '../storage';

describe('storage service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('store()', () => {
    it('stores a value in localStorage as JSON', async () => {
      await store('test-key', { foo: 'bar' });
      expect(localStorage.getItem('test-key')).toBe('{"foo":"bar"}');
    });

    it('stores arrays', async () => {
      await store('arr', [1, 2, 3]);
      expect(localStorage.getItem('arr')).toBe('[1,2,3]');
    });

    it('handles localStorage errors gracefully', async () => {
      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceeded');
        });
      // Should not throw
      await expect(store('key', 'val')).resolves.toBeUndefined();
      spy.mockRestore();
    });
  });

  describe('load()', () => {
    it('loads a stored value', async () => {
      localStorage.setItem('k', '{"a":1}');
      const result = await load('k', null);
      expect(result).toEqual({ a: 1 });
    });

    it('returns fallback when key does not exist', async () => {
      const result = await load('missing', 'default');
      expect(result).toBe('default');
    });

    it('returns fallback when JSON is invalid', async () => {
      localStorage.setItem('bad', '{invalid json');
      const result = await load('bad', []);
      expect(result).toEqual([]);
    });
  });
});
