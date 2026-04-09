import { describe, it, expect } from 'vitest';
import {
  isHoldActive, isSelectable, nonSelectableReason, countAvailable
} from '@domain/trips/seatRules';
import type { Seat, SeatHold } from '@domain/trips/seat';

const tabA = 'tab-A';
const tabB = 'tab-B';
const NOW = 1_700_000_000_000;

function seat(id: string, kind: Seat['kind'] = 'standard', status: Seat['status'] = 'available'): Seat {
  return { id, row: 1, column: 0, label: id, kind, status };
}

describe('seatRules', () => {
  it('isHoldActive returns false for missing or expired holds', () => {
    expect(isHoldActive(undefined, NOW)).toBe(false);
    expect(isHoldActive({ seatId: '1A', ownerTabId: tabA, expiresAt: NOW - 1 }, NOW)).toBe(false);
    expect(isHoldActive({ seatId: '1A', ownerTabId: tabA, expiresAt: NOW + 1 }, NOW)).toBe(true);
  });

  it('ADA seats are never selectable', () => {
    const s = seat('4A', 'ada');
    expect(isSelectable(s, undefined, NOW, tabA)).toBe(false);
    expect(nonSelectableReason(s, undefined, NOW, tabA)).toMatch(/ADA/);
  });

  it('crew-only seats are never selectable', () => {
    const s = seat('1A', 'crew');
    expect(isSelectable(s, undefined, NOW, tabA)).toBe(false);
    expect(nonSelectableReason(s, undefined, NOW, tabA)).toMatch(/Crew/);
  });

  it('booked seats are not selectable', () => {
    const s = seat('2B', 'standard', 'booked');
    expect(isSelectable(s, undefined, NOW, tabA)).toBe(false);
    expect(nonSelectableReason(s, undefined, NOW, tabA)).toMatch(/booked/i);
  });

  it('seats held by another tab are not selectable for current tab', () => {
    const s = seat('3C');
    const hold: SeatHold = { seatId: '3C', ownerTabId: tabB, expiresAt: NOW + 60_000 };
    expect(isSelectable(s, hold, NOW, tabA)).toBe(false);
    expect(nonSelectableReason(s, hold, NOW, tabA)).toMatch(/another session/);
  });

  it('seats held by current tab are still selectable', () => {
    const s = seat('3C');
    const hold: SeatHold = { seatId: '3C', ownerTabId: tabA, expiresAt: NOW + 60_000 };
    expect(isSelectable(s, hold, NOW, tabA)).toBe(true);
    expect(nonSelectableReason(s, hold, NOW, tabA)).toBeNull();
  });

  it('expired holds do not block selection', () => {
    const s = seat('3D');
    const hold: SeatHold = { seatId: '3D', ownerTabId: tabB, expiresAt: NOW - 10 };
    expect(isSelectable(s, hold, NOW, tabA)).toBe(true);
  });

  it('countAvailable counts only selectable seats', () => {
    const seats: Seat[] = [
      seat('1A', 'standard'),
      seat('1B', 'ada'),
      seat('1C', 'crew'),
      seat('1D', 'standard', 'booked'),
      seat('2A', 'standard')
    ];
    const holds = new Map<string, SeatHold>([
      ['2A', { seatId: '2A', ownerTabId: tabB, expiresAt: NOW + 1000 }]
    ]);
    expect(countAvailable(seats, holds, NOW, tabA)).toBe(1); // only 1A
  });
});
