import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';

// CSS import inside src/main.ts — suppress Vite transform noise in happy-dom
vi.mock('../src/ui/styles/global.css', () => ({}));

// Prevent svelte-spa-router from installing hash-routing side effects in happy-dom
vi.mock('svelte-spa-router', async () => {
  const { writable: w } = await import('svelte/store');
  const { default: FakeRouter } = await import('./FakeRouter.svelte');
  return {
    default: FakeRouter,
    link: (_node: Element) => ({ destroy: () => {} }),
    location: w('/'),
  };
});

// App.svelte calls runtimeConfig() at module evaluation time
vi.mock('@application/services/configService', () => ({
  runtimeConfig: () => ({
    appMode: 'test',
    testMode: 'true',
    localeDefault: 'en-US',
    localeDefaultFallback: 'en',
    staticConfigPath: '/config/app.json',
  }),
}));

// Login.svelte imports DEPARTMENTS from businessConfig
vi.mock('@application/services/businessConfig', () => ({
  businessConfig: () => ({
    questions: { minDifficulty: 1, maxDifficulty: 5, minScore: 0, maxScore: 100 },
    knowledgePoints: [],
    departments: ['Ops'],
    messageTemplates: [],
    messageCategories: [],
    quietHours: { startHour: 22, endHour: 7 },
    messaging: { ratePerMinute: 10, maxAttempts: 3 },
    foods: [],
    grading: {
      partialIncrement: 0.5,
      secondReviewDelta: 2,
      weights: {
        short_answer: 1, single_choice: 1, multi_choice: 1,
        true_false: 1, fill_in_blank: 1, numeric: 1,
      },
    },
  }),
}));

describe('src/main.ts bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    document.getElementById('app')?.remove();
  });

  it('mounts the real App and shows the login screen when unauthenticated', async () => {
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);

    // Import the real entry point — no App.svelte or ensureSeedUsers mocks.
    // The real App.svelte renders Login when !$isAuthenticated.
    await import('../src/main.ts');
    await tick();

    expect(div.innerHTML).toContain('Sign in');
  });

  it('throws when #app element is missing', async () => {
    await expect(import('../src/main.ts')).rejects.toThrow('Mount element #app missing');
  });
});
