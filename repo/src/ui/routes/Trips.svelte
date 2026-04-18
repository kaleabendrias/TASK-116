<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import RouteGuard from '../components/RouteGuard.svelte';
  import Modal from '../components/Modal.svelte';
  import SeatMap from '../components/SeatMap.svelte';
  import BookingPanel from '../components/BookingPanel.svelte';
  import { startSeatMap, stopSeatMap } from '@application/services/seatMapService';
  import {
    trips, selectedTripId, refreshTrips, createTrip, editTrip, selectTrip
  } from '@application/services/tripsService';
  import type { Seat } from '@domain/trips/seat';
  import type { NewTripInput, Trip } from '@domain/trips/trip';

  let selectedSeat: Seat | null = null;
  let modalOpen = false;
  let editingId: string | null = null;
  let errors: string[] = [];
  let form: NewTripInput = blankForm();

  function blankForm(): NewTripInput {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    return { name: '', origin: '', destination: '', departureAt: tomorrow, rows: 8, cols: 4 };
  }

  function openCreate(): void {
    editingId = null; errors = []; form = blankForm(); modalOpen = true;
  }

  function openEdit(trip: Trip): void {
    editingId = trip.id; errors = [];
    form = {
      name: trip.name, origin: trip.origin, destination: trip.destination,
      departureAt: trip.departureAt, rows: trip.rows, cols: trip.cols
    };
    modalOpen = true;
  }

  async function submitForm(): Promise<void> {
    const result = editingId ? await editTrip(editingId, form) : await createTrip(form);
    if (result.ok) { modalOpen = false; }
    else { errors = result.errors; }
  }

  async function pickTrip(id: string): Promise<void> {
    await selectTrip(id);
    selectedSeat = null;
    await startSeatMap(id);
  }

  function onDepartureInput(e: Event): void {
    const val = (e.currentTarget as HTMLInputElement).value;
    form.departureAt = fromIsoLocal(val);
  }

  function toIsoLocal(ms: number): string {
    const d = new Date(ms);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60 * 1000);
    return local.toISOString().slice(0, 16);
  }
  function fromIsoLocal(s: string): number {
    return new Date(s).getTime();
  }

  onMount(async () => {
    await refreshTrips();
  });
  onDestroy(stopSeatMap);

  function handleSelect(seat: Seat): void { selectedSeat = seat; }
  function handleCleared(): void { selectedSeat = null; }
</script>

<RouteGuard route="trips">
  <PageHeader title="Dispatcher · Trips" subtitle="Build trips, then bind a seat-map editor + booking workflow to each one." />

  <div class="card" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
    <button class="btn" on:click={openCreate}>New trip</button>
    <span style="color:var(--muted); font-size:12px;">Select a trip to view its seat map.</span>
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Trips</h3>
    {#if $trips.length === 0}
      <p style="color:var(--muted);">No trips yet — click <strong>New trip</strong>.</p>
    {/if}
    <table style="width:100%; font-size:13px;">
      <thead><tr><th>Name</th><th>Origin → Destination</th><th>Departure</th><th>Layout</th><th></th></tr></thead>
      <tbody>
        {#each $trips as trip (trip.id)}
          <tr class:selected-row={$selectedTripId === trip.id}>
            <td>{trip.name}</td>
            <td>{trip.origin} → {trip.destination}</td>
            <td>{new Date(trip.departureAt).toLocaleString()}</td>
            <td>{trip.rows} × {trip.cols}</td>
            <td style="display:flex; gap:4px;">
              <button class="btn secondary" on:click={() => pickTrip(trip.id)}>Select</button>
              <button class="btn secondary" on:click={() => openEdit(trip)}>Edit</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if $selectedTripId}
    <div class="layout">
      <section class="card seat-section">
        <h3 style="margin-top:0;">Seat map · {$trips.find((t) => t.id === $selectedTripId)?.name ?? ''}</h3>
        <SeatMap selectedSeatId={selectedSeat?.id ?? null} onSelect={handleSelect} />
      </section>
      <BookingPanel {selectedSeat} onCleared={handleCleared} />
    </div>
  {/if}
</RouteGuard>

<Modal open={modalOpen} title={editingId ? 'Edit trip' : 'New trip'} onClose={() => (modalOpen = false)}>
  <label>Name<br/><input bind:value={form.name} style="width:100%" /></label><br/><br/>
  <label>Origin<br/><input bind:value={form.origin} style="width:100%" /></label><br/><br/>
  <label>Destination<br/><input bind:value={form.destination} style="width:100%" /></label><br/><br/>
  <label>Departure<br/>
    <input
      type="datetime-local"
      value={toIsoLocal(form.departureAt)}
      on:input={onDepartureInput}
      style="width:100%"
    />
  </label><br/><br/>
  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
    <label>Rows<br/><input type="number" min="1" max="30" bind:value={form.rows} /></label>
    <label>Columns<br/><input type="number" min="2" max="8" bind:value={form.cols} /></label>
  </div>
  {#if errors.length}
    <ul style="color:#ff7676;">{#each errors as e}<li>{e}</li>{/each}</ul>
  {/if}
  <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
    <button type="button" class="btn secondary" on:click={() => (modalOpen = false)}>Cancel</button>
    <button type="button" class="btn" on:click={submitForm}>{editingId ? 'Save' : 'Create'}</button>
  </div>
</Modal>

<style>
  .layout { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; margin-top:16px; }
  .seat-section { padding: 24px; }
  .selected-row td { background: rgba(79, 140, 255, 0.1); }
  @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
</style>
