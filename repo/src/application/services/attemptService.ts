import { autoScore, type AttemptAnswer } from '@domain/grading/scoring';
import { isObjective } from '@domain/questions/questionRules';
import { questionsRepository } from '@persistence/questionsRepository';
import { attemptsRepository, type Attempt } from '@persistence/attemptsRepository';
import { uid } from '@shared/utils/id';
import { requireSession, hasAnyRole, AuthorizationError } from './authorization';
import { currentDepartment } from './authService';
import { logger } from '@shared/logging/logger';

/** Identity is taken from the active session — never from caller input. */
export async function submitAttempt(answer: AttemptAnswer): Promise<Attempt> {
  const userId = requireSession();
  const question = await questionsRepository.get(answer.questionId);
  if (!question) throw new Error('Question not found');
  if (question.status !== 'active') throw new Error('Question is not active');

  // Department applicability gate. A question whose `applicableDepartments`
  // list is non-empty is functionally restricted to users in those
  // departments. Administrators are exempt — they sit outside the
  // department scoping model. Empty list = no scope (open to everyone).
  if (question.applicableDepartments.length > 0 && !hasAnyRole('administrator')) {
    const dept = currentDepartment();
    if (dept === null || !question.applicableDepartments.includes(dept)) {
      logger.warn('attempt.department.denied', {
        userId,
        department: dept,
        questionId: question.id,
        applicableDepartments: question.applicableDepartments
      });
      throw new AuthorizationError(
        `Question is restricted to departments [${question.applicableDepartments.join(', ')}]`
      );
    }
  }

  let attempt: Attempt;
  if (isObjective(question.type)) {
    const result = autoScore(question, answer);
    attempt = {
      id: uid('att'),
      userId,
      questionId: question.id,
      answer,
      autoScore: result.rawScore,
      isCorrect: result.isCorrect,
      needsManualGrading: false,
      submittedAt: Date.now()
    };
  } else {
    attempt = {
      id: uid('att'),
      userId,
      questionId: question.id,
      answer,
      autoScore: null,
      isCorrect: null,
      needsManualGrading: true,
      submittedAt: Date.now()
    };
  }
  await attemptsRepository.put(attempt);
  return attempt;
}

/**
 * Object-level filtering: a regular user only sees their own attempts.
 * Reviewers and administrators see every attempt so they can grade.
 */
export async function listAttempts(): Promise<Attempt[]> {
  const userId = requireSession();
  const all = await attemptsRepository.list();
  if (hasAnyRole('administrator', 'reviewer')) return all;
  return all.filter((a) => a.userId === userId);
}
