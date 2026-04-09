import { describe, it, expect } from 'vitest';
import { buildSnapshot, exportToBlob, importFromFile, downloadSnapshot } from '@application/services/exportService';
import { createQuestion } from '@application/services/questionService';
import { register, login, logout, bootstrapFirstAdmin } from '@application/services/authService';
import { idbAll, idbClear } from '@persistence/indexedDb';
import type { NewQuestionInput, Question } from '@domain/questions/question';

function valid(): NewQuestionInput {
  return {
    type: 'single_choice', prompt: '?',
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    correctChoiceIds: ['a'], correctNumeric: null, numericTolerance: 0,
    acceptedAnswers: [], caseSensitive: false,
    difficulty: 1, maxScore: 10, explanation: '', tags: [],
    knowledgePoints: [], applicableDepartments: []
  };
}

async function asAdmin(name = 'admin'): Promise<void> {
  await bootstrapFirstAdmin(name, 'longenough');
  await login(name, 'longenough');
}

describe('exportService fingerprint round-trip', () => {
  it('rejects non-admin export and import', async () => {
    await register('disp', 'longenough', 'dispatcher');
    await login('disp', 'longenough');
    await expect(buildSnapshot()).rejects.toThrow(/not authorized/);
    const file = new File(['{}'], 'snap.json');
    await expect(importFromFile(file)).rejects.toThrow(/not authorized/);
  }, 30000);

  it('builds an envelope with a stable SHA-256 fingerprint', async () => {
    await asAdmin();
    await createQuestion(valid());
    const env = await buildSnapshot();
    expect(env.schema).toBe('task09.snapshot');
    expect(env.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(env.payload.stores.questions.length).toBeGreaterThan(0);
  }, 30000);

  it('imports a valid snapshot back into IndexedDB', async () => {
    await asAdmin();
    await createQuestion(valid());
    const blob = await exportToBlob();
    const file = new File([await blob.text()], 'snap.json', { type: 'application/json' });

    await idbClear('questions');
    expect((await idbAll<Question>('questions')).length).toBe(0);

    const r = await importFromFile(file);
    expect(r.ok).toBe(true);
    expect(r.imported).toBeGreaterThan(0);
    expect(r.rejected).toBe(0);
    expect((await idbAll<Question>('questions')).length).toBeGreaterThan(0);
  }, 30000);

  it('rejects invalid JSON', async () => {
    await asAdmin();
    const bad = new File(['{not json'], 'b.json');
    const r = await importFromFile(bad);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Invalid JSON/);
  }, 30000);

  it('rejects envelopes with the wrong schema', async () => {
    await asAdmin();
    const bad = new File([JSON.stringify({ schema: 'wrong' })], 'b.json');
    const r = await importFromFile(bad);
    expect(r.ok).toBe(false);
  }, 30000);

  it('detects fingerprint tampering and refuses import', async () => {
    await asAdmin();
    await createQuestion(valid());
    const env = await buildSnapshot();
    (env.payload.stores.questions[0] as Question).prompt = 'tampered!';
    const tamperedFile = new File([JSON.stringify(env)], 'tampered.json');
    const r = await importFromFile(tamperedFile);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/tampered|Fingerprint/i);
  }, 30000);

  it('skips unknown stores and reports the issue', async () => {
    await asAdmin();
    const env = await buildSnapshot();
    (env.payload as { stores: Record<string, unknown[]> }).stores.bogus = [{ id: 'x' }];
    const { canonicalize } = await import('@domain/export/snapshot');
    const { sha256Hex } = await import('@shared/crypto/sha256');
    env.fingerprint = await sha256Hex(canonicalize(env.payload));
    const f = new File([JSON.stringify(env)], 'snap.json');
    const r = await importFromFile(f);
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes('bogus'))).toBe(true);
  }, 30000);

  it('per-store schema validation rejects malformed records but imports valid ones', async () => {
    await asAdmin();
    const env = await buildSnapshot();
    (env.payload.stores as Record<string, unknown[]>).questions = [
      // missing prompt + invalid type
      { id: 'qBad', type: 'unknown', choices: [], correctChoiceIds: [], tags: [], knowledgePoints: [], applicableDepartments: [], difficulty: 1, maxScore: 10, status: 'active' },
      // missing required id
      { type: 'short_answer', prompt: 'no id' }
    ];
    const { canonicalize } = await import('@domain/export/snapshot');
    const { sha256Hex } = await import('@shared/crypto/sha256');
    env.fingerprint = await sha256Hex(canonicalize(env.payload));
    const f = new File([JSON.stringify(env)], 'snap.json');
    const r = await importFromFile(f);
    expect(r.ok).toBe(true);
    expect(r.rejected).toBeGreaterThanOrEqual(2);
    expect(r.errors.some((e) => e.includes('questions'))).toBe(true);
  }, 30000);

  it('per-store schema validation rejects malformed config records (sampleType)', async () => {
    await asAdmin();
    const env = await buildSnapshot();
    (env.payload.stores as Record<string, unknown[]>).catalogs = [
      {
        id: 'cfgrec:bad',
        record: {
          id: 'bad', name: 'X', device: 'Y', department: 'Z',
          project: 'P', sampleQueue: 'Q',
          sampleType: 'unicorn', // invalid
          tags: [], effectiveFrom: '01/01/2026', effectiveTo: '12/31/2026',
          priceUsd: 10, valid: true
        }
      }
    ];
    const { canonicalize } = await import('@domain/export/snapshot');
    const { sha256Hex } = await import('@shared/crypto/sha256');
    env.fingerprint = await sha256Hex(canonicalize(env.payload));
    const f = new File([JSON.stringify(env)], 'snap.json');
    const r = await importFromFile(f);
    expect(r.rejected).toBeGreaterThan(0);
    expect(r.errors.some((e) => e.includes('sampleType'))).toBe(true);
  }, 30000);

  it('snapshot includes seats / holds / bookings stores', async () => {
    await asAdmin();
    const env = await buildSnapshot();
    expect(env.payload.stores.seats).toBeDefined();
    expect(env.payload.stores.holds).toBeDefined();
    expect(env.payload.stores.bookings).toBeDefined();
  }, 30000);

  it('rejects malformed seat / hold / booking records on import', async () => {
    await asAdmin();
    const env = await buildSnapshot();
    (env.payload.stores as Record<string, unknown[]>).seats = [
      { id: 'broken', tripId: 't', seatId: 's' } // missing label/row/column/kind
    ];
    (env.payload.stores as Record<string, unknown[]>).holds = [
      { id: 'h1' } // missing required fields
    ];
    (env.payload.stores as Record<string, unknown[]>).bookings = [
      { id: 'b1', tripId: 't' } // missing seatId / bookedAt
    ];
    const { canonicalize } = await import('@domain/export/snapshot');
    const { sha256Hex } = await import('@shared/crypto/sha256');
    env.fingerprint = await sha256Hex(canonicalize(env.payload));
    const f = new File([JSON.stringify(env)], 'snap.json');
    const r = await importFromFile(f);
    expect(r.rejected).toBeGreaterThanOrEqual(3);
    expect(r.errors.some((e) => e.includes('seats'))).toBe(true);
    expect(r.errors.some((e) => e.includes('holds'))).toBe(true);
    expect(r.errors.some((e) => e.includes('bookings'))).toBe(true);
  }, 30000);

  it('downloadSnapshot wires Blob URL plumbing without throwing', async () => {
    await asAdmin();
    const blob = await exportToBlob();
    const originalCreate = (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: (u: string) => void }).revokeObjectURL;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:test';
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    type ClickStub = { click: () => void; href?: string; download?: string };
    const fakeAnchor: ClickStub = { click: () => {} };
    const docStub = { createElement: () => fakeAnchor as unknown as HTMLAnchorElement };
    // @ts-expect-error stub
    globalThis.document = docStub;
    expect(() => downloadSnapshot(blob, 'name.json')).not.toThrow();
    if (originalCreate) (URL as unknown as { createObjectURL: typeof originalCreate }).createObjectURL = originalCreate;
    if (originalRevoke) (URL as unknown as { revokeObjectURL: typeof originalRevoke }).revokeObjectURL = originalRevoke;
    // @ts-expect-error cleanup
    delete globalThis.document;
    logout();
  }, 30000);
});
