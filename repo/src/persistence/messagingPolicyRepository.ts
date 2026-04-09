import { getDb } from './indexedDb';

/**
 * IndexedDB-backed per-user rate limiter.
 *
 * Rate counters live here (rather than in memory) so concurrent tabs
 * cannot exceed the configured cap by racing — IndexedDB serializes
 * readwrite transactions per origin. Quiet-hours preferences live in
 * localStorage; see `persistence/preferences.ts`.
 */

const RATE_PREFIX = 'rate:';
const RATE_WINDOW_MS = 60_000;

interface RateRecord {
  id: string;
  userId: string;
  windowStart: number;
  count: number;
}

function rateKey(userId: string): string { return RATE_PREFIX + userId; }

export const messagingPolicyRepository = {
  /**
   * Atomic compare-and-swap rate limiter.
   *
   * Inside a single readwrite transaction:
   *   1. Read the recipient's current window record.
   *   2. If the window has expired, reset it.
   *   3. If the count is already at the configured cap, deny without
   *      incrementing and return the next-available timestamp.
   *   4. Otherwise increment and persist.
   *
   * Two tabs racing on the same recipient see consistent state because
   * IndexedDB serializes readwrite transactions on the same store per
   * origin.
   */
  async tryConsumeRate(
    userId: string,
    ratePerMinute: number,
    now: number
  ): Promise<{ ok: true } | { ok: false; nextAvailableAt: number }> {
    const d = await getDb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('messagingPolicy', 'readwrite');
      const store = tx.objectStore('messagingPolicy');
      const req = store.get(rateKey(userId));
      let result: { ok: true } | { ok: false; nextAvailableAt: number } = { ok: true };
      req.onsuccess = () => {
        const existing = req.result as RateRecord | undefined;
        const inWindow = !!existing && now - existing.windowStart < RATE_WINDOW_MS;
        if (inWindow && existing!.count >= ratePerMinute) {
          result = { ok: false, nextAvailableAt: existing!.windowStart + RATE_WINDOW_MS };
          return;
        }
        const next: RateRecord = inWindow
          ? { id: rateKey(userId), userId, windowStart: existing!.windowStart, count: existing!.count + 1 }
          : { id: rateKey(userId), userId, windowStart: now, count: 1 };
        store.put(next);
        result = { ok: true };
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Test-only helper: read the raw rate record. */
  async _getRateForTesting(userId: string): Promise<RateRecord | undefined> {
    const d = await getDb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('messagingPolicy', 'readonly');
      const req = tx.objectStore('messagingPolicy').get(rateKey(userId));
      req.onsuccess = () => resolve(req.result as RateRecord | undefined);
      req.onerror = () => reject(req.error);
    });
  }
};
