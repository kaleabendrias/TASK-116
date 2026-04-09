import type { EncryptedField } from '@shared/crypto/fieldCrypto';

export interface HealthProfile {
  id: string;        // user id
  userId: string;
  /** Encrypted JSON blob containing dietary preferences, allergens, goals, age, activity. */
  encryptedPreferences: EncryptedField | null;
  updatedAt: number;
}

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

/**
 * Age is captured as a coarse bracket rather than a single integer. The
 * Wellness module's recommendations and budgets are policy-level decisions
 * that should not depend on the user's exact age — and storing a single
 * year is also a privacy footgun. The bracket enum below is the
 * authoritative taxonomy; the AGE_BRACKETS lookup expands each enum into
 * an explicit min/max year span used by downstream calculators.
 */
export type AgeRange =
  | '0-17'
  | '18-29'
  | '30-44'
  | '45-59'
  | '60-74'
  | '75+';

export const AGE_RANGES: AgeRange[] = ['0-17', '18-29', '30-44', '45-59', '60-74', '75+'];

export interface AgeBracket {
  min: number;
  max: number;
}

export const AGE_BRACKETS: Record<AgeRange, AgeBracket> = {
  '0-17':  { min: 0,  max: 17  },
  '18-29': { min: 18, max: 29  },
  '30-44': { min: 30, max: 44  },
  '45-59': { min: 45, max: 59  },
  '60-74': { min: 60, max: 74  },
  '75+':   { min: 75, max: 120 }
};

export function isAgeRange(value: unknown): value is AgeRange {
  return typeof value === 'string' && (AGE_RANGES as readonly string[]).includes(value);
}

/**
 * Coerce an arbitrary value (e.g. a stale persisted profile that still
 * carries an integer `age` field, or an unknown bracket from an old
 * deployment) into a strict AgeRange enum or null.
 */
export function normalizeAgeRange(value: unknown): AgeRange | null {
  return isAgeRange(value) ? value : null;
}

/**
 * Pick the midpoint year of a bracket — the representative age used by the
 * deterministic nutrition budget calculator. This keeps the same budget
 * across every member of the bracket so the calculator stays a function of
 * coarse policy inputs only.
 */
export function ageBracketMidpoint(range: AgeRange): number {
  const b = AGE_BRACKETS[range];
  return Math.round((b.min + b.max) / 2);
}

export interface DietaryPreferences {
  goals: ('weight-loss' | 'high-protein' | 'low-sodium' | 'whole-grain' | 'dairy-free')[];
  allergens: string[];
  dislikes: string[];
  ageRange: AgeRange | null;
  activityLevel: ActivityLevel | null;
}

export const EMPTY_PREFS: DietaryPreferences = {
  goals: [],
  allergens: [],
  dislikes: [],
  ageRange: null,
  activityLevel: null
};
