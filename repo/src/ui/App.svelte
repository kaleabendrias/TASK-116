<script lang="ts">
  import Router, { link, location } from 'svelte-spa-router';
  import { routes } from './router';
  import Login from './routes/Login.svelte';
  import { runtimeConfig } from '@application/services/configService';
  import { principal, isAuthenticated, logout } from '@application/services/authService';
  import { visibleRoutes, type RouteKey } from '@domain/auth/permissions';
  import { ROLE_LABELS } from '@domain/auth/role';

  const cfg = runtimeConfig();

  const NAV_LABELS: Record<RouteKey, { path: string; label: string }> = {
    home: { path: '/', label: 'Home' },
    trips: { path: '/trips', label: 'Trips' },
    configuration: { path: '/configuration', label: 'Configuration Console' },
    questions: { path: '/questions', label: 'Question Management' },
    messaging: { path: '/messaging', label: 'Messaging Center' },
    wellness: { path: '/wellness', label: 'Wellness Profile' },
    review: { path: '/review', label: 'Review / Grading' }
  };

  $: navItems = visibleRoutes($principal?.role ?? null).map((k) => NAV_LABELS[k]);
</script>

{#if !$isAuthenticated}
  <Login />
{:else}
  <div class="app-shell">
    <div class="brand">Task 09 SPA</div>
    <div class="topbar">
      <span>mode: {cfg.appMode} · locale: {cfg.localeDefault} · test: {cfg.testMode}</span>
      <span style="margin-left:auto; display:flex; gap:12px; align-items:center;">
        <span>{$principal?.username} · {ROLE_LABELS[$principal!.role]}</span>
        <button class="btn secondary" on:click={logout}>Sign out</button>
      </span>
    </div>
    <nav class="nav">
      {#each navItems as item}
        <a href={'#' + item.path} use:link class:active={$location === item.path}>{item.label}</a>
      {/each}
    </nav>
    <main class="main">
      <Router {routes} />
    </main>
  </div>
{/if}
