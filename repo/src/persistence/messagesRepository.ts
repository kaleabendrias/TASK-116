import type { Message, SubscriptionPreferences } from '@domain/messaging/message';
import { idbAll, idbGet, idbPut } from './indexedDb';

const SUB_PREFIX = 'sub:';

export const messagesRepository = {
  list: (): Promise<Message[]> => idbAll<Message>('messages'),
  get: (id: string): Promise<Message | undefined> => idbGet<Message>('messages', id),
  put: (m: Message): Promise<void> => idbPut('messages', m),
  pushDeadLetter: (m: Message): Promise<void> => idbPut('deadLetters', m),
  listDeadLetters: (): Promise<Message[]> => idbAll<Message>('deadLetters'),

  async getSubscription(userId: string): Promise<SubscriptionPreferences> {
    const all = await idbAll<{ id: string; data: SubscriptionPreferences }>('catalogs');
    const found = all.find((c) => c.id === SUB_PREFIX + userId);
    return found?.data ?? { userId, unsubscribed: [] };
  },
  async putSubscription(prefs: SubscriptionPreferences): Promise<void> {
    await idbPut('catalogs', { id: SUB_PREFIX + prefs.userId, data: prefs });
  }
};
