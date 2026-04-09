import type { Seat, SeatHold } from '@domain/trips/seat';
import type { Trip } from '@domain/trips/trip';
import { uid } from '@shared/utils/id';
import { getDb } from './indexedDb';

const HOLDS_CHANNEL = 'task09.seatMap';
const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Composite-key persistence shapes. Each row in seats/holds/bookings is
 * keyed by `${tripId}:${seatId}` so trips have independent inventories
 * yet share a single set of object stores.
 */
interface StoredSeat extends Seat {
  /** Composite store key. */
  id: string;
  /** Trip-scoped seat id (e.g. "5B"). */
  seatId: string;
  tripId: string;
}

interface StoredHold extends SeatHold {
  id: string;
  tripId: string;
}

interface StoredBooking {
  id: string;
  tripId: string;
  seatId: string;
  bookedAt: number;
}

function compositeId(tripId: string, seatId: string): string {
  return `${tripId}:${seatId}`;
}

export function buildSeatsForTrip(trip: Pick<Trip, 'id' | 'rows' | 'cols'>): StoredSeat[] {
  const seats: StoredSeat[] = [];
  const cols = COL_LETTERS.slice(0, trip.cols);
  const adaRow = Math.max(1, Math.floor(trip.rows / 2));
  for (let r = 1; r <= trip.rows; r++) {
    for (let c = 0; c < cols.length; c++) {
      let kind: Seat['kind'] = 'standard';
      const isFirstOrLastCol = c === 0 || c === cols.length - 1;
      if (r === 1 && isFirstOrLastCol) kind = 'crew';
      else if (r === adaRow && isFirstOrLastCol && trip.rows >= 2) kind = 'ada';
      const seatId = `${r}${cols[c]}`;
      seats.push({
        id: compositeId(trip.id, seatId),
        seatId,
        tripId: trip.id,
        row: r,
        column: c,
        label: seatId,
        kind,
        status: 'available'
      });
    }
  }
  return seats;
}

export let tabId = uid('tab');

/** Test-only: override the tab identifier to simulate multi-tab races. */
export function _setTabIdForTesting(id: string): void {
  tabId = id;
}

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  try { channel = new BroadcastChannel(HOLDS_CHANNEL); } catch { channel = null; }
  return channel;
}

export interface SeatMapSnapshot {
  tripId: string;
  seats: Seat[];
  holds: Map<string, SeatHold>;
  bookings: Set<string>;
}

async function getAllByTrip<T extends { tripId: string }>(
  store: 'seats' | 'holds' | 'bookings',
  tripId: string
): Promise<T[]> {
  const d = await getDb();
  return new Promise<T[]>((res, rej) => {
    const req = d.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => res((req.result as T[]).filter((x) => x.tripId === tripId));
    req.onerror = () => rej(req.error);
  });
}

export interface ReconciliationReport {
  seatsRemoved: number;
  holdsRemoved: number;
  bookingsRemoved: number;
}

export const seatMapRepository = {
  /**
   * Initialize a trip's seat inventory. Idempotent — running twice is a no-op
   * because seat ids are deterministic from (tripId, row, col).
   */
  async initializeTripSeats(trip: Pick<Trip, 'id' | 'rows' | 'cols'>): Promise<void> {
    const d = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction('seats', 'readwrite');
      const store = tx.objectStore('seats');
      for (const seat of buildSeatsForTrip(trip)) store.put(seat);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Reconcile a trip's seat inventory after a dimension change. Computes the
   * authoritative new seat set and DELETES every seat / hold / booking that
   * does not belong to it. Then writes the new seat records.
   *
   * Runs in a single multi-store readwrite transaction so partial failures
   * cannot leave the inventory in an inconsistent state.
   */
  async reconcileTripInventory(trip: Pick<Trip, 'id' | 'rows' | 'cols'>): Promise<ReconciliationReport> {
    const d = await getDb();
    const desired = buildSeatsForTrip(trip);
    const desiredKeys = new Set(desired.map((s) => s.id));

    return new Promise<ReconciliationReport>((resolve, reject) => {
      const tx = d.transaction(['seats', 'holds', 'bookings'], 'readwrite');
      const seats = tx.objectStore('seats');
      const holds = tx.objectStore('holds');
      const bookings = tx.objectStore('bookings');

      const report: ReconciliationReport = { seatsRemoved: 0, holdsRemoved: 0, bookingsRemoved: 0 };

      const seatsReq = seats.getAll();
      seatsReq.onsuccess = () => {
        for (const s of seatsReq.result as StoredSeat[]) {
          if (s.tripId !== trip.id) continue;
          if (!desiredKeys.has(s.id)) {
            seats.delete(s.id);
            report.seatsRemoved++;
          }
        }
        // Now write the new authoritative seat set.
        for (const seat of desired) seats.put(seat);
      };

      const holdsReq = holds.getAll();
      holdsReq.onsuccess = () => {
        for (const h of holdsReq.result as StoredHold[]) {
          if (h.tripId !== trip.id) continue;
          if (!desiredKeys.has(h.id)) {
            holds.delete(h.id);
            report.holdsRemoved++;
          }
        }
      };

      const bookingsReq = bookings.getAll();
      bookingsReq.onsuccess = () => {
        for (const b of bookingsReq.result as StoredBooking[]) {
          if (b.tripId !== trip.id) continue;
          if (!desiredKeys.has(b.id)) {
            bookings.delete(b.id);
            report.bookingsRemoved++;
          }
        }
      };

      tx.oncomplete = () => resolve(report);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('reconcile aborted'));
    });
  },

  async snapshot(tripId: string): Promise<SeatMapSnapshot> {
    const [seats, holdsArr, bookingsArr] = await Promise.all([
      getAllByTrip<StoredSeat>('seats', tripId),
      getAllByTrip<StoredHold>('holds', tripId),
      getAllByTrip<StoredBooking>('bookings', tripId)
    ]);
    const now = Date.now();
    const validHolds = holdsArr.filter((h) => h.expiresAt > now);
    const bookings = new Set(bookingsArr.map((b) => b.seatId));
    const merged: Seat[] = seats.map((s) => ({
      id: s.seatId,
      row: s.row,
      column: s.column,
      label: s.label,
      kind: s.kind,
      status: bookings.has(s.seatId) ? ('booked' as const) : ('available' as const)
    }));
    return {
      tripId,
      seats: merged,
      holds: new Map(validHolds.map((h) => [h.seatId, h])),
      bookings
    };
  },

  async tryHold(tripId: string, seatId: string, durationMs: number): Promise<{ ok: true; hold: SeatHold } | { ok: false; reason: string }> {
    const d = await getDb();
    const key = compositeId(tripId, seatId);
    return new Promise((resolve) => {
      const tx = d.transaction(['holds', 'bookings'], 'readwrite');
      const holds = tx.objectStore('holds');
      const bookings = tx.objectStore('bookings');
      let result: { ok: true; hold: SeatHold } | { ok: false; reason: string } = { ok: false, reason: 'Unknown' };

      const bookingReq = bookings.get(key);
      bookingReq.onsuccess = () => {
        if (bookingReq.result) { result = { ok: false, reason: 'Already booked' }; tx.abort(); return; }
        const holdReq = holds.get(key);
        holdReq.onsuccess = () => {
          const existing = holdReq.result as StoredHold | undefined;
          const now = Date.now();
          if (existing && existing.expiresAt > now && existing.ownerTabId !== tabId) {
            result = { ok: false, reason: 'Held by another session' }; tx.abort(); return;
          }
          const hold: SeatHold = { seatId, ownerTabId: tabId, expiresAt: now + durationMs };
          const stored: StoredHold = { id: key, tripId, ...hold };
          holds.put(stored);
          result = { ok: true, hold };
        };
      };
      tx.oncomplete = () => {
        if (result.ok) getChannel()?.postMessage({ type: 'holds-changed', tripId });
        resolve(result);
      };
      tx.onabort = () => resolve(result);
      tx.onerror = () => resolve({ ok: false, reason: 'Transaction error' });
    });
  },

  async releaseHold(tripId: string, seatId: string): Promise<void> {
    const d = await getDb();
    const key = compositeId(tripId, seatId);
    await new Promise<void>((resolve) => {
      const tx = d.transaction('holds', 'readwrite');
      const holds = tx.objectStore('holds');
      const req = holds.get(key);
      req.onsuccess = () => {
        const existing = req.result as StoredHold | undefined;
        if (existing && existing.ownerTabId === tabId) holds.delete(key);
      };
      tx.oncomplete = () => { getChannel()?.postMessage({ type: 'holds-changed', tripId }); resolve(); };
      tx.onerror = () => resolve();
    });
  },

  async pruneExpired(): Promise<void> {
    const d = await getDb();
    await new Promise<void>((resolve) => {
      const tx = d.transaction('holds', 'readwrite');
      const holds = tx.objectStore('holds');
      const req = holds.getAll();
      req.onsuccess = () => {
        const now = Date.now();
        for (const h of req.result as StoredHold[]) {
          if (h.expiresAt <= now) holds.delete(h.id);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  async book(tripId: string, seatId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const d = await getDb();
    const key = compositeId(tripId, seatId);
    return new Promise((resolve) => {
      const tx = d.transaction(['holds', 'bookings'], 'readwrite');
      const holds = tx.objectStore('holds');
      const bookings = tx.objectStore('bookings');
      let result: { ok: true } | { ok: false; reason: string } = { ok: false, reason: 'Unknown' };

      const bReq = bookings.get(key);
      bReq.onsuccess = () => {
        if (bReq.result) { result = { ok: false, reason: 'Already booked' }; tx.abort(); return; }
        const hReq = holds.get(key);
        hReq.onsuccess = () => {
          const hold = hReq.result as StoredHold | undefined;
          const now = Date.now();
          if (hold && hold.expiresAt > now && hold.ownerTabId !== tabId) {
            result = { ok: false, reason: 'Held by another session' }; tx.abort(); return;
          }
          const stored: StoredBooking = { id: key, tripId, seatId, bookedAt: now };
          bookings.put(stored);
          if (hold) holds.delete(key);
          result = { ok: true };
        };
      };
      tx.oncomplete = () => {
        if (result.ok) getChannel()?.postMessage({ type: 'bookings-changed', tripId });
        resolve(result);
      };
      tx.onabort = () => resolve(result);
      tx.onerror = () => resolve({ ok: false, reason: 'Transaction error' });
    });
  },

  subscribe(listener: () => void): () => void {
    const ch = getChannel();
    const onMsg = () => listener();
    ch?.addEventListener('message', onMsg);
    return () => ch?.removeEventListener('message', onMsg);
  }
};
