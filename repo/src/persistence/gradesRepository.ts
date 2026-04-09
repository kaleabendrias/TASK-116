import type { EncryptedField } from '@shared/crypto/fieldCrypto';
import { idbAll, idbGet, getDb } from './indexedDb';

/**
 * Grade workflow state machine. A grade always starts in either
 * `PENDING_SECOND_REVIEW` (when the first review's score deviates from the
 * auto-graded baseline by more than the configured threshold, or when the
 * question type has no auto baseline at all) or `COMPLETED` (when the first
 * review is already in agreement with the auto-graded baseline). The only
 * legal transition is `PENDING_SECOND_REVIEW → COMPLETED` via
 * `submitSecondReview`.
 */
export type GradeState = 'PENDING_SECOND_REVIEW' | 'COMPLETED';

export interface Grade {
  id: string;
  attemptId: string;
  questionId: string;
  graderId: string;
  /** First-pass score, on the configured grid. */
  firstScore: number;
  /** Second-review score, present once a second reviewer has acted. */
  secondScore: number | null;
  secondGraderId: string | null;
  /**
   * Final score policy: in `PENDING_SECOND_REVIEW` the final score is `null`
   * — the grade is not yet authoritative. Once the mandatory second review
   * has been recorded the grade transitions to `COMPLETED` and `finalScore`
   * holds the type-weighted average of `firstScore` and `secondScore`,
   * rounded to the configured increment. A grade in `COMPLETED` always has
   * a non-null `finalScore`.
   */
  finalScore: number | null;
  /** Workflow state — see GradeState. */
  state: GradeState;
  /** True while the grade is awaiting a second reviewer (mirror of state === PENDING_SECOND_REVIEW). */
  awaitingSecondReview: boolean;
  /** Free-form audit message (e.g. delta exceeded threshold). */
  blockedReason: string | null;
  /** Encrypted free-text grader notes. */
  notesEncrypted: EncryptedField | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Persistence-layer enforcement: the IndexedDB store has a unique index on
 * `attemptId`, so two grades for the same attempt cannot coexist. Repository
 * helpers below propagate the underlying ConstraintError as a typed `put`
 * rejection so the service layer can map it to a friendly message.
 */
export class DuplicateGradeError extends Error {
  constructor(public readonly attemptId: string) {
    super(`A grade already exists for attempt ${attemptId}`);
    this.name = 'DuplicateGradeError';
  }
}

export const gradesRepository = {
  list: (): Promise<Grade[]> => idbAll<Grade>('grades'),
  get: (id: string): Promise<Grade | undefined> => idbGet<Grade>('grades', id),

  async findByAttemptId(attemptId: string): Promise<Grade | undefined> {
    const d = await getDb();
    return new Promise<Grade | undefined>((resolve, reject) => {
      const tx = d.transaction('grades', 'readonly');
      const store = tx.objectStore('grades');
      const idx = store.index('attemptId');
      const req = idx.get(attemptId);
      req.onsuccess = () => resolve(req.result as Grade | undefined);
      req.onerror = () => reject(req.error);
    });
  },

  async put(g: Grade): Promise<void> {
    const d = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction('grades', 'readwrite');
      const store = tx.objectStore('grades');
      const req = store.put(g);
      req.onerror = () => {
        const err = req.error;
        if (err && err.name === 'ConstraintError') {
          reject(new DuplicateGradeError(g.attemptId));
        } else {
          reject(err);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => {
        const err = tx.error;
        if (err && err.name === 'ConstraintError') {
          reject(new DuplicateGradeError(g.attemptId));
        } else {
          reject(err ?? new Error('Transaction aborted'));
        }
      };
      tx.onerror = () => {
        // most error paths are caught above; defensive fallback
        if (tx.error && tx.error.name === 'ConstraintError') {
          reject(new DuplicateGradeError(g.attemptId));
        } else {
          reject(tx.error ?? new Error('Transaction error'));
        }
      };
    });
  }
};
