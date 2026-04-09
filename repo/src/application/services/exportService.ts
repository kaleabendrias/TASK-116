import { canonicalize, validateEnvelope, type SnapshotEnvelope } from '@domain/export/snapshot';
import { STORE_VALIDATORS } from '@domain/export/storeSchemas';
import { sha256Hex } from '@shared/crypto/sha256';
import { idbAll, idbPut, type StoreName } from '@persistence/indexedDb';
import { requireRole } from './authorization';

const EXPORTABLE_STORES: StoreName[] = [
  'questions', 'attempts', 'grades', 'messages', 'deadLetters', 'healthProfiles',
  'trips', 'seats', 'holds', 'bookings', 'catalogs'
];

export interface SnapshotPayload {
  stores: Record<string, unknown[]>;
}

export async function buildSnapshot(): Promise<SnapshotEnvelope<SnapshotPayload>> {
  requireRole('administrator');
  const stores: Record<string, unknown[]> = {};
  for (const s of EXPORTABLE_STORES) {
    stores[s] = await idbAll<unknown>(s);
  }
  const payload: SnapshotPayload = { stores };
  const fingerprint = await sha256Hex(canonicalize(payload));
  return {
    schema: 'task09.snapshot',
    version: 1,
    exportedAt: Date.now(),
    payload,
    fingerprint
  };
}

export async function exportToBlob(): Promise<Blob> {
  const env = await buildSnapshot();
  return new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
}

export function downloadSnapshot(blob: Blob, filename = `task09-snapshot-${Date.now()}.json`): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  ok: boolean;
  imported: number;
  rejected: number;
  errors: string[];
}

export async function importFromFile(file: File): Promise<ImportResult> {
  requireRole('administrator');
  const text = await file.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, imported: 0, rejected: 0, errors: ['Invalid JSON'] }; }
  const v = validateEnvelope(parsed);
  if (!v.ok) return { ok: false, imported: 0, rejected: 0, errors: v.errors };

  // Verify fingerprint.
  const expected = await sha256Hex(canonicalize(v.envelope.payload));
  if (expected !== v.envelope.fingerprint) {
    return { ok: false, imported: 0, rejected: 0, errors: ['Fingerprint mismatch — file is tampered or corrupt'] };
  }

  const payload = v.envelope.payload as SnapshotPayload;
  if (!payload.stores || typeof payload.stores !== 'object') {
    return { ok: false, imported: 0, rejected: 0, errors: ['Payload missing stores'] };
  }

  let imported = 0;
  let rejected = 0;
  const errors: string[] = [];
  for (const [storeName, items] of Object.entries(payload.stores)) {
    if (!EXPORTABLE_STORES.includes(storeName as StoreName)) {
      errors.push(`Skipping unknown store ${storeName}`);
      continue;
    }
    if (!Array.isArray(items)) { errors.push(`Store ${storeName} is not an array`); continue; }
    const validator = STORE_VALIDATORS[storeName];
    for (const item of items) {
      if (validator) {
        const reason = validator(item);
        if (reason !== null) {
          rejected++;
          errors.push(`${storeName}: rejected — ${reason}`);
          continue;
        }
      }
      if (!item || typeof item !== 'object' || !('id' in (item as object))) {
        rejected++;
        errors.push(`Item in ${storeName} missing id`);
        continue;
      }
      await idbPut(storeName as StoreName, item);
      imported++;
    }
  }
  return { ok: true, imported, rejected, errors };
}
