import type { ConfigRecord } from '@domain/config/configRecord';
import { idbAll, idbGet, idbPut } from './indexedDb';
import { uid } from '@shared/utils/id';

const CATALOG_PREFIX = 'cfgrec:';
const SEED_FLAG = 'cfgrec-seeded-v1';

interface CatalogEnvelope {
  id: string;
  record?: ConfigRecord;
  seededAt?: number;
}

function envelopeOf(rec: ConfigRecord): CatalogEnvelope {
  return { id: CATALOG_PREFIX + rec.id, record: rec };
}

const SEED_RECORDS = (): ConfigRecord[] => [
  {
    id: uid('cfg'), name: 'Genome Sequencer A', device: 'GS-100', department: 'Genomics',
    project: 'Atlas', sampleQueue: 'queue-genomics-a', sampleType: 'blood',
    tags: ['priority', 'lab-1'],
    effectiveFrom: '01/01/2026', effectiveTo: '12/31/2026', priceUsd: 1450.00, valid: true
  },
  {
    id: uid('cfg'), name: 'Mass Spec B', device: 'MS-220', department: 'Proteomics',
    project: 'Helix', sampleQueue: 'queue-proteomics-b', sampleType: 'serum',
    tags: ['routine'],
    effectiveFrom: '03/01/2025', effectiveTo: '12/31/2025', priceUsd: 875.5, valid: true
  },
  {
    id: uid('cfg'), name: 'Legacy Centrifuge', device: 'CF-50', department: 'Hematology',
    project: 'Pulse', sampleQueue: 'queue-hema-legacy', sampleType: 'plasma',
    tags: ['deprecated'],
    effectiveFrom: '01/01/2020', effectiveTo: '01/01/2024', priceUsd: 220, valid: false
  }
];

async function ensureSeeded(): Promise<void> {
  const flag = await idbGet<CatalogEnvelope>('catalogs', SEED_FLAG);
  if (flag) return;
  for (const rec of SEED_RECORDS()) {
    await idbPut('catalogs', envelopeOf(rec));
  }
  await idbPut('catalogs', { id: SEED_FLAG, seededAt: Date.now() });
}

export const configRecordRepository = {
  async list(): Promise<ConfigRecord[]> {
    await ensureSeeded();
    const all = await idbAll<CatalogEnvelope>('catalogs');
    return all.filter((e) => e.id.startsWith(CATALOG_PREFIX) && e.record).map((e) => e.record as ConfigRecord);
  },
  async get(id: string): Promise<ConfigRecord | undefined> {
    const env = await idbGet<CatalogEnvelope>('catalogs', CATALOG_PREFIX + id);
    return env?.record;
  },
  async update(id: string, patch: Partial<ConfigRecord>): Promise<ConfigRecord | undefined> {
    const env = await idbGet<CatalogEnvelope>('catalogs', CATALOG_PREFIX + id);
    if (!env || !env.record) return undefined;
    const updated: ConfigRecord = { ...env.record, ...patch, id };
    await idbPut('catalogs', envelopeOf(updated));
    return updated;
  }
};
