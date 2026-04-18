<script lang="ts">
  import type { Seat } from '@domain/trips/seat';
  import { seatMap, ownTabId } from '@application/services/seatMapService';
  import { isSelectable, nonSelectableReason } from '@domain/trips/seatRules';

  export let selectedSeatId: string | null = null;
  export let onSelect: (seat: Seat) => void = () => {};

  $: state = $seatMap;
  $: rows = groupRows(state.seats);

  function groupRows(seats: Seat[]): Seat[][] {
    const map = new Map<number, Seat[]>();
    for (const s of seats) {
      if (!map.has(s.row)) map.set(s.row, []);
      map.get(s.row)!.push(s);
    }
    return Array.from(map.values()).map((r) => r.sort((a, b) => a.column - b.column));
  }

  function classFor(seat: Seat): string {
    const hold = state.holds.get(seat.id);
    const selectable = isSelectable(seat, hold, state.now, ownTabId);
    const isMine = hold?.ownerTabId === ownTabId && hold.expiresAt > state.now;
    if (seat.kind === 'ada') return 'seat ada';
    if (seat.kind === 'crew') return 'seat crew';
    if (seat.status === 'booked') return 'seat booked';
    if (isMine) return 'seat held-mine';
    if (hold && hold.expiresAt > state.now) return 'seat held-other';
    if (selected(seat)) return 'seat selected';
    /* v8 ignore next */
    return selectable ? 'seat available' : 'seat blocked';
  }

  function selected(seat: Seat): boolean { return selectedSeatId === seat.id; }

  function handle(seat: Seat): void {
    if (isSelectable(seat, state.holds.get(seat.id), state.now, ownTabId)) onSelect(seat);
  }
</script>

<div class="seat-map">
  {#each rows as row}
    <div class="seat-row">
      {#each row as seat}
        <button
          class={classFor(seat)}
          title={nonSelectableReason(seat, state.holds.get(seat.id), state.now, ownTabId) ?? `Seat ${seat.label}`}
          disabled={!isSelectable(seat, state.holds.get(seat.id), state.now, ownTabId)}
          on:click={() => handle(seat)}
        >{seat.label}</button>
      {/each}
    </div>
  {/each}
</div>

<div class="legend">
  <span class="chip available">Available</span>
  <span class="chip selected">Selected</span>
  <span class="chip held-mine">Your hold</span>
  <span class="chip held-other">Held (other)</span>
  <span class="chip booked">Booked</span>
  <span class="chip ada">ADA</span>
  <span class="chip crew">Crew</span>
</div>

<style>
  .seat-map { display: flex; flex-direction: column; gap: 8px; }
  .seat-row { display: flex; gap: 8px; justify-content: center; }
  .seat {
    width: 44px; height: 44px; border-radius: 6px; border: 1px solid var(--border);
    background: #1f2430; color: var(--fg); font-size: 12px;
  }
  .seat:disabled { cursor: not-allowed; }
  .available { background: #1f2430; }
  .selected { background: var(--accent); border-color: var(--accent); color: white; }
  .held-mine { background: #b58900; border-color: #b58900; color: #1a1a1a; }
  .held-other { background: #553; border-color: #775; color: #ddd; }
  .booked { background: #444; border-color: #555; color: #888; }
  .ada { background: #2a3a4a; border-color: #3a5a7a; color: #88c; }
  .crew { background: #3a2a2a; border-color: #5a3a3a; color: #c88; }
  .legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; font-size: 12px; }
  .chip { padding: 4px 8px; border-radius: 12px; border: 1px solid var(--border); }
  @media (max-width: 600px) { .seat { width: 36px; height: 36px; font-size: 11px; } }
</style>
