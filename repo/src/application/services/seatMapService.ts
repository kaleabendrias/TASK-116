import { writable, derived, get, type Readable } from 'svelte/store';
import type { Seat, SeatHold } from '@domain/trips/seat';
import { HOLD_DURATION_MS } from '@domain/trips/seat';
import type { Trip } from '@domain/trips/trip';
import { countAvailable } from '@domain/trips/seatRules';
import { seatMapRepository, tabId } from '@persistence/seatMapRepository';
import { tripsRepository } from '@persistence/tripsRepository';
import { requireRole, requireSession, hasAnyRole, AuthorizationError } from './authorization';
import { logger } from '@shared/logging/logger';

interface ViewState {
  tripId: string | null;
  seats: Seat[];
  holds: Map<string, SeatHold>;
  now: number;
}

const stateStore = writable<ViewState>({ tripId: null, seats: [], holds: new Map(), now: Date.now() });

let activeTripId: string | null = null;
let unsubRepo: (() => void) | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  if (!activeTripId) {
    stateStore.set({ tripId: null, seats: [], holds: new Map(), now: Date.now() });
    return;
  }
  const snap = await seatMapRepository.snapshot(activeTripId);
  stateStore.set({ tripId: snap.tripId, seats: snap.seats, holds: snap.holds, now: Date.now() });
}

/** Test-only: drop the cached active trip so beforeEach hooks reset cleanly. */
export function _resetSeatMapForTesting(): void {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  if (unsubRepo) { unsubRepo(); unsubRepo = null; }
  activeTripId = null;
  stateStore.set({ tripId: null, seats: [], holds: new Map(), now: Date.now() });
}

/**
 * Resolve a trip and verify the active session may operate on it. Mirrors
 * the creator-check logic in `tripsService.editTrip`: dispatchers may only
 * touch trips they themselves created; administrators may touch any trip.
 * Throws `AuthorizationError` on a visibility mismatch and a plain Error
 * when the trip does not exist at all.
 */
async function resolveTripForActor(tripId: string, userId: string): Promise<Trip> {
  const trip = await tripsRepository.get(tripId);
  if (!trip) {
    logger.warn('seatmap.trip.missing', { tripId, actor: userId });
    throw new Error('Trip not found');
  }
  if (trip.createdBy !== userId && !hasAnyRole('administrator')) {
    logger.warn('seatmap.trip.denied', { tripId, actor: userId, owner: trip.createdBy });
    throw new AuthorizationError('Cannot operate on another dispatcher\'s trip');
  }
  return trip;
}

export async function startSeatMap(tripId: string): Promise<void> {
  const userId = requireSession();
  // Visibility gate: refuse to even open the seat map of a trip the caller
  // does not own (and is not admin for). Otherwise the BroadcastChannel
  // refresh and the polling tick would leak inventory snapshots from a
  // foreign trip into the active session's UI state.
  await resolveTripForActor(tripId, userId);
  activeTripId = tripId;
  if (!unsubRepo) unsubRepo = seatMapRepository.subscribe(() => { void refresh(); });
  if (!tickInterval) {
    tickInterval = setInterval(() => {
      void seatMapRepository.pruneExpired().then(refresh);
    }, 1000);
  }
  await refresh();
}

export function stopSeatMap(): void {
  unsubRepo?.(); unsubRepo = null;
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

export const seatMap: Readable<ViewState> = { subscribe: stateStore.subscribe };

export const availableCount = derived(stateStore, ($s) =>
  countAvailable($s.seats, $s.holds, $s.now, tabId)
);

export const ownTabId = tabId;

function activeTripOrThrow(): string {
  if (!activeTripId) throw new Error('No active trip selected');
  return activeTripId;
}

/** Initialize the seat inventory for a trip and select it as the active trip. */
export async function initializeSeatsForTrip(trip: Pick<Trip, 'id' | 'rows' | 'cols'>): Promise<void> {
  requireRole('dispatcher', 'administrator');
  await seatMapRepository.initializeTripSeats(trip);
  logger.info('seatmap.initialized', { tripId: trip.id, rows: trip.rows, cols: trip.cols });
}

export async function holdSeat(seatId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { userId } = requireRole('dispatcher', 'administrator');
  const tripId = activeTripOrThrow();
  await resolveTripForActor(tripId, userId);
  const result = await seatMapRepository.tryHold(tripId, seatId, HOLD_DURATION_MS);
  if (result.ok) logger.info('seatmap.hold', { tripId, seatId, userId });
  else logger.warn('seatmap.hold.rejected', { tripId, seatId, userId, reason: result.reason });
  await refresh();
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function releaseSeat(seatId: string): Promise<void> {
  const { userId } = requireRole('dispatcher', 'administrator');
  const tripId = activeTripOrThrow();
  await resolveTripForActor(tripId, userId);
  await seatMapRepository.releaseHold(tripId, seatId);
  logger.info('seatmap.release', { tripId, seatId, userId });
  await refresh();
}

export async function bookSeat(seatId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { userId } = requireRole('dispatcher', 'administrator');
  const tripId = activeTripOrThrow();
  await resolveTripForActor(tripId, userId);
  const result = await seatMapRepository.book(tripId, seatId);
  if (result.ok) logger.info('seatmap.book', { tripId, seatId, userId });
  else logger.warn('seatmap.book.rejected', { tripId, seatId, userId, reason: result.reason });
  await refresh();
  return result;
}

export function ownHoldFor(seatId: string): SeatHold | null {
  const s = get(stateStore);
  const h = s.holds.get(seatId);
  return h && h.ownerTabId === tabId && h.expiresAt > Date.now() ? h : null;
}

export function getActiveTripId(): string | null {
  return activeTripId;
}
