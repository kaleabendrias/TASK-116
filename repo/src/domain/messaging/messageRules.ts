import type { QuietHours } from '@shared/utils/clock';
import { isWithinQuietHours, nextQuietEnd } from '@shared/utils/clock';
import type { Message, SubscriptionPreferences } from './message';

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

export type DeliveryDecision =
  | { kind: 'deliver' }
  | { kind: 'defer'; until: number; reason: string }
  | { kind: 'drop'; reason: string }
  | { kind: 'dead'; reason: string };

export interface RateLimiterState {
  windowStart: number;
  count: number;
}

export function decideDelivery(
  message: Message,
  now: Date,
  prefs: SubscriptionPreferences,
  rate: RateLimiterState,
  ratePerMinute: number,
  quiet: QuietHours,
  maxAttempts: number,
  retryBackoffMs: number
): DeliveryDecision {
  if (prefs.unsubscribed.includes(message.category)) {
    return { kind: 'drop', reason: `Recipient unsubscribed from ${message.category}` };
  }
  if (message.attempts >= maxAttempts) {
    return { kind: 'dead', reason: `Exceeded ${maxAttempts} attempts` };
  }
  if (isWithinQuietHours(now, quiet)) {
    return { kind: 'defer', until: nextQuietEnd(now, quiet).getTime(), reason: 'Quiet hours' };
  }
  if (now.getTime() - rate.windowStart < 60_000 && rate.count >= ratePerMinute) {
    return { kind: 'defer', until: rate.windowStart + 60_000, reason: 'Rate limit' };
  }
  return { kind: 'deliver' };
}

export function bumpRateLimit(rate: RateLimiterState, now: Date): RateLimiterState {
  if (now.getTime() - rate.windowStart >= 60_000) {
    return { windowStart: now.getTime(), count: 1 };
  }
  return { windowStart: rate.windowStart, count: rate.count + 1 };
}

export function backoffNextAttempt(now: Date, attempts: number, retryBackoffMs: number): number {
  // Linear backoff with attempt index multiplier.
  return now.getTime() + retryBackoffMs * Math.max(1, attempts);
}
