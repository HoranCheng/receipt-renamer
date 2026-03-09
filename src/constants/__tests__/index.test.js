import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  CAT_ICON,
  CAT_CLR,
  SCOPES,
  DISCOVERY_DOCS,
  DRIVE_FOLDERS,
  DEFAULT_CONFIG,
} from '../index';

describe('CATEGORIES', () => {
  it('has 14 categories', () => {
    expect(CATEGORIES).toHaveLength(14);
  });

  it('includes essential categories', () => {
    expect(CATEGORIES).toContain('Grocery');
    expect(CATEGORIES).toContain('Dining');
    expect(CATEGORIES).toContain('Fuel');
    expect(CATEGORIES).toContain('Other');
  });
});

describe('CAT_ICON', () => {
  it('has an icon for every category', () => {
    CATEGORIES.forEach((cat) => {
      expect(CAT_ICON[cat]).toBeDefined();
      expect(typeof CAT_ICON[cat]).toBe('string');
    });
  });
});

describe('CAT_CLR', () => {
  it('has a color for every category', () => {
    CATEGORIES.forEach((cat) => {
      expect(CAT_CLR[cat]).toBeDefined();
      expect(CAT_CLR[cat]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has required fields', () => {
    expect(DEFAULT_CONFIG).toHaveProperty('clientId', '');
    expect(DEFAULT_CONFIG).toHaveProperty('connected', false);
    expect(DEFAULT_CONFIG).toHaveProperty('setupDone', false);
    expect(DEFAULT_CONFIG).toHaveProperty('inboxFolder');
    expect(DEFAULT_CONFIG).toHaveProperty('validatedFolder');
    expect(DEFAULT_CONFIG).toHaveProperty('reviewFolder');
    expect(DEFAULT_CONFIG).toHaveProperty('sheetName');
  });
});

describe('Google API constants', () => {
  it('SCOPES includes drive and sheets', () => {
    expect(SCOPES).toContain('drive');
    expect(SCOPES).toContain('spreadsheets');
  });

  it('DISCOVERY_DOCS has 2 entries', () => {
    expect(DISCOVERY_DOCS).toHaveLength(2);
  });

  it('DRIVE_FOLDERS has inbox, validated, review', () => {
    expect(DRIVE_FOLDERS.inbox).toBe('00_inbox');
    expect(DRIVE_FOLDERS.validated).toBe('10_validated');
    expect(DRIVE_FOLDERS.review).toBeDefined();
  });
});
