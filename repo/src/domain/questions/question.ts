export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'numeric'
  | 'short_answer'
  | 'true_false'
  | 'fill_in_blank';

export type QuestionStatus = 'active' | 'inactive' | 'deleted';

export interface QuestionChoice {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  // single/multi/true_false:
  choices: QuestionChoice[];
  correctChoiceIds: string[];
  // numeric:
  correctNumeric: number | null;
  numericTolerance: number;
  // fill_in_blank:
  acceptedAnswers: string[];
  caseSensitive: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  maxScore: number;
  explanation: string;
  tags: string[];
  knowledgePoints: string[];
  applicableDepartments: string[];
  status: QuestionStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type NewQuestionInput = Omit<Question, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type QuestionPatch = Partial<NewQuestionInput>;

/** Stable choice ids for true/false questions, used everywhere they appear. */
export const TRUE_FALSE_CHOICES: QuestionChoice[] = [
  { id: 'true', label: 'True' },
  { id: 'false', label: 'False' }
];
