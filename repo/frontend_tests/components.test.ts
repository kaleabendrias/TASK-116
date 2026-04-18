/**
 * Lightweight tests for the simpler UI components:
 * Modal, Drawer, PageHeader, HoldCountdown, BookingPanel.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';

// Mock seatMapService for components that depend on it
vi.mock('@application/services/seatMapService', async () => {
  const { writable, readable } = await import('svelte/store');
  const state = { tripId: null, seats: [], holds: new Map(), now: Date.now() };
  const storeW = writable(state);
  const availCount = writable(0);
  return {
    seatMap: { subscribe: storeW.subscribe },
    ownTabId: 'test-tab',
    __seatStore: storeW,
    __availCount: availCount,
    availableCount: { subscribe: availCount.subscribe },
    holdSeat: vi.fn().mockResolvedValue({ ok: true }),
    releaseSeat: vi.fn().mockResolvedValue(undefined),
    bookSeat: vi.fn().mockResolvedValue({ ok: true }),
    ownHoldFor: vi.fn().mockReturnValue(null),
    _resetSeatMapForTesting: vi.fn()
  };
});

import Modal from '../src/ui/components/Modal.svelte';
import Drawer from '../src/ui/components/Drawer.svelte';
import PageHeader from '../src/ui/components/PageHeader.svelte';
import HoldCountdown from '../src/ui/components/HoldCountdown.svelte';
import BookingPanel from '../src/ui/components/BookingPanel.svelte';

afterEach(() => {
  document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader
// ─────────────────────────────────────────────────────────────────────────────

describe('PageHeader', () => {
  it('renders the title', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new PageHeader({ target: host, props: { title: 'My Title' } });
    await tick();
    expect(host.innerHTML).toContain('My Title');
  });

  it('renders the subtitle when provided', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new PageHeader({ target: host, props: { title: 'T', subtitle: 'Sub text' } });
    await tick();
    expect(host.innerHTML).toContain('Sub text');
  });

  it('does not render a subtitle paragraph when subtitle is empty', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new PageHeader({ target: host, props: { title: 'T' } });
    await tick();
    expect(host.querySelector('p')).toBeNull();
  });

  it('renders inside a header element', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new PageHeader({ target: host, props: { title: 'T' } });
    await tick();
    expect(host.querySelector('header')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

describe('Modal', () => {
  it('renders nothing when open is false', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Modal({ target: host, props: { open: false, title: 'My Modal', onClose: vi.fn() } });
    await tick();
    expect(host.querySelector('.modal-backdrop')).toBeNull();
  });

  it('renders the modal when open is true', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Modal({ target: host, props: { open: true, title: 'My Modal', onClose: vi.fn() } });
    await tick();
    expect(host.querySelector('.modal-backdrop')).not.toBeNull();
    expect(host.innerHTML).toContain('My Modal');
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Modal({ target: host, props: { open: true, title: 'Test', onClose } });
    await tick();
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    btn?.click();
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Modal({ target: host, props: { open: true, title: 'Test', onClose } });
    await tick();
    const backdrop = host.querySelector<HTMLElement>('.modal-backdrop');
    backdrop?.click();
    await tick();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the modal title in the header', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Modal({ target: host, props: { open: true, title: 'Unique Title', onClose: vi.fn() } });
    await tick();
    const header = host.querySelector('header');
    expect(header?.innerHTML).toContain('Unique Title');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Drawer
// ─────────────────────────────────────────────────────────────────────────────

describe('Drawer', () => {
  it('renders nothing when closed', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Drawer({ target: host, props: { open: false, title: 'Drawer', onClose: vi.fn() } });
    await tick();
    expect(host.querySelector('aside.drawer')).toBeNull();
  });

  it('renders the drawer when open', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Drawer({ target: host, props: { open: true, title: 'My Drawer', onClose: vi.fn() } });
    await tick();
    expect(host.querySelector('aside.drawer')).not.toBeNull();
    expect(host.innerHTML).toContain('My Drawer');
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Drawer({ target: host, props: { open: true, title: 'D', onClose } });
    await tick();
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    btn?.click();
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    new Drawer({ target: host, props: { open: true, title: 'D', onClose } });
    await tick();
    const backdrop = host.querySelector<HTMLElement>('.drawer-backdrop');
    backdrop?.click();
    await tick();
    expect(onClose).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HoldCountdown
// ─────────────────────────────────────────────────────────────────────────────

describe('HoldCountdown', () => {
  it('renders nothing when no hold exists for the seat', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new HoldCountdown({ target: host, props: { seatId: 's1' } });
    await tick();
    expect(host.querySelector('.countdown')).toBeNull();
  });

  it('renders the countdown when there is an active hold', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __seatStore: { set: (v: unknown) => void }
    };
    const expiresAt = Date.now() + 5 * 60 * 1000;
    mod.__seatStore.set({
      tripId: 't1',
      seats: [],
      holds: new Map([['s1', { seatId: 's1', ownerTabId: 'test-tab', expiresAt }]]),
      now: Date.now()
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    new HoldCountdown({ target: host, props: { seatId: 's1' } });
    await tick();
    expect(host.querySelector('.countdown')).not.toBeNull();
  });

  it('shows warn class when hold is about to expire', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __seatStore: { set: (v: unknown) => void }
    };
    const now = Date.now();
    const expiresAt = now + 30_000; // 30 seconds left → < 60s → warn
    mod.__seatStore.set({
      tripId: 't1',
      seats: [],
      holds: new Map([['s2', { seatId: 's2', ownerTabId: 'test-tab', expiresAt }]]),
      now
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    new HoldCountdown({ target: host, props: { seatId: 's2' } });
    await tick();
    const el = host.querySelector('.countdown');
    expect(el?.classList.contains('warn')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BookingPanel
// ─────────────────────────────────────────────────────────────────────────────

describe('BookingPanel', () => {
  it('renders "Select a seat" message when no seat selected', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: null, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('Select a seat');
  });

  it('renders the selected seat label', async () => {
    const seat = { id: 's1', row: 1, column: 1, label: '1A', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('1A');
  });

  it('shows Hold seat button when no active hold', async () => {
    const mod = await import('@application/services/seatMapService') as { ownHoldFor: ReturnType<typeof vi.fn> };
    mod.ownHoldFor.mockReturnValue(null); // set before mount so reactive var evaluates correctly
    const seat = { id: 's1', row: 1, column: 1, label: '1A', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('Hold seat');
  });

  it('shows Release and Confirm buttons when hold is active', async () => {
    const mod = await import('@application/services/seatMapService') as { ownHoldFor: ReturnType<typeof vi.fn> };
    // Set before mount so hasOwnHold evaluates true on first render
    mod.ownHoldFor.mockReturnValue({ seatId: 's1', ownerTabId: 'test-tab', expiresAt: Date.now() + 9 * 60 * 1000 });
    const seat = { id: 's1', row: 1, column: 1, label: '1A', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('Release hold');
    expect(host.innerHTML).toContain('Confirm booking');
  });

  it('shows available count from store', async () => {
    const mod = await import('@application/services/seatMapService') as {
      __availCount: { set: (v: number) => void }
    };
    mod.__availCount.set(12);

    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: null, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('12');
  });

  it('shows the seat kind when a seat is selected', async () => {
    const seat = { id: 's1', row: 1, column: 1, label: '1A', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('standard');
  });

  it('shows success message after clicking Hold seat', async () => {
    const mod = await import('@application/services/seatMapService') as {
      ownHoldFor: ReturnType<typeof vi.fn>;
      holdSeat: ReturnType<typeof vi.fn>;
    };
    mod.ownHoldFor.mockReturnValue(null);
    mod.holdSeat.mockResolvedValue({ ok: true });

    const seat = { id: 's2', row: 1, column: 1, label: '2A', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();

    const holdBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Hold seat'));
    holdBtn?.click();
    await tick();
    await tick();

    expect(host.innerHTML).toContain('held');
  });

  it('shows message after clicking Release hold', async () => {
    const mod = await import('@application/services/seatMapService') as {
      ownHoldFor: ReturnType<typeof vi.fn>;
      releaseSeat: ReturnType<typeof vi.fn>;
    };
    mod.ownHoldFor.mockReturnValue({ seatId: 's3', ownerTabId: 'test-tab', expiresAt: Date.now() + 600_000 });
    mod.releaseSeat.mockResolvedValue(undefined);

    const seat = { id: 's3', row: 1, column: 2, label: '3A', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();

    const releaseBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Release'));
    releaseBtn?.click();
    await tick();
    await tick();

    expect(host.innerHTML).toContain('released');
  });

  it('shows message after clicking Confirm booking', async () => {
    const mod = await import('@application/services/seatMapService') as {
      ownHoldFor: ReturnType<typeof vi.fn>;
      bookSeat: ReturnType<typeof vi.fn>;
    };
    mod.ownHoldFor.mockReturnValue({ seatId: 's4', ownerTabId: 'test-tab', expiresAt: Date.now() + 600_000 });
    mod.bookSeat.mockResolvedValue({ ok: true });

    const seat = { id: 's4', row: 1, column: 3, label: '4A', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();

    const bookBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Confirm'));
    bookBtn?.click();
    await tick();
    await tick();

    expect(host.innerHTML).toContain('booked');
  });

  it('shows error message when Hold seat fails', async () => {
    const mod = await import('@application/services/seatMapService') as {
      ownHoldFor: ReturnType<typeof vi.fn>;
      holdSeat: ReturnType<typeof vi.fn>;
    };
    mod.ownHoldFor.mockReturnValue(null);
    mod.holdSeat.mockResolvedValue({ ok: false, reason: 'Seat already held' });

    const seat = { id: 'sf1', row: 2, column: 1, label: 'F1', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();

    const holdBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Hold seat'));
    holdBtn?.click();
    await tick();
    await tick();

    expect(host.innerHTML).toContain('Seat already held');
  });

  it('covers hasOwnHold transition from false to true via $set', async () => {
    const mod = await import('@application/services/seatMapService') as {
      ownHoldFor: ReturnType<typeof vi.fn>;
    };
    mod.ownHoldFor.mockReturnValue(null);
    const seat = { id: 'ht1', row: 4, column: 1, label: 'H1', kind: 'standard' as const, status: 'available' as const };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const component = new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('Hold seat');

    // Change mock so next reactive eval returns a hold, then re-trigger via $set
    mod.ownHoldFor.mockReturnValue({ seatId: 'ht1', ownerTabId: 'test-tab', expiresAt: Date.now() + 600_000 });
    (component as unknown as { $set: (p: object) => void }).$set({ selectedSeat: null });
    await tick();
    (component as unknown as { $set: (p: object) => void }).$set({ selectedSeat: seat });
    await tick();
    expect(host.innerHTML).toContain('Release hold');
  });

  it('covers selectedSeat $set transition (null → seat → null)', async () => {
    const mod = await import('@application/services/seatMapService') as { ownHoldFor: ReturnType<typeof vi.fn> };
    mod.ownHoldFor.mockReturnValue(null);
    const seat = { id: 'tr1', row: 3, column: 1, label: 'T1', kind: 'standard' as const, status: 'available' as const };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const component = new BookingPanel({ target: host, props: { selectedSeat: null, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('Select a seat');

    (component as unknown as { $set: (p: object) => void }).$set({ selectedSeat: seat });
    await tick();
    expect(host.innerHTML).toContain('T1');

    (component as unknown as { $set: (p: object) => void }).$set({ selectedSeat: null });
    await tick();
    expect(host.innerHTML).toContain('Select a seat');
  });

  it('shows error message when booking fails', async () => {
    const mod = await import('@application/services/seatMapService') as {
      ownHoldFor: ReturnType<typeof vi.fn>;
      bookSeat: ReturnType<typeof vi.fn>;
    };
    mod.ownHoldFor.mockReturnValue({ seatId: 'sf2', ownerTabId: 'test-tab', expiresAt: Date.now() + 600_000 });
    mod.bookSeat.mockResolvedValue({ ok: false, reason: 'Seat no longer available' });

    const seat = { id: 'sf2', row: 2, column: 2, label: 'F2', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();

    const bookBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Confirm'));
    bookBtn?.click();
    await tick();
    await tick();

    expect(host.innerHTML).toContain('Seat no longer available');
  });

  it('covers truthy→truthy selectedSeat update path (seatA → seatB)', async () => {
    const mod = await import('@application/services/seatMapService') as { ownHoldFor: ReturnType<typeof vi.fn> };
    mod.ownHoldFor.mockReturnValue(null);
    const seatA = { id: 'ta1', row: 5, col: 1, label: 'A1', kind: 'standard' as const, status: 'available' as const };
    const seatB = { id: 'ta2', row: 5, col: 2, label: 'B2', kind: 'premium' as const, status: 'available' as const };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const comp = new BookingPanel({ target: host, props: { selectedSeat: seatA, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('A1');

    (comp as unknown as { $set: (p: object) => void }).$set({ selectedSeat: seatB });
    await tick();
    expect(host.innerHTML).toContain('B2');
    expect(host.innerHTML).toContain('premium');
  });

  it('covers message truthy→truthy update path (two sequential notifications)', async () => {
    const mod = await import('@application/services/seatMapService') as {
      ownHoldFor: ReturnType<typeof vi.fn>;
      holdSeat: ReturnType<typeof vi.fn>;
      releaseSeat: ReturnType<typeof vi.fn>;
    };
    mod.ownHoldFor.mockReturnValue(null);
    mod.holdSeat.mockResolvedValue({ ok: true });
    mod.releaseSeat.mockResolvedValue(undefined);

    const seat = { id: 'mm1', row: 6, col: 1, label: 'M1', kind: 'standard' as const, status: 'available' as const };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const comp = new BookingPanel({ target: host, props: { selectedSeat: seat, onCleared: vi.fn() } });
    await tick();

    // First notification: hold success
    const holdBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Hold seat'));
    holdBtn?.click();
    await tick();
    await tick();
    expect(host.innerHTML).toContain('held');

    // Second notification while message is already set: update existing message block
    mod.ownHoldFor.mockReturnValue({ seatId: 'mm1', ownerTabId: 'test-tab', expiresAt: Date.now() + 600_000 });
    (comp as unknown as { $set: (p: object) => void }).$set({ selectedSeat: null });
    await tick();
    (comp as unknown as { $set: (p: object) => void }).$set({ selectedSeat: seat });
    await tick();
    const releaseBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Release'));
    releaseBtn?.click();
    await tick();
    await tick();
    expect(host.innerHTML).toContain('released');
  });

  it('covers null→null no-op: selectedSeat stays null after $set(null)', async () => {
    const mod = await import('@application/services/seatMapService') as { ownHoldFor: ReturnType<typeof vi.fn> };
    mod.ownHoldFor.mockReturnValue(null);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const comp = new BookingPanel({ target: host, props: { selectedSeat: null, onCleared: vi.fn() } });
    await tick();
    expect(host.innerHTML).toContain('Select a seat');

    (comp as unknown as { $set: (p: object) => void }).$set({ selectedSeat: null });
    await tick();
    expect(host.innerHTML).toContain('Select a seat');
  });
});
