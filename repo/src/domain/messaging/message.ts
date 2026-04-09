export type MessageStatus = 'pending' | 'delivered' | 'read' | 'dead';

export interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  category: string;
  templateId: string | null;
  subject: string;
  body: string;
  variables: Record<string, string>;
  attempts: number;
  status: MessageStatus;
  lastError: string | null;
  createdAt: number;
  nextAttemptAt: number;
  deliveredAt: number | null;
  readAt: number | null;
}

export interface SubscriptionPreferences {
  userId: string;
  unsubscribed: string[];   // categories
}
