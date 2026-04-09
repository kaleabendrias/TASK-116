import { writable } from 'svelte/store';
import type { Message, SubscriptionPreferences } from '@domain/messaging/message';
import { renderTemplate, backoffNextAttempt } from '@domain/messaging/messageRules';
import { isWithinQuietHours, nextQuietEnd, type QuietHours } from '@shared/utils/clock';
import { messagesRepository } from '@persistence/messagesRepository';
import { messagingPolicyRepository } from '@persistence/messagingPolicyRepository';
import { usersRepository } from '@persistence/usersRepository';
import type { Role } from '@domain/auth/role';
import { preferences } from '@persistence/preferences';
import { businessConfig } from './businessConfig';
import { uid } from '@shared/utils/id';
import { requireSession, hasAnyRole } from './authorization';
import { logger } from '@shared/logging/logger';

const messagesStore = writable<Message[]>([]);
const deadLettersStore = writable<Message[]>([]);

export const messages = { subscribe: messagesStore.subscribe };
export const deadLetters = { subscribe: deadLettersStore.subscribe };

/**
 * Minimal directory entry for the messaging UI's recipient picker. ONLY the
 * three fields strictly required to render an option in the compose modal —
 * never the credential hash, salt, encryption salt, or any other field that
 * could leak via the browser devtools / Svelte component state.
 */
export interface DirectoryEntry {
  id: string;
  username: string;
  role: Role;
}

/**
 * Service-level directory projection. Reads the user table behind the
 * authorization boundary (requires an active session) and projects each
 * record down to the safe minimum so that credential material is NEVER
 * handed to the UI layer in the first place.
 */
export async function listDirectory(): Promise<DirectoryEntry[]> {
  requireSession();
  const all = await usersRepository.list();
  return all.map((u): DirectoryEntry => ({
    id: u.id,
    username: u.username,
    role: u.role
  }));
}

/**
 * Object-level filtering: each refresh shows only the current user's messages.
 */
export async function refreshMessages(): Promise<void> {
  const me = requireSession();
  const all = await messagesRepository.list();
  const dead = await messagesRepository.listDeadLetters();
  if (hasAnyRole('administrator')) {
    messagesStore.set(all);
    deadLettersStore.set(dead);
  } else {
    messagesStore.set(all.filter((m) => m.fromUserId === me || m.toUserId === me));
    deadLettersStore.set(dead.filter((m) => m.fromUserId === me || m.toUserId === me));
  }
}

export interface SendMessageInput {
  toUserId: string;
  category: string;
  templateId?: string;
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
}

/** The sender is always the active session — never accepted from caller input. */
export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const fromUserId = requireSession();
  const cfg = businessConfig();

  // Validate the recipient exists BEFORE persisting any record. Sending to
  // a non-existent userId would create dead-end messages and let storage
  // drift away from the canonical user table.
  if (!input.toUserId || !input.toUserId.trim()) {
    throw new Error('Recipient is required');
  }
  const recipient = await usersRepository.get(input.toUserId);
  if (!recipient) {
    logger.warn('messaging.send.unknown_recipient', { sender: fromUserId, toUserId: input.toUserId });
    throw new Error(`Unknown recipient: ${input.toUserId}`);
  }

  let subject = input.subject ?? '';
  let body = input.body ?? '';
  if (input.templateId) {
    const tpl = cfg.messageTemplates.find((t) => t.id === input.templateId);
    if (!tpl) throw new Error('Unknown template');
    subject = tpl.subject;
    body = tpl.body;
  }
  const vars = input.variables ?? {};
  const message: Message = {
    id: uid('msg'),
    fromUserId,
    toUserId: input.toUserId,
    category: input.category,
    templateId: input.templateId ?? null,
    subject: renderTemplate(subject, vars),
    body: renderTemplate(body, vars),
    variables: vars,
    attempts: 0,
    status: 'pending',
    lastError: null,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
    deliveredAt: null,
    readAt: null
  };
  await messagesRepository.put(message);
  await processOne(message.id);
  await refreshMessages();
  return message;
}

/**
 * Drive a single message through the policy → delivery pipeline.
 *
 * Retry-counter semantics: `message.attempts` counts ONLY real delivery
 * attempts. Deferrals (quiet hours, rate limit) update `nextAttemptAt`
 * and `lastError` but DO NOT consume a retry slot — otherwise a message
 * sitting in a long quiet window would be prematurely exhausted and
 * dead-lettered before any reviewer ever saw it. Subscription drops
 * short-circuit immediately and also do not count as an attempt.
 */
async function processOne(messageId: string): Promise<void> {
  const cfg = businessConfig();
  const message = await messagesRepository.get(messageId);
  if (!message) return;
  if (message.status !== 'pending') return;
  if (message.nextAttemptAt > Date.now()) return;

  const now = new Date();

  // 1. Subscription drop — immediate, never counted as a delivery attempt.
  const prefs: SubscriptionPreferences = await messagesRepository.getSubscription(message.toUserId);
  if (prefs.unsubscribed.includes(message.category)) {
    const dropped: Message = {
      ...message,
      status: 'dead',
      lastError: `Recipient unsubscribed from ${message.category}`
    };
    await messagesRepository.put(dropped);
    await messagesRepository.pushDeadLetter(dropped);
    logger.warn('messaging.dropped', { messageId: message.id, reason: dropped.lastError });
    return;
  }

  // 2. Quiet hours — DEFERRAL, not an attempt. attempts is preserved.
  const recipientQuiet: QuietHours | null = preferences.getQuietHours(message.toUserId);
  const quiet = recipientQuiet ?? cfg.quietHours;
  if (isWithinQuietHours(now, quiet)) {
    const until = nextQuietEnd(now, quiet).getTime();
    const deferred: Message = {
      ...message,
      // attempts intentionally unchanged
      nextAttemptAt: Math.max(until, backoffNextAttempt(now, message.attempts + 1, cfg.messaging.retryBackoffMs)),
      lastError: 'Quiet hours'
    };
    await messagesRepository.put(deferred);
    logger.info('messaging.deferred', {
      messageId: message.id, attempts: message.attempts, reason: 'Quiet hours', nextAttemptAt: deferred.nextAttemptAt
    });
    return;
  }

  // 3. Rate limit — DEFERRAL, not an attempt. attempts is preserved.
  const consume = await messagingPolicyRepository.tryConsumeRate(
    message.toUserId,
    cfg.messaging.ratePerMinute,
    now.getTime()
  );
  if (!consume.ok) {
    const deferred: Message = {
      ...message,
      // attempts intentionally unchanged
      nextAttemptAt: Math.max(consume.nextAvailableAt, backoffNextAttempt(now, message.attempts + 1, cfg.messaging.retryBackoffMs)),
      lastError: 'Rate limit'
    };
    await messagesRepository.put(deferred);
    logger.info('messaging.deferred', {
      messageId: message.id, attempts: message.attempts, reason: 'Rate limit', nextAttemptAt: deferred.nextAttemptAt
    });
    return;
  }

  // 4. Real delivery attempt — only NOW does the retry counter advance.
  const attemptsNow = message.attempts + 1;
  if (attemptsNow > cfg.messaging.maxAttempts) {
    const dead: Message = {
      ...message,
      attempts: attemptsNow,
      status: 'dead',
      lastError: `Exceeded ${cfg.messaging.maxAttempts} delivery attempts`
    };
    await messagesRepository.put(dead);
    await messagesRepository.pushDeadLetter(dead);
    logger.warn('messaging.dead_letter', { messageId: message.id, reason: dead.lastError, attempts: attemptsNow });
    return;
  }

  try {
    const delivered: Message = {
      ...message,
      attempts: attemptsNow,
      status: 'delivered',
      deliveredAt: now.getTime(),
      lastError: null
    };
    await messagesRepository.put(delivered);
    logger.info('messaging.delivered', { messageId: message.id, attempts: attemptsNow });
  } catch (e) {
    // Real failure — bumped attempts is persisted with a backoff.
    const failed: Message = {
      ...message,
      attempts: attemptsNow,
      lastError: e instanceof Error ? e.message : 'Delivery failed',
      nextAttemptAt: backoffNextAttempt(now, attemptsNow, cfg.messaging.retryBackoffMs)
    };
    await messagesRepository.put(failed);
    logger.warn('messaging.deliver.failed', { messageId: message.id, attempts: attemptsNow, error: failed.lastError });
  }
}

/** Drive the queue — call on a timer from UI while messaging center is open. */
export async function tickQueue(): Promise<void> {
  requireSession();
  const all = await messagesRepository.list();
  for (const m of all) {
    if (m.status === 'pending' && m.nextAttemptAt <= Date.now()) {
      await processOne(m.id);
    }
  }
  await refreshMessages();
}

export async function markRead(messageId: string): Promise<void> {
  const me = requireSession();
  const m = await messagesRepository.get(messageId);
  if (!m || m.status !== 'delivered') return;
  if (m.toUserId !== me) throw new Error('Cannot mark another user\'s message as read');
  await messagesRepository.put({ ...m, status: 'read', readAt: Date.now() });
  await refreshMessages();
}

/**
 * Read a user's subscription preferences. Mirrors the write-path protection:
 * users can only see their own preferences; administrators may see anyone's.
 */
export async function getSubscription(userId: string): Promise<SubscriptionPreferences> {
  const me = requireSession();
  if (userId !== me && !hasAnyRole('administrator')) {
    logger.warn('messaging.subscription.read.denied', { actor: me, target: userId });
    throw new Error('Cannot read another user\'s subscription preferences');
  }
  return messagesRepository.getSubscription(userId);
}

/** Subscription edits are limited to the current user (or admin override). */
export async function updateSubscription(prefs: SubscriptionPreferences): Promise<void> {
  const me = requireSession();
  if (prefs.userId !== me && !hasAnyRole('administrator')) {
    throw new Error('Cannot edit another user\'s subscription preferences');
  }
  await messagesRepository.putSubscription(prefs);
}

/* ---- Per-user quiet hours (localStorage-backed, sync) -------------------- */

/** Read a user's quiet-hours preference (own user, or admin override). */
export function getQuietHours(userId: string): QuietHours | null {
  const me = requireSession();
  if (userId !== me && !hasAnyRole('administrator')) {
    throw new Error('Cannot read another user\'s quiet hours');
  }
  return preferences.getQuietHours(userId);
}

/** Persist a user's quiet-hours preference. Validates the window. */
export function setQuietHours(userId: string, qh: QuietHours): void {
  const me = requireSession();
  if (userId !== me && !hasAnyRole('administrator')) {
    throw new Error('Cannot edit another user\'s quiet hours');
  }
  preferences.setQuietHours(userId, qh);
  logger.info('messaging.quiet_hours.updated', { userId, startHour: qh.startHour, endHour: qh.endHour });
}

/** Clear a user's quiet-hours preference. */
export function clearQuietHours(userId: string): void {
  const me = requireSession();
  if (userId !== me && !hasAnyRole('administrator')) {
    throw new Error('Cannot edit another user\'s quiet hours');
  }
  preferences.clearQuietHours(userId);
  logger.info('messaging.quiet_hours.cleared', { userId });
}
