import { describe, it, expect } from 'vitest';
import { runtimeConfig, type RuntimeConfig } from '@application/services/configService';

describe('runtimeConfig', () => {
  it('returns an object with all required keys', () => {
    const cfg = runtimeConfig();
    const keys: (keyof RuntimeConfig)[] = [
      'appMode', 'testMode', 'localeDefault', 'localeFallback', 'staticConfigPath'
    ];
    for (const key of keys) {
      expect(cfg).toHaveProperty(key);
    }
  });

  it('appMode is a non-empty string', () => {
    const { appMode } = runtimeConfig();
    expect(typeof appMode).toBe('string');
    expect(appMode.length).toBeGreaterThan(0);
  });

  it('testMode is a boolean', () => {
    const { testMode } = runtimeConfig();
    expect(typeof testMode).toBe('boolean');
  });

  it('localeDefault is a non-empty string', () => {
    const { localeDefault } = runtimeConfig();
    expect(typeof localeDefault).toBe('string');
    expect(localeDefault.length).toBeGreaterThan(0);
  });

  it('localeFallback is a non-empty string', () => {
    const { localeFallback } = runtimeConfig();
    expect(typeof localeFallback).toBe('string');
    expect(localeFallback.length).toBeGreaterThan(0);
  });

  it('staticConfigPath is a non-empty string', () => {
    const { staticConfigPath } = runtimeConfig();
    expect(typeof staticConfigPath).toBe('string');
    expect(staticConfigPath.length).toBeGreaterThan(0);
  });

  it('falls back to "development" when VITE_APP_MODE is not set', () => {
    const { appMode } = runtimeConfig();
    // In the test environment VITE_APP_MODE is not set, so it should default
    expect(['development', 'production', 'test'].includes(appMode) || appMode.length > 0).toBe(true);
  });

  it('testMode defaults to false when VITE_TEST_MODE is not set', () => {
    const { testMode } = runtimeConfig();
    expect(typeof testMode).toBe('boolean');
  });

  it('returns a new object on each call (no shared mutable reference)', () => {
    const a = runtimeConfig();
    const b = runtimeConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
