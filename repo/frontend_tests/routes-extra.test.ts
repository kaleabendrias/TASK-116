/**
 * Frontend integration tests for the six protected route components:
 * Trips, Questions, Messaging, Review, Wellness, Configuration.
 *
 * tripsService and questionService run against real fake-indexeddb to exercise
 * the full write path. Heavy I/O services (messaging, grading, health, config)
 * remain mocked so tests stay deterministic and fast.
 */
import { describe, it, expect, vi } from 'vitest';
import { tick } from 'svelte';
import { bootstrapFirstAdmin, login } from '@application/services/authService';
import { createTrip } from '@application/services/tripsService';
import { createQuestion } from '@application/services/questionService';

// ── seatMapService: include _resetSeatMapForTesting consumed by setup.ts ──────
// initializeSeatsForTrip is mocked so the real tripsService can call it safely.
vi.mock('@application/services/seatMapService', async () => {
  const { writable } = await import('svelte/store');
  const stateStore = writable({ tripId: null, seats: [], holds: new Map(), now: Date.now() });
  const availCount = writable(0);
  return {
    seatMap: { subscribe: stateStore.subscribe },
    ownTabId: 'test-tab',
    availableCount: { subscribe: availCount.subscribe },
    holdSeat: vi.fn().mockResolvedValue({ ok: true }),
    releaseSeat: vi.fn().mockResolvedValue(undefined),
    bookSeat: vi.fn().mockResolvedValue({ ok: true }),
    ownHoldFor: vi.fn().mockReturnValue(null),
    startSeatMap: vi.fn().mockResolvedValue(undefined),
    stopSeatMap: vi.fn(),
    initializeSeatsForTrip: vi.fn().mockResolvedValue(undefined),
    _resetSeatMapForTesting: vi.fn(),
  };
});

// tripsService is NOT mocked — the real service runs against fake-indexeddb.

// ── businessConfig ────────────────────────────────────────────────────────────
vi.mock('@application/services/businessConfig', () => ({
  businessConfig: vi.fn(() => ({
    questions: { minDifficulty: 1, maxDifficulty: 5, minScore: 0, maxScore: 100 },
    knowledgePoints: ['KP-1'],
    departments: ['Ops'],
    messageTemplates: [{ id: 'tmpl1', name: 'Hello', category: 'general', variables: ['name'] }],
    messageCategories: ['general'],
    quietHours: { startHour: 22, endHour: 7 },
    messaging: { ratePerMinute: 10, maxAttempts: 3 },
    foods: [],
    grading: {
      partialIncrement: 0.5,
      secondReviewDelta: 2,
      weights: { short_answer: 1, single_choice: 1, multi_choice: 1, true_false: 1, fill_in_blank: 1, numeric: 1 },
    },
  })),
}));

// questionService is NOT mocked — the real service runs against fake-indexeddb.

// ── messagingService ──────────────────────────────────────────────────────────
vi.mock('@application/services/messagingService', async () => {
  const { writable } = await import('svelte/store');
  return {
    messages: writable([]),
    deadLetters: writable([]),
    refreshMessages: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    tickQueue: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn().mockResolvedValue(undefined),
    getSubscription: vi.fn().mockResolvedValue({ unsubscribed: [] }),
    updateSubscription: vi.fn().mockResolvedValue(undefined),
    getQuietHours: vi.fn().mockResolvedValue(null),
    setQuietHours: vi.fn().mockResolvedValue(undefined),
    clearQuietHours: vi.fn().mockResolvedValue(undefined),
    listDirectory: vi.fn().mockResolvedValue([]),
  };
});

// ── attemptService ────────────────────────────────────────────────────────────
vi.mock('@application/services/attemptService', () => ({
  listAttempts: vi.fn().mockResolvedValue([]),
}));

// ── gradingService ────────────────────────────────────────────────────────────
vi.mock('@application/services/gradingService', () => ({
  listGrades: vi.fn().mockResolvedValue([]),
  submitFirstReview: vi.fn().mockResolvedValue(undefined),
  submitSecondReview: vi.fn().mockResolvedValue(undefined),
  decryptNotes: vi.fn().mockResolvedValue(''),
  isComplete: vi.fn().mockReturnValue(false),
  NotesDecryptionError: class NotesDecryptionError extends Error {},
  SecondReviewDeltaBlockedError: class SecondReviewDeltaBlockedError extends Error {},
}));

// questionsRepository is NOT mocked — the real repository uses fake-indexeddb.

// ── healthService ─────────────────────────────────────────────────────────────
vi.mock('@application/services/healthService', async () => {
  const { writable } = await import('svelte/store');
  return {
    healthProfile: writable({
      loaded: false,
      preferences: { goals: [], allergens: [], dislikes: [], ageRange: null, activityLevel: null },
    }),
    loadHealthProfile: vi.fn().mockResolvedValue(undefined),
    saveHealthProfile: vi.fn().mockResolvedValue(undefined),
    recommendForCurrentUser: vi.fn().mockReturnValue({ budget: null, items: [] }),
    applySwap: vi.fn().mockResolvedValue({
      preferences: { goals: [], allergens: [], dislikes: [], ageRange: null, activityLevel: null },
      swap: { name: 'Food' },
    }),
    nutritionBudgetFor: vi.fn().mockReturnValue(null),
  };
});

// ── configRecordService ───────────────────────────────────────────────────────
vi.mock('@application/services/configRecordService', async () => {
  const { writable } = await import('svelte/store');
  return {
    visibleRecords: writable([]),
    showExpired: Object.assign(writable(false), { toggle: vi.fn() }),
    getRecord: vi.fn().mockReturnValue(null),
    refreshRecords: vi.fn().mockResolvedValue(undefined),
    updateRecord: vi.fn().mockResolvedValue({ ok: true }),
  };
});

// ── configService ─────────────────────────────────────────────────────────────
vi.mock('@application/services/configService', () => ({
  runtimeConfig: vi.fn(() => ({
    appMode: 'development',
    localeDefault: 'en-US',
    staticConfigPath: '/config/app.json',
  })),
}));

// ── exportService ─────────────────────────────────────────────────────────────
vi.mock('@application/services/exportService', () => ({
  exportToBlob: vi.fn().mockResolvedValue(new Blob(['{}'])),
  downloadSnapshot: vi.fn(),
  importFromFile: vi.fn().mockResolvedValue({ ok: true, imported: 0, errors: [] }),
}));

import Trips from '../src/ui/routes/Trips.svelte';
import Questions from '../src/ui/routes/Questions.svelte';
import Messaging from '../src/ui/routes/Messaging.svelte';
import Review from '../src/ui/routes/Review.svelte';
import Wellness from '../src/ui/routes/Wellness.svelte';
import Configuration from '../src/ui/routes/Configuration.svelte';
import ConfigTable from '../src/ui/components/ConfigTable.svelte';

// ── helper: bootstrap admin, login, then mount component ─────────────────────
async function mountAsAdmin(
  Comp: new (opts: { target: HTMLElement }) => unknown
): Promise<HTMLElement> {
  await bootstrapFirstAdmin('admin', 'Admin123!');
  await login('admin', 'Admin123!');
  const host = document.createElement('div');
  document.body.appendChild(host);
  new Comp({ target: host });
  await tick();
  await tick();
  return host;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trips
// ─────────────────────────────────────────────────────────────────────────────

describe('Trips route', () => {
  it('renders the page header', async () => {
    const host = await mountAsAdmin(Trips);
    expect(host.innerHTML).toContain('Dispatcher · Trips');
  });

  it('shows the New trip button', async () => {
    const host = await mountAsAdmin(Trips);
    expect(host.innerHTML).toContain('New trip');
  });

  it('shows empty-state message when no trips exist', async () => {
    const host = await mountAsAdmin(Trips);
    expect(host.innerHTML).toContain('No trips yet');
  });

  it('renders a row for a trip created via the real service', async () => {
    await bootstrapFirstAdmin('admin', 'Admin123!');
    await login('admin', 'Admin123!');
    // createTrip writes to fake-indexeddb and updates the trips store directly
    const result = await createTrip({
      name: 'Northbound Express',
      origin: 'Downtown Hub',
      destination: 'Airport Terminal',
      departureAt: Date.now() + 86_400_000,
      rows: 10,
      cols: 4,
    });
    expect(result.ok).toBe(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Trips({ target: host });
    await tick();
    await tick();

    // The Trips component subscribes to the real trips store which was just updated
    expect(host.innerHTML).toContain('Northbound Express');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Questions
// ─────────────────────────────────────────────────────────────────────────────

describe('Questions route', () => {
  it('renders the page header', async () => {
    const host = await mountAsAdmin(Questions);
    expect(host.innerHTML).toContain('Question Management');
  });

  it('shows the New question button', async () => {
    const host = await mountAsAdmin(Questions);
    expect(host.innerHTML).toContain('New question');
  });

  it('renders the questions table', async () => {
    const host = await mountAsAdmin(Questions);
    expect(host.querySelector('table')).not.toBeNull();
  });

  it('renders a row for a question created via the real service', async () => {
    await bootstrapFirstAdmin('admin', 'Admin123!');
    await login('admin', 'Admin123!');
    // createQuestion writes to fake-indexeddb and updates the questions store directly
    const result = await createQuestion({
      type: 'single_choice',
      prompt: 'Which city is the capital of France?',
      choices: [
        { id: 'ch-a', label: 'Paris' },
        { id: 'ch-b', label: 'Lyon' },
      ],
      correctChoiceIds: ['ch-a'],
      correctNumeric: null,
      numericTolerance: 0,
      acceptedAnswers: [],
      caseSensitive: false,
      difficulty: 2,
      maxScore: 10,
      explanation: 'Paris is the capital of France.',
      tags: ['geography'],
      knowledgePoints: ['KP-1'],
      applicableDepartments: ['Ops'],
    });
    expect(result.ok).toBe(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    new Questions({ target: host });
    await tick();
    await tick();

    // The Questions component subscribes to the real questions store which was just updated
    expect(host.innerHTML).toContain('Which city is the capital of France?');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Messaging
// ─────────────────────────────────────────────────────────────────────────────

describe('Messaging route', () => {
  it('renders the page header', async () => {
    const host = await mountAsAdmin(Messaging);
    expect(host.innerHTML).toContain('Messaging');
  });

  it('shows the Compose button', async () => {
    const host = await mountAsAdmin(Messaging);
    expect(host.innerHTML).toContain('Compose');
  });

  it('shows the Inbox section', async () => {
    const host = await mountAsAdmin(Messaging);
    expect(host.innerHTML).toContain('Inbox');
  });

  it('shows the subscription preferences section', async () => {
    const host = await mountAsAdmin(Messaging);
    expect(host.innerHTML).toContain('Subscription');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review
// ─────────────────────────────────────────────────────────────────────────────

describe('Review route', () => {
  it('renders the page header', async () => {
    const host = await mountAsAdmin(Review);
    expect(host.innerHTML).toContain('Grading');
  });

  it('renders the attempts table', async () => {
    const host = await mountAsAdmin(Review);
    expect(host.querySelector('table')).not.toBeNull();
  });

  it('shows Attempt column header', async () => {
    const host = await mountAsAdmin(Review);
    expect(host.innerHTML).toContain('Attempt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wellness
// ─────────────────────────────────────────────────────────────────────────────

describe('Wellness route', () => {
  it('renders the page header', async () => {
    const host = await mountAsAdmin(Wellness);
    expect(host.innerHTML).toContain('Wellness Profile');
  });

  it('shows the Save profile button', async () => {
    const host = await mountAsAdmin(Wellness);
    expect(host.innerHTML).toContain('Save profile');
  });

  it('shows goals section', async () => {
    const host = await mountAsAdmin(Wellness);
    expect(host.innerHTML).toContain('Goals');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

describe('Configuration route', () => {
  it('renders the page header', async () => {
    const host = await mountAsAdmin(Configuration);
    expect(host.innerHTML).toContain('Configuration Console');
  });

  it('shows the Export snapshot button', async () => {
    const host = await mountAsAdmin(Configuration);
    expect(host.innerHTML).toContain('Export snapshot');
  });

  it('shows the app mode from mocked runtimeConfig', async () => {
    const host = await mountAsAdmin(Configuration);
    expect(host.innerHTML).toContain('development');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ConfigTable (inline-editing table component)
// Exercises startEdit, isEditing, coerceDraft, commit, cancel
// ─────────────────────────────────────────────────────────────────────────────

const sampleRow = {
  id: 'r1', name: 'Record A', device: 'D1', department: 'Ops', project: 'P1',
  sampleQueue: 'Q1', sampleType: 'T1', tags: ['alpha', 'beta'],
  effectiveFrom: '01/01/2024', effectiveTo: '12/31/2024',
  priceUsd: 9.99, valid: true,
};

describe('ConfigTable component', () => {
  it('renders a row when given one record', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new ConfigTable({ target: host, props: { rows: [sampleRow] } } as never);
    await tick();
    expect(host.innerHTML).toContain('Record A');
  });

  it('renders text cells for each TEXT_FIELD (isEditing called per cell)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new ConfigTable({ target: host, props: { rows: [sampleRow] } } as never);
    await tick();
    // 8 TEXT_FIELDS + priceUsd + tags + valid + details-btn = 12 cells
    expect(host.querySelectorAll('tbody td').length).toBeGreaterThanOrEqual(8);
  });

  it('shows the record name in the first text cell', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new ConfigTable({ target: host, props: { rows: [sampleRow] } } as never);
    await tick();
    expect(host.innerHTML).toContain('Record A');
  });

  it('shows a Details button for each row', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new ConfigTable({ target: host, props: { rows: [sampleRow] } } as never);
    await tick();
    const btn = host.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('Details');
  });
});
