import type { AttemptAnswer } from '@domain/grading/scoring';
import { idbAll, idbGet, idbPut } from './indexedDb';

export interface Attempt {
  id: string;
  userId: string;
  questionId: string;
  answer: AttemptAnswer;
  autoScore: number | null;       // null when needs manual grading
  isCorrect: boolean | null;
  needsManualGrading: boolean;
  submittedAt: number;
}

export const attemptsRepository = {
  list: (): Promise<Attempt[]> => idbAll<Attempt>('attempts'),
  get: (id: string): Promise<Attempt | undefined> => idbGet<Attempt>('attempts', id),
  put: (a: Attempt): Promise<void> => idbPut('attempts', a)
};
