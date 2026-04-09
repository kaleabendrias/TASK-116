import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
  createTrip, editTrip, selectTrip, refreshTrips, trips, selectedTripId, getSelectedTripId
} from '@application/services/tripsService';
import { register, login, logout, bootstrapFirstAdmin } from '@application/services/authService';
import { seatMapRepository } from '@persistence/seatMapRepository';

const TRIP_INPUT = {
  name: 'Demo Trip', origin: 'Reykjavík', destination: 'Akureyri',
  departureAt: Date.now() + 86400000, rows: 8, cols: 4
};

async function asDispatcher(name = 'disp'): Promise<void> {
  await register(name, 'longenough', 'dispatcher');
  await login(name, 'longenough');
}

describe('tripsService', () => {
  it('rejects writes when not authenticated', async () => {
    await expect(createTrip(TRIP_INPUT)).rejects.toThrow(/Authentication/);
  });

  it('rejects writes from a non-dispatcher session', async () => {
    await register('reviewer', 'longenough', 'reviewer');
    await login('reviewer', 'longenough');
    await expect(createTrip(TRIP_INPUT)).rejects.toThrow(/not authorized/);
  }, 30000);

  it('creates a trip and seeds its seat inventory', async () => {
    await asDispatcher();
    const r = await createTrip(TRIP_INPUT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const snap = await seatMapRepository.snapshot(r.trip.id);
    expect(snap.seats.length).toBe(8 * 4);
  }, 30000);

  it('rejects invalid input', async () => {
    await asDispatcher();
    const bad = await createTrip({ ...TRIP_INPUT, name: '', rows: 0 } as typeof TRIP_INPUT);
    expect(bad.ok).toBe(false);
    const sameOriginDest = await createTrip({ ...TRIP_INPUT, origin: 'X', destination: 'X' });
    expect(sameOriginDest.ok).toBe(false);
  }, 30000);

  it('shrinking a trip explicitly deletes obsolete seats / holds / bookings (reconciliation)', async () => {
    await asDispatcher();
    const r = await createTrip(TRIP_INPUT);
    if (!r.ok) throw new Error('setup');

    // Hold and book seats that will live in row 7 (outside the new 6-row layout).
    const holdRes = await seatMapRepository.tryHold(r.trip.id, '7B', 60_000);
    expect(holdRes.ok).toBe(true);
    const bookRes = await seatMapRepository.book(r.trip.id, '7C');
    expect(bookRes.ok).toBe(true);

    // Sanity: 8 × 4 inventory before reconciliation
    let snap = await seatMapRepository.snapshot(r.trip.id);
    expect(snap.seats.length).toBe(32);
    expect(snap.holds.has('7B')).toBe(true);
    expect(snap.bookings.has('7C')).toBe(true);

    // Resize down to 6 rows
    const edited = await editTrip(r.trip.id, { rows: 6 });
    expect(edited.ok).toBe(true);

    snap = await seatMapRepository.snapshot(r.trip.id);
    expect(snap.seats.length).toBe(24); // 6 × 4 — no leftover row-7/8 seats
    expect(snap.seats.every((s) => s.row <= 6)).toBe(true);
    expect(snap.holds.has('7B')).toBe(false);
    expect(snap.bookings.has('7C')).toBe(false);
  }, 60000);

  it('growing a trip leaves existing seats intact and adds new rows', async () => {
    await asDispatcher();
    const r = await createTrip({ ...TRIP_INPUT, rows: 6 });
    if (!r.ok) throw new Error('setup');
    await seatMapRepository.book(r.trip.id, '6B');
    const edited = await editTrip(r.trip.id, { rows: 8 });
    expect(edited.ok).toBe(true);
    const snap = await seatMapRepository.snapshot(r.trip.id);
    expect(snap.seats.length).toBe(32);
    expect(snap.bookings.has('6B')).toBe(true);
  }, 60000);

  it('reconcileTripInventory called directly returns a precise report', async () => {
    await asDispatcher();
    const r = await createTrip(TRIP_INPUT);
    if (!r.ok) throw new Error('setup');
    await seatMapRepository.tryHold(r.trip.id, '8A', 60_000);
    await seatMapRepository.book(r.trip.id, '7D');
    const report = await seatMapRepository.reconcileTripInventory({ id: r.trip.id, rows: 6, cols: 4 });
    expect(report.seatsRemoved).toBe(8);   // rows 7-8 × 4 columns
    expect(report.holdsRemoved).toBe(1);
    expect(report.bookingsRemoved).toBe(1);
  }, 30000);

  it('edit rejects another dispatcher\'s trip', async () => {
    await asDispatcher('alice');
    const r = await createTrip(TRIP_INPUT);
    if (!r.ok) throw new Error('setup');
    logout();
    await asDispatcher('bob');
    const edited = await editTrip(r.trip.id, { name: 'hijack' });
    expect(edited.ok).toBe(false);
  }, 30000);

  it('refreshTrips object-level filters by creator; admins see everything', async () => {
    await asDispatcher('alice');
    await createTrip({ ...TRIP_INPUT, name: 'alice-trip' });
    logout();
    await asDispatcher('bob');
    await createTrip({ ...TRIP_INPUT, name: 'bob-trip' });
    await refreshTrips();
    const bobsView = get(trips);
    expect(bobsView.every((t) => t.name === 'bob-trip')).toBe(true);

    logout();
    await bootstrapFirstAdmin('root', 'longenough');
    await login('root', 'longenough');
    await refreshTrips();
    expect(get(trips).length).toBeGreaterThanOrEqual(2);
  }, 90000);

  it('selectTrip updates the active store and getSelectedTripId helper', async () => {
    await asDispatcher();
    const r = await createTrip(TRIP_INPUT);
    if (!r.ok) throw new Error('setup');
    await selectTrip(r.trip.id);
    expect(get(selectedTripId)).toBe(r.trip.id);
    expect(getSelectedTripId()).toBe(r.trip.id);
    await selectTrip(null);
    expect(get(selectedTripId)).toBeNull();
  }, 30000);

  it('edit rejects unknown trip + invalid patch', async () => {
    await asDispatcher();
    const missing = await editTrip('nope', { name: 'x' });
    expect(missing.ok).toBe(false);
    const r = await createTrip(TRIP_INPUT);
    if (!r.ok) throw new Error('setup');
    const bad = await editTrip(r.trip.id, { name: '' });
    expect(bad.ok).toBe(false);
  }, 30000);
});
