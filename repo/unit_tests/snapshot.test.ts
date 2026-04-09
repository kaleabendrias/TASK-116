import { describe, it, expect } from 'vitest';
import { canonicalize, validateEnvelope } from '@domain/export/snapshot';

describe('canonicalize', () => {
  it('produces stable JSON regardless of insertion order', () => {
    const a = { z: 1, a: { y: 2, x: [3, 2, 1] } };
    const b = { a: { x: [3, 2, 1], y: 2 }, z: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('handles primitives, null, and arrays', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(['b','a'])).toBe('["b","a"]');
  });

  it('throws on cycles', () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => canonicalize(o)).toThrow();
  });
});

describe('validateEnvelope', () => {
  const ok = { schema: 'task09.snapshot', version: 1, exportedAt: 1, payload: {}, fingerprint: 'x' };
  it('accepts a well-formed envelope', () => {
    expect(validateEnvelope(ok).ok).toBe(true);
  });
  it('rejects non-objects and missing fields', () => {
    expect(validateEnvelope(null).ok).toBe(false);
    expect(validateEnvelope({}).ok).toBe(false);
    expect(validateEnvelope({ ...ok, schema: 'wrong' }).ok).toBe(false);
    expect(validateEnvelope({ ...ok, version: 2 }).ok).toBe(false);
    const { exportedAt: _ea, ...noTime } = ok; void _ea;
    expect(validateEnvelope(noTime).ok).toBe(false);
    const { fingerprint: _fp, ...noFp } = ok; void _fp;
    expect(validateEnvelope(noFp).ok).toBe(false);
    const { payload: _pl, ...noPayload } = ok; void _pl;
    expect(validateEnvelope(noPayload).ok).toBe(false);
  });
});
