<script lang="ts">
  import type { ConfigRecord } from '@domain/config/configRecord';
  import { updateRecord } from '@application/services/configRecordService';
  import { formatUsd, isExpired } from '@domain/config/configRules';

  export let rows: ConfigRecord[] = [];
  export let onOpen: (id: string) => void = () => {};

  /**
   * Inline-editable scalar text fields. Adding `project` and `sampleQueue`
   * brings the table to full operational parity with the details drawer
   * so administrators can update project / queue associations directly
   * from the row, without opening the drawer for every change.
   */
  const TEXT_FIELDS = [
    'name','device','department','project','sampleQueue','sampleType',
    'effectiveFrom','effectiveTo'
  ] as const satisfies readonly (keyof ConfigRecord)[];

  let editing: { id: string; field: keyof ConfigRecord } | null = null;
  let draft = '';
  let errorRow: string | null = null;
  let errorMsg = '';

  function startEdit(row: ConfigRecord, field: keyof ConfigRecord): void {
    editing = { id: row.id, field };
    // `tags` is string[] in the model — render it as a comma-separated
    // string for editing and split it back on commit. Every other field
    // round-trips through String(...).
    if (field === 'tags') {
      draft = (row.tags ?? []).join(', ');
    } else {
      draft = String(row[field] ?? '');
    }
    errorRow = null;
  }

  /** Convert the draft string back into the model-shaped value for `field`. */
  function coerceDraft(field: keyof ConfigRecord): unknown {
    if (field === 'priceUsd') return Number(draft);
    if (field === 'tags') {
      return draft
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
    return draft;
  }

  async function commit(): Promise<void> {
    if (!editing) return;
    const { id, field } = editing;
    const value = coerceDraft(field);
    const r = await updateRecord(id, { [field]: value } as Partial<ConfigRecord>);
    if (!r.ok) { errorRow = id; errorMsg = r.errors.join(', '); return; }
    editing = null;
  }

  function cancel(): void { editing = null; errorRow = null; }
  function isEditing(row: ConfigRecord, field: keyof ConfigRecord): boolean {
    return editing?.id === row.id && editing.field === field;
  }
</script>

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Device</th>
      <th>Department</th>
      <th>Project</th>
      <th>Sample Queue</th>
      <th>Sample Type</th>
      <th>Effective From</th>
      <th>Effective To</th>
      <th>Price</th>
      <th>Tags</th>
      <th>Valid</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.id)}
      <tr class:expired={isExpired(row)}>
        {#each TEXT_FIELDS as f (f)}
          <td on:dblclick={() => startEdit(row, f)}>
            {#if isEditing(row, f)}
              <input bind:value={draft} on:blur={commit} on:keydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} />
            {:else}
              {row[f]}
            {/if}
          </td>
        {/each}
        <td on:dblclick={() => startEdit(row, 'priceUsd')}>
          {#if isEditing(row, 'priceUsd')}
            <input type="number" step="0.01" bind:value={draft} on:blur={commit} on:keydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} autofocus />
          {:else}
            {formatUsd(row.priceUsd)}
          {/if}
        </td>
        <td on:dblclick={() => startEdit(row, 'tags')} title="Double-click to edit tags (comma-separated)">
          {#if isEditing(row, 'tags')}
            <input bind:value={draft} placeholder="tag1, tag2, tag3" on:blur={commit} on:keydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} />
          {:else}
            {(row.tags ?? []).join(', ')}
          {/if}
        </td>
        <td>
          <input type="checkbox" checked={row.valid} on:change={(e) => { void updateRecord(row.id, { valid: e.currentTarget.checked }); }} />
        </td>
        <td><button class="btn secondary" on:click={() => onOpen(row.id)}>Details</button></td>
      </tr>
      {#if errorRow === row.id}
        <tr><td colspan="12" class="err">{errorMsg}</td></tr>
      {/if}
    {/each}
  </tbody>
</table>

<style>
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; }
  tr.expired { opacity: 0.55; }
  td input { width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--accent); padding: 4px 6px; border-radius: 4px; }
  .err { color: #ff7676; font-size: 12px; }
</style>
