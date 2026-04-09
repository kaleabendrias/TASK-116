import type { Question, QuestionType } from '@domain/questions/question';

/** Every question type the scoring pipeline knows how to handle. */
export const ALL_QUESTION_TYPES: readonly QuestionType[] = [
  'single_choice', 'multi_choice', 'numeric', 'short_answer', 'true_false', 'fill_in_blank'
];

/**
 * Validate that a weights map covers every question type. Throws on the
 * first missing key — used by the business config loader to fail fast
 * rather than relying on silent fallbacks downstream.
 */
export function validateWeights(weights: Record<string, number>): void {
  for (const t of ALL_QUESTION_TYPES) {
    if (typeof weights[t] !== 'number' || !Number.isFinite(weights[t])) {
      throw new Error(`Missing or invalid weight for question type '${t}'`);
    }
  }
}

export interface AttemptAnswer {
  questionId: string;
  selectedChoiceIds?: string[];
  numericAnswer?: number;
  textAnswer?: string;
  fillAnswer?: string;
}

function normalize(s: string, caseSensitive: boolean): string {
  const trimmed = s.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

export interface AutoScoreResult {
  questionId: string;
  rawScore: number;        // 0..maxScore
  isCorrect: boolean;
  manualReviewRequired: boolean;
}

export function autoScore(question: Question, answer: AttemptAnswer): AutoScoreResult {
  const max = question.maxScore;
  switch (question.type) {
    case 'single_choice':
    case 'true_false': {
      const selected = answer.selectedChoiceIds ?? [];
      const correct = selected.length === 1 && question.correctChoiceIds.includes(selected[0]);
      return { questionId: question.id, rawScore: correct ? max : 0, isCorrect: correct, manualReviewRequired: false };
    }
    case 'fill_in_blank': {
      const supplied = answer.fillAnswer;
      if (typeof supplied !== 'string' || supplied.trim().length === 0) {
        return { questionId: question.id, rawScore: 0, isCorrect: false, manualReviewRequired: false };
      }
      const candidate = normalize(supplied, question.caseSensitive);
      const accepted = question.acceptedAnswers.map((a) => normalize(a, question.caseSensitive));
      const hit = accepted.includes(candidate);
      return { questionId: question.id, rawScore: hit ? max : 0, isCorrect: hit, manualReviewRequired: false };
    }
    case 'multi_choice': {
      const selected = new Set(answer.selectedChoiceIds ?? []);
      const correct = new Set(question.correctChoiceIds);
      // Partial credit: fraction of correct picked minus penalty for wrong picks, clamped.
      let hits = 0; let wrong = 0;
      for (const id of selected) (correct.has(id) ? hits++ : wrong++);
      const total = correct.size;
      const ratio = Math.max(0, (hits - wrong) / total);
      const raw = roundToIncrement(ratio * max, 0.5);
      return { questionId: question.id, rawScore: raw, isCorrect: hits === total && wrong === 0, manualReviewRequired: false };
    }
    case 'numeric': {
      const val = answer.numericAnswer;
      if (val === undefined || val === null || !Number.isFinite(val) || question.correctNumeric === null) {
        return { questionId: question.id, rawScore: 0, isCorrect: false, manualReviewRequired: false };
      }
      const within = Math.abs(val - question.correctNumeric) <= question.numericTolerance;
      return { questionId: question.id, rawScore: within ? max : 0, isCorrect: within, manualReviewRequired: false };
    }
    case 'short_answer':
      return { questionId: question.id, rawScore: 0, isCorrect: false, manualReviewRequired: true };
  }
}

/** Round to nearest configured increment (default 0.5 — half-up). */
export function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/** Backwards-compatible 0.5-grid alias for callers that don't need configurability. */
export function roundToHalf(value: number): number {
  return roundToIncrement(value, 0.5);
}

/** Validate a manual grade increment is on the configured grid and within bounds. */
export function isValidPartialScore(score: number, max: number, increment = 0.5): boolean {
  if (!Number.isFinite(score)) return false;
  if (score < 0 || score > max) return false;
  if (!Number.isFinite(increment) || increment <= 0) return true;
  const ratio = score / increment;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

/**
 * Apply the configured type weight. The map MUST contain a finite weight for
 * the supplied type — silent fallbacks are forbidden so that misconfigured
 * deployments fail loudly instead of producing distorted scores.
 */
export function applyTypeWeight(
  score: number,
  type: QuestionType,
  weights: Record<string, number>,
  increment = 0.5
): number {
  const w = weights[type];
  if (typeof w !== 'number' || !Number.isFinite(w)) {
    throw new Error(`Missing or invalid weight for question type '${type}'`);
  }
  return roundToIncrement(score * w, increment);
}

export interface WeightedTotal {
  total: number;
  maxTotal: number;
}

export function totalWeighted(
  results: { score: number; max: number; type: QuestionType }[],
  weights: Record<string, number>
): WeightedTotal {
  let total = 0;
  let maxTotal = 0;
  for (const r of results) {
    total += applyTypeWeight(r.score, r.type, weights);
    maxTotal += applyTypeWeight(r.max, r.type, weights);
  }
  return { total: roundToHalf(total), maxTotal: roundToHalf(maxTotal) };
}

export function requiresSecondReview(firstScore: number, secondScore: number, deltaThreshold: number): boolean {
  return Math.abs(firstScore - secondScore) > deltaThreshold;
}

/**
 * Centralized "needs a second review?" gate. The reference baseline is the
 * auto-graded score for objective question types and is `null` for purely
 * manual types (no auto baseline at all). Manual-only questions ALWAYS
 * require a second review — there is no auto baseline to compare against.
 * Otherwise, the reviewer's first-pass score must agree with the auto
 * baseline within `deltaThreshold` points; any score whose absolute delta
 * exceeds the threshold (default 10) MUST transition the grade into
 * `PENDING_SECOND_REVIEW` and must NOT be allowed to terminally close.
 */
export function gateNeedsSecondReview(
  firstScore: number,
  baseline: number | null,
  deltaThreshold: number
): boolean {
  if (baseline === null || !Number.isFinite(baseline)) return true;
  return requiresSecondReview(firstScore, baseline, deltaThreshold);
}

/**
 * Workflow invariant assertion. Acts as a final, schema-level check before a
 * grade is persisted. Enforces:
 *
 *   PENDING_SECOND_REVIEW
 *     - finalScore        === null   (no terminal closure yet)
 *     - secondScore       === null
 *     - secondGraderId    === null
 *     - awaitingSecondReview === true
 *
 *   COMPLETED
 *     - finalScore        !== null   (finite number — terminal closure)
 *     - awaitingSecondReview === false
 *     - if a second review was performed (secondScore !== null) then
 *       secondGraderId must be present and must differ from graderId.
 *
 * Any other shape is a corrupt half-state and is rejected — this prevents a
 * caller (or a future refactor) from accidentally writing a grade that
 * advertises COMPLETED while still missing the required gate fields.
 */
export interface GradeShape {
  state: 'PENDING_SECOND_REVIEW' | 'COMPLETED';
  firstScore: number;
  secondScore: number | null;
  graderId: string;
  secondGraderId: string | null;
  finalScore: number | null;
  awaitingSecondReview: boolean;
}

export function assertGradeStateInvariant(g: GradeShape): void {
  if (g.state === 'PENDING_SECOND_REVIEW') {
    if (g.finalScore !== null) {
      throw new Error('State invariant: PENDING_SECOND_REVIEW must have null finalScore');
    }
    if (g.secondScore !== null || g.secondGraderId !== null) {
      throw new Error('State invariant: PENDING_SECOND_REVIEW must have null secondScore/secondGraderId');
    }
    if (g.awaitingSecondReview !== true) {
      throw new Error('State invariant: PENDING_SECOND_REVIEW must have awaitingSecondReview=true');
    }
    return;
  }
  // COMPLETED
  if (g.finalScore === null || !Number.isFinite(g.finalScore)) {
    throw new Error('State invariant: COMPLETED must have a finite finalScore');
  }
  if (g.awaitingSecondReview !== false) {
    throw new Error('State invariant: COMPLETED must have awaitingSecondReview=false');
  }
  if (g.secondScore !== null) {
    if (!g.secondGraderId) {
      throw new Error('State invariant: COMPLETED with a secondScore must record a secondGraderId');
    }
    if (g.secondGraderId === g.graderId) {
      throw new Error('State invariant: secondGraderId must differ from graderId');
    }
    if (!Number.isFinite(g.secondScore)) {
      throw new Error('State invariant: COMPLETED secondScore must be a finite number');
    }
  }
}
