import { writable, derived } from 'svelte/store';
import type { NewQuestionInput, Question, QuestionPatch } from '@domain/questions/question';
import {
  validateQuestion, applyPatch, copy as copyQuestion, deactivate, activate, softDelete, restore
} from '@domain/questions/questionRules';
import { questionsRepository } from '@persistence/questionsRepository';
import { businessConfig } from './businessConfig';
import { uid } from '@shared/utils/id';
import { requireRole } from './authorization';

const questionsStore = writable<Question[]>([]);
const showDeletedStore = writable<boolean>(false);

export const questions = { subscribe: questionsStore.subscribe };
export const showDeleted = {
  subscribe: showDeletedStore.subscribe,
  toggle: () => showDeletedStore.update((v) => !v),
  set: (v: boolean) => showDeletedStore.set(v)
};

export const visibleQuestions = derived(
  [questionsStore, showDeletedStore],
  ([$q, $show]) => $show ? $q : $q.filter((q) => q.status !== 'deleted')
);

/**
 * Question reads require a privileged role — only content authors and
 * administrators may pull the question bank. This blocks anonymous callers
 * AND prevents lower-privileged authenticated roles (dispatchers, reviewers)
 * from scraping assessment content by invoking the service directly.
 */
export async function refreshQuestions(): Promise<void> {
  requireRole('content_author', 'administrator');
  questionsStore.set(await questionsRepository.list());
}

function limits() {
  return businessConfig().questions;
}

export async function createQuestion(input: NewQuestionInput): Promise<{ ok: true; question: Question } | { ok: false; errors: string[] }> {
  requireRole('content_author', 'administrator');
  const v = validateQuestion(input, limits());
  if (!v.ok) return v;
  const now = Date.now();
  const q: Question = { ...input, id: uid('q'), status: 'active', createdAt: now, updatedAt: now, deletedAt: null };
  await questionsRepository.put(q);
  await refreshQuestions();
  return { ok: true, question: q };
}

export async function editQuestion(id: string, patch: QuestionPatch): Promise<{ ok: true; question: Question } | { ok: false; errors: string[] }> {
  requireRole('content_author', 'administrator');
  const existing = await questionsRepository.get(id);
  if (!existing) return { ok: false, errors: ['Not found'] };
  const merged = { ...existing, ...patch } as NewQuestionInput;
  const v = validateQuestion(merged, limits());
  if (!v.ok) return v;
  const updated = applyPatch(existing, patch);
  await questionsRepository.put(updated);
  await refreshQuestions();
  return { ok: true, question: updated };
}

export async function copyQuestionById(id: string): Promise<Question | null> {
  requireRole('content_author', 'administrator');
  const existing = await questionsRepository.get(id);
  if (!existing) return null;
  const cloned = copyQuestion(existing, uid('q'));
  await questionsRepository.put(cloned);
  await refreshQuestions();
  return cloned;
}

export async function setActive(id: string, active: boolean): Promise<void> {
  requireRole('content_author', 'administrator');
  const existing = await questionsRepository.get(id);
  if (!existing) return;
  const updated = active ? activate(existing) : deactivate(existing);
  await questionsRepository.put(updated);
  await refreshQuestions();
}

export async function softDeleteQuestion(id: string): Promise<void> {
  requireRole('content_author', 'administrator');
  const existing = await questionsRepository.get(id);
  if (!existing) return;
  await questionsRepository.put(softDelete(existing));
  await refreshQuestions();
}

export async function restoreQuestion(id: string): Promise<void> {
  requireRole('content_author', 'administrator');
  const existing = await questionsRepository.get(id);
  if (!existing) return;
  await questionsRepository.put(restore(existing));
  await refreshQuestions();
}
