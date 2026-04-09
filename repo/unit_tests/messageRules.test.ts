import { describe, it, expect } from 'vitest';
import {
  renderTemplate, decideDelivery, bumpRateLimit, backoffNextAttempt,
  type RateLimiterState
} from '@domain/messaging/messageRules';
import type { Message, SubscriptionPreferences } from '@domain/messaging/message';

function msg(over: Partial<Message> = {}): Message {
  return {
    id: 'm1', fromUserId: 'u1', toUserId: 'u2', category: 'system',
    templateId: null, subject: 's', body: 'b', variables: {},
    attempts: 0, status: 'pending', lastError: null,
    createdAt: 0, nextAttemptAt: 0, deliveredAt: null, readAt: null,
    ...over
  };
}

const quiet = { startHour: 21, endHour: 7 };
const noQuiet = { startHour: 0, endHour: 0 };
const subs: SubscriptionPreferences = { userId: 'u2', unsubscribed: [] };

describe('renderTemplate', () => {
  it('substitutes known variables and leaves unknowns intact', () => {
    expect(renderTemplate('Hi {name}, role {role}', { name: 'Ada', role: 'admin' }))
      .toBe('Hi Ada, role admin');
    expect(renderTemplate('Hi {name}, age {age}', { name: 'Ada' }))
      .toBe('Hi Ada, age {age}');
  });
});

describe('decideDelivery', () => {
  const middayDate = new Date('2026-04-08T13:00:00');
  const lateNightDate = new Date('2026-04-08T23:30:00');
  const earlyMorningDate = new Date('2026-04-08T05:00:00');
  const cfg = { ratePerMinute: 30, maxAttempts: 3, retryBackoffMs: 60_000 };

  it('drops when recipient unsubscribed', () => {
    const r = decideDelivery(
      msg({ category: 'wellness' }),
      middayDate,
      { userId: 'u2', unsubscribed: ['wellness'] },
      { windowStart: middayDate.getTime(), count: 0 },
      cfg.ratePerMinute, noQuiet, cfg.maxAttempts, cfg.retryBackoffMs
    );
    expect(r.kind).toBe('drop');
  });

  it('marks dead when attempts exhausted', () => {
    const r = decideDelivery(
      msg({ attempts: 3 }),
      middayDate, subs,
      { windowStart: middayDate.getTime(), count: 0 },
      cfg.ratePerMinute, noQuiet, cfg.maxAttempts, cfg.retryBackoffMs
    );
    expect(r.kind).toBe('dead');
  });

  it('defers during quiet hours (late night)', () => {
    const r = decideDelivery(
      msg(), lateNightDate, subs,
      { windowStart: lateNightDate.getTime(), count: 0 },
      cfg.ratePerMinute, quiet, cfg.maxAttempts, cfg.retryBackoffMs
    );
    expect(r.kind).toBe('defer');
    if (r.kind === 'defer') expect(r.reason).toMatch(/Quiet/);
  });

  it('defers during quiet hours (early morning)', () => {
    const r = decideDelivery(
      msg(), earlyMorningDate, subs,
      { windowStart: earlyMorningDate.getTime(), count: 0 },
      cfg.ratePerMinute, quiet, cfg.maxAttempts, cfg.retryBackoffMs
    );
    expect(r.kind).toBe('defer');
  });

  it('defers when rate limit exceeded', () => {
    const r = decideDelivery(
      msg(), middayDate, subs,
      { windowStart: middayDate.getTime(), count: 30 },
      30, noQuiet, cfg.maxAttempts, cfg.retryBackoffMs
    );
    expect(r.kind).toBe('defer');
    if (r.kind === 'defer') expect(r.reason).toMatch(/Rate/);
  });

  it('delivers in normal conditions', () => {
    const r = decideDelivery(
      msg(), middayDate, subs,
      { windowStart: middayDate.getTime(), count: 0 },
      cfg.ratePerMinute, noQuiet, cfg.maxAttempts, cfg.retryBackoffMs
    );
    expect(r.kind).toBe('deliver');
  });
});

describe('bumpRateLimit', () => {
  it('starts a new window after 60s', () => {
    const now = new Date('2026-04-08T13:00:00');
    const next = bumpRateLimit({ windowStart: now.getTime() - 70_000, count: 5 }, now);
    expect(next.count).toBe(1);
    expect(next.windowStart).toBe(now.getTime());
  });
  it('increments within window', () => {
    const now = new Date('2026-04-08T13:00:00');
    const start: RateLimiterState = { windowStart: now.getTime() - 10_000, count: 5 };
    const next = bumpRateLimit(start, now);
    expect(next.count).toBe(6);
    expect(next.windowStart).toBe(start.windowStart);
  });
});

describe('backoffNextAttempt', () => {
  it('linearly scales by attempt', () => {
    const now = new Date(1_000_000);
    expect(backoffNextAttempt(now, 1, 1000)).toBe(1_001_000);
    expect(backoffNextAttempt(now, 3, 1000)).toBe(1_003_000);
    expect(backoffNextAttempt(now, 0, 1000)).toBe(1_001_000); // floors to 1
  });
});
