import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
  createQuestion, editQuestion, copyQuestionById, setActive,
  softDeleteQuestion, restoreQuestion, refreshQuestions, visibleQuestions, showDeleted
} from '@application/services/questionService';
import { register, login, logout } from '@application/services/authService';
import type { NewQuestionInput } from '@domain/questions/question';
import { TRUE_FALSE_CHOICES } from '@domain/questions/question';

function valid(): NewQuestionInput {
  return {
    type: 'single_choice', prompt: 'P?',
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    correctChoiceIds: ['a'],
    correctNumeric: null, numericTolerance: 0,
    acceptedAnswers: [], caseSensitive: false,
    difficulty: 2, maxScore: 10, explanation: '',
    tags: ['t'], knowledgePoints: ['safety'], applicableDepartments: ['Genomics']
  };
}

async function asAuthor(name = 'author'): Promise<void> {
  await register(name, 'longenough', 'content_author');
  await login(name, 'longenough');
}

describe('questionService lifecycle', () => {
  it('rejects writes when not authenticated', async () => {
    await expect(createQuestion(valid())).rejects.toThrow(/not authorized|Authentication/);
  });

  it('rejects refreshQuestions without an active session', async () => {
    await expect(refreshQuestions()).rejects.toThrow(/Authentication|not authorized/);
  });

  it('rejects refreshQuestions for an authenticated but non-author role (dispatcher)', async () => {
    await register('disp-reader', 'longenough', 'dispatcher');
    await login('disp-reader', 'longenough');
    await expect(refreshQuestions()).rejects.toThrow(/not authorized/);
    logout();
  }, 30000);

  it('rejects refreshQuestions for a reviewer role (no question-bank leakage)', async () => {
    await register('rev-reader', 'longenough', 'reviewer');
    await login('rev-reader', 'longenough');
    await expect(refreshQuestions()).rejects.toThrow(/not authorized/);
    logout();
  }, 30000);

  it('rejects writes from a wrong role (dispatcher)', async () => {
    await register('disp', 'longenough', 'dispatcher');
    await login('disp', 'longenough');
    await expect(createQuestion(valid())).rejects.toThrow(/not authorized/);
  }, 30000);

  it('creates and lists', async () => {
    await asAuthor();
    const r = await createQuestion(valid());
    expect(r.ok).toBe(true);
    await refreshQuestions();
    expect(get(visibleQuestions).length).toBe(1);
  }, 30000);

  it('rejects invalid input with errors', async () => {
    await asAuthor();
    const r = await createQuestion({ ...valid(), prompt: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  }, 30000);

  it('edits an existing question and revalidates', async () => {
    await asAuthor();
    const create = await createQuestion(valid());
    if (!create.ok) throw new Error('setup');
    const ok = await editQuestion(create.question.id, { prompt: 'New prompt' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.question.prompt).toBe('New prompt');
    const bad = await editQuestion(create.question.id, { maxScore: 999 });
    expect(bad.ok).toBe(false);
    const missing = await editQuestion('nope', { prompt: 'x' });
    expect(missing.ok).toBe(false);
  }, 30000);

  it('copy creates a new question with copy suffix', async () => {
    await asAuthor();
    const create = await createQuestion(valid());
    if (!create.ok) throw new Error('setup');
    const copy = await copyQuestionById(create.question.id);
    expect(copy?.id).not.toBe(create.question.id);
    expect(copy?.prompt).toMatch(/copy/);
    expect(await copyQuestionById('nope')).toBeNull();
  }, 30000);

  it('deactivate / activate flow', async () => {
    await asAuthor();
    const create = await createQuestion(valid());
    if (!create.ok) throw new Error('setup');
    await setActive(create.question.id, false);
    await refreshQuestions();
    let q = get(visibleQuestions).find((x) => x.id === create.question.id);
    expect(q?.status).toBe('inactive');
    await setActive(create.question.id, true);
    await setActive('nope', true); // no-op
    await refreshQuestions();
    q = get(visibleQuestions).find((x) => x.id === create.question.id);
    expect(q?.status).toBe('active');
  }, 30000);

  it('soft delete + restore', async () => {
    await asAuthor();
    const create = await createQuestion(valid());
    if (!create.ok) throw new Error('setup');
    await softDeleteQuestion(create.question.id);
    await refreshQuestions();
    expect(get(visibleQuestions).find((x) => x.id === create.question.id)).toBeUndefined();
    showDeleted.set(true);
    await refreshQuestions();
    expect(get(visibleQuestions).find((x) => x.id === create.question.id)).toBeTruthy();
    showDeleted.toggle();
    await restoreQuestion(create.question.id);
    await softDeleteQuestion('nope'); // no-op
    await restoreQuestion('nope');    // no-op
    await refreshQuestions();
    const restored = get(visibleQuestions).find((x) => x.id === create.question.id);
    expect(restored?.status).toBe('inactive');
  }, 30000);

  it('supports true/false questions', async () => {
    await asAuthor();
    const r = await createQuestion({
      ...valid(),
      type: 'true_false',
      choices: TRUE_FALSE_CHOICES.map((c) => ({ ...c })),
      correctChoiceIds: ['true']
    });
    expect(r.ok).toBe(true);
    const bad = await createQuestion({
      ...valid(),
      type: 'true_false',
      choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      correctChoiceIds: ['yes']
    });
    expect(bad.ok).toBe(false);
  }, 30000);

  it('supports fill-in-the-blank questions', async () => {
    await asAuthor();
    const r = await createQuestion({
      ...valid(),
      type: 'fill_in_blank',
      acceptedAnswers: ['Paris', 'paris'],
      caseSensitive: false
    });
    expect(r.ok).toBe(true);
    const bad = await createQuestion({
      ...valid(),
      type: 'fill_in_blank',
      acceptedAnswers: []
    });
    expect(bad.ok).toBe(false);
    logout();
  }, 30000);
});
