import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildReceiptName,
  parseReceiptName,
  resetNameCounters,
  seedNameCounters,
} from '../naming';

describe('buildReceiptName', () => {
  beforeEach(() => resetNameCounters());

  it('produces date_category_seq format', () => {
    const name = buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg');
    expect(name).toBe('2026-03-10_grocery_1.jpg');
  });

  it('increments sequence for same date+category', () => {
    buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg');
    const second = buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg');
    expect(second).toBe('2026-03-10_grocery_2.jpg');
  });

  it('different categories get independent counters', () => {
    buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg');
    const dining = buildReceiptName({ date: '2026-03-10', category: 'Dining' }, 'jpg');
    expect(dining).toBe('2026-03-10_dining_1.jpg');
  });

  it('different dates get independent counters', () => {
    buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg');
    const next = buildReceiptName({ date: '2026-03-11', category: 'Grocery' }, 'jpg');
    expect(next).toBe('2026-03-11_grocery_1.jpg');
  });

  it('maps category slugs correctly', () => {
    expect(buildReceiptName({ date: '2026-01-01', category: 'Hardware & Garden' }, 'png'))
      .toBe('2026-01-01_hardware_1.png');
    expect(buildReceiptName({ date: '2026-01-01', category: 'Outdoor & Camping' }, 'jpg'))
      .toBe('2026-01-01_outdoor_1.jpg');
  });

  it('falls back to other when no category', () => {
    const name = buildReceiptName({ date: '2026-03-10' }, 'jpg');
    expect(name).toBe('2026-03-10_other_1.jpg');
  });

  it('uses today date when no date provided', () => {
    const name = buildReceiptName({ category: 'Dining' }, 'jpg');
    const today = new Date().toISOString().slice(0, 10);
    expect(name).toBe(`${today}_dining_1.jpg`);
  });

  it('accepts explicit sequence number', () => {
    const name = buildReceiptName({ date: '2026-03-10', category: 'Fuel' }, 'jpg', 42);
    expect(name).toBe('2026-03-10_fuel_42.jpg');
  });

  it('handles PDF extension', () => {
    const name = buildReceiptName({ date: '2026-03-10', category: 'Medical' }, 'pdf');
    expect(name).toBe('2026-03-10_medical_1.pdf');
  });

  it('handles case-insensitive category match', () => {
    const name = buildReceiptName({ date: '2026-03-10', category: 'grocery' }, 'jpg');
    expect(name).toBe('2026-03-10_grocery_1.jpg');
  });
});

describe('seedNameCounters', () => {
  beforeEach(() => resetNameCounters());

  it('seeds from existing filenames and continues sequence', () => {
    seedNameCounters([
      '2026-03-10_grocery_1.jpg',
      '2026-03-10_grocery_2.jpg',
      '2026-03-10_grocery_3.jpg',
    ]);
    const next = buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg');
    expect(next).toBe('2026-03-10_grocery_4.jpg');
  });

  it('handles mixed categories', () => {
    seedNameCounters([
      '2026-03-10_grocery_1.jpg',
      '2026-03-10_dining_1.jpg',
      '2026-03-10_dining_2.png',
    ]);
    expect(buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg'))
      .toBe('2026-03-10_grocery_2.jpg');
    expect(buildReceiptName({ date: '2026-03-10', category: 'Dining' }, 'jpg'))
      .toBe('2026-03-10_dining_3.jpg');
  });

  it('ignores non-matching filenames', () => {
    seedNameCounters([
      'random-file.jpg',
      '2026.03.10 Woolworths 45.50.jpg', // old format
      '2026-03-10_grocery_1.jpg',
    ]);
    const next = buildReceiptName({ date: '2026-03-10', category: 'Grocery' }, 'jpg');
    expect(next).toBe('2026-03-10_grocery_2.jpg');
  });

  it('starts from 1 when no matching existing files', () => {
    seedNameCounters(['unrelated.jpg']);
    const name = buildReceiptName({ date: '2026-05-01', category: 'Fuel' }, 'jpg');
    expect(name).toBe('2026-05-01_fuel_1.jpg');
  });
});

describe('parseReceiptName', () => {
  it('parses valid receipt name', () => {
    expect(parseReceiptName('2026-03-10_grocery_1.jpg')).toEqual({
      date: '2026-03-10', category: 'grocery', seq: 1, ext: 'jpg',
    });
  });

  it('parses multi-digit sequence', () => {
    expect(parseReceiptName('2026-03-10_dining_42.png')).toEqual({
      date: '2026-03-10', category: 'dining', seq: 42, ext: 'png',
    });
  });

  it('returns null for old format', () => {
    expect(parseReceiptName('2026.03.10 Woolworths 45.50.jpg')).toBeNull();
  });

  it('returns null for random name', () => {
    expect(parseReceiptName('IMG_20260310_123456.jpg')).toBeNull();
  });
});
