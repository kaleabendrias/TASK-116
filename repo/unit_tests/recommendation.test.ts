import { describe, it, expect } from 'vitest';
import { recommendFoods, findEquivalent, type FoodItem } from '@domain/health/recommendation';
import type { DietaryPreferences } from '@domain/health/healthProfile';

const foods: FoodItem[] = [
  { id: 'oat', name: 'Oat', category: 'grain', calories: 150, tags: ['whole-grain','high-fiber'], allergens: [] },
  { id: 'yogurt', name: 'Yogurt', category: 'dairy', calories: 120, tags: ['high-protein'], allergens: ['dairy'] },
  { id: 'soy', name: 'Soy Yogurt', category: 'dairy-alt', calories: 110, tags: ['high-protein','dairy-free'], allergens: ['soy'] },
  { id: 'bagel', name: 'Bagel', category: 'grain', calories: 280, tags: ['refined-grain','high-sodium'], allergens: ['gluten'] },
  { id: 'feast', name: 'Family Feast', category: 'meal', calories: 900, tags: [], allergens: [] },
  { id: 'salt-snack', name: 'Salt Snack', category: 'snack', calories: 300, tags: ['high-sodium'], allergens: [] }
];
const equivalents: Record<string, string> = { bagel: 'oat', yogurt: 'soy' };

describe('recommendFoods', () => {
  it('filters allergens and dislikes, scores by goals, attaches reasons', () => {
    const prefs: DietaryPreferences = {
      goals: ['high-protein','whole-grain','weight-loss','dairy-free','low-sodium'],
      allergens: ['dairy'],
      dislikes: ['salt-snack'],
      ageRange: '30-44', activityLevel: 'moderate'
    };
    const result = recommendFoods(prefs, foods, equivalents);
    const ids = result.items.map((r) => r.food.id);
    expect(ids).not.toContain('yogurt');
    expect(ids).not.toContain('salt-snack');
    expect(ids).toContain('soy');
    expect(ids).toContain('oat');
    expect(result.budget).not.toBeNull();
    const oat = result.items.find((r) => r.food.id === 'oat')!;
    expect(oat.reasons.length).toBeGreaterThan(0);
    expect(oat.swap).toBeNull();
  });

  it('sorts highest-scoring items first', () => {
    const prefs: DietaryPreferences = {
      goals: ['high-protein','whole-grain'], allergens: [], dislikes: [],
      ageRange: null, activityLevel: null
    };
    const result = recommendFoods(prefs, foods, equivalents);
    expect(result.items[0].score).toBeGreaterThanOrEqual(result.items[result.items.length - 1].score);
    expect(result.budget).toBeNull();
  });

  it('returns at least one fallback reason for items with no goal hits', () => {
    const prefs: DietaryPreferences = { goals: [], allergens: [], dislikes: [], ageRange: null, activityLevel: null };
    const result = recommendFoods(prefs, foods, equivalents);
    for (const r of result.items) expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('penalises items that exceed the per-meal calorie cap when a budget is set', () => {
    const prefs: DietaryPreferences = {
      goals: ['weight-loss'], allergens: [], dislikes: [],
      ageRange: '30-44', activityLevel: 'moderate'
    };
    const result = recommendFoods(prefs, foods, equivalents);
    const feast = result.items.find((r) => r.food.id === 'feast');
    expect(feast?.reasons.some((r) => /per-meal calorie cap/i.test(r))).toBe(true);
    const oat = result.items.find((r) => r.food.id === 'oat');
    expect(oat?.reasons.some((r) => /budget/i.test(r))).toBe(true);
  });
});

describe('age-range policy nudges', () => {
  it('applies a low-sodium nudge for older brackets (60-74, 75+) on non-high-sodium foods', () => {
    const oldPrefs: DietaryPreferences = {
      goals: [], allergens: [], dislikes: [],
      ageRange: '75+', activityLevel: 'moderate'
    };
    const result = recommendFoods(oldPrefs, foods, equivalents);
    const oat = result.items.find((r) => r.food.id === 'oat')!;
    expect(oat.reasons.some((r) => /Age-appropriate \(75\+\)/.test(r))).toBe(true);
    const salty = result.items.find((r) => r.food.id === 'salt-snack');
    expect(salty?.reasons.some((r) => /Age-appropriate/.test(r))).toBeFalsy();
  });

  it('applies a protein-forward nudge for younger brackets on high-protein foods', () => {
    const youngPrefs: DietaryPreferences = {
      goals: [], allergens: [], dislikes: [],
      ageRange: '18-29', activityLevel: 'moderate'
    };
    const result = recommendFoods(youngPrefs, foods, equivalents);
    const soy = result.items.find((r) => r.food.id === 'soy')!;
    expect(soy.reasons.some((r) => /Age-appropriate \(18-29\)/.test(r))).toBe(true);
  });

  it('applies no age nudge when ageRange is null', () => {
    const prefs: DietaryPreferences = { goals: [], allergens: [], dislikes: [], ageRange: null, activityLevel: null };
    const result = recommendFoods(prefs, foods, equivalents);
    for (const r of result.items) {
      expect(r.reasons.some((s) => /Age-appropriate/.test(s))).toBeFalsy();
    }
  });
});

describe('findEquivalent', () => {
  it('returns the swap when defined', () => {
    expect(findEquivalent('bagel', foods, equivalents)?.id).toBe('oat');
  });
  it('returns null when undefined', () => {
    expect(findEquivalent('oat', foods, equivalents)).toBeNull();
  });
  it('returns null when swap id not in catalog', () => {
    expect(findEquivalent('bagel', foods, { bagel: 'unknown' })).toBeNull();
  });
});
