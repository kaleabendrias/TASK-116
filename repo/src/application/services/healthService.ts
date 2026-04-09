import { writable } from 'svelte/store';
import type { DietaryPreferences, HealthProfile } from '@domain/health/healthProfile';
import { EMPTY_PREFS } from '@domain/health/healthProfile';
import { recommendFoods, findEquivalent, type FoodItem, type RecommendationResult } from '@domain/health/recommendation';
import { calculateNutritionBudget, type NutritionBudget } from '@domain/health/nutrition';
import { encryptString, decryptString, isEncrypted } from '@shared/crypto/fieldCrypto';
import { healthRepository } from '@persistence/healthRepository';
import { businessConfig } from './businessConfig';
import { currentEncryptionKey } from './authService';
import { requireSession } from './authorization';

const profileStore = writable<{ preferences: DietaryPreferences; loaded: boolean }>({ preferences: EMPTY_PREFS, loaded: false });
export const healthProfile = { subscribe: profileStore.subscribe };

export async function loadHealthProfile(): Promise<void> {
  const userId = requireSession();
  const record = await healthRepository.get(userId);
  if (!record || !record.encryptedPreferences) {
    profileStore.set({ preferences: EMPTY_PREFS, loaded: true });
    return;
  }
  const key = currentEncryptionKey();
  if (!key) throw new Error('No encryption key in session');
  if (!isEncrypted(record.encryptedPreferences)) {
    profileStore.set({ preferences: EMPTY_PREFS, loaded: true });
    return;
  }
  const json = await decryptString(key, record.encryptedPreferences);
  profileStore.set({ preferences: JSON.parse(json) as DietaryPreferences, loaded: true });
}

export async function saveHealthProfile(prefs: DietaryPreferences): Promise<void> {
  const userId = requireSession();
  const key = currentEncryptionKey();
  if (!key) throw new Error('No encryption key in session');
  const encryptedPreferences = await encryptString(key, JSON.stringify(prefs));
  const record: HealthProfile = { id: userId, userId, encryptedPreferences, updatedAt: Date.now() };
  await healthRepository.put(record);
  profileStore.set({ preferences: prefs, loaded: true });
}

export function recommendForCurrentUser(prefs: DietaryPreferences): RecommendationResult {
  const cfg = businessConfig();
  return recommendFoods(prefs, cfg.foods as FoodItem[], cfg.foodEquivalents);
}

export function nutritionBudgetFor(prefs: DietaryPreferences): NutritionBudget | null {
  return calculateNutritionBudget(prefs);
}

export function swapEquivalent(foodId: string): FoodItem | null {
  const cfg = businessConfig();
  return findEquivalent(foodId, cfg.foods as FoodItem[], cfg.foodEquivalents);
}

/**
 * Apply a one-click swap and persist it. The original food id is added to
 * the user's `dislikes` list so future recommendations skip it; the swap
 * target is now the canonical recommendation. Throws when no equivalent is
 * configured for `originalFoodId`.
 */
export async function applySwap(originalFoodId: string): Promise<{ swap: FoodItem; preferences: DietaryPreferences }> {
  const swap = swapEquivalent(originalFoodId);
  if (!swap) throw new Error(`No equivalent configured for ${originalFoodId}`);
  // Read the current preferences from the in-memory store; fall back to empty.
  const current = (await new Promise<DietaryPreferences>((resolve) => {
    const off = profileStore.subscribe((v) => resolve(v.preferences));
    off();
  }));
  const next: DietaryPreferences = {
    ...current,
    dislikes: current.dislikes.includes(originalFoodId)
      ? current.dislikes
      : [...current.dislikes, originalFoodId]
  };
  await saveHealthProfile(next);
  return { swap, preferences: next };
}
