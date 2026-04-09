import type { NewQuestionInput, Question, QuestionPatch, QuestionType } from './question';
import { TRUE_FALSE_CHOICES } from './question';

export interface QuestionLimits {
  minDifficulty: number;
  maxDifficulty: number;
  minScore: number;
  maxScore: number;
}

export function validateQuestion(input: NewQuestionInput, limits: QuestionLimits): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!input.prompt || !input.prompt.trim()) errors.push('Prompt is required');
  if (input.difficulty < limits.minDifficulty || input.difficulty > limits.maxDifficulty) {
    errors.push(`Difficulty must be ${limits.minDifficulty}-${limits.maxDifficulty}`);
  }
  if (input.maxScore < limits.minScore || input.maxScore > limits.maxScore) {
    errors.push(`Score must be ${limits.minScore}-${limits.maxScore}`);
  }
  if (input.type === 'single_choice' || input.type === 'multi_choice') {
    if (input.choices.length < 2) errors.push('Provide at least two choices');
    if (input.correctChoiceIds.length === 0) errors.push('Mark at least one correct choice');
    if (input.type === 'single_choice' && input.correctChoiceIds.length !== 1) {
      errors.push('Single choice must have exactly one correct answer');
    }
    const ids = new Set(input.choices.map((c) => c.id));
    if (input.correctChoiceIds.some((c) => !ids.has(c))) errors.push('Correct ids must reference choices');
  }
  if (input.type === 'true_false') {
    if (input.choices.length !== 2 || input.choices[0].id !== 'true' || input.choices[1].id !== 'false') {
      errors.push('True/false questions must use the canonical true/false choice ids');
    }
    if (input.correctChoiceIds.length !== 1 || (input.correctChoiceIds[0] !== 'true' && input.correctChoiceIds[0] !== 'false')) {
      errors.push('True/false questions need exactly one correct answer (true or false)');
    }
  }
  if (input.type === 'numeric') {
    if (input.correctNumeric === null || !Number.isFinite(input.correctNumeric)) {
      errors.push('Numeric questions need a correct value');
    }
    if (!Number.isFinite(input.numericTolerance) || input.numericTolerance < 0) {
      errors.push('Numeric tolerance must be ≥ 0');
    }
  }
  if (input.type === 'fill_in_blank') {
    if (!input.acceptedAnswers || input.acceptedAnswers.length === 0) {
      errors.push('Fill-in-the-blank requires at least one accepted answer');
    } else if (input.acceptedAnswers.some((a) => !a.trim())) {
      errors.push('Accepted answers must be non-empty');
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Build a fresh true_false question template with canonical choices. */
export function trueFalseTemplate(): Pick<NewQuestionInput, 'type' | 'choices' | 'correctChoiceIds'> {
  return {
    type: 'true_false',
    choices: TRUE_FALSE_CHOICES.map((c) => ({ ...c })),
    correctChoiceIds: ['true']
  };
}

export function isObjective(type: QuestionType): boolean {
  return type !== 'short_answer';
}

export function applyPatch(existing: Question, patch: QuestionPatch): Question {
  return { ...existing, ...patch, id: existing.id, updatedAt: Date.now() };
}

export function copy(existing: Question, newId: string): Question {
  const now = Date.now();
  return {
    ...existing,
    id: newId,
    prompt: `${existing.prompt} (copy)`,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
}

export function deactivate(q: Question): Question {
  return { ...q, status: 'inactive', updatedAt: Date.now() };
}

export function activate(q: Question): Question {
  return { ...q, status: 'active', updatedAt: Date.now() };
}

export function softDelete(q: Question): Question {
  return { ...q, status: 'deleted', deletedAt: Date.now(), updatedAt: Date.now() };
}

export function restore(q: Question): Question {
  return { ...q, status: 'inactive', deletedAt: null, updatedAt: Date.now() };
}
