<script lang="ts">
  export let open = false;
  export let title = '';
  export let onClose: () => void = () => {};
</script>

{#if open}
  <div class="drawer-backdrop" on:click={onClose} role="presentation"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <strong>{title}</strong>
      <button on:click={onClose} aria-label="Close">×</button>
    </header>
    <div class="body">
      <slot />
    </div>
  </aside>
{/if}

<style>
  .drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 40; }
  .drawer {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: min(480px, 92vw); background: var(--panel); border-left: 1px solid var(--border);
    z-index: 50; display: flex; flex-direction: column;
  }
  header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid var(--border); }
  header button { background: transparent; border: none; color: var(--muted); font-size: 22px; }
  .body { padding: 16px; overflow: auto; flex: 1; }
</style>
