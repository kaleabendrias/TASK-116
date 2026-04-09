import type { NewTripInput, TripPatch, Trip } from './trip';
import { MIN_ROWS, MAX_ROWS, MIN_COLS, MAX_COLS } from './trip';

export function validateNewTrip(input: NewTripInput): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!input.name || !input.name.trim()) errors.push('Name is required');
  if (!input.origin || !input.origin.trim()) errors.push('Origin is required');
  if (!input.destination || !input.destination.trim()) errors.push('Destination is required');
  if (!Number.isFinite(input.departureAt) || input.departureAt <= 0) errors.push('Departure time is required');
  if (input.origin && input.destination && input.origin.trim() === input.destination.trim()) {
    errors.push('Origin and destination must differ');
  }
  if (!Number.isInteger(input.rows) || input.rows < MIN_ROWS || input.rows > MAX_ROWS) {
    errors.push(`Rows must be an integer between ${MIN_ROWS} and ${MAX_ROWS}`);
  }
  if (!Number.isInteger(input.cols) || input.cols < MIN_COLS || input.cols > MAX_COLS) {
    errors.push(`Cols must be an integer between ${MIN_COLS} and ${MAX_COLS}`);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validatePatch(existing: Trip, patch: TripPatch): { ok: true; merged: NewTripInput } | { ok: false; errors: string[] } {
  const merged: NewTripInput = {
    name: patch.name ?? existing.name,
    origin: patch.origin ?? existing.origin,
    destination: patch.destination ?? existing.destination,
    departureAt: patch.departureAt ?? existing.departureAt,
    rows: patch.rows ?? existing.rows,
    cols: patch.cols ?? existing.cols
  };
  const v = validateNewTrip(merged);
  if (!v.ok) return v;
  return { ok: true, merged };
}
