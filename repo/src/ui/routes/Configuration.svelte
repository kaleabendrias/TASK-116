<script lang="ts">
  import PageHeader from '../components/PageHeader.svelte';
  import RouteGuard from '../components/RouteGuard.svelte';
  import ConfigTable from '../components/ConfigTable.svelte';
  import Drawer from '../components/Drawer.svelte';
  import { onMount } from 'svelte';
  import { visibleRecords, showExpired, getRecord, refreshRecords } from '@application/services/configRecordService';
  import { formatUsd, isExpired } from '@domain/config/configRules';
  import { runtimeConfig } from '@application/services/configService';
  import { exportToBlob, downloadSnapshot, importFromFile, type ImportResult } from '@application/services/exportService';

  const cfg = runtimeConfig();
  let drawerOpenId: string | null = null;
  $: drawerRecord = drawerOpenId ? getRecord(drawerOpenId) ?? null : null;

  let importResult: ImportResult | null = null;
  let exporting = false;

  onMount(refreshRecords);

  async function handleExport(): Promise<void> {
    exporting = true;
    try {
      const blob = await exportToBlob();
      downloadSnapshot(blob);
    } finally { exporting = false; }
  }

  async function handleImport(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importResult = await importFromFile(file);
    input.value = '';
  }
</script>

<RouteGuard route="configuration">
  <PageHeader title="Administrator · Configuration Console" subtitle="Inline-edit records and inspect associations." />

  <div class="card" style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
    <div>App mode <strong>{cfg.appMode}</strong> · Locale <strong>{cfg.localeDefault}</strong> · Static config <strong>{cfg.staticConfigPath}</strong></div>
    <label style="margin-left:auto;">
      <input type="checkbox" checked={$showExpired} on:change={showExpired.toggle} />
      Show expired records
    </label>
  </div>

  <div class="card">
    <ConfigTable rows={$visibleRecords} onOpen={(id) => (drawerOpenId = id)} />
    <p style="color:var(--muted); font-size:12px;">Double-click a cell to edit inline. Dates use MM/DD/YYYY.</p>
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Local snapshot export / import</h3>
    <p style="color:var(--muted); font-size:13px;">JSON snapshot includes a SHA-256 fingerprint to detect tampering on import.</p>
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <button class="btn" on:click={handleExport} disabled={exporting}>{exporting ? '…' : 'Export snapshot'}</button>
      <label class="btn secondary">
        Import snapshot
        <input type="file" accept="application/json" on:change={handleImport} style="display:none" />
      </label>
    </div>
    {#if importResult}
      <p style="margin-top:12px; color:{importResult.ok ? '#6ee7a0' : '#ff7676'};">
        {importResult.ok ? `Imported ${importResult.imported} records.` : `Failed: ${importResult.errors.join(', ')}`}
      </p>
      {#if importResult.errors.length > 0 && importResult.ok}
        <ul style="color:var(--muted); font-size:12px;">{#each importResult.errors as e}<li>{e}</li>{/each}</ul>
      {/if}
    {/if}
  </div>
</RouteGuard>

<Drawer open={!!drawerRecord} title={drawerRecord ? `Details · ${drawerRecord.name}` : ''} onClose={() => (drawerOpenId = null)}>
  {#if drawerRecord}
    <section>
      <h4>Associations</h4>
      <dl>
        <dt>Device</dt><dd>{drawerRecord.device}</dd>
        <dt>Department</dt><dd>{drawerRecord.department}</dd>
        <dt>Project</dt><dd>{drawerRecord.project}</dd>
        <dt>Sample queue</dt><dd>{drawerRecord.sampleQueue}</dd>
        <dt>Sample type</dt><dd>{drawerRecord.sampleType}</dd>
        <dt>Department → Device → Queue</dt>
        <dd>{drawerRecord.department} → {drawerRecord.device} → {drawerRecord.sampleQueue}</dd>
      </dl>
    </section>
    <section>
      <h4>Tags</h4>
      <div class="tags">
        {#each drawerRecord.tags as tag}<span class="tag">{tag}</span>{/each}
      </div>
    </section>
    <section>
      <h4>Effective range</h4>
      <p>{drawerRecord.effectiveFrom} → {drawerRecord.effectiveTo}
         {#if isExpired(drawerRecord)}<em style="color:#ff7676;"> (expired)</em>{/if}
      </p>
    </section>
    <section>
      <h4>Pricing</h4>
      <p>{formatUsd(drawerRecord.priceUsd)} USD</p>
    </section>
    <section>
      <h4>Validity</h4>
      <p>{drawerRecord.valid ? 'Valid' : 'Marked invalid'}</p>
    </section>
  {/if}
</Drawer>

<style>
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { padding: 3px 8px; border-radius: 12px; background: #1f2430; border: 1px solid var(--border); font-size: 12px; }
  h4 { margin: 16px 0 8px; }
</style>
