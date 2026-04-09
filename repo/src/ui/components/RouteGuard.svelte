<script lang="ts">
  import { principal } from '@application/services/authService';
  import { canAccess, type RouteKey } from '@domain/auth/permissions';
  export let route: RouteKey;
</script>

{#if canAccess(route, $principal?.role ?? null)}
  <slot />
{:else}
  <div class="card">
    <h2 style="margin-top:0;">Access denied</h2>
    <p style="color:var(--muted);">Your role ({$principal?.role ?? 'anonymous'}) cannot view this workspace.</p>
  </div>
{/if}
