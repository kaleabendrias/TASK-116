import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
  startSeatMap, stopSeatMap, seatMap, availableCount, holdSeat, releaseSeat, bookSeat, ownHoldFor
} from '@application/services/seatMapService';
import { seatMapRepository, _setTabIdForTesting } from '@persistence/seatMapRepository';
import { register, login, logout, bootstrapFirstAdmin } from '@application/services/authService';
import { createTrip, selectTrip } from '@application/services/tripsService';

const TRIP_TEMPLATE = { name: 'Demo', origin: 'A', destination: 'B', departureAt: Date.now() + 86400000, rows: 8, cols: 4 };

async function loginAsDispatcher(name = 'disp'): Promise<void> {
  await register(name, 'longenough', 'dispatcher');
  await login(name, 'longenough');
}

async function newTripAndStart(name = 'demo'): Promise<string> {
  await loginAsDispatcher(name);
  const r = await createTrip(TRIP_TEMPLATE);
  if (!r.ok) throw new Error('setup');
  await selectTrip(r.trip.id);
  await startSeatMap(r.trip.id);
  return r.trip.id;
}

describe('seatMapService — single tab', () => {
  it('seeds an offline inventory with ADA / crew / standard seats per trip', async () => {
    await newTripAndStart();
    const state = get(seatMap);
    expect(state.seats.length).toBe(32); // 8 rows × 4 columns
    expect(state.seats.filter((s) => s.kind === 'ada').length).toBeGreaterThan(0);
    expect(state.seats.filter((s) => s.kind === 'crew').length).toBeGreaterThan(0);
    stopSeatMap();
  }, 30000);

  it('hold + release flow updates ownership instantly', async () => {
    await newTripAndStart();
    const before = get(availableCount);
    const hold = await holdSeat('5B');
    expect(hold.ok).toBe(true);
    expect(ownHoldFor('5B')).not.toBeNull();
    expect(get(availableCount)).toBe(before);
    await releaseSeat('5B');
    expect(ownHoldFor('5B')).toBeNull();
    stopSeatMap();
  }, 30000);

  it('booking removes the seat from available pool and prevents re-booking', async () => {
    await newTripAndStart();
    const before = get(availableCount);
    await holdSeat('6C');
    const r = await bookSeat('6C');
    expect(r.ok).toBe(true);
    expect(get(availableCount)).toBe(before - 1);
    const again = await bookSeat('6C');
    expect(again.ok).toBe(false);
    stopSeatMap();
  }, 30000);

  it('hold expiry math: expiresAt is now + duration', async () => {
    const tripId = await newTripAndStart();
    const before = Date.now();
    const r = await seatMapRepository.tryHold(tripId, '7A', 10 * 60 * 1000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hold.expiresAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000);
      expect(r.hold.expiresAt).toBeLessThan(before + 10 * 60 * 1000 + 5000);
    }
  }, 30000);

  it('pruneExpired removes stale holds', async () => {
    const tripId = await newTripAndStart();
    await seatMapRepository.tryHold(tripId, '8A', 1);
    await new Promise((r) => setTimeout(r, 10));
    await seatMapRepository.pruneExpired();
    const snap = await seatMapRepository.snapshot(tripId);
    expect(snap.holds.has('8A')).toBe(false);
  }, 30000);

  it('rejects mutations from a non-dispatcher session', async () => {
    await register('reviewer1', 'longenough', 'reviewer');
    await login('reviewer1', 'longenough');
    await expect(holdSeat('1B')).rejects.toThrow(/not authorized/);
    await expect(releaseSeat('1B')).rejects.toThrow(/not authorized/);
    await expect(bookSeat('1B')).rejects.toThrow(/not authorized/);
  }, 30000);

  it('rejects mutations when no trip is selected', async () => {
    await loginAsDispatcher('lonely');
    await expect(holdSeat('1B')).rejects.toThrow(/No active trip/);
  }, 30000);

  it('rejects startSeatMap on a trip owned by a different dispatcher', async () => {
    // Owner creates a trip…
    const tripId = await newTripAndStart('owner-disp');
    stopSeatMap();
    logout();
    // …a second dispatcher cannot even open the seat map for it.
    await loginAsDispatcher('intruder-disp');
    await expect(startSeatMap(tripId)).rejects.toThrow(/another dispatcher/);
  }, 60000);

  it('intruder dispatcher cannot smuggle a foreign trip id into the active seat-map state', async () => {
    // Owner sets up the trip and its inventory.
    const tripId = await newTripAndStart('owner-disp-2');
    stopSeatMap();
    logout();

    // Intruder logs in, opens their own trip (so the module's private
    // activeTripId is now legitimately set), and then tries to swap in
    // the foreign id. The visibility gate must reject the swap.
    await loginAsDispatcher('intruder-disp-2');
    const ownTrip = await createTrip(TRIP_TEMPLATE);
    if (!ownTrip.ok) throw new Error('setup');
    await startSeatMap(ownTrip.trip.id);
    await expect(startSeatMap(tripId)).rejects.toThrow(/another dispatcher/);
    stopSeatMap();
  }, 60000);

  it('administrators may operate on any dispatcher\'s trip inventory', async () => {
    const tripId = await newTripAndStart('owner-disp-3');
    stopSeatMap();
    logout();
    await bootstrapFirstAdmin('overseer', 'longenough');
    await login('overseer', 'longenough');
    // Admin can open the seat map and hold a seat on the dispatcher's trip.
    await startSeatMap(tripId);
    const r = await holdSeat('4C');
    expect(r.ok).toBe(true);
    await releaseSeat('4C');
    stopSeatMap();
  }, 60000);
});

describe('seatMapService — multi-tab race', () => {
  it('a second tab cannot hold a seat already held by the first tab', async () => {
    const tripId = await newTripAndStart('race-1');
    _setTabIdForTesting('tab-A');
    const r1 = await seatMapRepository.tryHold(tripId, '2A', 60_000);
    expect(r1.ok).toBe(true);

    _setTabIdForTesting('tab-B');
    const r2 = await seatMapRepository.tryHold(tripId, '2A', 60_000);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/another session/);
  }, 30000);

  it('a second tab cannot book a seat held by the first tab', async () => {
    const tripId = await newTripAndStart('race-2');
    _setTabIdForTesting('tab-A');
    await seatMapRepository.tryHold(tripId, '2B', 60_000);

    _setTabIdForTesting('tab-B');
    const blocked = await seatMapRepository.book(tripId, '2B');
    expect(blocked.ok).toBe(false);

    _setTabIdForTesting('tab-A');
    await seatMapRepository.releaseHold(tripId, '2B');

    _setTabIdForTesting('tab-B');
    const ok = await seatMapRepository.book(tripId, '2B');
    expect(ok.ok).toBe(true);

    _setTabIdForTesting('tab-A');
    const dup = await seatMapRepository.book(tripId, '2B');
    expect(dup.ok).toBe(false);
  }, 30000);

  it('subscribe/unsubscribe wires the broadcast channel without throwing', () => {
    const off = seatMapRepository.subscribe(() => {});
    off();
  });

  it('seat inventories are scoped per trip', async () => {
    const tripA = await newTripAndStart('iso-a');
    await seatMapRepository.tryHold(tripA, '3A', 60_000);
    await bootstrapFirstAdmin('root', 'longenough');
    logout();
    await login('root', 'longenough');
    const tripBRes = await createTrip({ ...TRIP_TEMPLATE, name: 'iso-b' });
    if (!tripBRes.ok) throw new Error('setup');
    const snapA = await seatMapRepository.snapshot(tripA);
    const snapB = await seatMapRepository.snapshot(tripBRes.trip.id);
    expect(snapA.holds.has('3A')).toBe(true);
    expect(snapB.holds.has('3A')).toBe(false);
  }, 60000);
});
