export interface SnapshotEnvelope<T = unknown> {
  schema: 'task09.snapshot';
  version: 1;
  exportedAt: number;
  payload: T;
  fingerprint: string; // sha256 hex of canonical(payload)
}

export function canonicalize(value: unknown): string {
  // Stable JSON: object keys sorted recursively.
  const seen = new WeakSet<object>();
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) throw new Error('Cycle detected during canonicalization');
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(sort);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sort(obj[k]);
    return out;
  };
  return JSON.stringify(sort(value));
}

export function validateEnvelope(value: unknown): { ok: true; envelope: SnapshotEnvelope } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['Not an object'] };
  const v = value as Record<string, unknown>;
  if (v.schema !== 'task09.snapshot') errors.push('Wrong schema marker');
  if (v.version !== 1) errors.push('Unsupported version');
  if (typeof v.exportedAt !== 'number') errors.push('Missing exportedAt');
  if (typeof v.fingerprint !== 'string') errors.push('Missing fingerprint');
  if (!('payload' in v)) errors.push('Missing payload');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, envelope: value as SnapshotEnvelope };
}
