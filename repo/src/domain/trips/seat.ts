export type SeatKind = 'standard' | 'ada' | 'crew';
export type SeatStatus = 'available' | 'booked' | 'held';

export interface Seat {
  id: string;
  row: number;
  column: number;
  label: string;
  kind: SeatKind;
  status: SeatStatus;
}

export interface SeatHold {
  seatId: string;
  ownerTabId: string;
  expiresAt: number; // epoch ms
}

export const HOLD_DURATION_MS = 10 * 60 * 1000;
