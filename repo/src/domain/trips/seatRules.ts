import type { Seat, SeatHold } from './seat';

export function isHoldActive(hold: SeatHold | undefined, now: number): boolean {
  return !!hold && hold.expiresAt > now;
}

export function isSelectable(seat: Seat, hold: SeatHold | undefined, now: number, ownerTabId: string): boolean {
  if (seat.kind === 'ada' || seat.kind === 'crew') return false;
  if (seat.status === 'booked') return false;
  if (isHoldActive(hold, now) && hold!.ownerTabId !== ownerTabId) return false;
  return true;
}

export function nonSelectableReason(seat: Seat, hold: SeatHold | undefined, now: number, ownerTabId: string): string | null {
  if (seat.kind === 'ada') return 'Blocked — ADA reserved';
  if (seat.kind === 'crew') return 'Crew only';
  if (seat.status === 'booked') return 'Already booked';
  if (isHoldActive(hold, now) && hold!.ownerTabId !== ownerTabId) return 'Held by another session';
  return null;
}

export function countAvailable(seats: Seat[], holds: Map<string, SeatHold>, now: number, ownerTabId: string): number {
  return seats.filter((s) => isSelectable(s, holds.get(s.id), now, ownerTabId)).length;
}
