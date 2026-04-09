<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import RouteGuard from '../components/RouteGuard.svelte';
  import {
    healthProfile, loadHealthProfile, saveHealthProfile,
    recommendForCurrentUser, applySwap, nutritionBudgetFor
  } from '@application/services/healthService';
  import type { DietaryPreferences, ActivityLevel, AgeRange } from '@domain/health/healthProfile';
  import { ACTIVITY_LEVELS, AGE_RANGES, AGE_BRACKETS, normalizeAgeRange } from '@domain/health/healthProfile';
  import { normalizeActivityLevel } from '@domain/health/nutrition';
  import { businessConfig } from '@application/services/businessConfig';

  const cfg = businessConfig();
  const GOALS: DietaryPreferences['goals'] = ['weight-loss','high-protein','low-sodium','whole-grain','dairy-free'];
  let prefs: DietaryPreferences = { goals: [], allergens: [], dislikes: [], ageRange: null, activityLevel: null };
  let recs: ReturnType<typeof recommendForCurrentUser> = { budget: null, items: [] };
  let saving = false;
  let message = '';

  onMount(async () => {
    await loadHealthProfile();
  });

  $: if ($healthProfile.loaded) {
    prefs = { ...$healthProfile.preferences };
    recs = recommendForCurrentUser(prefs);
  }

  // Normalize the raw <select> binding to a strict ActivityLevel enum (or
  // null) before forwarding to the budget calculator. This guards against:
  //  • the placeholder "— select —" option whose value is `null`
  //  • a string from a stale persisted profile that no longer matches any
  //    ActivityLevel
  // Without this, the ACTIVITY_FACTOR lookup would return undefined and
  // the calorie computation would propagate NaN through every field.
  $: normalizedActivity = normalizeActivityLevel(prefs.activityLevel);
  $: normalizedAgeRange = normalizeAgeRange(prefs.ageRange);
  $: budget = nutritionBudgetFor({ ...prefs, activityLevel: normalizedActivity, ageRange: normalizedAgeRange });

  function toggle<T extends string>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  async function save(): Promise<void> {
    saving = true; message = '';
    try {
      // Persist a normalized copy so a stale string can never be re-loaded
      // from IDB and re-poison the budget calculator after a refresh.
      const sanitized: DietaryPreferences = {
        ...prefs,
        ageRange: normalizeAgeRange(prefs.ageRange),
        activityLevel: normalizeActivityLevel(prefs.activityLevel)
      };
      await saveHealthProfile(sanitized);
      prefs = sanitized;
      recs = recommendForCurrentUser(sanitized);
      message = 'Saved (encrypted at rest).';
    } catch (e) {
      message = e instanceof Error ? e.message : 'Save failed';
    } finally { saving = false; }
  }

  async function doSwap(foodId: string): Promise<void> {
    try {
      const result = await applySwap(foodId);
      prefs = result.preferences;
      recs = recommendForCurrentUser(prefs);
      message = `Swapped to ${result.swap.name} (preference saved).`;
    } catch (e) {
      message = e instanceof Error ? e.message : 'Swap failed';
    }
  }
</script>

<RouteGuard route="wellness">
  <PageHeader title="Wellness Profile" subtitle="Optional Healthy Eating profile with deterministic nutrition budget." />

  <div class="card">
    <h3 style="margin-top:0;">Profile</h3>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <label>Age range<br/>
        <select bind:value={prefs.ageRange} style="width:100%">
          <option value={null}>— select —</option>
          {#each AGE_RANGES as r}
            <option value={r}>{r} years ({AGE_BRACKETS[r].min}–{AGE_BRACKETS[r].max})</option>
          {/each}
        </select>
      </label>
      <label>Activity level<br/>
        <select bind:value={prefs.activityLevel} style="width:100%">
          <option value={null}>— select —</option>
          {#each ACTIVITY_LEVELS as a}
            <option value={a}>{a.replace('_', ' ')}</option>
          {/each}
        </select>
      </label>
    </div>

    <h3>Goals</h3>
    {#each GOALS as g}
      <label style="margin-right:12px;">
        <input type="checkbox" checked={prefs.goals.includes(g)} on:change={() => prefs.goals = toggle(prefs.goals, g)} />
        {g}
      </label>
    {/each}

    <h3>Allergens</h3>
    <input value={prefs.allergens.join(', ')} on:input={(e) => prefs.allergens = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean)} style="width:100%" />

    <h3>Dislikes (food ids)</h3>
    <input value={prefs.dislikes.join(', ')} on:input={(e) => prefs.dislikes = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean)} style="width:100%" />

    <div style="margin-top:12px;">
      <button class="btn" on:click={save} disabled={saving}>Save profile</button>
      {#if message}<span style="margin-left:12px; color:var(--muted);">{message}</span>{/if}
    </div>
  </div>

  {#if budget}
    <div class="card">
      <h3 style="margin-top:0;">Daily nutrition budget</h3>
      <p style="color:var(--muted); font-size:12px;">Computed deterministically from age range + activity + goals.</p>
      <ul>
        <li>Calories: <strong>{budget.calories} kcal</strong></li>
        <li>Protein target: <strong>{budget.proteinGrams} g</strong></li>
        <li>Sodium cap: <strong>{budget.sodiumMg} mg</strong></li>
        <li>Added sugar cap: <strong>{budget.addedSugarGrams} g</strong></li>
      </ul>
    </div>
  {:else}
    <div class="card" style="color:var(--muted);">
      Set age range and activity level to unlock your daily nutrition budget.
    </div>
  {/if}

  <div class="card">
    <h3 style="margin-top:0;">Recommendations</h3>
    <p style="color:var(--muted); font-size:12px;">Reasons explain why each item was selected. Click swap to use the equivalent.</p>
    {#each recs.items as rec (rec.food.id)}
      <div class="card" style="margin:8px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>{rec.food.name}</strong>
          <span style="color:var(--muted); font-size:12px;">{rec.food.calories} kcal · {rec.food.category}</span>
        </div>
        <ul style="margin:8px 0; padding-left:20px;">
          {#each rec.reasons as r}<li>{r}</li>{/each}
        </ul>
        {#if rec.swap}
          <button class="btn secondary" on:click={() => doSwap(rec.food.id)}>Swap to {rec.swap.name}</button>
        {/if}
      </div>
    {:else}
      <p style="color:var(--muted);">Set goals to get recommendations.</p>
    {/each}
  </div>

  <p style="color:var(--muted); font-size:12px;">Foods catalog provided by local config: {cfg.foods.length} items.</p>
</RouteGuard>
