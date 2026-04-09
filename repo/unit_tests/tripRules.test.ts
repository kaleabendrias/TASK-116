import { describe, it, expect } from 'vitest';
import { validateNewTrip, validatePatch } from '@domain/trips/tripRules';
import type { Trip } from '@domain/trips/trip';

const NOW = Date.now();

function valid() {
  return { name: 'Trip', origin: 'A', destination: 'B', departureAt: NOW + 1000, rows: 8, cols: 4 };
}

function existing(): Trip {
  return { id: 't1', createdBy: 'u1', createdAt: NOW, updatedAt: NOW, ...valid() };
}

describe('validateNewTrip', () => {
  it('accepts a sane trip', () => {
    expect(validateNewTrip(valid()).ok).toBe(true);
  });
  it('requires non-empty name, origin, destination', () => {
    expect(validateNewTrip({ ...valid(), name: '   ' }).ok).toBe(false);
    expect(validateNewTrip({ ...valid(), origin: '' }).ok).toBe(false);
    expect(validateNewTrip({ ...valid(), destination: '' }).ok).toBe(false);
  });
  it('rejects same origin/destination', () => {
    expect(validateNewTrip({ ...valid(), origin: 'X', destination: 'X' }).ok).toBe(false);
  });
  it('rejects bad departure timestamps', () => {
    expect(validateNewTrip({ ...valid(), departureAt: 0 }).ok).toBe(false);
    expect(validateNewTrip({ ...valid(), departureAt: NaN as number }).ok).toBe(false);
  });
  it('rejects out-of-range rows/cols', () => {
    expect(validateNewTrip({ ...valid(), rows: 0 }).ok).toBe(false);
    expect(validateNewTrip({ ...valid(), rows: 99 }).ok).toBe(false);
    expect(validateNewTrip({ ...valid(), cols: 1 }).ok).toBe(false);
    expect(validateNewTrip({ ...valid(), cols: 12 }).ok).toBe(false);
    expect(validateNewTrip({ ...valid(), rows: 1.5 }).ok).toBe(false);
  });
});

describe('validatePatch', () => {
  it('merges partials and revalidates', () => {
    const r = validatePatch(existing(), { name: 'Renamed' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged.name).toBe('Renamed');
  });
  it('rejects merged invalid state', () => {
    const r = validatePatch(existing(), { rows: 0 });
    expect(r.ok).toBe(false);
  });
});
