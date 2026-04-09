import type { ConfigRecord, ConfigRecordPatch } from './configRecord';

const MMDDYYYY = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;

export function isMmDdYyyy(s: string): boolean {
  return MMDDYYYY.test(s);
}

export function parseMmDdYyyy(s: string): Date | null {
  if (!isMmDdYyyy(s)) return null;
  const [m, d, y] = s.split('/').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function isExpired(record: ConfigRecord, now: Date = new Date()): boolean {
  const end = parseMmDdYyyy(record.effectiveTo);
  if (!end) return false;
  return end.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export const ALLOWED_SAMPLE_TYPES = ['blood', 'tissue', 'serum', 'saliva', 'plasma', 'urine'] as const;

/**
 * Full-record validator. Use this against the merged result of (existing
 * record + patch) to enforce cross-field invariants such as the date range,
 * which a patch-only check would silently bypass on single-field edits.
 */
export function validateRecord(record: ConfigRecord): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!record.name || !record.name.trim()) errors.push('Name is required');
  if (!record.sampleType || !record.sampleType.trim()) errors.push('Sample type is required');
  else if (!(ALLOWED_SAMPLE_TYPES as readonly string[]).includes(record.sampleType)) {
    errors.push(`Sample type must be one of ${(ALLOWED_SAMPLE_TYPES as readonly string[]).join(', ')}`);
  }
  if (!Number.isFinite(record.priceUsd) || record.priceUsd < 0) {
    errors.push('Price must be a non-negative number');
  }
  if (!isMmDdYyyy(record.effectiveFrom)) errors.push('Effective From must be MM/DD/YYYY');
  if (!isMmDdYyyy(record.effectiveTo)) errors.push('Effective To must be MM/DD/YYYY');
  if (isMmDdYyyy(record.effectiveFrom) && isMmDdYyyy(record.effectiveTo)) {
    const a = parseMmDdYyyy(record.effectiveFrom);
    const b = parseMmDdYyyy(record.effectiveTo);
    if (a && b && a.getTime() > b.getTime()) {
      errors.push('Effective From must be on or before Effective To');
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validatePatch(patch: ConfigRecordPatch): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (patch.name !== undefined && !patch.name.trim()) errors.push('Name is required');
  if (patch.sampleType !== undefined) {
    if (!patch.sampleType.trim()) errors.push('Sample type is required');
    else if (!(ALLOWED_SAMPLE_TYPES as readonly string[]).includes(patch.sampleType)) {
      errors.push(`Sample type must be one of ${(ALLOWED_SAMPLE_TYPES as readonly string[]).join(', ')}`);
    }
  }
  if (patch.priceUsd !== undefined) {
    if (!Number.isFinite(patch.priceUsd) || patch.priceUsd < 0) errors.push('Price must be a non-negative number');
  }
  if (patch.effectiveFrom !== undefined && !isMmDdYyyy(patch.effectiveFrom)) {
    errors.push('Effective From must be MM/DD/YYYY');
  }
  if (patch.effectiveTo !== undefined && !isMmDdYyyy(patch.effectiveTo)) {
    errors.push('Effective To must be MM/DD/YYYY');
  }
  if (patch.effectiveFrom && patch.effectiveTo) {
    const a = parseMmDdYyyy(patch.effectiveFrom);
    const b = parseMmDdYyyy(patch.effectiveTo);
    if (a && b && a.getTime() > b.getTime()) errors.push('Effective From must be on or before Effective To');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function filterVisible(records: ConfigRecord[], showExpired: boolean, now: Date = new Date()): ConfigRecord[] {
  if (showExpired) return records;
  return records.filter((r) => !isExpired(r, now));
}
