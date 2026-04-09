import type { Question } from '@domain/questions/question';
import { idbAll, idbGet, idbPut } from './indexedDb';

export const questionsRepository = {
  list: (): Promise<Question[]> => idbAll<Question>('questions'),
  get: (id: string): Promise<Question | undefined> => idbGet<Question>('questions', id),
  put: (q: Question): Promise<void> => idbPut('questions', q)
};
