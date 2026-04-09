import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { refreshRecords, visibleRecords, showExpired, updateRecord, getRecord } from '@application/services/configRecordService';
import { configRecordRepository } from '@persistence/configRecordRepository';
import { register, login, logout, bootstrapFirstAdmin } from '@application/services/authService';

async function asAdmin(name = 'admin'): Promise<void> {
  await bootstrapFirstAdmin(name, 'longenough');
  await login(name, 'longenough');
}

describe('configRecordService', () => {
  it('refreshRecords requires an administrator session', async () => {
    await expect(refreshRecords()).rejects.toThrow(/Authentication|not authorized/);
    await register('disp', 'longenough', 'dispatcher');
    await login('disp', 'longenough');
    await expect(refreshRecords()).rejects.toThrow(/not authorized/);
  }, 30000);

  it('seeds and lists records, hiding expired by default (admin only)', async () => {
    await asAdmin();
    await refreshRecords();
    const visible = get(visibleRecords);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.some((r) => r.name === 'Legacy Centrifuge')).toBe(false);

    showExpired.set(true);
    expect(get(visibleRecords).some((r) => r.name === 'Legacy Centrifuge')).toBe(true);
    showExpired.toggle();
  }, 30000);

  it('seeded records carry sampleType', async () => {
    await asAdmin();
    await refreshRecords();
    showExpired.set(true);
    const all = get(visibleRecords);
    expect(all.every((r) => typeof r.sampleType === 'string' && r.sampleType.length > 0)).toBe(true);
    expect(all.map((r) => r.sampleType)).toEqual(expect.arrayContaining(['blood', 'serum', 'plasma']));
    showExpired.set(false);
  }, 30000);

  it('updates require administrator role', async () => {
    await asAdmin();
    await refreshRecords();
    const sample = get(visibleRecords)[0];
    logout();
    await expect(updateRecord(sample.id, { name: 'X' })).rejects.toThrow(/Authentication|not authorized/);
    await register('disp', 'longenough', 'dispatcher');
    await login('disp', 'longenough');
    await expect(updateRecord(sample.id, { name: 'X' })).rejects.toThrow(/not authorized/);
  }, 60000);

  it('updates records via patch and rejects invalid patches', async () => {
    await asAdmin();
    await refreshRecords();
    const sample = get(visibleRecords)[0];
    const ok = await updateRecord(sample.id, { name: 'Renamed' });
    expect(ok.ok).toBe(true);
    const found = getRecord(sample.id);
    expect(found?.name).toBe('Renamed');

    const bad = await updateRecord(sample.id, { name: '' });
    expect(bad.ok).toBe(false);

    const badType = await updateRecord(sample.id, { sampleType: 'unicorn' });
    expect(badType.ok).toBe(false);

    const goodType = await updateRecord(sample.id, { sampleType: 'tissue' });
    expect(goodType.ok).toBe(true);

    const missing = await updateRecord('nope', { name: 'x' });
    expect(missing.ok).toBe(false);
  }, 30000);

  it('catalog repository returns undefined for unknown ids', async () => {
    expect(await configRecordRepository.update('absent', { name: 'x' })).toBeUndefined();
    expect(getRecord('absent')).toBeUndefined();
  });

  it('merged-state validation: a single-field date edit cannot bypass the from <= to invariant', async () => {
    await asAdmin();
    await refreshRecords();
    const sample = get(visibleRecords).find((r) => r.name === 'Genome Sequencer A');
    if (!sample) throw new Error('seed');
    // Existing range is 01/01/2026 → 12/31/2026. A single-field edit that
    // pushes effectiveFrom past effectiveTo MUST be rejected by the merged
    // validator (the previous patch-only validator missed this).
    const bad = await updateRecord(sample.id, { effectiveFrom: '06/01/2027' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/Effective From must be on or before/);
    // The reciprocal also fails when only effectiveTo is edited.
    const bad2 = await updateRecord(sample.id, { effectiveTo: '12/31/2024' });
    expect(bad2.ok).toBe(false);
    if (!bad2.ok) expect(bad2.errors.join(' ')).toMatch(/Effective From must be on or before/);
    // Sanity: a valid single-field edit still works.
    const good = await updateRecord(sample.id, { effectiveTo: '06/30/2027' });
    expect(good.ok).toBe(true);
  }, 30000);
});
