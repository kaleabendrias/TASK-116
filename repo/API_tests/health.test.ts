import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { register, login, logout, currentUserId } from '@application/services/authService';
import {
  loadHealthProfile, saveHealthProfile, recommendForCurrentUser,
  swapEquivalent, applySwap, healthProfile, nutritionBudgetFor
} from '@application/services/healthService';
import { healthRepository } from '@persistence/healthRepository';
import { isEncrypted } from '@shared/crypto/fieldCrypto';

describe('healthService crypto-at-rest + nutrition budget', () => {
  it('encrypts preferences in IndexedDB and decrypts on load', async () => {
    await register('alice', 'longenough', 'reviewer');
    await login('alice', 'longenough');
    await saveHealthProfile({
      goals: ['high-protein'], allergens: ['dairy'], dislikes: [],
      ageRange: '30-44', activityLevel: 'moderate'
    });

    const stored = await healthRepository.get((await healthRepository.list())[0].userId);
    expect(stored?.encryptedPreferences).not.toBeNull();
    expect(isEncrypted(stored!.encryptedPreferences!)).toBe(true);
    const raw = JSON.stringify(stored?.encryptedPreferences);
    expect(raw).not.toContain('high-protein');
    expect(raw).not.toContain('dairy');
    expect(raw).not.toContain('moderate');

    logout();
    await login('alice', 'longenough');
    await loadHealthProfile();
    const view = get(healthProfile);
    expect(view.loaded).toBe(true);
    expect(view.preferences.goals).toContain('high-protein');
    expect(view.preferences.ageRange).toBe('30-44');
    expect(view.preferences.activityLevel).toBe('moderate');
  }, 60000);

  it('rejects load + save when not authenticated', async () => {
    await expect(loadHealthProfile()).rejects.toThrow(/Authentication/);
    await expect(saveHealthProfile({ goals: [], allergens: [], dislikes: [], ageRange: null, activityLevel: null }))
      .rejects.toThrow(/Authentication/);
  });

  it('returns empty preferences when no profile exists', async () => {
    await register('bob', 'longenough', 'reviewer');
    await login('bob', 'longenough');
    await loadHealthProfile();
    expect(get(healthProfile).preferences.goals).toEqual([]);
    expect(get(healthProfile).preferences.ageRange).toBeNull();
  }, 30000);

  it('nutrition budget is null without ageRange + activity, deterministic with both', async () => {
    expect(nutritionBudgetFor({ goals: [], allergens: [], dislikes: [], ageRange: null, activityLevel: null })).toBeNull();
    expect(nutritionBudgetFor({ goals: [], allergens: [], dislikes: [], ageRange: '30-44', activityLevel: null })).toBeNull();
    const b1 = nutritionBudgetFor({ goals: [], allergens: [], dislikes: [], ageRange: '30-44', activityLevel: 'moderate' });
    const b2 = nutritionBudgetFor({ goals: [], allergens: [], dislikes: [], ageRange: '30-44', activityLevel: 'moderate' });
    expect(b1).toEqual(b2);
    // Midpoint of 30-44 is 37 → 2000 - 35 = 1965
    expect(b1?.calories).toBe(1965);
    expect(b1?.sodiumMg).toBe(2300);
  });

  it('weight-loss goal trims calories; low-sodium drops the cap', async () => {
    const wl = nutritionBudgetFor({ goals: ['weight-loss'], allergens: [], dislikes: [], ageRange: '30-44', activityLevel: 'sedentary' });
    expect(wl?.calories).toBeLessThan(2000);
    const ls = nutritionBudgetFor({ goals: ['low-sodium'], allergens: [], dislikes: [], ageRange: '30-44', activityLevel: 'moderate' });
    expect(ls?.sodiumMg).toBe(1500);
  });

  it('recommendForCurrentUser surfaces ranked items with reasons and a budget', async () => {
    const recs = recommendForCurrentUser({
      goals: ['high-protein','whole-grain'], allergens: [], dislikes: [],
      ageRange: '30-44', activityLevel: 'moderate'
    });
    expect(recs.budget).not.toBeNull();
    expect(recs.items.length).toBeGreaterThan(0);
    expect(recs.items[0].reasons.length).toBeGreaterThan(0);
  });

  it('swapEquivalent returns the configured equivalent', async () => {
    expect(swapEquivalent('f-bagel')?.id).toBe('f-oat');
    expect(swapEquivalent('f-unknown')).toBeNull();
  });

  it('applySwap actually persists the dislike and refreshes the loaded profile', async () => {
    await register('swapper', 'longenough', 'reviewer');
    await login('swapper', 'longenough');
    await saveHealthProfile({
      goals: ['high-protein'], allergens: [], dislikes: [],
      ageRange: '30-44', activityLevel: 'moderate'
    });
    const result = await applySwap('f-bagel');
    expect(result.swap.id).toBe('f-oat');
    expect(result.preferences.dislikes).toContain('f-bagel');

    // Re-load from IDB to confirm persistence
    logout();
    await login('swapper', 'longenough');
    await loadHealthProfile();
    expect(get(healthProfile).preferences.dislikes).toContain('f-bagel');
  }, 90000);

  it('applySwap rejects food ids with no configured equivalent', async () => {
    await register('lonely', 'longenough', 'reviewer');
    await login('lonely', 'longenough');
    await saveHealthProfile({ goals: [], allergens: [], dislikes: [], ageRange: '30-44', activityLevel: 'moderate' });
    await expect(applySwap('f-quinoa')).rejects.toThrow(/No equivalent/);
  }, 60000);

  it('applySwap is idempotent when food is already in dislikes (covers dislikes.includes true branch)', async () => {
    await register('idem-user', 'longenough', 'reviewer');
    await login('idem-user', 'longenough');
    // Save profile with f-bagel already in dislikes
    await saveHealthProfile({
      goals: [], allergens: [], dislikes: ['f-bagel'],
      ageRange: '30-44', activityLevel: 'moderate'
    });
    await loadHealthProfile();
    const result = await applySwap('f-bagel');
    // Should return the swap target
    expect(result.swap.id).toBe('f-oat');
    // Dislikes should still contain f-bagel exactly once (idempotent)
    expect(result.preferences.dislikes.filter((d: string) => d === 'f-bagel').length).toBe(1);
  }, 60000);

  it('loadHealthProfile treats stored record with non-encrypted preferences as empty (covers !isEncrypted branch)', async () => {
    await register('raw-prefs-user', 'longenough', 'reviewer');
    await login('raw-prefs-user', 'longenough');
    const userId = currentUserId()!;
    // Put a record with encryptedPreferences that is NOT a valid EncryptedField
    await healthRepository.put({
      id: userId,
      userId,
      encryptedPreferences: { notAnEncryptedField: true } as unknown as import('@shared/crypto/fieldCrypto').EncryptedField,
      updatedAt: Date.now()
    });
    await loadHealthProfile();
    const view = get(healthProfile);
    // Non-encrypted record → treated as missing → empty prefs
    expect(view.loaded).toBe(true);
    expect(view.preferences.goals).toEqual([]);
  }, 30000);

  it('saveHealthProfile update: second save overwrites first and persists the latest values', async () => {
    await register('update-user', 'longenough', 'reviewer');
    await login('update-user', 'longenough');

    await saveHealthProfile({
      goals: ['high-protein'], allergens: [], dislikes: [],
      ageRange: '18-29', activityLevel: 'sedentary'
    });
    await saveHealthProfile({
      goals: ['weight-loss', 'whole-grain'], allergens: ['nuts'], dislikes: ['f-bagel'],
      ageRange: '45-59', activityLevel: 'active'
    });

    // Reload from IDB and verify the latest values are stored
    await loadHealthProfile();
    const view = get(healthProfile);
    expect(view.loaded).toBe(true);
    expect(view.preferences.goals).toContain('weight-loss');
    expect(view.preferences.goals).toContain('whole-grain');
    expect(view.preferences.allergens).toContain('nuts');
    expect(view.preferences.dislikes).toContain('f-bagel');
    expect(view.preferences.ageRange).toBe('45-59');
    expect(view.preferences.activityLevel).toBe('active');
    // First save's values must NOT appear
    expect(view.preferences.goals).not.toContain('high-protein');
    expect(view.preferences.ageRange).not.toBe('18-29');
  }, 60000);

  it('full round-trip: all preference fields survive a logout + login cycle via AES-GCM', async () => {
    await register('roundtrip-user', 'longenough', 'reviewer');
    await login('roundtrip-user', 'longenough');

    const prefs = {
      goals: ['low-sodium', 'whole-grain'],
      allergens: ['gluten', 'dairy'],
      dislikes: ['f-bagel', 'f-oat'],
      ageRange: '30-44' as const,
      activityLevel: 'moderate' as const
    };
    await saveHealthProfile(prefs);

    // Full logout + re-login cycle to re-derive the AES-GCM key
    logout();
    await login('roundtrip-user', 'longenough');
    await loadHealthProfile();

    const view = get(healthProfile);
    expect(view.loaded).toBe(true);
    expect(view.preferences.goals).toEqual(prefs.goals);
    expect(view.preferences.allergens).toEqual(prefs.allergens);
    expect(view.preferences.dislikes).toEqual(prefs.dislikes);
    expect(view.preferences.ageRange).toBe(prefs.ageRange);
    expect(view.preferences.activityLevel).toBe(prefs.activityLevel);
  }, 90000);
});
