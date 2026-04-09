import { describe, it, expect } from 'vitest';
import { submitAttempt, listAttempts } from '@application/services/attemptService';
import { createQuestion, setActive } from '@application/services/questionService';
import { register, login, logout, bootstrapFirstAdmin } from '@application/services/authService';
import type { NewQuestionInput } from '@domain/questions/question';

function objQ(): NewQuestionInput {
  return {
    type: 'single_choice', prompt: '?',
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    correctChoiceIds: ['a'], correctNumeric: null, numericTolerance: 0,
    acceptedAnswers: [], caseSensitive: false,
    difficulty: 1, maxScore: 10, explanation: '',
    tags: [], knowledgePoints: [], applicableDepartments: []
  };
}

function textQ(): NewQuestionInput {
  return { ...objQ(), type: 'short_answer', choices: [], correctChoiceIds: [] };
}

async function asAuthor(name: string): Promise<void> {
  await register(name, 'longenough', 'content_author');
  await login(name, 'longenough');
}

describe('attemptService', () => {
  it('auto-scores objective questions on submit (identity from session)', async () => {
    await asAuthor('author1');
    const create = await createQuestion(objQ());
    if (!create.ok) throw new Error('setup');
    const attempt = await submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] });
    expect(attempt.autoScore).toBe(10);
    expect(attempt.isCorrect).toBe(true);
    expect(attempt.needsManualGrading).toBe(false);
    expect(attempt.userId).toBeTruthy();
    const list = await listAttempts();
    expect(list.length).toBe(1);
  }, 30000);

  it('marks text questions as needing manual grading', async () => {
    await asAuthor('author2');
    const create = await createQuestion(textQ());
    if (!create.ok) throw new Error('setup');
    const attempt = await submitAttempt({ questionId: create.question.id, textAnswer: 'an answer' });
    expect(attempt.needsManualGrading).toBe(true);
    expect(attempt.autoScore).toBeNull();
  }, 30000);

  it('rejects when not authenticated', async () => {
    await expect(submitAttempt({ questionId: 'nope' })).rejects.toThrow(/Authentication/);
  });

  it('rejects when question is missing or inactive', async () => {
    await asAuthor('author3');
    await expect(submitAttempt({ questionId: 'nope' })).rejects.toThrow(/not found/);
    const create = await createQuestion(objQ());
    if (!create.ok) throw new Error('setup');
    await setActive(create.question.id, false);
    await expect(submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] }))
      .rejects.toThrow(/not active/);
  }, 30000);

  it('rejects submission when the question is restricted to a department the user is not in', async () => {
    // Author (no department) creates a question scoped to Genomics.
    await asAuthor('dept-author');
    const create = await createQuestion({ ...objQ(), applicableDepartments: ['Genomics'] });
    if (!create.ok) throw new Error('setup');
    logout();

    // A different user with no department at all is denied.
    await register('no-dept', 'longenough', 'reviewer');
    await login('no-dept', 'longenough');
    await expect(submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] }))
      .rejects.toThrow(/restricted to departments/);
    logout();

    // A user in the WRONG department is also denied.
    await register('wrong-dept', 'longenough', 'reviewer', 'Hematology');
    await login('wrong-dept', 'longenough');
    await expect(submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] }))
      .rejects.toThrow(/restricted to departments/);
    logout();

    // A user in the RIGHT department succeeds.
    await register('right-dept', 'longenough', 'reviewer', 'Genomics');
    await login('right-dept', 'longenough');
    const ok = await submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] });
    expect(ok.userId).toBeTruthy();
    expect(ok.isCorrect).toBe(true);
    logout();

    // Administrators are exempt from the department gate.
    await bootstrapFirstAdmin('dept-admin', 'longenough');
    await login('dept-admin', 'longenough');
    const adminOk = await submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] });
    expect(adminOk.userId).toBeTruthy();
  }, 120000);

  it('allows submission when the question has no department scope (open question)', async () => {
    await asAuthor('open-author');
    const create = await createQuestion(objQ()); // applicableDepartments: []
    if (!create.ok) throw new Error('setup');
    logout();
    await register('any-user', 'longenough', 'reviewer');
    await login('any-user', 'longenough');
    const ok = await submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] });
    expect(ok.userId).toBeTruthy();
  }, 60000);

  it('listAttempts filters to current user, but reviewers see everything', async () => {
    // Author 1 creates a question and an attempt.
    await asAuthor('author4');
    const create = await createQuestion(objQ());
    if (!create.ok) throw new Error('setup');
    await submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['a'] });
    logout();

    // Author 5 makes a different attempt.
    await asAuthor('author5');
    await submitAttempt({ questionId: create.question.id, selectedChoiceIds: ['b'] });
    const own = await listAttempts();
    expect(own.length).toBe(1);
    expect(own[0].answer.selectedChoiceIds?.[0]).toBe('b');

    logout();
    await register('reviewer-x', 'longenough', 'reviewer');
    await login('reviewer-x', 'longenough');
    const all = await listAttempts();
    expect(all.length).toBe(2);
  }, 60000);
});
