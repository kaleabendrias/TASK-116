import type { DietaryPreferences, AgeRange } from './healthProfile';
import { normalizeAgeRange } from './healthProfile';
import { calculateNutritionBudget, type NutritionBudget } from './nutrition';

/**
 * Coarse age-bracket policy nudges. Older brackets get a small bonus for
 * lower-sodium / whole-grain choices to reflect the broader Wellness
 * policy scope. Younger brackets get a small bonus for high-protein.
 * These are deterministic, declarative tweaks — they do NOT depend on a
 * single integer age, so the recommendation pipeline stays a function of
 * coarse policy inputs only.
 */
function ageRangeBonuses(range: AgeRange | null, foodTags: string[]): { delta: number; reason: string | null } {
  if (range === null) return { delta: 0, reason: null };
  if ((range === '60-74' || range === '75+') && !foodTags.includes('high-sodium')) {
    return { delta: 0.5, reason: `Age-appropriate (${range}): lower-sodium friendly` };
  }
  if ((range === '18-29' || range === '30-44') && foodTags.includes('high-protein')) {
    return { delta: 0.5, reason: `Age-appropriate (${range}): protein-forward` };
  }
  return { delta: 0, reason: null };
}

export interface FoodItem {
  id: string;
  name: string;
  category: string;
  calories: number;
  tags: string[];
  allergens: string[];
}

export interface Recommendation {
  food: FoodItem;
  score: number;
  reasons: string[];
  swap: FoodItem | null;
}

export interface RecommendationResult {
  budget: NutritionBudget | null;
  items: Recommendation[];
}

export function recommendFoods(
  prefs: DietaryPreferences,
  foods: FoodItem[],
  equivalents: Record<string, string>
): RecommendationResult {
  const budget = calculateNutritionBudget(prefs);
  const calorieCap = budget ? Math.round(budget.calories / 4) : Infinity; // ~per-meal cap
  const safe = foods.filter((f) => !f.allergens.some((a) => prefs.allergens.includes(a)) && !prefs.dislikes.includes(f.id));
  const ageRange = normalizeAgeRange(prefs.ageRange);
  const items: Recommendation[] = [];
  for (const f of safe) {
    const reasons: string[] = [];
    let score = 0;
    if (prefs.goals.includes('high-protein') && f.tags.includes('high-protein')) {
      score += 2; reasons.push('Aligns with your high-protein goal');
    }
    if (prefs.goals.includes('whole-grain') && f.tags.includes('whole-grain')) {
      score += 2; reasons.push('Whole-grain choice');
    }
    if (prefs.goals.includes('weight-loss') && f.calories <= 200) {
      score += 1; reasons.push(`Lower calorie option (${f.calories} kcal)`);
    }
    if (prefs.goals.includes('dairy-free') && !f.allergens.includes('dairy')) {
      score += 1; reasons.push('Dairy-free');
    }
    if (prefs.goals.includes('low-sodium') && !f.tags.includes('high-sodium')) {
      score += 0.5;
    }
    const ageNudge = ageRangeBonuses(ageRange, f.tags);
    if (ageNudge.delta > 0) {
      score += ageNudge.delta;
      if (ageNudge.reason) reasons.push(ageNudge.reason);
    }
    if (budget && f.calories > calorieCap) {
      score -= 1; reasons.push(`Exceeds your per-meal calorie cap (~${calorieCap} kcal)`);
    } else if (budget) {
      reasons.push(`Fits within your daily ${budget.calories} kcal budget`);
    }
    if (reasons.length === 0) reasons.push('Within your dietary constraints');
    const swapId = equivalents[f.id];
    const swap = swapId ? foods.find((x) => x.id === swapId) ?? null : null;
    items.push({ food: f, score, reasons, swap });
  }
  items.sort((a, b) => b.score - a.score);
  return { budget, items };
}

export function findEquivalent(foodId: string, foods: FoodItem[], equivalents: Record<string, string>): FoodItem | null {
  const swapId = equivalents[foodId];
  if (!swapId) return null;
  return foods.find((f) => f.id === swapId) ?? null;
}
