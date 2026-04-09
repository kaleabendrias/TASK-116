import {
  requiresSecondReview, roundToIncrement, applyTypeWeight,
  gateNeedsSecondReview, assertGradeStateInvariant
} from '@domain/grading/scoring';
import { encryptString, decryptString, type EncryptedField } from '@shared/crypto/fieldCrypto';
import { gradesRepository, DuplicateGradeError, type Grade } from '@persistence/gradesRepository';
import { attemptsRepository } from '@persistence/attemptsRepository';
import { questionsRepository } from '@persistence/questionsRepository';
import { businessConfig } from './businessConfig';
import { currentEncryptionKey } from './authService';
import { requireRole, requireSession } from './authorization';
import { uid } from '@shared/utils/id';
import { logger } from '@shared/logging/logger';

export interface ManualGradeInput {
  attemptId: string;
  score: number;
  notes: string;
}

export interface SecondReviewInput {
  score: number;
  notes: string;
}

/** Raised when the active session cannot decrypt a notes payload (typically because it was written by a different reviewer). */
export class NotesDecryptionError extends Error {
  constructor() {
    super('Notes are encrypted with a different reviewer\'s key and cannot be decrypted in this session');
    this.name = 'NotesDecryptionError';
  }
}

/**
 * Raised when a second review submission would close a grade whose
 * absolute delta against the first review still exceeds the configured
 * threshold. The grade is left untouched in `PENDING_SECOND_REVIEW` and
 * the workflow refuses terminal closure until reviewers reach agreement
 * within the configured policy window.
 */
export class SecondReviewDeltaBlockedError extends Error {
  constructor(
    public readonly firstScore: number,
    public readonly secondScore: number,
    public readonly delta: number,
    public readonly threshold: number
  ) {
    super(
      `Second review blocked: delta ${delta} between first review (${firstScore}) ` +
      `and proposed second review (${secondScore}) still exceeds the policy threshold ` +
      `of ${threshold}. The grade cannot finalize until both reviewers agree within ${threshold} points.`
    );
    this.name = 'SecondReviewDeltaBlockedError';
  }
}

async function encryptNotes(notes: string): Promise<EncryptedField | null> {
  if (!notes) return null;
  const key = currentEncryptionKey();
  if (!key) throw new Error('No encryption key in session');
  return encryptString(key, notes);
}

export async function decryptNotes(payload: EncryptedField | null): Promise<string> {
  if (!payload) return '';
  const key = currentEncryptionKey();
  if (!key) throw new NotesDecryptionError();
  try {
    return await decryptString(key, payload);
  } catch {
    // Wrong key (cross-user notes), corrupt payload, or any other AES failure.
    throw new NotesDecryptionError();
  }
}

function gradingKnobs() {
  const cfg = businessConfig().grading;
  return {
    increment: cfg.partialIncrement,
    weights: cfg.weights,
    deltaThreshold: cfg.secondReviewDelta
  };
}

/**
 * Read-only helper that lets the review UI (and the duplicate-guard inside
 * `submitFirstReview`) check whether any grader has already submitted a
 * grade for the given attempt — globally, not filtered by current grader.
 */
export async function findGradeByAttempt(attemptId: string): Promise<Grade | null> {
  requireSession();
  return (await gradesRepository.findByAttemptId(attemptId)) ?? null;
}

/**
 * First review submission. Enforces the one-grade-per-attempt invariant at
 * the service boundary by explicitly probing the global index, and is
 * defended in depth by the unique IDB index on `attemptId` which surfaces
 * as `DuplicateGradeError` for any race that slipped past the probe.
 *
 * Workflow: the first review never finalizes a grade by itself when the
 * manual score deviates from the auto-graded baseline by more than the
 * configured threshold (default 10) — that grade is forced into
 * `PENDING_SECOND_REVIEW` and cannot become COMPLETED until a different
 * reviewer submits a second review. Manual-only question types (text) have
 * no auto baseline at all, so they ALWAYS transition to
 * `PENDING_SECOND_REVIEW`. Only first reviews where the score agrees with
 * the auto baseline within the threshold short-circuit to COMPLETED.
 */
export async function submitFirstReview(input: ManualGradeInput): Promise<Grade> {
  const { userId: grader } = requireRole('reviewer', 'administrator');
  const attempt = await attemptsRepository.get(input.attemptId);
  if (!attempt) throw new Error('Attempt not found');
  const question = await questionsRepository.get(attempt.questionId);
  if (!question) throw new Error('Question not found');
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > question.maxScore) {
    throw new Error(`Score must be between 0 and ${question.maxScore}`);
  }
  // Service-level uniqueness probe.
  const existing = await gradesRepository.findByAttemptId(input.attemptId);
  if (existing) {
    logger.warn('grading.first.duplicate', { attemptId: input.attemptId, existingGradeId: existing.id, grader });
    throw new Error('A grade already exists for this attempt');
  }

  const knobs = gradingKnobs();
  const rounded = roundToIncrement(input.score, knobs.increment);
  const weighted = applyTypeWeight(rounded, question.type, knobs.weights, knobs.increment);
  const notesEncrypted = await encryptNotes(input.notes);

  // State-machine decision: does this first review need a mandatory
  // second review before it can finalize?
  const hasAutoBaseline = !attempt.needsManualGrading && attempt.autoScore !== null && Number.isFinite(attempt.autoScore);
  const baseline = hasAutoBaseline ? (attempt.autoScore as number) : null;
  // Centralized control gate: any score whose absolute delta against the
  // reference baseline exceeds the configured threshold (default 10) MUST
  // be forced into PENDING_SECOND_REVIEW. Manual-only questions have no
  // baseline at all and therefore always require a second reviewer.
  const deltaExceeds = gateNeedsSecondReview(rounded, baseline, knobs.deltaThreshold);

  const state: 'PENDING_SECOND_REVIEW' | 'COMPLETED' = deltaExceeds ? 'PENDING_SECOND_REVIEW' : 'COMPLETED';
  const finalScoreOnFirst = state === 'COMPLETED' ? weighted : null;
  const blockedReason = deltaExceeds
    ? (baseline === null
        ? 'Pending second review: question requires manual grading (no auto baseline)'
        : `Pending second review: first-review score ${rounded} differs from auto baseline ${baseline} by more than ${knobs.deltaThreshold}`)
    : null;

  const now = Date.now();
  const grade: Grade = {
    id: uid('grade'),
    attemptId: attempt.id,
    questionId: question.id,
    graderId: grader,
    firstScore: rounded,
    secondScore: null,
    secondGraderId: null,
    finalScore: finalScoreOnFirst,
    state,
    awaitingSecondReview: state === 'PENDING_SECOND_REVIEW',
    blockedReason,
    notesEncrypted,
    createdAt: now,
    updatedAt: now
  };
  // Schema-level invariant assertion — refuses to persist a grade whose
  // shape contradicts the state machine (e.g. a COMPLETED grade with a
  // null finalScore, or a PENDING grade that already carries a second
  // grader). This is a defensive backstop for the rule above.
  assertGradeStateInvariant(grade);
  try {
    await gradesRepository.put(grade);
  } catch (e) {
    if (e instanceof DuplicateGradeError) {
      logger.warn('grading.first.race', { attemptId: input.attemptId, grader });
      throw new Error('A grade already exists for this attempt');
    }
    throw e;
  }
  logger.info('grading.first', {
    gradeId: grade.id, attemptId: attempt.id, graderId: grader,
    questionType: question.type, firstScore: rounded,
    finalScore: grade.finalScore, state: grade.state
  });
  if (deltaExceeds) {
    logger.warn('grading.first.pending_second_review', {
      gradeId: grade.id, attemptId: attempt.id,
      firstScore: rounded, autoBaseline: baseline,
      threshold: knobs.deltaThreshold
    });
  }
  return grade;
}

/**
 * Second review submission. Drives the grade from PENDING_SECOND_REVIEW to
 * COMPLETED — but ONLY when the second reviewer's score is within the
 * configured delta threshold of the first review. Refuses to operate on a
 * grade that has already finalized (state === COMPLETED): the workflow is
 * one-way and a grade cannot be "re-completed". The final score is the
 * type-weighted average of the two reviewers' scores.
 *
 * Mandatory blocking: if the absolute delta between the first review and
 * the proposed second-review score still exceeds the configured threshold
 * the call raises `SecondReviewDeltaBlockedError`, the persisted record is
 * left untouched in `PENDING_SECOND_REVIEW`, and terminal closure is
 * prevented until reviewers reach agreement within the policy window. The
 * second review is NEVER allowed to short-circuit a delta-exceeded
 * disagreement into a final score.
 */
export async function submitSecondReview(gradeId: string, input: SecondReviewInput): Promise<Grade> {
  const { userId: grader } = requireRole('reviewer', 'administrator');
  const grade = await gradesRepository.get(gradeId);
  if (!grade) throw new Error('Grade not found');
  if (grade.state !== 'PENDING_SECOND_REVIEW') {
    logger.warn('grading.second.invalid_state', { gradeId, state: grade.state });
    throw new Error(`Grade is not awaiting a second review (state=${grade.state})`);
  }
  // State-machine guard: a grade in PENDING_SECOND_REVIEW must never carry
  // a finalized score; if it does, the persisted record is corrupt and the
  // workflow refuses to advance it. This catches tampering or schema drift.
  if (grade.finalScore !== null || grade.secondGraderId !== null) {
    logger.error('grading.second.corrupt_pending', { gradeId });
    throw new Error('Refusing to advance a corrupt PENDING_SECOND_REVIEW record');
  }
  const question = await questionsRepository.get(grade.questionId);
  if (!question) throw new Error('Question not found');
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > question.maxScore) {
    throw new Error(`Score must be between 0 and ${question.maxScore}`);
  }
  if (grader === grade.graderId) throw new Error('Second review must be by a different grader');

  const knobs = gradingKnobs();
  const rounded = roundToIncrement(input.score, knobs.increment);
  const exceedsThreshold = requiresSecondReview(grade.firstScore, rounded, knobs.deltaThreshold);

  if (exceedsThreshold) {
    // Strict policy: a second review whose delta still exceeds the
    // threshold cannot terminally close the grade. The persisted record
    // is left untouched (still PENDING_SECOND_REVIEW) and the caller is
    // notified via a typed error so the UI can prompt for reviewer
    // coordination instead of silently auditing a half-disagreed grade.
    const delta = Math.abs(grade.firstScore - rounded);
    logger.warn('grading.delta.exceeded', {
      gradeId, attemptId: grade.attemptId,
      firstScore: grade.firstScore, secondScore: rounded,
      delta, threshold: knobs.deltaThreshold
    });
    throw new SecondReviewDeltaBlockedError(grade.firstScore, rounded, delta, knobs.deltaThreshold);
  }

  // Within-threshold path: encrypt the notes ONLY now (after the gate)
  // so that a blocked attempt does not leak a useless ciphertext into
  // the heap and so reviewers know that a successful return means the
  // grade actually finalized.
  const notesEncrypted = await encryptNotes(input.notes);
  const avg = (grade.firstScore + rounded) / 2;
  const weightedFinal = applyTypeWeight(avg, question.type, knobs.weights, knobs.increment);
  const updated: Grade = {
    ...grade,
    secondScore: rounded,
    secondGraderId: grader,
    finalScore: weightedFinal,
    state: 'COMPLETED',
    awaitingSecondReview: false,
    blockedReason: null,
    notesEncrypted: notesEncrypted ?? grade.notesEncrypted,
    updatedAt: Date.now()
  };
  assertGradeStateInvariant(updated);
  await gradesRepository.put(updated);
  logger.info('grading.second', {
    gradeId, attemptId: grade.attemptId, secondGraderId: grader,
    secondScore: rounded, finalScore: weightedFinal,
    deltaExceeded: false
  });
  return updated;
}

/** A grade is complete once the workflow has reached the COMPLETED state. */
export function isComplete(grade: Grade): boolean {
  return grade.state === 'COMPLETED';
}

/**
 * Reviewers and administrators see every grade in the system so they can
 * make informed decisions before submitting their own first review (no
 * blind spots). Other roles get an empty list.
 */
export async function listGrades(): Promise<Grade[]> {
  requireRole('reviewer', 'administrator');
  return gradesRepository.list();
}
