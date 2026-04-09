import { describe, it, expect } from 'vitest';
import {
  validateQuestion, isObjective, applyPatch, copy, deactivate, activate, softDelete, restore,
  trueFalseTemplate
} from '@domain/questions/questionRules';
import type { NewQuestionInput, Question } from '@domain/questions/question';
import { TRUE_FALSE_CHOICES } from '@domain/questions/question';

const limits = { minDifficulty: 1, maxDifficulty: 5, minScore: 0, maxScore: 100 };

function valid(): NewQuestionInput {
  return {
    type: 'single_choice',
    prompt: 'What?',
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    correctChoiceIds: ['a'],
    correctNumeric: null,
    numericTolerance: 0,
    acceptedAnswers: [],
    caseSensitive: false,
    difficulty: 3,
    maxScore: 10,
    explanation: 'because',
    tags: ['t1'],
    knowledgePoints: ['safety'],
    applicableDepartments: ['Genomics']
  };
}

function asQuestion(input: NewQuestionInput): Question {
  return {
    ...input, id: 'q1', status: 'active', createdAt: 1, updatedAt: 1, deletedAt: null
  };
}

describe('validateQuestion', () => {
  it('accepts a valid single-choice question', () => {
    expect(validateQuestion(valid(), limits)).toEqual({ ok: true });
  });

  it('rejects empty prompt', () => {
    const r = validateQuestion({ ...valid(), prompt: '   ' }, limits);
    expect(r.ok).toBe(false);
  });

  it('rejects out-of-range difficulty and score', () => {
    expect(validateQuestion({ ...valid(), difficulty: 0 as 1 }, limits).ok).toBe(false);
    expect(validateQuestion({ ...valid(), difficulty: 6 as 5 }, limits).ok).toBe(false);
    expect(validateQuestion({ ...valid(), maxScore: -1 }, limits).ok).toBe(false);
    expect(validateQuestion({ ...valid(), maxScore: 101 }, limits).ok).toBe(false);
  });

  it('requires at least two choices and one correct for choice questions', () => {
    expect(validateQuestion({ ...valid(), choices: [{ id: 'a', label: 'A' }] }, limits).ok).toBe(false);
    expect(validateQuestion({ ...valid(), correctChoiceIds: [] }, limits).ok).toBe(false);
  });

  it('single_choice must have exactly one correct id', () => {
    const r = validateQuestion({ ...valid(), correctChoiceIds: ['a','b'] }, limits);
    expect(r.ok).toBe(false);
  });

  it('correct ids must reference choices', () => {
    const r = validateQuestion({ ...valid(), correctChoiceIds: ['z'] }, limits);
    expect(r.ok).toBe(false);
  });

  it('multi_choice accepts multiple correct', () => {
    const r = validateQuestion({ ...valid(), type: 'multi_choice', correctChoiceIds: ['a','b'] }, limits);
    expect(r.ok).toBe(true);
  });

  it('numeric requires correctNumeric and non-negative tolerance', () => {
    expect(validateQuestion({ ...valid(), type: 'numeric', correctNumeric: null }, limits).ok).toBe(false);
    expect(validateQuestion({ ...valid(), type: 'numeric', correctNumeric: 5, numericTolerance: -1 }, limits).ok).toBe(false);
    expect(validateQuestion({ ...valid(), type: 'numeric', correctNumeric: 5, numericTolerance: 0.1 }, limits).ok).toBe(true);
  });

  it('short_answer type ignores choice/numeric checks', () => {
    const r = validateQuestion({
      ...valid(), type: 'short_answer', choices: [], correctChoiceIds: [], correctNumeric: null
    }, limits);
    expect(r.ok).toBe(true);
  });

  it('true_false requires the canonical true/false ids and exactly one correct', () => {
    const ok = validateQuestion({
      ...valid(),
      type: 'true_false',
      choices: TRUE_FALSE_CHOICES.map((c) => ({ ...c })),
      correctChoiceIds: ['true']
    }, limits);
    expect(ok.ok).toBe(true);

    const wrongIds = validateQuestion({
      ...valid(),
      type: 'true_false',
      choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      correctChoiceIds: ['yes']
    }, limits);
    expect(wrongIds.ok).toBe(false);

    const noCorrect = validateQuestion({
      ...valid(),
      type: 'true_false',
      choices: TRUE_FALSE_CHOICES.map((c) => ({ ...c })),
      correctChoiceIds: []
    }, limits);
    expect(noCorrect.ok).toBe(false);
  });

  it('fill_in_blank requires at least one non-empty accepted answer', () => {
    const ok = validateQuestion({
      ...valid(),
      type: 'fill_in_blank',
      acceptedAnswers: ['Paris']
    }, limits);
    expect(ok.ok).toBe(true);

    const empty = validateQuestion({
      ...valid(),
      type: 'fill_in_blank',
      acceptedAnswers: []
    }, limits);
    expect(empty.ok).toBe(false);

    const blank = validateQuestion({
      ...valid(),
      type: 'fill_in_blank',
      acceptedAnswers: ['   ']
    }, limits);
    expect(blank.ok).toBe(false);
  });

  it('trueFalseTemplate returns canonical choices and a default correct answer', () => {
    const t = trueFalseTemplate();
    expect(t.type).toBe('true_false');
    expect(t.choices.map((c) => c.id)).toEqual(['true', 'false']);
    expect(t.correctChoiceIds).toEqual(['true']);
  });
});

describe('isObjective', () => {
  it('classifies types correctly', () => {
    expect(isObjective('single_choice')).toBe(true);
    expect(isObjective('multi_choice')).toBe(true);
    expect(isObjective('numeric')).toBe(true);
    expect(isObjective('true_false')).toBe(true);
    expect(isObjective('fill_in_blank')).toBe(true);
    expect(isObjective('short_answer')).toBe(false);
  });
});

describe('lifecycle helpers', () => {
  const q = asQuestion(valid());
  it('applyPatch merges and bumps updatedAt', () => {
    const updated = applyPatch(q, { prompt: 'new' });
    expect(updated.prompt).toBe('new');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(q.updatedAt);
    expect(updated.id).toBe(q.id);
  });
  it('copy clones with new id and active status', () => {
    const c = copy({ ...q, status: 'inactive' }, 'q2');
    expect(c.id).toBe('q2');
    expect(c.prompt).toMatch(/copy/);
    expect(c.status).toBe('active');
    expect(c.deletedAt).toBeNull();
  });
  it('deactivate / activate flip status', () => {
    expect(deactivate(q).status).toBe('inactive');
    expect(activate({ ...q, status: 'inactive' }).status).toBe('active');
  });
  it('softDelete sets deletedAt + status', () => {
    const d = softDelete(q);
    expect(d.status).toBe('deleted');
    expect(d.deletedAt).not.toBeNull();
  });
  it('restore returns to inactive', () => {
    const r = restore(softDelete(q));
    expect(r.status).toBe('inactive');
    expect(r.deletedAt).toBeNull();
  });
});
