import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
  sendMessage, tickQueue, markRead, refreshMessages, messages, deadLetters,
  getSubscription, updateSubscription, getQuietHours, setQuietHours, clearQuietHours
} from '@application/services/messagingService';
import { register, login, logout, currentUserId, bootstrapFirstAdmin } from '@application/services/authService';
import { messagesRepository } from '@persistence/messagesRepository';
import { messagingPolicyRepository } from '@persistence/messagingPolicyRepository';
import { preferences } from '@persistence/preferences';
import { businessConfig } from '@application/services/businessConfig';

const RATE_LIMIT = businessConfig().messaging.ratePerMinute;

async function loginAs(name: string, role: 'dispatcher' | 'reviewer' = 'dispatcher'): Promise<string> {
  await register(name, 'longenough', role);
  await login(name, 'longenough');
  return currentUserId() as string;
}

async function loginAsAdmin(name: string): Promise<string> {
  await bootstrapFirstAdmin(name, 'longenough');
  await login(name, 'longenough');
  return currentUserId() as string;
}

/** Register a recipient WITHOUT clobbering the active session. */
async function registerRecipient(name: string, role: 'dispatcher' | 'reviewer' = 'reviewer'): Promise<string> {
  const u = await register(name, 'longenough', role);
  return u.id;
}

/** Force the recipient's quiet hours to include "now" via the localStorage-backed preference. */
function quietNowFor(recipientId: string): void {
  const h = new Date().getHours();
  preferences.setQuietHours(recipientId, { startHour: h, endHour: (h + 1) % 24 });
}

/** Force the recipient's quiet hours to exclude "now". */
function quietNeverFor(recipientId: string): void {
  const h = new Date().getHours();
  const safe = (h + 12) % 24;
  preferences.setQuietHours(recipientId, { startHour: safe, endHour: (safe + 1) % 24 });
}

describe('messagingService', () => {
  it('rejects send when not authenticated', async () => {
    await expect(sendMessage({ toUserId: 'b', category: 'system' })).rejects.toThrow(/Authentication/);
  });

  it('rejects send when the recipient does not exist', async () => {
    await loginAs('alice');
    await expect(sendMessage({ toUserId: 'ghost-id', category: 'system', subject: 's', body: 'b' }))
      .rejects.toThrow(/Unknown recipient/);
    // No message should have been persisted.
    const all = await messagesRepository.list();
    expect(all.length).toBe(0);
  }, 30000);

  it('rejects send when toUserId is whitespace-only (covers .trim() branch)', async () => {
    await loginAs('ws-sender');
    await expect(sendMessage({ toUserId: '   ', category: 'system' }))
      .rejects.toThrow(/Recipient is required/);
  }, 30000);

  it('renders templates and delivers immediately', async () => {
    await loginAs('alice');
    const recipient = await registerRecipient('bob');
    quietNeverFor(recipient);
    const m = await sendMessage({
      toUserId: recipient, category: 'system',
      templateId: 'tpl-welcome', variables: { name: 'Ada', role: 'admin' }
    });
    expect(m.subject).toContain('Ada');
    expect(m.body).toContain('admin');
    expect(m.fromUserId).toBeTruthy();
    await refreshMessages();
    const stored = get(messages).find((x) => x.id === m.id);
    expect(stored?.status).toBe('delivered');
    expect(stored?.deliveredAt).not.toBeNull();
  }, 30000);

  it('sends without a template using explicit subject/body', async () => {
    await loginAs('alice');
    const recipient = await registerRecipient('bob');
    quietNeverFor(recipient);
    const m = await sendMessage({
      toUserId: recipient, category: 'system',
      subject: 'plain', body: 'no template'
    });
    expect(m.subject).toBe('plain');
    expect(m.body).toBe('no template');
  }, 30000);

  it('rejects unknown templates', async () => {
    await loginAs('alice');
    const recipient = await registerRecipient('bob');
    await expect(sendMessage({ toUserId: recipient, category: 'system', templateId: 'no-such' }))
      .rejects.toThrow(/Unknown template/);
  }, 30000);

  it('drops messages to unsubscribed recipients into dead letter', async () => {
    const aliceId = await loginAs('alice');
    quietNeverFor(aliceId);
    await updateSubscription({ userId: aliceId, unsubscribed: ['wellness'] });
    const m = await sendMessage({ toUserId: aliceId, category: 'wellness', subject: 's', body: 'b' });
    await refreshMessages();
    const stored = get(messages).find((x) => x.id === m.id);
    expect(stored?.status).toBe('dead');
    expect(get(deadLetters).find((x) => x.id === m.id)).toBeTruthy();
  }, 30000);

  it('subscription preferences round-trip; users cannot edit other users preferences', async () => {
    const aliceId = await loginAs('alice');
    expect((await getSubscription(aliceId)).unsubscribed).toEqual([]);
    await updateSubscription({ userId: aliceId, unsubscribed: ['system'] });
    expect((await getSubscription(aliceId)).unsubscribed).toEqual(['system']);
    await expect(updateSubscription({ userId: 'someone-else', unsubscribed: [] })).rejects.toThrow(/another user/);
  }, 30000);

  it('getSubscription rejects cross-user reads unless caller is admin', async () => {
    const aliceId = await loginAs('alice');
    await updateSubscription({ userId: aliceId, unsubscribed: ['system'] });

    logout();
    const bobId = await loginAs('bob');
    await expect(getSubscription(aliceId)).rejects.toThrow(/another user/);
    expect((await getSubscription(bobId)).unsubscribed).toEqual([]);

    logout();
    await loginAsAdmin('boss');
    const view = await getSubscription(aliceId);
    expect(view.unsubscribed).toEqual(['system']);
  }, 90000);

  it('getSubscription rejects when not authenticated', async () => {
    await expect(getSubscription('anyone')).rejects.toThrow(/Authentication/);
  });

  it('defers during recipient quiet hours and dispatches once outside', async () => {
    const aliceId = await loginAs('alice');
    quietNowFor(aliceId);
    const m = await sendMessage({ toUserId: aliceId, category: 'system', subject: 's', body: 'b' });
    await refreshMessages();
    let stored = get(messages).find((x) => x.id === m.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.lastError).toMatch(/Quiet/);

    quietNeverFor(aliceId);
    if (stored) {
      stored.nextAttemptAt = Date.now() - 1;
      await messagesRepository.put(stored);
    }
    await tickQueue();
    stored = get(messages).find((x) => x.id === m.id);
    expect(stored?.status).toBe('delivered');
  }, 30000);

  it('rate-limits at 30 per minute and defers the 31st (atomic IDB counter)', async () => {
    await loginAs('alice');
    const recipient = await registerRecipient('spam-target');
    quietNeverFor(recipient);
    for (let i = 0; i < RATE_LIMIT; i++) {
      await sendMessage({ toUserId: recipient, category: 'system', subject: `s${i}`, body: 'b' });
    }
    const last = await sendMessage({ toUserId: recipient, category: 'system', subject: 'over', body: 'b' });
    await refreshMessages();
    const stored = get(messages).find((x) => x.id === last.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.lastError).toMatch(/Rate/);
    const rate = await messagingPolicyRepository._getRateForTesting(recipient);
    expect(rate?.count).toBe(RATE_LIMIT);
  }, 60000);

  it('rate counter survives a logout/login (persistent across "page refresh")', async () => {
    const aliceId = await loginAs('alice');
    quietNeverFor(aliceId);
    await sendMessage({ toUserId: aliceId, category: 'system', subject: 's', body: 'b' });
    const before = await messagingPolicyRepository._getRateForTesting(aliceId);
    expect(before?.count).toBe(1);
    logout();
    await login('alice', 'longenough');
    const after = await messagingPolicyRepository._getRateForTesting(aliceId);
    expect(after?.count).toBe(1);
  }, 30000);

  it('marks delivered messages as read; rejects marking another user\'s message', async () => {
    const aliceId = await loginAs('alice');
    quietNeverFor(aliceId);
    const m = await sendMessage({ toUserId: aliceId, category: 'system', subject: 's', body: 'b' });
    await markRead(m.id);
    await refreshMessages();
    const stored = get(messages).find((x) => x.id === m.id);
    expect(stored?.status).toBe('read');
    expect(stored?.readAt).not.toBeNull();
    await markRead('nope');

    logout();
    await loginAs('bob');
    quietNeverFor(aliceId);
    const m2 = await sendMessage({ toUserId: aliceId, category: 'system', subject: 's', body: 'b' });
    await expect(markRead(m2.id)).rejects.toThrow(/another user/);
  }, 60000);

  it('quiet-hours deferrals do NOT consume retry slots — message stays pending across many ticks', async () => {
    // Regression: a message in a long quiet window must not be prematurely
    // exhausted into the dead letter queue. attempts is reserved for real
    // delivery attempts; deferrals only update nextAttemptAt + lastError.
    await loginAs('alice');
    const recipient = await registerRecipient('bob');
    quietNowFor(recipient);
    const m = await sendMessage({ toUserId: recipient, category: 'system', subject: 's', body: 'b' });
    let stored = (await messagesRepository.list()).find((x) => x.id === m.id);
    expect(stored?.status).toBe('pending');
    for (let i = 0; i < 5; i++) {
      if (stored) {
        stored.nextAttemptAt = Date.now() - 1;
        await messagesRepository.put(stored);
      }
      await tickQueue();
      stored = (await messagesRepository.list()).find((x) => x.id === m.id);
    }
    // After 5 quiet-hour ticks the message is STILL pending, attempts is
    // STILL 0, and it has NOT been moved to the dead letter queue.
    expect(stored?.status).toBe('pending');
    expect(stored?.attempts).toBe(0);
    expect(stored?.lastError).toMatch(/Quiet/);
    expect((await messagesRepository.listDeadLetters()).find((x) => x.id === m.id)).toBeUndefined();
  }, 30000);

  it('rate-limit deferrals do NOT consume retry slots either', async () => {
    await loginAs('alice');
    const recipient = await registerRecipient('rl-bob');
    quietNeverFor(recipient);
    // Saturate the rate limiter for the recipient.
    for (let i = 0; i < RATE_LIMIT; i++) {
      await sendMessage({ toUserId: recipient, category: 'system', subject: `s${i}`, body: 'b' });
    }
    const blocked = await sendMessage({ toUserId: recipient, category: 'system', subject: 'over', body: 'b' });
    let stored = (await messagesRepository.list()).find((x) => x.id === blocked.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.lastError).toMatch(/Rate/);
    // Re-tick a few times — still no attempt consumed.
    for (let i = 0; i < 3; i++) {
      if (stored) {
        stored.nextAttemptAt = Date.now() - 1;
        await messagesRepository.put(stored);
      }
      await tickQueue();
      stored = (await messagesRepository.list()).find((x) => x.id === blocked.id);
    }
    expect(stored?.attempts).toBe(0);
    expect(stored?.status).toBe('pending');
    expect((await messagesRepository.listDeadLetters()).find((x) => x.id === blocked.id)).toBeUndefined();
  }, 60000);

  it('a message that has already exhausted its delivery attempts is moved to the dead letter queue on the next tick', async () => {
    // Simulate a message whose `attempts` counter has been driven up by
    // real delivery failures (or by an admin/migration). The next time it
    // is processed it must be moved straight to the dead letter queue.
    const aliceId = await loginAs('alice');
    quietNeverFor(aliceId);
    const m = await sendMessage({ toUserId: aliceId, category: 'system', subject: 's', body: 'b' });
    // Drive attempts up to the configured ceiling and force re-processing.
    const cfg = businessConfig().messaging;
    const stored = (await messagesRepository.list()).find((x) => x.id === m.id);
    if (!stored) throw new Error('setup');
    stored.status = 'pending';
    stored.attempts = cfg.maxAttempts; // next attempt would exceed
    stored.nextAttemptAt = Date.now() - 1;
    await messagesRepository.put(stored);
    await tickQueue();
    const after = (await messagesRepository.list()).find((x) => x.id === m.id);
    expect(after?.status).toBe('dead');
    expect(after?.lastError).toMatch(/Exceeded/);
    expect((await messagesRepository.listDeadLetters()).find((x) => x.id === m.id)).toBeTruthy();
  }, 30000);

  it('refreshMessages object-level filters by current user; admins see everything', async () => {
    const aliceId = await loginAs('alice');
    const recipient = await registerRecipient('recv');
    quietNeverFor(recipient);
    await sendMessage({ toUserId: recipient, category: 'system', subject: 'a-msg', body: 'x' });
    logout();

    const bobId = await loginAs('bob');
    await sendMessage({ toUserId: recipient, category: 'system', subject: 'b-msg', body: 'y' });
    await refreshMessages();
    const bobView = get(messages);
    expect(bobView.every((m) => m.fromUserId === bobId || m.toUserId === bobId)).toBe(true);

    logout();
    await loginAsAdmin('boss');
    await refreshMessages();
    const adminView = get(messages);
    expect(adminView.length).toBeGreaterThanOrEqual(2);
    expect(adminView.some((m) => m.fromUserId === aliceId)).toBe(true);
  }, 60000);

  it('tickQueue is a no-op when no messages are due', async () => {
    await loginAs('alice');
    await tickQueue();
    await refreshMessages();
    expect(get(messages).length).toBe(0);
  }, 30000);

  // ---- per-user quiet hours, localStorage-backed ----

  it('quiet hours round-trip via the localStorage-backed service helpers', async () => {
    const me = await loginAs('qh-user');
    expect(getQuietHours(me)).toBeNull();
    setQuietHours(me, { startHour: 22, endHour: 6 });
    expect(getQuietHours(me)).toEqual({ startHour: 22, endHour: 6 });
    // Confirm storage is genuinely localStorage
    expect(localStorage.getItem(`task09.pref.quietHours.${me}`)).toBeTruthy();
    clearQuietHours(me);
    expect(getQuietHours(me)).toBeNull();
  }, 30000);

  it('rejects invalid quiet-hours values at the service boundary', async () => {
    const me = await loginAs('qh-user');
    expect(() => setQuietHours(me, { startHour: -1, endHour: 5 })).toThrow();
    expect(() => setQuietHours(me, { startHour: 5, endHour: 24 })).toThrow();
    expect(() => setQuietHours(me, { startHour: 5, endHour: 5 })).toThrow();
    expect(() => setQuietHours(me, { startHour: 1.5, endHour: 5 } as never)).toThrow();
  }, 30000);

  it('users cannot read or set another user\'s quiet hours unless admin', async () => {
    const aliceId = await loginAs('alice');
    setQuietHours(aliceId, { startHour: 22, endHour: 6 });
    logout();
    await loginAs('bob');
    expect(() => getQuietHours(aliceId)).toThrow(/another user/);
    expect(() => setQuietHours(aliceId, { startHour: 21, endHour: 7 })).toThrow(/another user/);
    expect(() => clearQuietHours(aliceId)).toThrow(/another user/);
    logout();
    await loginAsAdmin('boss');
    expect(getQuietHours(aliceId)).toEqual({ startHour: 22, endHour: 6 });
  }, 90000);
});
