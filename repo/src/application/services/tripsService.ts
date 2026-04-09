import { writable, get, derived } from 'svelte/store';
import type { Trip, NewTripInput, TripPatch } from '@domain/trips/trip';
import { validateNewTrip, validatePatch } from '@domain/trips/tripRules';
import { tripsRepository } from '@persistence/tripsRepository';
import { seatMapRepository } from '@persistence/seatMapRepository';
import { requireRole, requireSession, hasAnyRole } from './authorization';
import { initializeSeatsForTrip } from './seatMapService';
import { uid } from '@shared/utils/id';
import { logger } from '@shared/logging/logger';

const tripsStore = writable<Trip[]>([]);
const selectedTripIdStore = writable<string | null>(null);

export const trips = { subscribe: tripsStore.subscribe };
export const selectedTripId = { subscribe: selectedTripIdStore.subscribe };

export const selectedTrip = derived([tripsStore, selectedTripIdStore], ([$trips, $id]) =>
  $id ? $trips.find((t) => t.id === $id) ?? null : null
);

export function getSelectedTripId(): string | null {
  return get(selectedTripIdStore);
}

/**
 * Object-level filtering: dispatchers see only their own trips; admins see
 * everything. Refreshing requires a session.
 */
export async function refreshTrips(): Promise<void> {
  const userId = requireSession();
  const all = await tripsRepository.list();
  const visible = hasAnyRole('administrator') ? all : all.filter((t) => t.createdBy === userId);
  tripsStore.set(visible);
}

export async function createTrip(input: NewTripInput): Promise<{ ok: true; trip: Trip } | { ok: false; errors: string[] }> {
  const { userId } = requireRole('dispatcher', 'administrator');
  const v = validateNewTrip(input);
  if (!v.ok) return v;
  const now = Date.now();
  const trip: Trip = {
    ...input,
    id: uid('trip'),
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  };
  await tripsRepository.put(trip);
  await initializeSeatsForTrip(trip);
  logger.info('trip.created', { tripId: trip.id, by: userId, rows: trip.rows, cols: trip.cols });
  await refreshTrips();
  return { ok: true, trip };
}

export async function editTrip(id: string, patch: TripPatch): Promise<{ ok: true; trip: Trip } | { ok: false; errors: string[] }> {
  const { userId } = requireRole('dispatcher', 'administrator');
  const existing = await tripsRepository.get(id);
  if (!existing) return { ok: false, errors: ['Trip not found'] };
  if (existing.createdBy !== userId && !hasAnyRole('administrator')) {
    logger.warn('trip.edit.denied', { tripId: id, actor: userId });
    return { ok: false, errors: ['Cannot edit another dispatcher\'s trip'] };
  }
  const v = validatePatch(existing, patch);
  if (!v.ok) return v;
  const updated: Trip = {
    ...existing,
    ...v.merged,
    updatedAt: Date.now()
  };
  await tripsRepository.put(updated);
  // Reconcile the seat inventory when dimensions change so obsolete seats,
  // holds, and bookings are explicitly deleted instead of leaking past the
  // new layout.
  if (existing.rows !== updated.rows || existing.cols !== updated.cols) {
    const report = await seatMapRepository.reconcileTripInventory(updated);
    logger.info('trip.resized', {
      tripId: id, rows: updated.rows, cols: updated.cols,
      seatsRemoved: report.seatsRemoved,
      holdsRemoved: report.holdsRemoved,
      bookingsRemoved: report.bookingsRemoved
    });
  }
  logger.info('trip.edited', { tripId: id, by: userId });
  await refreshTrips();
  return { ok: true, trip: updated };
}

export async function selectTrip(id: string | null): Promise<void> {
  requireRole('dispatcher', 'administrator');
  selectedTripIdStore.set(id);
  logger.info('trip.selected', { tripId: id });
}

/** Test-only: clear the selected trip + cached store. */
export function _resetTripsForTesting(): void {
  selectedTripIdStore.set(null);
  tripsStore.set([]);
}
