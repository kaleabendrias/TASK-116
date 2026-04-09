import { describe, it, expect, vi, afterEach } from 'vitest';
import { businessConfig } from '@application/services/businessConfig';
import { runtimeConfig } from '@application/services/configService';

describe('businessConfig', () => {
  it('exposes the loaded local JSON contract', () => {
    const cfg = businessConfig();
    expect(cfg.language).toBe('en');
    expect(cfg.quietHours).toEqual({ startHour: 21, endHour: 7 });
    expect(cfg.messaging.ratePerMinute).toBe(30);
    expect(cfg.messaging.maxAttempts).toBe(3);
    expect(cfg.grading.partialIncrement).toBe(0.5);
    expect(cfg.grading.secondReviewDelta).toBe(10);
    expect(cfg.questions.minDifficulty).toBe(1);
    expect(cfg.questions.maxDifficulty).toBe(5);
    expect(cfg.foods.length).toBeGreaterThan(0);
    expect(cfg.messageTemplates.length).toBeGreaterThan(0);
  });
});

describe('runtimeConfig', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('falls back to defaults when env is unset', () => {
    const cfg = runtimeConfig();
    expect(cfg.appMode).toBe('development');
    expect(cfg.localeDefault).toBe('en-US');
    expect(cfg.localeFallback).toBe('en');
    expect(cfg.staticConfigPath).toBe('/config');
    expect(cfg.testMode).toBe(false);
  });

  it('reads provided env values', () => {
    vi.stubEnv('VITE_APP_MODE', 'production');
    vi.stubEnv('VITE_TEST_MODE', 'true');
    vi.stubEnv('VITE_LOCALE_DEFAULT', 'fr-FR');
    vi.stubEnv('VITE_LOCALE_FALLBACK', 'fr');
    vi.stubEnv('VITE_STATIC_CONFIG_PATH', '/etc');
    const cfg = runtimeConfig();
    expect(cfg.appMode).toBe('production');
    expect(cfg.testMode).toBe(true);
    expect(cfg.localeDefault).toBe('fr-FR');
    expect(cfg.localeFallback).toBe('fr');
    expect(cfg.staticConfigPath).toBe('/etc');
  });
});
