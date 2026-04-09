import { describe, it, expect } from 'vitest';
import { isMmDdYyyy, parseMmDdYyyy, formatUsd, isExpired, validatePatch, filterVisible } from '@domain/config/configRules';
import type { ConfigRecord } from '@domain/config/configRecord';

function rec(over: Partial<ConfigRecord> = {}): ConfigRecord {
  return {
    id: 'r1', name: 'r', device: 'd', department: 'g', project: 'p',
    sampleQueue: 'q', sampleType: 'blood',
    tags: [], effectiveFrom: '01/01/2020', effectiveTo: '12/31/2099',
    priceUsd: 100, valid: true, ...over
  };
}

describe('isMmDdYyyy / parseMmDdYyyy', () => {
  it('accepts valid dates', () => {
    expect(isMmDdYyyy('01/02/2020')).toBe(true);
    expect(parseMmDdYyyy('01/02/2020')?.getUTCFullYear()).toBe(2020);
  });
  it('rejects malformed strings', () => {
    expect(isMmDdYyyy('2020-01-02')).toBe(false);
    expect(isMmDdYyyy('1/2/2020')).toBe(false);
    expect(isMmDdYyyy('13/01/2020')).toBe(false);
    expect(parseMmDdYyyy('bad')).toBeNull();
  });
  it('rejects impossible calendar dates', () => {
    expect(parseMmDdYyyy('02/30/2021')).toBeNull();
  });
});

describe('formatUsd', () => {
  it('formats with currency symbol', () => {
    expect(formatUsd(1234.5)).toMatch(/\$1,234\.50/);
  });
});

describe('isExpired', () => {
  it('returns true for past effectiveTo', () => {
    const r = rec({ effectiveTo: '01/01/2000' });
    expect(isExpired(r, new Date('2026-04-08'))).toBe(true);
  });
  it('returns false for future effectiveTo', () => {
    const r = rec({ effectiveTo: '12/31/2099' });
    expect(isExpired(r, new Date('2026-04-08'))).toBe(false);
  });
  it('returns false when effectiveTo is malformed', () => {
    const r = rec({ effectiveTo: 'garbage' });
    expect(isExpired(r)).toBe(false);
  });
});

describe('validatePatch', () => {
  it('passes a sane patch', () => {
    expect(validatePatch({ name: 'x', priceUsd: 5, sampleType: 'blood', effectiveFrom: '01/01/2026', effectiveTo: '12/31/2026' }).ok).toBe(true);
  });
  it('rejects empty name, negative price, bad dates', () => {
    expect(validatePatch({ name: ' ' }).ok).toBe(false);
    expect(validatePatch({ priceUsd: -1 }).ok).toBe(false);
    expect(validatePatch({ priceUsd: NaN }).ok).toBe(false);
    expect(validatePatch({ effectiveFrom: 'bad' }).ok).toBe(false);
    expect(validatePatch({ effectiveTo: 'bad' }).ok).toBe(false);
  });
  it('rejects when from is after to', () => {
    expect(validatePatch({ effectiveFrom: '12/01/2026', effectiveTo: '01/01/2026' }).ok).toBe(false);
  });
  it('rejects empty or unknown sampleType', () => {
    expect(validatePatch({ sampleType: '' }).ok).toBe(false);
    expect(validatePatch({ sampleType: 'unicorn' }).ok).toBe(false);
    expect(validatePatch({ sampleType: 'tissue' }).ok).toBe(true);
  });
});

describe('filterVisible', () => {
  it('hides expired by default and shows when toggled', () => {
    const records = [
      rec({ id: '1', effectiveTo: '01/01/2000' }),
      rec({ id: '2', effectiveTo: '12/31/2099' })
    ];
    const now = new Date('2026-04-08');
    expect(filterVisible(records, false, now).map((r) => r.id)).toEqual(['2']);
    expect(filterVisible(records, true, now).map((r) => r.id)).toEqual(['1','2']);
  });
});
