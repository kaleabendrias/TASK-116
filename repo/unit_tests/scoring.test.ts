import { describe, it, expect } from 'vitest';
import {
  autoScore, roundToHalf, isValidPartialScore, applyTypeWeight,
  totalWeighted, requiresSecondReview, type AttemptAnswer
} from '@domain/grading/scoring';
import type { Question } from '@domain/questions/question';

function baseQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1', type: 'single_choice', prompt: 'p', choices: [], correctChoiceIds: [],
    correctNumeric: null, numericTolerance: 0,
    acceptedAnswers: [], caseSensitive: false,
    difficulty: 1, maxScore: 10,
    explanation: '', tags: [], knowledgePoints: [], applicableDepartments: [],
    status: 'active', createdAt: 0, updatedAt: 0, deletedAt: null, ...overrides
  };
}

describe('roundToHalf', () => {
  it('rounds to nearest 0.5', () => {
    expect(roundToHalf(0.24)).toBe(0);
    expect(roundToHalf(0.25)).toBe(0.5);
    expect(roundToHalf(0.74)).toBe(0.5);
    expect(roundToHalf(0.75)).toBe(1);
    expect(roundToHalf(7.3)).toBe(7.5);
  });
});

describe('isValidPartialScore', () => {
  it('accepts only multiples of 0.5 within bounds', () => {
    expect(isValidPartialScore(0, 10)).toBe(true);
    expect(isValidPartialScore(0.5, 10)).toBe(true);
    expect(isValidPartialScore(10, 10)).toBe(true);
    expect(isValidPartialScore(3.5, 10)).toBe(true);
    expect(isValidPartialScore(3.25, 10)).toBe(false);
    expect(isValidPartialScore(-0.5, 10)).toBe(false);
    expect(isValidPartialScore(11, 10)).toBe(false);
    expect(isValidPartialScore(NaN, 10)).toBe(false);
  });
});

describe('autoScore', () => {
  it('scores single_choice all-or-nothing', () => {
    const q = baseQuestion({
      type: 'single_choice',
      choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      correctChoiceIds: ['a'], maxScore: 10
    });
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['a'] }).rawScore).toBe(10);
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['b'] }).rawScore).toBe(0);
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['a','b'] }).rawScore).toBe(0);
    expect(autoScore(q, { questionId: 'q1' }).rawScore).toBe(0);
  });

  it('scores multi_choice with hits/wrong partial credit on 0.5 grid', () => {
    const q = baseQuestion({
      type: 'multi_choice',
      choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }],
      correctChoiceIds: ['a','b','c'], maxScore: 10
    });
    // All correct → full
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['a','b','c'] })).toMatchObject({ rawScore: 10, isCorrect: true });
    // 2/3 correct, 0 wrong → 2/3 * 10 = 6.66 → 6.5 on grid
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['a','b'] }).rawScore).toBe(6.5);
    // 2 correct + 1 wrong → (2-1)/3 * 10 = 3.33 → 3.5
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['a','b','d'] }).rawScore).toBe(3.5);
    // All wrong → 0 (clamped)
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['d'] }).rawScore).toBe(0);
    // Empty
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: [] }).rawScore).toBe(0);
  });

  it('scores numeric with tolerance', () => {
    const q = baseQuestion({ type: 'numeric', correctNumeric: 5, numericTolerance: 0.5, maxScore: 10 });
    expect(autoScore(q, { questionId: 'q1', numericAnswer: 5 }).rawScore).toBe(10);
    expect(autoScore(q, { questionId: 'q1', numericAnswer: 5.5 }).rawScore).toBe(10);
    expect(autoScore(q, { questionId: 'q1', numericAnswer: 6 }).rawScore).toBe(0);
    expect(autoScore(q, { questionId: 'q1' }).rawScore).toBe(0);
  });

  it('numeric with null correct value scores zero', () => {
    const q = baseQuestion({ type: 'numeric', correctNumeric: null });
    expect(autoScore(q, { questionId: 'q1', numericAnswer: 5 }).rawScore).toBe(0);
  });

  it('short_answer questions are flagged for manual review with raw 0', () => {
    const q = baseQuestion({ type: 'short_answer' });
    const r = autoScore(q, { questionId: 'q1', textAnswer: 'hi' } as AttemptAnswer);
    expect(r.manualReviewRequired).toBe(true);
    expect(r.rawScore).toBe(0);
  });

  it('true_false scores all-or-nothing using stable choice ids', () => {
    const q = baseQuestion({
      type: 'true_false',
      choices: [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }],
      correctChoiceIds: ['true'], maxScore: 10
    });
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['true'] }).rawScore).toBe(10);
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: ['false'] }).rawScore).toBe(0);
    expect(autoScore(q, { questionId: 'q1', selectedChoiceIds: [] }).rawScore).toBe(0);
  });

  it('fill_in_blank matches accepted answers (case-insensitive by default)', () => {
    const q = baseQuestion({
      type: 'fill_in_blank',
      acceptedAnswers: ['Paris', 'paris cedex'],
      caseSensitive: false,
      maxScore: 10
    });
    expect(autoScore(q, { questionId: 'q1', fillAnswer: 'paris' }).rawScore).toBe(10);
    expect(autoScore(q, { questionId: 'q1', fillAnswer: '  PARIS  ' }).rawScore).toBe(10);
    expect(autoScore(q, { questionId: 'q1', fillAnswer: 'london' }).rawScore).toBe(0);
    expect(autoScore(q, { questionId: 'q1' }).rawScore).toBe(0);
    expect(autoScore(q, { questionId: 'q1', fillAnswer: '   ' }).rawScore).toBe(0);
  });

  it('fill_in_blank case-sensitive variant compares verbatim', () => {
    const q = baseQuestion({
      type: 'fill_in_blank',
      acceptedAnswers: ['Paris'],
      caseSensitive: true,
      maxScore: 10
    });
    expect(autoScore(q, { questionId: 'q1', fillAnswer: 'Paris' }).rawScore).toBe(10);
    expect(autoScore(q, { questionId: 'q1', fillAnswer: 'paris' }).rawScore).toBe(0);
  });
});

describe('applyTypeWeight + totalWeighted', () => {
  const FULL_WEIGHTS = {
    single_choice: 1, multi_choice: 1.2, numeric: 1, short_answer:1.5,
    true_false: 0.8, fill_in_blank: 1.1
  };

  it('applies type weights and rounds to 0.5', () => {
    expect(applyTypeWeight(10, 'multi_choice', FULL_WEIGHTS)).toBe(12);
    expect(applyTypeWeight(8, 'short_answer', FULL_WEIGHTS)).toBe(12);
    expect(applyTypeWeight(7, 'single_choice', FULL_WEIGHTS)).toBe(7);
    expect(applyTypeWeight(10, 'true_false', FULL_WEIGHTS)).toBe(8);
    expect(applyTypeWeight(10, 'fill_in_blank', FULL_WEIGHTS)).toBe(11);
  });

  it('throws on a missing weight (no silent fallback)', () => {
    expect(() => applyTypeWeight(7, 'numeric', {})).toThrow(/Missing or invalid weight/);
    expect(() => applyTypeWeight(7, 'short_answer', { short_answer:NaN })).toThrow(/Missing or invalid weight/);
  });

  it('totalWeighted sums weighted scores and maxes', () => {
    const result = totalWeighted([
      { score: 10, max: 10, type: 'single_choice' },
      { score: 5, max: 10, type: 'multi_choice' },
      { score: 8, max: 10, type: 'short_answer' }
    ], FULL_WEIGHTS);
    expect(result.total).toBe(28);     // 10 + 6 + 12
    expect(result.maxTotal).toBe(37);  // 10 + 12 + 15
  });
});

describe('validateWeights', () => {
  it('passes when every question type has a finite weight', async () => {
    const { validateWeights } = await import('@domain/grading/scoring');
    expect(() => validateWeights({
      single_choice: 1, multi_choice: 1, numeric: 1, short_answer:1, true_false: 1, fill_in_blank: 1
    })).not.toThrow();
  });
  it('throws on any missing weight', async () => {
    const { validateWeights } = await import('@domain/grading/scoring');
    expect(() => validateWeights({ single_choice: 1 } as Record<string, number>)).toThrow();
  });
});

describe('requiresSecondReview', () => {
  it('flags only when delta exceeds threshold', () => {
    expect(requiresSecondReview(10, 20, 10)).toBe(false); // exactly 10 → no
    expect(requiresSecondReview(10, 21, 10)).toBe(true);
    expect(requiresSecondReview(50, 30, 10)).toBe(true);
    expect(requiresSecondReview(50, 50, 10)).toBe(false);
  });
});

describe('gateNeedsSecondReview', () => {
  it('forces a second review when there is no auto baseline (manual-only question)', async () => {
    const { gateNeedsSecondReview } = await import('@domain/grading/scoring');
    expect(gateNeedsSecondReview(73.5, null, 10)).toBe(true);
    expect(gateNeedsSecondReview(0, null, 10)).toBe(true);
  });

  it('forces a second review when |firstScore - baseline| exceeds the threshold', async () => {
    const { gateNeedsSecondReview } = await import('@domain/grading/scoring');
    expect(gateNeedsSecondReview(80, 60, 10)).toBe(true);  // delta 20
    expect(gateNeedsSecondReview(60, 80, 10)).toBe(true);  // delta 20 (other direction)
    expect(gateNeedsSecondReview(70.5, 60, 10)).toBe(true); // delta 10.5
  });

  it('allows terminal closure when delta is within threshold', async () => {
    const { gateNeedsSecondReview } = await import('@domain/grading/scoring');
    expect(gateNeedsSecondReview(70, 60, 10)).toBe(false); // exactly 10 — boundary OK
    expect(gateNeedsSecondReview(60, 60, 10)).toBe(false);
  });

  it('treats a non-finite baseline as "no baseline"', async () => {
    const { gateNeedsSecondReview } = await import('@domain/grading/scoring');
    expect(gateNeedsSecondReview(50, NaN, 10)).toBe(true);
    expect(gateNeedsSecondReview(50, Infinity, 10)).toBe(true);
  });
});

describe('assertGradeStateInvariant', () => {
  const baseShape = {
    state: 'PENDING_SECOND_REVIEW' as const,
    firstScore: 80,
    secondScore: null as number | null,
    graderId: 'g1',
    secondGraderId: null as string | null,
    finalScore: null as number | null,
    awaitingSecondReview: true
  };

  it('accepts a well-formed PENDING_SECOND_REVIEW grade', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({ ...baseShape })).not.toThrow();
  });

  it('rejects PENDING with a non-null finalScore (terminal closure attempted before gate satisfied)', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({ ...baseShape, finalScore: 100 }))
      .toThrow(/PENDING_SECOND_REVIEW must have null finalScore/);
  });

  it('rejects PENDING with a second grader already attached', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({ ...baseShape, secondGraderId: 'g2' }))
      .toThrow(/null secondScore\/secondGraderId/);
  });

  it('rejects PENDING with awaitingSecondReview=false (mirror desync)', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({ ...baseShape, awaitingSecondReview: false }))
      .toThrow(/awaitingSecondReview=true/);
  });

  it('accepts a well-formed COMPLETED grade with two reviewers', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({
      state: 'COMPLETED', firstScore: 80, secondScore: 78, graderId: 'g1',
      secondGraderId: 'g2', finalScore: 79, awaitingSecondReview: false
    })).not.toThrow();
  });

  it('rejects COMPLETED with null finalScore', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({
      state: 'COMPLETED', firstScore: 80, secondScore: 78, graderId: 'g1',
      secondGraderId: 'g2', finalScore: null, awaitingSecondReview: false
    })).toThrow(/finite finalScore/);
  });

  it('rejects COMPLETED whose second reviewer matches the first', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({
      state: 'COMPLETED', firstScore: 80, secondScore: 78, graderId: 'g1',
      secondGraderId: 'g1', finalScore: 79, awaitingSecondReview: false
    })).toThrow(/differ from graderId/);
  });

  it('rejects COMPLETED with awaitingSecondReview=true (mirror desync)', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({
      state: 'COMPLETED', firstScore: 80, secondScore: 78, graderId: 'g1',
      secondGraderId: 'g2', finalScore: 79, awaitingSecondReview: true
    })).toThrow(/awaitingSecondReview=false/);
  });

  it('rejects COMPLETED with second reviewer set but missing secondGraderId', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({
      state: 'COMPLETED', firstScore: 80, secondScore: 78, graderId: 'g1',
      secondGraderId: null, finalScore: 79, awaitingSecondReview: false
    })).toThrow(/secondGraderId/);
  });

  it('rejects COMPLETED with non-finite secondScore', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    expect(() => assertGradeStateInvariant({
      state: 'COMPLETED', firstScore: 80, secondScore: NaN, graderId: 'g1',
      secondGraderId: 'g2', finalScore: 79, awaitingSecondReview: false
    })).toThrow(/finite number/);
  });

  it('accepts a single-reviewer COMPLETED short-circuit (auto-baseline agreement)', async () => {
    const { assertGradeStateInvariant } = await import('@domain/grading/scoring');
    // When the first review agrees with the auto baseline within the
    // threshold the grade legitimately short-circuits to COMPLETED with no
    // secondScore/secondGraderId.
    expect(() => assertGradeStateInvariant({
      state: 'COMPLETED', firstScore: 70, secondScore: null, graderId: 'g1',
      secondGraderId: null, finalScore: 70, awaitingSecondReview: false
    })).not.toThrow();
  });
});
