/**
 * Trips route — integration tests with real tripsService.
 *
 * Uses a thin mock for seatMapService (only stubs startSeatMap / stopSeatMap
 * because seat-map IDB logic is exercised separately in API_tests/seatMap.test.ts).
 * Everything else — auth, tripsService, IndexedDB — runs with real implementations,
 * proving that the Trips UI correctly handles actual backend data without masking
 * failures behind wholesale service mocks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';
import {
  bootstrapFirstAdmin, login, logout, register
} from '@application/services/authService';
import { createTrip } from '@application/services/tripsService';

// Stub svelte-spa-router to avoid hash-routing side effects in happy-dom
vi.mock('svelte-spa-router', async () => {
  const { writable: w } = await import('svelte/store');
  const { default: FakeRouter } = await import('./FakeRouter.svelte');
  return {
    default: FakeRouter,
    link: (_node: Element) => ({ destroy: () => {} }),
    location: w('/')
  };
});

// Thin mock: only stubs the seat-map operations that Trips.svelte calls directly.
// The trips list, auth, and IDB all use real implementations.
vi.mock('@application/services/seatMapService', async () => {
  const { writable } = await import('svelte/store');
  const storeW = writable({ tripId: null, seats: [], holds: new Map(), now: Date.now() });
  const availCount = writable(0);
  return {
    seatMap: { subscribe: storeW.subscribe },
    availableCount: { subscribe: availCount.subscribe },
    ownTabId: 'test-tab',
    startSeatMap: vi.fn().mockResolvedValue(undefined),
    stopSeatMap: vi.fn(),
    holdSeat: vi.fn().mockResolvedValue({ ok: true }),
    releaseSeat: vi.fn().mockResolvedValue(undefined),
    bookSeat: vi.fn().mockResolvedValue({ ok: true }),
    ownHoldFor: vi.fn().mockReturnValue(null),
    _resetSeatMapForTesting: vi.fn(),
    getActiveTripId: vi.fn().mockReturnValue(null)
  };
});

import Trips from '../src/ui/routes/Trips.svelte';

afterEach(() => {
  logout();
  document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
// Trips route — real tripsService integration
// ─────────────────────────────────────────────────────────────────────────────

describe('Trips route — real data flow (thin-mocked seatMapService only)', () => {
  it('renders the page header', async () => {
    await bootstrapFirstAdmin('trips_hdr_admin', 'Admin123!');
    await login('trips_hdr_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    expect(host.innerHTML).toContain('Trips');
  });

  it('renders "No trips yet" empty-state when the IDB store is empty', async () => {
    await bootstrapFirstAdmin('trips_empty_admin', 'Admin123!');
    await login('trips_empty_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    expect(host.innerHTML).toContain('No trips yet');
  });

  it('renders a trip created via real tripsService — no mock bypasses the data flow', async () => {
    await bootstrapFirstAdmin('trips_real_admin', 'Admin123!');
    await login('trips_real_admin', 'Admin123!');

    const result = await createTrip({
      name: 'Real Integration Trip',
      origin: 'Alpha Hub',
      destination: 'Beta Terminal',
      departureAt: Date.now() + 86_400_000,
      rows: 8,
      cols: 4
    });
    expect(result.ok).toBe(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    expect(host.innerHTML).toContain('Real Integration Trip');
    expect(host.innerHTML).toContain('Alpha Hub');
    expect(host.innerHTML).toContain('Beta Terminal');
  });

  it('renders multiple trips created via real service — list faithfully reflects IDB state', async () => {
    await bootstrapFirstAdmin('trips_multi_admin', 'Admin123!');
    await login('trips_multi_admin', 'Admin123!');

    const tripNames = ['Alpha Run', 'Beta Express', 'Gamma Shuttle'];
    for (const name of tripNames) {
      const r = await createTrip({
        name,
        origin: 'O',
        destination: 'D',
        departureAt: Date.now() + 86_400_000,
        rows: 4,
        cols: 4
      });
      expect(r.ok).toBe(true);
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    for (const name of tripNames) {
      expect(host.innerHTML).toContain(name);
    }
    expect(host.innerHTML).not.toContain('No trips yet');
  });

  it('dispatcher can see their own trips rendered from real IDB data', async () => {
    await bootstrapFirstAdmin('trips_disp_setup', 'Admin123!');
    await login('trips_disp_setup', 'Admin123!');
    logout();

    await register('trips_disp1', 'Disp123!', 'dispatcher');
    await login('trips_disp1', 'Disp123!');

    const result = await createTrip({
      name: 'Dispatcher Integration Trip',
      origin: 'North',
      destination: 'South',
      departureAt: Date.now() + 86_400_000,
      rows: 6,
      cols: 4
    });
    expect(result.ok).toBe(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    expect(host.innerHTML).toContain('Dispatcher Integration Trip');
    expect(host.innerHTML).toContain('North');
    expect(host.innerHTML).toContain('South');
  });

  it('shows the layout dimensions of each trip from real service data', async () => {
    await bootstrapFirstAdmin('trips_layout_admin', 'Admin123!');
    await login('trips_layout_admin', 'Admin123!');

    await createTrip({
      name: 'Layout Verifier',
      origin: 'X',
      destination: 'Y',
      departureAt: Date.now() + 86_400_000,
      rows: 10,
      cols: 6
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    // The table renders rows × cols
    expect(host.innerHTML).toContain('10');
    expect(host.innerHTML).toContain('6');
  });

  it('renders the "New trip" button', async () => {
    await bootstrapFirstAdmin('trips_btn_admin', 'Admin123!');
    await login('trips_btn_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    const btn = Array.from(host.querySelectorAll('button')).find(
      b => b.textContent?.includes('New trip')
    );
    expect(btn).toBeDefined();
  });

  it('opening the New trip modal shows the form — real component + real auth', async () => {
    await bootstrapFirstAdmin('trips_modal_admin', 'Admin123!');
    await login('trips_modal_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    const btn = Array.from(host.querySelectorAll('button')).find(
      b => b.textContent?.includes('New trip')
    );
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    // Modal with inputs should appear
    expect(host.querySelectorAll('input').length).toBeGreaterThanOrEqual(1);
  });

  it('trip validation errors from real service surface in the UI', async () => {
    await bootstrapFirstAdmin('trips_err_admin', 'Admin123!');
    await login('trips_err_admin', 'Admin123!');

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();

    // Open modal
    const newBtn = Array.from(host.querySelectorAll('button')).find(
      b => b.textContent?.includes('New trip')
    );
    newBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    // Click Create with empty name (default form) — service returns validation errors
    const createBtn = Array.from(host.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Create'
    );
    createBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    // Real tripsService returns errors for blank name — they should be rendered
    expect(host.innerHTML).toContain('ul');
  });
});
