<script lang="ts">
  import { availableCount, holdSeat, releaseSeat, bookSeat, ownHoldFor } from '@application/services/seatMapService';
  import HoldCountdown from './HoldCountdown.svelte';
  import type { Seat } from '@domain/trips/seat';

  export let selectedSeat: Seat | null = null;
  export let onCleared: () => void = () => {};

  let message = '';
  let messageKind: 'info' | 'error' | 'success' = 'info';

  function notify(text: string, kind: typeof messageKind = 'info'): void {
    message = text; messageKind = kind;
  }

  async function doHold(): Promise<void> {
    /* v8 ignore next */
    if (!selectedSeat) return;
    const r = await holdSeat(selectedSeat.id);
    if (r.ok) notify(`Seat ${selectedSeat.label} held for 10 minutes.`, 'success');
    else notify(r.reason, 'error');
  }

  async function doRelease(): Promise<void> {
    /* v8 ignore next */
    if (!selectedSeat) return;
    await releaseSeat(selectedSeat.id);
    notify(`Seat ${selectedSeat.label} released.`, 'info');
  }

  async function doBook(): Promise<void> {
    /* v8 ignore next */
    if (!selectedSeat) return;
    const r = await bookSeat(selectedSeat.id);
    if (r.ok) {
      notify(`Seat ${selectedSeat.label} booked.`, 'success');
      onCleared();
    } else {
      notify(r.reason, 'error');
    }
  }

  $: hasOwnHold = selectedSeat ? !!ownHoldFor(selectedSeat.id) : false;
</script>

<aside class="card booking-panel">
  <h3 style="margin-top:0;">Booking</h3>
  <div style="color:var(--muted); font-size:13px;">Available right now: <strong>{$availableCount}</strong></div>

  {#if selectedSeat}
    <div style="margin-top:12px;">
      <div>Selected: <strong>{selectedSeat.label}</strong></div>
      <div style="color:var(--muted); font-size:12px;">{selectedSeat.kind}</div>
    </div>
    <div style="margin-top:12px;">
      <HoldCountdown seatId={selectedSeat.id} />
    </div>
    <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
      {#if !hasOwnHold}
        <button class="btn" on:click={doHold}>Hold seat</button>
      {:else}
        <button class="btn secondary" on:click={doRelease}>Release hold</button>
        <button class="btn" on:click={doBook}>Confirm booking</button>
      {/if}
    </div>
  {:else}
    <p style="color:var(--muted);">Select a seat from the map.</p>
  {/if}

  {#if message}
    <p class="msg {messageKind}">{message}</p>
  {/if}
</aside>

<style>
  .booking-panel { min-width: 240px; }
  .msg { margin-top: 12px; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
  .msg.info { background: #1c2433; color: #aac; }
  .msg.error { background: #2a1717; color: #ff7676; }
  .msg.success { background: #16291d; color: #6ee7a0; }
</style>
