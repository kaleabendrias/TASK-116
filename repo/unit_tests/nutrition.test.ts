import { describe, it, expect } from 'vitest';
import { calculateNutritionBudget, normalizeActivityLevel } from '@domain/health/nutrition';
import type { DietaryPreferences } from '@domain/health/healthProfile';
import { normalizeAgeRange, ageBracketMidpoint } from '@domain/health/healthProfile';

function prefs(over: Partial<DietaryPreferences> = {}): DietaryPreferences {
  return { goals: [], allergens: [], dislikes: [], ageRange: '30-44', activityLevel: 'moderate', ...over };
}

describe('calculateNutritionBudget', () => {
  it('returns null when ageRange or activity is missing', () => {
    expect(calculateNutritionBudget(prefs({ ageRange: null }))).toBeNull();
    expect(calculateNutritionBudget(prefs({ activityLevel: null }))).toBeNull();
  });

  it('rejects invalid ageRange strings (stale persisted profile)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateNutritionBudget(prefs({ ageRange: 'unknown' as any }))).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateNutritionBudget(prefs({ ageRange: '999+' as any }))).toBeNull();
  });

  it('is deterministic for the same inputs', () => {
    const a = calculateNutritionBudget(prefs());
    const b = calculateNutritionBudget(prefs());
    expect(a).toEqual(b);
  });

  it('produces a budget for the 30-44 bracket at moderate activity', () => {
    // Midpoint of 30-44 is 37 → ageDelta = (37-30)*5 = 35.
    const b = calculateNutritionBudget(prefs())!;
    // (2000 - 35) * 1.0 = 1965
    expect(b.calories).toBe(1965);
    expect(b.proteinGrams).toBe(Math.round((1965 * 0.30) / 4));
    expect(b.sodiumMg).toBe(2300);
    expect(b.addedSugarGrams).toBe(Math.round((1965 * 0.10) / 4));
  });

  it('older brackets trim more calories than younger; very_active boosts them', () => {
    const young = calculateNutritionBudget(prefs({ ageRange: '18-29' }))!;
    const old = calculateNutritionBudget(prefs({ ageRange: '60-74' }))!;
    expect(old.calories).toBeLessThan(young.calories);

    const sedentary = calculateNutritionBudget(prefs({ activityLevel: 'sedentary' }))!;
    const veryActive = calculateNutritionBudget(prefs({ activityLevel: 'very_active' }))!;
    expect(veryActive.calories).toBeGreaterThan(sedentary.calories);
  });

  it('weight-loss goal trims another 250 kcal with a 1200 floor', () => {
    const base = calculateNutritionBudget(prefs())!;
    const wl = calculateNutritionBudget(prefs({ goals: ['weight-loss'] }))!;
    expect(wl.calories).toBe(base.calories - 250);

    const tiny = calculateNutritionBudget(prefs({ ageRange: '75+', activityLevel: 'sedentary', goals: ['weight-loss'] }))!;
    expect(tiny.calories).toBeGreaterThanOrEqual(1200);
  });

  it('low-sodium goal lowers the sodium cap', () => {
    expect(calculateNutritionBudget(prefs({ goals: ['low-sodium'] }))!.sodiumMg).toBe(1500);
    expect(calculateNutritionBudget(prefs())!.sodiumMg).toBe(2300);
  });

  it('returns null (no NaN poisoning) for an invalid activityLevel string', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dirty: any = prefs({ activityLevel: 'super_active' as any });
    const b = calculateNutritionBudget(dirty);
    expect(b).toBeNull();
  });

  it('normalizeActivityLevel coerces unknown values to null', () => {
    expect(normalizeActivityLevel('moderate')).toBe('moderate');
    expect(normalizeActivityLevel('very_active')).toBe('very_active');
    expect(normalizeActivityLevel('super_active')).toBeNull();
    expect(normalizeActivityLevel('')).toBeNull();
    expect(normalizeActivityLevel(null)).toBeNull();
    expect(normalizeActivityLevel(undefined)).toBeNull();
    expect(normalizeActivityLevel(42)).toBeNull();
    expect(normalizeActivityLevel({})).toBeNull();
  });

  it('normalizeAgeRange accepts every enum member and rejects everything else', () => {
    expect(normalizeAgeRange('0-17')).toBe('0-17');
    expect(normalizeAgeRange('18-29')).toBe('18-29');
    expect(normalizeAgeRange('30-44')).toBe('30-44');
    expect(normalizeAgeRange('45-59')).toBe('45-59');
    expect(normalizeAgeRange('60-74')).toBe('60-74');
    expect(normalizeAgeRange('75+')).toBe('75+');
    expect(normalizeAgeRange('999+')).toBeNull();
    expect(normalizeAgeRange(30)).toBeNull();
    expect(normalizeAgeRange(null)).toBeNull();
    expect(normalizeAgeRange(undefined)).toBeNull();
    expect(normalizeAgeRange({})).toBeNull();
  });

  it('ageBracketMidpoint returns the midpoint year of each bracket', () => {
    expect(ageBracketMidpoint('0-17')).toBe(9);
    expect(ageBracketMidpoint('18-29')).toBe(24);
    expect(ageBracketMidpoint('30-44')).toBe(37);
    expect(ageBracketMidpoint('45-59')).toBe(52);
    expect(ageBracketMidpoint('60-74')).toBe(67);
    expect(ageBracketMidpoint('75+')).toBe(98);
  });
});
