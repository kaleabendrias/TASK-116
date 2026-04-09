<script lang="ts">
  import { seatMap, ownTabId } from '@application/services/seatMapService';

  export let seatId: string;

  $: state = $seatMap;
  $: hold = state.holds.get(seatId);
  $: isMine = !!hold && hold.ownerTabId === ownTabId && hold.expiresAt > state.now;
  $: remaining = hold && isMine ? Math.max(0, hold.expiresAt - state.now) : 0;
  $: mm = Math.floor(remaining / 60000).toString().padStart(2, '0');
  $: ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
</script>

{#if isMine}
  <div class="countdown" class:warn={remaining < 60000}>
    Hold expires in <strong>{mm}:{ss}</strong>
  </div>
{/if}

<style>
  .countdown { padding: 8px 12px; border-radius: 6px; background: #2a2417; border: 1px solid #b58900; color: #f1c40f; font-size: 13px; }
  .warn { background: #2a1717; border-color: #c0392b; color: #ff7676; }
</style>
