export interface Trip {
  id: string;
  name: string;
  origin: string;
  destination: string;
  /** Departure time as epoch milliseconds. */
  departureAt: number;
  rows: number;
  cols: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type NewTripInput = Omit<Trip, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;
export type TripPatch = Partial<Omit<Trip, 'id' | 'createdBy' | 'createdAt'>>;

export const MIN_ROWS = 1;
export const MAX_ROWS = 30;
export const MIN_COLS = 2;
export const MAX_COLS = 8;
