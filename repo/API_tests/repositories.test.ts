import { describe, it, expect } from 'vitest';
import { tripsRepository } from '@persistence/tripsRepository';
import { questionsRepository } from '@persistence/questionsRepository';
import type { Trip } from '@domain/trips/trip';
import type { Question } from '@domain/questions/question';

// ─────────────────────────────────────────────────────────────────────────────
// Helper factories
// ─────────────────────────────────────────────────────────────────────────────

function makeTrip(id: string, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    name: `Trip ${id}`,
    origin: 'JFK',
    destination: 'LAX',
    departureAt: Date.now() + 86_400_000,
    rows: 8,
    cols: 4,
    createdBy: 'user-1',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    ...overrides
  };
}

function makeQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    type: 'short_answer',
    prompt: `Question ${id}?`,
    choices: [],
    correctChoiceIds: [],
    correctNumeric: null,
    numericTolerance: 0,
    acceptedAnswers: [],
    caseSensitive: false,
    difficulty: 2,
    maxScore: 10,
    explanation: '',
    tags: [],
    knowledgePoints: [],
    applicableDepartments: [],
    status: 'active',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    deletedAt: null,
    ...overrides
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// tripsRepository
// ─────────────────────────────────────────────────────────────────────────────

describe('tripsRepository.list', () => {
  it('returns an empty array on a fresh database', async () => {
    const trips = await tripsRepository.list();
    expect(trips).toEqual([]);
  });

  it('returns all stored trips', async () => {
    await tripsRepository.put(makeTrip('t1'));
    await tripsRepository.put(makeTrip('t2'));
    const trips = await tripsRepository.list();
    expect(trips.length).toBe(2);
    expect(trips.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });
});

describe('tripsRepository.get', () => {
  it('returns undefined for a missing id', async () => {
    const result = await tripsRepository.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('retrieves a trip by id', async () => {
    const trip = makeTrip('t-get');
    await tripsRepository.put(trip);
    const result = await tripsRepository.get('t-get');
    expect(result).toEqual(trip);
  });
});

describe('tripsRepository.put', () => {
  it('inserts a new trip', async () => {
    const trip = makeTrip('t-put-new');
    await tripsRepository.put(trip);
    expect(await tripsRepository.get('t-put-new')).toEqual(trip);
  });

  it('updates an existing trip (upsert)', async () => {
    const trip = makeTrip('t-put-up');
    await tripsRepository.put(trip);
    const updated = { ...trip, name: 'Updated Name', updatedAt: trip.updatedAt + 1 };
    await tripsRepository.put(updated);
    const result = await tripsRepository.get('t-put-up');
    expect(result?.name).toBe('Updated Name');
  });

  it('preserves all trip fields on round-trip', async () => {
    const trip = makeTrip('t-rt', { origin: 'SFO', destination: 'ORD', rows: 12, cols: 6 });
    await tripsRepository.put(trip);
    const result = await tripsRepository.get('t-rt');
    expect(result?.origin).toBe('SFO');
    expect(result?.destination).toBe('ORD');
    expect(result?.rows).toBe(12);
    expect(result?.cols).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// questionsRepository
// ─────────────────────────────────────────────────────────────────────────────

describe('questionsRepository.list', () => {
  it('returns an empty array on a fresh database', async () => {
    const qs = await questionsRepository.list();
    expect(qs).toEqual([]);
  });

  it('returns all stored questions', async () => {
    await questionsRepository.put(makeQuestion('q1'));
    await questionsRepository.put(makeQuestion('q2'));
    const qs = await questionsRepository.list();
    expect(qs.length).toBe(2);
    expect(qs.map((q) => q.id).sort()).toEqual(['q1', 'q2']);
  });
});

describe('questionsRepository.get', () => {
  it('returns undefined for a missing id', async () => {
    const result = await questionsRepository.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('retrieves a question by id', async () => {
    const q = makeQuestion('q-get');
    await questionsRepository.put(q);
    const result = await questionsRepository.get('q-get');
    expect(result?.id).toBe('q-get');
    expect(result?.type).toBe('short_answer');
  });
});

describe('questionsRepository.put', () => {
  it('inserts a new question', async () => {
    const q = makeQuestion('q-put-new');
    await questionsRepository.put(q);
    expect(await questionsRepository.get('q-put-new')).toBeDefined();
  });

  it('updates an existing question (upsert)', async () => {
    const q = makeQuestion('q-put-up');
    await questionsRepository.put(q);
    const updated = { ...q, prompt: 'Updated prompt?', updatedAt: q.updatedAt + 1 };
    await questionsRepository.put(updated);
    const result = await questionsRepository.get('q-put-up');
    expect(result?.prompt).toBe('Updated prompt?');
  });

  it('preserves all fields on round-trip', async () => {
    const q = makeQuestion('q-rt', {
      type: 'single_choice',
      choices: [{ id: 'c1', label: 'Option A' }],
      correctChoiceIds: ['c1'],
      maxScore: 25,
      difficulty: 4,
      tags: ['tag1', 'tag2'],
      knowledgePoints: ['kp1']
    });
    await questionsRepository.put(q);
    const result = await questionsRepository.get('q-rt');
    expect(result?.type).toBe('single_choice');
    expect(result?.choices).toHaveLength(1);
    expect(result?.correctChoiceIds).toEqual(['c1']);
    expect(result?.maxScore).toBe(25);
    expect(result?.tags).toEqual(['tag1', 'tag2']);
  });

  it('stores questions with deleted status correctly', async () => {
    const q = makeQuestion('q-deleted', { status: 'deleted', deletedAt: 9_999_999 });
    await questionsRepository.put(q);
    const result = await questionsRepository.get('q-deleted');
    expect(result?.status).toBe('deleted');
    expect(result?.deletedAt).toBe(9_999_999);
  });
});
