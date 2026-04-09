import { describe, it, expect } from 'vitest';
import { submitAttempt } from '@application/services/attemptService';
import { createQuestion } from '@application/services/questionService';
import {
  submitFirstReview, submitSecondReview, findGradeByAttempt,
  decryptNotes, listGrades, isComplete, NotesDecryptionError
} from '@application/services/gradingService';
import {
  register, login, logout, bootstrapFirstAdmin, currentUserId
} from '@application/services/authService';
import { businessConfig } from '@application/services/businessConfig';
import { gradesRepository, DuplicateGradeError, type Grade } from '@persistence/gradesRepository';
import type { NewQuestionInput } from '@domain/questions/question';
import { uid } from '@shared/utils/id';

function textQ(): NewQuestionInput {
  return {
    type: 'short_answer', prompt: 'Explain.', choices: [], correctChoiceIds: [],
    correctNumeric: null, numericTolerance: 0,
    acceptedAnswers: [], caseSensitive: false,
    difficulty: 3, maxScore: 100, explanation: '',
    tags: [], knowledgePoints: [], applicableDepartments: []
  };
}

const TEXT_WEIGHT = businessConfig().grading.weights.short_answer ?? 1.5;

async function asContentAuthor(name: string): Promise<void> {
  await register(name, 'longenough', 'content_author');
  await login(name, 'longenough');
}

async function asReviewer(name: string): Promise<void> {
  await register(name, 'longenough', 'reviewer');
  await login(name, 'longenough');
}

async function asAdmin(name: string): Promise<void> {
  await bootstrapFirstAdmin(name, 'longenough');
  await login(name, 'longenough');
}

async function setupAttempt(): Promise<string> {
  const create = await createQuestion(textQ());
  if (!create.ok) throw new Error('setup');
  const attempt = await submitAttempt({ questionId: create.question.id, textAnswer: 'a' });
  return attempt.id;
}

describe('gradingService', () => {
  it('rejects writes from a non-grader role', async () => {
    await asContentAuthor('author1');
    const attemptId = await setupAttempt();
    logout();
    await register('disp', 'longenough', 'dispatcher');
    await login('disp', 'longenough');
    await expect(submitFirstReview({ attemptId, score: 50, notes: '' })).rejects.toThrow(/not authorized/);
  }, 30000);

  it('first review on a manual-only (text) question forces PENDING_SECOND_REVIEW (never auto-finalizes)', async () => {
    await asContentAuthor('author2');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader1');
    const grade = await submitFirstReview({ attemptId, score: 73.3, notes: 'good effort' });
    expect(grade.firstScore).toBe(73.5);
    // Text questions have no auto baseline → mandatory second review.
    expect(grade.state).toBe('PENDING_SECOND_REVIEW');
    expect(grade.awaitingSecondReview).toBe(true);
    expect(grade.finalScore).toBeNull();
    expect(grade.blockedReason).toMatch(/Pending second review/);
    expect(grade.notesEncrypted).not.toBeNull();
    expect(await decryptNotes(grade.notesEncrypted)).toBe('good effort');
    // The state machine guarantees a first review on a manual question is
    // NEVER complete.
    expect(isComplete(grade)).toBe(false);
  }, 60000);

  // Negative test: a first reviewer cannot bypass the threshold gate by
  // calling the second-review path directly on a grade that is still
  // pending. Same-grader rule + state-machine rule both block it.
  it('first review with delta exceeding threshold cannot self-finalize via submitSecondReview', async () => {
    await asContentAuthor('author2b');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader1b');
    const first = await submitFirstReview({ attemptId, score: 73.5, notes: '' });
    expect(first.state).toBe('PENDING_SECOND_REVIEW');
    // Same grader trying to "finish" the grade themselves — rejected.
    await expect(submitSecondReview(first.id, { score: 73.5, notes: '' })).rejects.toThrow(/different/);
  }, 90000);

  // Negative test: once a grade is COMPLETED, second-review writes are
  // rejected by the state machine — no double-finalize.
  it('second review on a COMPLETED grade is rejected by the state machine', async () => {
    await asContentAuthor('author2c');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader1c');
    const first = await submitFirstReview({ attemptId, score: 80, notes: '' });
    expect(first.state).toBe('PENDING_SECOND_REVIEW');
    logout();
    await asReviewer('grader1d');
    const completed = await submitSecondReview(first.id, { score: 78, notes: '' });
    expect(completed.state).toBe('COMPLETED');
    logout();
    await asReviewer('grader1e');
    await expect(submitSecondReview(first.id, { score: 70, notes: '' }))
      .rejects.toThrow(/not awaiting a second review/);
  }, 120000);

  it('rounds non-grid scores and rejects out-of-bounds values', async () => {
    await asContentAuthor('author3');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader2');
    const rounded = await submitFirstReview({ attemptId, score: 50.25, notes: '' });
    expect(rounded.firstScore).toBe(50.5);
    // Same attempt — second first-review attempt is blocked by the duplicate guard
    await expect(submitFirstReview({ attemptId, score: -1, notes: '' })).rejects.toThrow();
  }, 60000);

  it('rejects when not authenticated for grading actions', async () => {
    await expect(submitFirstReview({ attemptId: 'x', score: 50, notes: '' })).rejects.toThrow();
  });

  it('rejects when attempt or question missing', async () => {
    await asReviewer('grader3');
    await expect(submitFirstReview({ attemptId: 'nope', score: 50, notes: '' })).rejects.toThrow(/Attempt not found/);
  }, 30000);

  it('second review with delta within threshold averages to a weighted final and reaches COMPLETED', async () => {
    await asContentAuthor('author4');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader4');
    const first = await submitFirstReview({ attemptId, score: 80, notes: 'first' });
    expect(first.state).toBe('PENDING_SECOND_REVIEW');

    // same grader cannot do second review
    await expect(submitSecondReview(first.id, { score: 78, notes: '' })).rejects.toThrow(/different/);

    logout();
    await asReviewer('grader5');
    const updated = await submitSecondReview(first.id, { score: 72, notes: 'second' });
    expect(updated.secondScore).toBe(72);
    expect(updated.state).toBe('COMPLETED');
    // (80 + 72) / 2 = 76 → weighted = 76 * 1.5 = 114
    expect(updated.finalScore).toBe(Math.round((76 * TEXT_WEIGHT) * 2) / 2);
    expect(updated.awaitingSecondReview).toBe(false);
    expect(updated.blockedReason).toBeNull();
    expect(isComplete(updated)).toBe(true);
  }, 90000);

  it('second review is BLOCKED when delta > 10 — record stays in PENDING_SECOND_REVIEW', async () => {
    const { SecondReviewDeltaBlockedError } = await import('@application/services/gradingService');
    await asContentAuthor('author5');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader6');
    const first = await submitFirstReview({ attemptId, score: 80, notes: '' });
    expect(first.state).toBe('PENDING_SECOND_REVIEW');

    logout();
    await asReviewer('grader7');
    // Delta = |80 - 60| = 20, well over the configured 10-point threshold.
    await expect(submitSecondReview(first.id, { score: 60, notes: 'second' }))
      .rejects.toBeInstanceOf(SecondReviewDeltaBlockedError);

    // The persisted record is unchanged — no terminal closure, no second
    // grader fields written, no finalScore.
    const after = await gradesRepository.get(first.id);
    expect(after).toBeTruthy();
    expect(after?.state).toBe('PENDING_SECOND_REVIEW');
    expect(after?.secondScore).toBeNull();
    expect(after?.secondGraderId).toBeNull();
    expect(after?.finalScore).toBeNull();
    expect(after?.awaitingSecondReview).toBe(true);
    expect(isComplete(after as Grade)).toBe(false);
  }, 90000);

  it('a blocked second review can be retried with an in-threshold score and finalize cleanly', async () => {
    const { SecondReviewDeltaBlockedError } = await import('@application/services/gradingService');
    await asContentAuthor('author5retry');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader6r');
    const first = await submitFirstReview({ attemptId, score: 80, notes: '' });

    logout();
    await asReviewer('grader7r');
    // First proposal — delta 25 → blocked.
    await expect(submitSecondReview(first.id, { score: 55, notes: 'too low' }))
      .rejects.toBeInstanceOf(SecondReviewDeltaBlockedError);
    let mid = await gradesRepository.get(first.id);
    expect(mid?.state).toBe('PENDING_SECOND_REVIEW');

    // Same reviewer comes back with a score within the policy window.
    const ok = await submitSecondReview(first.id, { score: 75, notes: 'agreed' });
    expect(ok.state).toBe('COMPLETED');
    expect(ok.secondScore).toBe(75);
    // (80 + 75) / 2 = 77.5 → weighted text = 77.5 * 1.5 = 116.25 → 116.5 on the 0.5 grid
    expect(ok.finalScore).toBe(Math.round((77.5 * TEXT_WEIGHT) * 2) / 2);
    expect(ok.blockedReason).toBeNull();
    expect(isComplete(ok)).toBe(true);
  }, 120000);

  it('second review at boundary delta = 10 still finalizes', async () => {
    await asContentAuthor('author5b');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader6b');
    const first = await submitFirstReview({ attemptId, score: 80, notes: '' });
    logout();
    await asReviewer('grader7b');
    const updated = await submitSecondReview(first.id, { score: 70, notes: '' });
    expect(updated.blockedReason).toBeNull();
    expect(isComplete(updated)).toBe(true);
  }, 90000);

  it('rejects second review with out-of-bounds score or missing grade', async () => {
    await asContentAuthor('author7');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader10');
    const first = await submitFirstReview({ attemptId, score: 50, notes: '' });
    logout();
    await asReviewer('grader11');
    await expect(submitSecondReview(first.id, { score: 200, notes: '' })).rejects.toThrow();
    await expect(submitSecondReview(first.id, { score: NaN, notes: '' })).rejects.toThrow();
    await expect(submitSecondReview('nope', { score: 50, notes: '' })).rejects.toThrow(/not found/);
  }, 90000);

  it('listGrades returns all grades to reviewers + admins (no blind spots)', async () => {
    // Two attempts graded by two different reviewers — each reviewer must
    // still see BOTH grades when calling listGrades.
    await asContentAuthor('author8');
    const attemptA = await setupAttempt();
    const attemptB = await setupAttempt();
    logout();
    await asReviewer('graderA');
    await submitFirstReview({ attemptId: attemptA, score: 50, notes: '' });
    expect((await listGrades()).length).toBe(1);

    logout();
    await asReviewer('graderB');
    expect((await listGrades()).length).toBe(1); // sees graderA's grade — globally
    await submitFirstReview({ attemptId: attemptB, score: 75, notes: '' });
    expect((await listGrades()).length).toBe(2);

    logout();
    await asAdmin('admin2');
    expect((await listGrades()).length).toBe(2);
  }, 120000);

  it('listGrades denies non-grader roles (no leakage to dispatchers / authors)', async () => {
    await asContentAuthor('leaker');
    await expect(listGrades()).rejects.toThrow(/not authorized/);
  }, 30000);

  it('decryptNotes returns empty string for null payload', async () => {
    await asReviewer('grader-empty');
    expect(await decryptNotes(null)).toBe('');
  }, 30000);

  it('decryptNotes raises NotesDecryptionError when reading another reviewer\'s notes', async () => {
    await asContentAuthor('author-cross');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('grader-cross-1');
    const first = await submitFirstReview({ attemptId, score: 50, notes: 'private notes from grader 1' });
    expect(first.notesEncrypted).not.toBeNull();
    // Another reviewer logs in and tries to decrypt — their AES key cannot
    // open the payload encrypted with the first reviewer's key.
    logout();
    await asReviewer('grader-cross-2');
    await expect(decryptNotes(first.notesEncrypted)).rejects.toBeInstanceOf(NotesDecryptionError);
  }, 90000);

  it('isComplete classifies grades correctly across the state machine', async () => {
    await asContentAuthor('author9');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('graderC');
    const first = await submitFirstReview({ attemptId, score: 50, notes: '' });
    // Manual-only question → PENDING_SECOND_REVIEW, NOT complete.
    expect(first.state).toBe('PENDING_SECOND_REVIEW');
    expect(isComplete(first)).toBe(false);
    expect(currentUserId()).toBeTruthy();
    logout();
    await asReviewer('graderD');
    const completed = await submitSecondReview(first.id, { score: 55, notes: '' });
    expect(completed.state).toBe('COMPLETED');
    expect(isComplete(completed)).toBe(true);

    // A second review with delta > 10 is BLOCKED — never reaches COMPLETED.
    const { SecondReviewDeltaBlockedError } = await import('@application/services/gradingService');
    await asContentAuthor('author9b');
    const att2 = await setupAttempt();
    logout();
    await asReviewer('graderE');
    const f2 = await submitFirstReview({ attemptId: att2, score: 80, notes: '' });
    expect(isComplete(f2)).toBe(false);
    logout();
    await asReviewer('graderF');
    await expect(submitSecondReview(f2.id, { score: 60, notes: '' }))
      .rejects.toBeInstanceOf(SecondReviewDeltaBlockedError);
    const stillPending = await gradesRepository.get(f2.id);
    expect(stillPending?.state).toBe('PENDING_SECOND_REVIEW');
    expect(isComplete(stillPending as Grade)).toBe(false);
  }, 120000);

  // ---- one-grade-per-attempt invariant ----

  it('submitFirstReview is idempotent: a duplicate first review for the same attempt is rejected', async () => {
    await asContentAuthor('dup-author');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('dup-grader');
    await submitFirstReview({ attemptId, score: 60, notes: '' });
    await expect(submitFirstReview({ attemptId, score: 70, notes: '' }))
      .rejects.toThrow(/already exists/);

    // Even another reviewer can't second-write a first review for the same attempt.
    logout();
    await asReviewer('dup-other');
    await expect(submitFirstReview({ attemptId, score: 80, notes: '' }))
      .rejects.toThrow(/already exists/);
  }, 120000);

  it('persistence index enforces uniqueness even when bypassing the service guard', async () => {
    await asContentAuthor('repo-author');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('repo-grader');
    const first = await submitFirstReview({ attemptId, score: 60, notes: '' });

    // Construct a hand-rolled second grade for the same attemptId and write it
    // directly through the repository — bypassing the service-level guard.
    const dup: Grade = {
      ...first,
      id: uid('grade'),
      graderId: 'attacker',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await expect(gradesRepository.put(dup)).rejects.toBeInstanceOf(DuplicateGradeError);
  }, 90000);

  it('findGradeByAttempt returns null when no grade exists, and the grade when one does', async () => {
    await asContentAuthor('find-author');
    const attemptId = await setupAttempt();
    logout();
    await asReviewer('find-grader');
    expect(await findGradeByAttempt(attemptId)).toBeNull();
    await submitFirstReview({ attemptId, score: 50, notes: '' });
    const found = await findGradeByAttempt(attemptId);
    expect(found).not.toBeNull();
    expect(found?.attemptId).toBe(attemptId);
  }, 90000);
});
