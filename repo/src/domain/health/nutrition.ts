import type { ActivityLevel, DietaryPreferences } from './healthProfile';
import { ACTIVITY_LEVELS, ageBracketMidpoint, normalizeAgeRange } from './healthProfile';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 0.85,
  light: 0.95,
  moderate: 1.0,
  active: 1.1,
  very_active: 1.2
};

/**
 * Coerce an arbitrary value (e.g. raw <select> binding from the UI, which can
 * be a string, null, or even the placeholder option's stringified "null") into
 * a strict ActivityLevel enum or null. This is the chokepoint that prevents
 * an invalid activity level from reaching the ACTIVITY_FACTOR lookup and
 * producing `undefined * number === NaN` downstream.
 */
export function normalizeActivityLevel(value: unknown): ActivityLevel | null {
  if (typeof value !== 'string') return null;
  return (ACTIVITY_LEVELS as readonly string[]).includes(value)
    ? (value as ActivityLevel)
    : null;
}

export interface NutritionBudget {
  calories: number;       // kcal/day
  proteinGrams: number;   // g/day target
  sodiumMg: number;       // mg/day cap
  addedSugarGrams: number;// g/day cap
}

/** Deterministic budget — same inputs always produce the same output. */
export function calculateNutritionBudget(prefs: DietaryPreferences): NutritionBudget | null {
  // Coerce stale or unknown ageRange values to null instead of crashing.
  const normalizedAgeRange = normalizeAgeRange(prefs.ageRange);
  if (normalizedAgeRange === null || prefs.activityLevel === null) return null;

  // Use the midpoint of the bracket as the representative age. This keeps
  // the budget a deterministic function of coarse policy inputs.
  const representativeAge = ageBracketMidpoint(normalizedAgeRange);

  // Defence-in-depth: even though `activityLevel` is typed as ActivityLevel,
  // an invalid value can sneak in from a stale persisted profile or a UI
  // binding that bypassed normalization. Refuse to compute when the lookup
  // would yield undefined — otherwise (base - ageDelta) * undefined produces
  // NaN and poisons every downstream nutrient field.
  const normalizedLevel = normalizeActivityLevel(prefs.activityLevel);
  if (normalizedLevel === null) return null;
  const factor = ACTIVITY_FACTOR[normalizedLevel];
  if (typeof factor !== 'number' || !Number.isFinite(factor)) return null;

  const base = 2000;
  const ageDelta = representativeAge > 30 ? Math.min((representativeAge - 30) * 5, 250) : 0;
  let calories = Math.round((base - ageDelta) * factor);
  if (!Number.isFinite(calories)) return null;

  // Weight-loss goal trims another 250 kcal/day, with a 1200 floor.
  if (prefs.goals.includes('weight-loss')) calories = Math.max(1200, calories - 250);

  const proteinGrams = Math.round((calories * 0.30) / 4);
  // Low-sodium goal lowers the cap from the default 2300 mg to 1500 mg.
  const sodiumMg = prefs.goals.includes('low-sodium') ? 1500 : 2300;
  const addedSugarGrams = Math.round((calories * 0.10) / 4);

  return { calories, proteinGrams, sodiumMg, addedSugarGrams };
}
