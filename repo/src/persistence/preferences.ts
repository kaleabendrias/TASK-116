/**
 * Per-tab UI preferences in localStorage.
 *
 * The original architectural constraint puts the messaging quiet-hours
 * preference here (per-user) so it remains a lightweight, sync-readable
 * UI setting. Rate-limit counters are NOT stored here — they live in
 * IndexedDB so they survive refreshes and stay consistent across tabs.
 */

import type { QuietHours } from '@shared/utils/clock';
import { isValidQuietHours } from '@shared/utils/clock';

const PREFIX = 'task09.pref.';
const LANGUAGE = 'en' as const;
const QUIET_HOURS_PREFIX = 'quietHours.';

export { isValidQuietHours };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  /* v8 ignore next 1 */
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* noop */ }
}

function remove(key: string): void {
  /* v8 ignore next 1 */
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}

export const preferences = {
  language(): 'en' { return LANGUAGE; },
  getLastFilter(scope: string): Record<string, unknown> {
    return read<Record<string, unknown>>(`lastFilter.${scope}`, {});
  },
  setLastFilter(scope: string, value: Record<string, unknown>): void {
    write(`lastFilter.${scope}`, value);
  },

  /** Read a user's quiet-hours preference, or null when none / invalid. */
  getQuietHours(userId: string): QuietHours | null {
    const stored = read<unknown>(QUIET_HOURS_PREFIX + userId, null);
    return isValidQuietHours(stored) ? stored : null;
  },

  /** Persist a user's quiet-hours preference. Throws on invalid input. */
  setQuietHours(userId: string, value: QuietHours): void {
    if (!isValidQuietHours(value)) {
      throw new Error('Quiet hours must be integers in [0, 23] with start !== end');
    }
    write(QUIET_HOURS_PREFIX + userId, value);
  },

  /** Clear a user's quiet-hours preference. */
  clearQuietHours(userId: string): void {
    remove(QUIET_HOURS_PREFIX + userId);
  }
};
