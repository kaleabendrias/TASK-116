import { describe, it, expect } from 'vitest';
import { preferences, isValidQuietHours } from '@persistence/preferences';

describe('preferences', () => {
  it('language is fixed to English', () => {
    expect(preferences.language()).toBe('en');
  });

  it('lastFilter persists per scope', () => {
    expect(preferences.getLastFilter('any')).toEqual({});
    preferences.setLastFilter('grading', { showExpired: true });
    expect(preferences.getLastFilter('grading')).toEqual({ showExpired: true });
  });

  it('survives malformed localStorage values', () => {
    localStorage.setItem('task09.pref.lastFilter.broken', '{not json');
    expect(preferences.getLastFilter('broken')).toEqual({});
  });

  it('isValidQuietHours re-export validates input', () => {
    expect(isValidQuietHours({ startHour: 21, endHour: 7 })).toBe(true);
    expect(isValidQuietHours({ startHour: -1, endHour: 5 })).toBe(false);
    expect(isValidQuietHours({ startHour: 5, endHour: 5 })).toBe(false);
    expect(isValidQuietHours({ startHour: 1.5, endHour: 5 })).toBe(false);
    expect(isValidQuietHours(null)).toBe(false);
  });

  it('quiet hours round-trip in localStorage, keyed per-user', () => {
    expect(preferences.getQuietHours('user-1')).toBeNull();
    preferences.setQuietHours('user-1', { startHour: 21, endHour: 7 });
    expect(preferences.getQuietHours('user-1')).toEqual({ startHour: 21, endHour: 7 });
    // Stored in localStorage with the per-user key
    expect(localStorage.getItem('task09.pref.quietHours.user-1')).toBeTruthy();
    // Other users still see null
    expect(preferences.getQuietHours('user-2')).toBeNull();
    preferences.clearQuietHours('user-1');
    expect(preferences.getQuietHours('user-1')).toBeNull();
  });

  it('rejects invalid quiet-hours payloads', () => {
    expect(() => preferences.setQuietHours('u', { startHour: -1, endHour: 5 })).toThrow();
    expect(() => preferences.setQuietHours('u', { startHour: 5, endHour: 24 })).toThrow();
    expect(() => preferences.setQuietHours('u', { startHour: 5, endHour: 5 })).toThrow();
    expect(() => preferences.setQuietHours('u', { startHour: 1.5, endHour: 5 } as never)).toThrow();
  });

  it('ignores malformed quiet-hours blobs planted in localStorage', () => {
    localStorage.setItem('task09.pref.quietHours.u', JSON.stringify({ startHour: 99, endHour: 5 }));
    expect(preferences.getQuietHours('u')).toBeNull();
    localStorage.setItem('task09.pref.quietHours.u', '"not an object"');
    expect(preferences.getQuietHours('u')).toBeNull();
  });
});
