import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import type { Seat } from '@domain/trips/seat';

// Use async factory so writable can be imported inside the hoisted mock
vi.mock('@application/services/seatMapService', async () => {
  const { writable } = await import('svelte/store');
  const initial = { tripId: null as string | null, seats: [] as Seat[], holds: new Map<string, unknown>(), now: Date.now() };
  const mockStore = writable(initial);
  return {
    seatMap: { subscribe: mockStore.subscribe },
    ownTabId: 'test-tab-id',
    __mockStore: mockStore,
    _resetSeatMapForTesting: vi.fn()
  };
});

import SeatMap from '../src/ui/components/SeatMap.svelte';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SeatMap — empty state', () => {
  it('renders the seat-map container', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    expect(host.querySelector('.seat-map')).not.toBeNull();
  });

  it('renders the legend', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    expect(host.querySelector('.legend')).not.toBeNull();
  });

  it('renders no seat buttons when there are no seats', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const buttons = host.querySelectorAll('button.seat');
    expect(buttons.length).toBe(0);
  });

  it('renders legend chips', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const chips = host.querySelectorAll('.chip');
    expect(chips.length).toBeGreaterThanOrEqual(7);
  });
});

describe('SeatMap — with seats', () => {
  const now = Date.now();
  const seats: Seat[] = [
    { id: 's1', row: 1, column: 1, label: '1A', kind: 'standard', status: 'available' },
    { id: 's2', row: 1, column: 2, label: '1B', kind: 'standard', status: 'available' },
    { id: 's3', row: 1, column: 3, label: '1C', kind: 'ada',      status: 'available' },
    { id: 's4', row: 2, column: 1, label: '2A', kind: 'standard', status: 'booked'    },
    { id: 's5', row: 2, column: 2, label: '2B', kind: 'crew',     status: 'available' }
  ];

  beforeEach(async () => {
    const mod = await import('@application/services/seatMapService') as {
      __mockStore: { set: (v: unknown) => void }
    };
    mod.__mockStore.set({ tripId: 't1', seats, holds: new Map(), now });
  });

  it('renders one button per seat', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const buttons = host.querySelectorAll('button.seat');
    expect(buttons.length).toBe(5);
  });

  it('renders distinct seat-row elements per row', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const rows = host.querySelectorAll('.seat-row');
    expect(rows.length).toBe(2);
  });

  it('booked seat button is disabled', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const buttons = host.querySelectorAll<HTMLButtonElement>('button.seat');
    const booked = Array.from(buttons).find(b => b.textContent?.trim() === '2A');
    expect(booked?.disabled).toBe(true);
  });

  it('available seat button is not disabled', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const buttons = host.querySelectorAll<HTMLButtonElement>('button.seat');
    const avail = Array.from(buttons).find(b => b.textContent?.trim() === '1A');
    expect(avail?.disabled).toBe(false);
  });

  it('calls onSelect when an available seat is clicked', async () => {
    const onSelect = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect } });
    await tick();
    const buttons = host.querySelectorAll<HTMLButtonElement>('button.seat');
    const avail = Array.from(buttons).find(b => b.textContent?.trim() === '1A');
    avail?.click();
    await tick();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: 's1' });
  });
});

describe('SeatMap — hold states', () => {
  const now = Date.now();
  const seats: Seat[] = [
    { id: 'h1', row: 1, column: 1, label: '1A', kind: 'standard', status: 'available' },
    { id: 'h2', row: 1, column: 2, label: '1B', kind: 'standard', status: 'available' },
    { id: 'h3', row: 1, column: 3, label: '1C', kind: 'standard', status: 'available' }
  ];

  it('applies held-mine class when the seat is held by own tab', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __mockStore: { set: (v: unknown) => void }
    };
    const holds = new Map([
      ['h1', { seatId: 'h1', ownerTabId: 'test-tab-id', expiresAt: now + 600_000 }]
    ]);
    mod.__mockStore.set({ tripId: 't1', seats, holds, now });

    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button.seat'))
      .find(b => b.textContent?.trim() === '1A');
    expect(btn?.className).toContain('held-mine');
  });

  it('applies held-other class when the seat is held by another tab', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __mockStore: { set: (v: unknown) => void }
    };
    const holds = new Map([
      ['h2', { seatId: 'h2', ownerTabId: 'other-tab', expiresAt: now + 600_000 }]
    ]);
    mod.__mockStore.set({ tripId: 't1', seats, holds, now });

    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button.seat'))
      .find(b => b.textContent?.trim() === '1B');
    expect(btn?.className).toContain('held-other');
  });

  it('applies selected class when the seat matches selectedSeatId', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __mockStore: { set: (v: unknown) => void }
    };
    mod.__mockStore.set({ tripId: 't1', seats, holds: new Map(), now });

    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: 'h3', onSelect: vi.fn() } });
    await tick();
    const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button.seat'))
      .find(b => b.textContent?.trim() === '1C');
    expect(btn?.className).toContain('selected');
  });

  it('updates seat buttons when store changes after mount', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __mockStore: { set: (v: unknown) => void }
    };
    mod.__mockStore.set({ tripId: 't1', seats, holds: new Map(), now });

    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect: vi.fn() } });
    await tick();
    expect(host.querySelectorAll('button.seat').length).toBe(3);

    const newSeats = [...seats, { id: 'h4', row: 2, column: 1, label: '2A', kind: 'standard' as const, status: 'available' as const }];
    mod.__mockStore.set({ tripId: 't1', seats: newSeats, holds: new Map(), now });
    await tick();
    expect(host.querySelectorAll('button.seat').length).toBe(4);
  });

  it('does not call onSelect when clicking a held-other seat (disabled)', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __mockStore: { set: (v: unknown) => void }
    };
    const holds = new Map([
      ['h2', { seatId: 'h2', ownerTabId: 'other-tab', expiresAt: now + 600_000 }]
    ]);
    mod.__mockStore.set({ tripId: 't1', seats, holds, now });
    const onSelect = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    new SeatMap({ target: host, props: { selectedSeatId: null, onSelect } });
    await tick();
    const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button.seat'))
      .find(b => b.textContent?.trim() === '1B');
    btn?.click();
    await tick();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
