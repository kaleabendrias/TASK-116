<script lang="ts">
  import { onMount } from 'svelte';
  import { login, register, bootstrapFirstAdmin, isAdminBootstrapped } from '@application/services/authService';
  import { ALL_ROLES, ROLE_LABELS, type Role } from '@domain/auth/role';
  import { businessConfig } from '@application/services/businessConfig';

  type Mode = 'login' | 'register' | 'bootstrap';

  /** Test-only: inject initial value to avoid async IDB detection in unit tests. */
  export let initialAdminMissing: boolean | undefined = undefined;

  const DEPARTMENTS = businessConfig().departments;
  let mode: Mode = 'login';
  let username = '';
  let password = '';
  let role: Role = 'dispatcher';
  let department: string = '';
  let error = '';
  let busy = false;
  let adminMissing = initialAdminMissing ?? false;

  // Public registration cannot mint administrators — filter the role picker.
  const PUBLIC_ROLES = ALL_ROLES.filter((r) => r !== 'administrator');

  onMount(async () => {
    if (initialAdminMissing !== undefined) return;
    try {
      adminMissing = !(await isAdminBootstrapped());
    } catch {
      adminMissing = false;
    }
  });

  async function submit(): Promise<void> {
    error = ''; busy = true;
    try {
      if (mode === 'register') {
        await register(username, password, role, department || null);
        await login(username, password);
      } else if (mode === 'bootstrap') {
        await bootstrapFirstAdmin(username, password, department || null);
        await login(username, password);
        adminMissing = false;
      } else {
        await login(username, password);
      }
    } catch (e) {
      /* v8 ignore next */
      error = e instanceof Error ? e.message : 'Authentication failed';
    } finally {
      busy = false;
    }
  }

  function switchMode(next: Mode): void {
    mode = next; error = ''; password = '';
    if (next === 'register') role = 'dispatcher';
  }

  $: title = mode === 'bootstrap' ? 'First-run setup' : mode === 'register' ? 'Create account' : 'Sign in';
  $: subtitle = mode === 'bootstrap'
    ? 'No administrator exists yet — create the first one.'
    : mode === 'register'
    ? 'Public registration cannot mint administrators.'
    : 'Local pseudo-login — passwords are salted &amp; hashed in the browser.';
</script>

<div style="min-height: 100vh; display: flex; align-items: center; justify-content: center;">
  <form class="card" style="width: min(440px, 92vw);" on:submit|preventDefault={submit}>
    <h2 style="margin-top:0;">{title}</h2>
    <p style="color:var(--muted); margin-top:0;">{@html subtitle}</p>

    {#if mode !== 'bootstrap' && adminMissing}
      <div class="card" style="background:#2a2417; border-color:#b58900; color:#f1c40f; padding:10px 12px; margin-bottom:12px;">
        No administrator has been created yet. Initialize the system via the
        <button type="button" class="link" on:click={() => switchMode('bootstrap')}>first-run setup</button>.
      </div>
    {/if}

    <label>Username<br/><input bind:value={username} required style="width:100%" /></label>
    <br/><br/>
    <label>Password<br/><input type="password" bind:value={password} required style="width:100%" /></label>

    {#if mode === 'register' || mode === 'bootstrap'}
      <br/><br/>
      {#if mode === 'register'}
        <label>Role<br/>
          <select bind:value={role} style="width:100%">
            {#each PUBLIC_ROLES as r}
              <option value={r}>{ROLE_LABELS[r]}</option>
            {/each}
          </select>
        </label>
        <br/><br/>
      {/if}
      <label>Department <span style="color:var(--muted); font-weight:normal;">(scopes question access)</span><br/>
        <select bind:value={department} style="width:100%">
          <option value="">— none —</option>
          {#each DEPARTMENTS as d}
            <option value={d}>{d}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if error}<p style="color:#ff7676;">{error}</p>{/if}

    <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        {#if mode !== 'login'}
          <button type="button" class="btn secondary" on:click={() => switchMode('login')}>Sign in</button>
        {/if}
        {#if mode !== 'register'}
          <button type="button" class="btn secondary" on:click={() => switchMode('register')}>Register</button>
        {/if}
        {#if mode !== 'bootstrap' && adminMissing}
          <button type="button" class="btn secondary" on:click={() => switchMode('bootstrap')}>First-run setup</button>
        {/if}
      </div>
      <button class="btn" type="submit" disabled={busy}>
        {busy ? '…' : (mode === 'login' ? 'Sign in' : mode === 'bootstrap' ? 'Create administrator' : 'Create &amp; sign in')}
      </button>
    </div>
  </form>
</div>

<style>
  .link {
    background: transparent; border: none; padding: 0;
    color: inherit; text-decoration: underline; cursor: pointer; font: inherit;
  }
</style>
