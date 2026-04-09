import { describe, it, expect } from 'vitest';
import {
  logger, recentLogs, flushLogs, loadPersistedLogs, _resetLogsForTesting
} from '@shared/logging/logger';
import { idbAll } from '@persistence/indexedDb';
import type { LogEntry } from '@shared/logging/logger';

describe('logger IDB persistence', () => {
  it('writes log entries through to the IndexedDB logs store', async () => {
    logger.info('persist.test', { kind: 'audit' });
    await flushLogs();

    const stored = await idbAll<LogEntry>('logs');
    expect(stored.find((e) => e.event === 'persist.test')).toBeTruthy();
  });

  it('survives a "session restart" — loadPersistedLogs repopulates the in-memory buffer from IDB', async () => {
    logger.info('survives.restart', { phase: 'before' });
    await flushLogs();

    // Simulate restart: blow away the in-memory buffer (does NOT touch IDB).
    _resetLogsForTesting();
    expect(recentLogs().find((e) => e.event === 'survives.restart')).toBeUndefined();

    await loadPersistedLogs();
    expect(recentLogs().find((e) => e.event === 'survives.restart')).toBeTruthy();
  });

  it('redacts sensitive fields BEFORE persisting them to IDB', async () => {
    logger.warn('auth.denied', {
      userId: 'u1',
      password: 'hunter2',
      notes: 'do not log me',
      encryptedPreferences: { v: 1, ivB64: 'x', ctB64: 'y' }
    });
    await flushLogs();

    const stored = await idbAll<LogEntry>('logs');
    const entry = stored.find((e) => e.event === 'auth.denied');
    expect(entry).toBeTruthy();
    if (!entry) return;
    expect(entry.context.userId).toBe('u1');
    expect(entry.context.password).toBe('[REDACTED]');
    expect(entry.context.notes).toBe('[REDACTED]');
    expect(entry.context.encryptedPreferences).toBe('[REDACTED]');
    // Confirm the raw payload never appears in the persisted blob.
    const raw = JSON.stringify(entry);
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('do not log me');
  });

  it('bounded retention: old entries get pruned beyond the cap', async () => {
    // Push enough entries to trigger several prune cycles. We don't assert
    // the exact MAX (the constant is internal) — just that the persisted
    // store does not grow without bound.
    for (let i = 0; i < 700; i++) {
      logger.info(`evt${i}`);
    }
    await flushLogs();
    const stored = await idbAll<LogEntry>('logs');
    expect(stored.length).toBeLessThanOrEqual(600);
  });
});
