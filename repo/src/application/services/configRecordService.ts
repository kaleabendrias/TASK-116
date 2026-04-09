import { writable, derived, get } from 'svelte/store';
import type { ConfigRecord, ConfigRecordPatch } from '@domain/config/configRecord';
import { validateRecord, filterVisible } from '@domain/config/configRules';
import { configRecordRepository } from '@persistence/configRecordRepository';
import { preferences } from '@persistence/preferences';
import { requireRole } from './authorization';

const recordsStore = writable<ConfigRecord[]>([]);
const showExpiredStore = writable<boolean>(
  ((preferences.getLastFilter('configRecords').showExpired as boolean | undefined) ?? false)
);

export const records = { subscribe: recordsStore.subscribe };
export const showExpired = {
  subscribe: showExpiredStore.subscribe,
  toggle: () => showExpiredStore.update((v) => {
    const next = !v;
    preferences.setLastFilter('configRecords', { showExpired: next });
    return next;
  }),
  set: (v: boolean) => {
    preferences.setLastFilter('configRecords', { showExpired: v });
    showExpiredStore.set(v);
  }
};

export const visibleRecords = derived(
  [recordsStore, showExpiredStore],
  ([$records, $show]) => filterVisible($records, $show)
);

/**
 * Sensitive master data — only administrators may pull the catalog into the
 * service-level store. Direct, unauthorized service invocations are rejected.
 */
export async function refreshRecords(): Promise<void> {
  requireRole('administrator');
  recordsStore.set(await configRecordRepository.list());
}

/**
 * Update a record by patch. The merged record (existing fields + patch
 * overrides) is run through `validateRecord` so cross-field invariants —
 * particularly `effectiveFrom <= effectiveTo` — cannot be bypassed by
 * editing a single field at a time.
 */
export async function updateRecord(
  id: string,
  patch: ConfigRecordPatch
): Promise<{ ok: true; record: ConfigRecord } | { ok: false; errors: string[] }> {
  requireRole('administrator');
  const existing = await configRecordRepository.get(id);
  if (!existing) return { ok: false, errors: ['Record not found'] };
  const merged: ConfigRecord = { ...existing, ...patch, id };
  const validation = validateRecord(merged);
  if (!validation.ok) return validation;
  const updated = await configRecordRepository.update(id, patch);
  if (!updated) return { ok: false, errors: ['Record not found'] };
  await refreshRecords();
  return { ok: true, record: updated };
}

export function getRecord(id: string): ConfigRecord | undefined {
  return get(recordsStore).find((r) => r.id === id);
}
