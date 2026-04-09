<script lang="ts">
  export let title: string;
  export let subtitle = '';
</script>

<header style="margin-bottom: 16px;">
  <h1 style="margin:0 0 4px;">{title}</h1>
  {#if subtitle}<p style="margin:0;color:var(--muted)">{subtitle}</p>{/if}
</header>
