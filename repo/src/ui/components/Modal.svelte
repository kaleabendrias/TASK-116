<script lang="ts">
  export let open = false;
  export let title = '';
  export let onClose: () => void = () => {};
</script>

{#if open}
  <div class="modal-backdrop" on:click={onClose} role="presentation">
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-label={title}>
      <header>
        <strong>{title}</strong>
        <button on:click={onClose} aria-label="Close">×</button>
      </header>
      <section>
        <slot />
      </section>
    </div>
  </div>
{/if}
