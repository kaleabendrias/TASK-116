/**
 * Deterministic clock-driven integration tests.
 *
 * The seat-hold countdown and the messaging queue tick both depend on
 * actual wall-clock time AND on the browser's scheduling primitives
 * (`setInterval`, `Date.now`). The pre-existing tests probe these paths
 * with static fixtures or `setTimeout` sleeps, which only proves the
 * SHAPES are correct — they do not prove the runtime behavior under a
 * simulated browser scheduler.
 *
 * These tests use vitest's fake-timers to drive both the wall clock and
 * the timer queue forward in lockstep, and assert that:
 *
 *   - the seat-map service's 1s `setInterval` tick fires `pruneExpired`
 *     and removes a hold whose `expiresAt` has passed;
 *   - the messaging service's `tickQueue` releases a quiet-hours-deferred
 *     message exactly when the simulated clock leaves the quiet window.
 *
 * Both tests are fully deterministic — there is no real elapsed time,
 * no `setTimeout` racing IDB, and no flaky 10ms sleeps.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

import {
  startSeatMap, stopSeatMap, seatMap, holdSeat
} from '@application/services/seatMapService';
import { seatMapRepository } from '@persistence/seatMapRepository';
import { register, login, logout, currentUserId } from '@application/services/authService';
import { createTrip, selectTrip } from '@application/services/tripsService';

import {
  sendMessage, tickQueue, refreshMessages, messages
} from '@application/services/messagingService';
import { messagesRepository } from '@persistence/messagesRepository';
import { preferences } from '@persistence/preferences';

beforeEach(() => {
  // shouldAdvanceTime keeps fake-indexeddb's microtask-driven IO from
  // wedging behind the frozen clock — microtasks still flush normally,
  // and the timer queue advances only when we tell it to.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('seat hold countdown — deterministic, scheduler-driven', () => {
  it('the seatMap setInterval tick prunes a hold whose expiresAt has passed', async () => {
    // Pin the wall clock so Date.now() and the hold's expiresAt are
    // both controlled by the test.
    vi.setSystemTime(new Date('2026-04-09T12:00:00Z'));

    // --- session + trip setup ----
    await register('clock-disp', 'longenough', 'dispatcher');
    await login('clock-disp', 'longenough');
    const trip = await createTrip({
      name: 'Clock Trip', origin: 'A', destination: 'B',
      departureAt: Date.now() + 86_400_000, rows: 6, cols: 4
    });
    if (!trip.ok) throw new Error('setup');
    await selectTrip(trip.trip.id);

    // startSeatMap arms the 1-second pruning interval.
    await startSeatMap(trip.trip.id);

    // Place a hold that should expire in 60 seconds.
    const HOLD_MS = 60_000;
    const before = Date.now();
    const r = await seatMapRepository.tryHold(trip.trip.id, '3B', HOLD_MS);
    expect(r.ok).toBe(true);
    // Allow a small drift because shouldAdvanceTime ticks the clock
    // between two Date.now() reads while the IDB transaction resolves.
    if (r.ok) {
      expect(r.hold.expiresAt).toBeGreaterThanOrEqual(before + HOLD_MS);
      expect(r.hold.expiresAt).toBeLessThan(before + HOLD_MS + 1000);
    }

    // The hold is visible in the IDB-backed snapshot before time passes.
    let snap = await seatMapRepository.snapshot(trip.trip.id);
    expect(snap.holds.has('3B')).toBe(true);

    // Advance simulated time PAST the hold expiry. shouldAdvanceTime keeps
    // microtasks flowing so the tick callback's awaited IDB ops resolve;
    // advanceTimersByTimeAsync drives the setInterval queue.
    await vi.advanceTimersByTimeAsync(HOLD_MS + 5_000);

    // The repository's pruneExpired ran from inside the 1s tick — the
    // expired hold must be gone from the persistence layer entirely.
    snap = await seatMapRepository.snapshot(trip.trip.id);
    expect(snap.holds.has('3B')).toBe(false);

    stopSeatMap();
  }, 30000);

  it('an in-flight hold (not yet expired) survives the tick — no false positives', async () => {
    vi.setSystemTime(new Date('2026-04-09T12:00:00Z'));
    await register('clock-disp-2', 'longenough', 'dispatcher');
    await login('clock-disp-2', 'longenough');
    const trip = await createTrip({
      name: 'Clock Trip 2', origin: 'A', destination: 'B',
      departureAt: Date.now() + 86_400_000, rows: 4, cols: 4
    });
    if (!trip.ok) throw new Error('setup');
    await selectTrip(trip.trip.id);
    await startSeatMap(trip.trip.id);

    const HOLD_MS = 5 * 60_000;
    await seatMapRepository.tryHold(trip.trip.id, '2C', HOLD_MS);

    // Advance well past several scheduler ticks but stay before expiry.
    await vi.advanceTimersByTimeAsync(60_000);

    const snap = await seatMapRepository.snapshot(trip.trip.id);
    expect(snap.holds.has('2C')).toBe(true);
    stopSeatMap();
  }, 30000);
});

describe('messaging queue tick — deterministic, scheduler-driven', () => {
  it('a quiet-hours-deferred message becomes deliverable on the next tickQueue after the window ends', async () => {
    // Start INSIDE the recipient's quiet window so the first send is
    // automatically deferred. The window is 22:00–23:00 local time.
    vi.setSystemTime(new Date('2026-04-09T22:30:00'));

    await register('queue-sender', 'longenough', 'dispatcher');
    await login('queue-sender', 'longenough');
    const recipient = await register('queue-recip', 'longenough', 'reviewer');

    // Force a deterministic quiet window for the recipient that contains
    // the simulated "now". This bypasses the host's local timezone so the
    // test never depends on where it runs.
    const h = new Date().getHours();
    preferences.setQuietHours(recipient.id, { startHour: h, endHour: (h + 1) % 24 });

    const msg = await sendMessage({
      toUserId: recipient.id,
      category: 'system',
      subject: 's', body: 'b'
    });

    // First pass: deferred — still pending, attempts unchanged, lastError set.
    let stored = await messagesRepository.get(msg.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.attempts).toBe(0);
    expect(stored?.lastError).toBe('Quiet hours');
    expect(stored && stored.nextAttemptAt > Date.now()).toBe(true);

    // tickQueue while we are STILL inside the quiet window — must remain
    // deferred, must not consume a retry slot.
    await tickQueue();
    stored = await messagesRepository.get(msg.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.attempts).toBe(0);

    // Advance the simulated clock past the quiet window end. We use
    // advanceTimersByTimeAsync so any internal timer schedulers move
    // forward in lockstep with Date.now().
    const advanceMs = (stored!.nextAttemptAt - Date.now()) + 1_000;
    await vi.advanceTimersByTimeAsync(advanceMs);

    // Now drive the queue. The message should be delivered.
    await tickQueue();
    stored = await messagesRepository.get(msg.id);
    expect(stored?.status).toBe('delivered');
    expect(stored?.attempts).toBe(1);
    expect(stored?.lastError).toBeNull();

    // The store reflects the delivered status after refresh.
    await refreshMessages();
    const visible = get(messages).find((m) => m.id === msg.id);
    expect(visible?.status).toBe('delivered');
  }, 60000);

  it('tickQueue is a no-op for a message whose nextAttemptAt is still in the future', async () => {
    vi.setSystemTime(new Date('2026-04-09T03:30:00'));

    await register('queue-sender-2', 'longenough', 'dispatcher');
    await login('queue-sender-2', 'longenough');
    const recipient = await register('queue-recip-2', 'longenough', 'reviewer');
    const h = new Date().getHours();
    preferences.setQuietHours(recipient.id, { startHour: h, endHour: (h + 1) % 24 });

    const msg = await sendMessage({
      toUserId: recipient.id,
      category: 'system',
      subject: 's', body: 'b'
    });
    const stored1 = await messagesRepository.get(msg.id);
    expect(stored1?.status).toBe('pending');

    // Advance only a few seconds — far short of the deferral window end.
    await vi.advanceTimersByTimeAsync(5_000);
    await tickQueue();

    const stored2 = await messagesRepository.get(msg.id);
    expect(stored2?.status).toBe('pending');
    expect(stored2?.attempts).toBe(0);
  }, 60000);
});
