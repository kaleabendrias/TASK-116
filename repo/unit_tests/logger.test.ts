import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  logger, recentLogs, subscribeLog, _resetLogsForTesting, _setLogPersistenceForTesting,
  ALLOWED_LOG_KEYS
} from '@shared/logging/logger';

beforeEach(() => {
  _setLogPersistenceForTesting(false);
  _resetLogsForTesting();
});
afterEach(() => {
  _setLogPersistenceForTesting(true);
});

describe('logger', () => {
  it('records entries with structured (allowlisted) fields', () => {
    logger.info('event.test', { userId: 'u-1', reason: 'demo' });
    const all = recentLogs();
    expect(all.length).toBe(1);
    expect(all[0].level).toBe('info');
    expect(all[0].event).toBe('event.test');
    expect(all[0].context).toEqual({ userId: 'u-1', reason: 'demo' });
    expect(typeof all[0].ts).toBe('number');
    expect(typeof all[0].id).toBe('string');
  });

  it('supports all four levels', () => {
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    const all = recentLogs();
    expect(all.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('limit clamps the buffer return size', () => {
    for (let i = 0; i < 10; i++) logger.info(`evt${i}`);
    expect(recentLogs(3).length).toBe(3);
    expect(recentLogs(100).length).toBe(10);
  });

  it('notifies subscribers and unsubscribes cleanly', () => {
    const seen: string[] = [];
    const off = subscribeLog((e) => seen.push(e.event));
    logger.info('a');
    logger.info('b');
    off();
    logger.info('c');
    expect(seen).toEqual(['a', 'b']);
  });

  it('survives subscriber exceptions', () => {
    subscribeLog(() => { throw new Error('boom'); });
    expect(() => logger.info('safe')).not.toThrow();
  });

  it('ring buffer caps at MAX entries', () => {
    for (let i = 0; i < 600; i++) logger.info(`e${i}`);
    expect(recentLogs(600).length).toBeLessThanOrEqual(500);
  });

  it('default-deny: redacts every key not on the allowlist', () => {
    logger.info('auth.attempt', {
      userId: 'alice',         // allowlisted → kept
      password: 'hunter2',     // not allowlisted → redacted
      hash: 'should-not-appear',
      saltB64: 'shh',
      notes: 'private',
      notesEncrypted: { v: 1, ivB64: '...', ctB64: '...' },
      encryptedPreferences: 'opaque',
      token: 'jwt'
    });
    const entry = recentLogs(1)[0];
    expect(entry.context.userId).toBe('alice');
    expect(entry.context.password).toBe('[REDACTED]');
    expect(entry.context.hash).toBe('[REDACTED]');
    expect(entry.context.saltB64).toBe('[REDACTED]');
    expect(entry.context.notes).toBe('[REDACTED]');
    expect(entry.context.notesEncrypted).toBe('[REDACTED]');
    expect(entry.context.encryptedPreferences).toBe('[REDACTED]');
    expect(entry.context.token).toBe('[REDACTED]');
  });

  it('default-deny: a freshly-introduced sensitive-looking key is automatically redacted', () => {
    // Simulating a developer adding a new field they forgot to enroll —
    // the allowlist policy catches it before it reaches the buffer.
    logger.warn('experimental', {
      sessionToken: 'NEW-LEAKY-FIELD',
      apiSecret: 'should-never-persist',
      userId: 'still-allowlisted'
    });
    const entry = recentLogs(1)[0];
    expect(entry.context.sessionToken).toBe('[REDACTED]');
    expect(entry.context.apiSecret).toBe('[REDACTED]');
    expect(entry.context.userId).toBe('still-allowlisted');
  });

  it('exposes ALLOWED_LOG_KEYS as a frozen reference set', () => {
    expect(ALLOWED_LOG_KEYS.has('userId')).toBe(true);
    expect(ALLOWED_LOG_KEYS.has('password')).toBe(false);
    expect(ALLOWED_LOG_KEYS.has('notes')).toBe(false);
  });
});
