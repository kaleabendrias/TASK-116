import type { QuietHours } from '@shared/utils/clock';
import { validateWeights } from '@domain/grading/scoring';
import raw from '../../../config/business.json';

export interface BusinessConfig {
  language: 'en';
  quietHours: QuietHours;
  messaging: { ratePerMinute: number; maxAttempts: number; retryBackoffMs: number };
  grading: {
    partialIncrement: number;
    secondReviewDelta: number;
    weights: Record<string, number>;
  };
  questions: { minDifficulty: number; maxDifficulty: number; minScore: number; maxScore: number };
  departments: string[];
  knowledgePoints: string[];
  messageTemplates: { id: string; name: string; category: string; subject: string; body: string }[];
  messageCategories: string[];
  foods: { id: string; name: string; category: string; calories: number; tags: string[]; allergens: string[] }[];
  foodEquivalents: Record<string, string>;
}

const config = raw as unknown as BusinessConfig;

// Fail fast if the deployment ships an incomplete weights map.
validateWeights(config.grading.weights);

export function businessConfig(): BusinessConfig {
  return config;
}
