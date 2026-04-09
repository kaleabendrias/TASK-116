import { describe, it, expect } from 'vitest';
import { isWithinQuietHours, nextQuietEnd, isValidQuietHours } from '@shared/utils/clock';

describe('isWithinQuietHours', () => {
  it('handles a window crossing midnight (21 → 7)', () => {
    const qh = { startHour: 21, endHour: 7 };
    expect(isWithinQuietHours(new Date('2026-04-08T22:00:00'), qh)).toBe(true);
    expect(isWithinQuietHours(new Date('2026-04-08T03:00:00'), qh)).toBe(true);
    expect(isWithinQuietHours(new Date('2026-04-08T07:00:00'), qh)).toBe(false);
    expect(isWithinQuietHours(new Date('2026-04-08T13:00:00'), qh)).toBe(false);
  });

  it('handles a normal forward window (9 → 17)', () => {
    const qh = { startHour: 9, endHour: 17 };
    expect(isWithinQuietHours(new Date('2026-04-08T10:00:00'), qh)).toBe(true);
    expect(isWithinQuietHours(new Date('2026-04-08T17:00:00'), qh)).toBe(false);
    expect(isWithinQuietHours(new Date('2026-04-08T08:59:00'), qh)).toBe(false);
  });

  it('a zero-length window is never inside', () => {
    expect(isWithinQuietHours(new Date(), { startHour: 5, endHour: 5 })).toBe(false);
  });
});

describe('nextQuietEnd', () => {
  it('walks forward until the window ends', () => {
    const qh = { startHour: 21, endHour: 7 };
    const within = new Date('2026-04-08T23:30:00');
    const next = nextQuietEnd(within, qh);
    expect(next.getHours()).toBe(7);
  });
});

describe('isValidQuietHours', () => {
  it('accepts integer windows in [0, 23] with start !== end', () => {
    expect(isValidQuietHours({ startHour: 21, endHour: 7 })).toBe(true);
    expect(isValidQuietHours({ startHour: 0, endHour: 23 })).toBe(true);
  });
  it('rejects non-integer, out-of-range, or zero-length windows', () => {
    expect(isValidQuietHours({ startHour: -1, endHour: 5 })).toBe(false);
    expect(isValidQuietHours({ startHour: 5, endHour: 24 })).toBe(false);
    expect(isValidQuietHours({ startHour: 5, endHour: 5 })).toBe(false);
    expect(isValidQuietHours({ startHour: 1.5, endHour: 5 })).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(isValidQuietHours(null)).toBe(false);
    expect(isValidQuietHours('quiet')).toBe(false);
    expect(isValidQuietHours(undefined)).toBe(false);
  });
});
