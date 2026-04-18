import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { _resetDbCache } from '@persistence/indexedDb';
import { _setTabIdForTesting } from '@persistence/seatMapRepository';
import { _resetSeatMapForTesting } from '@application/services/seatMapService';
import { _resetTripsForTesting } from '@application/services/tripsService';
import { _resetLogsForTesting } from '@shared/logging/logger';
import { logout } from '@application/services/authService';
import { _resetSessionsForTesting } from '../server/app';
import { uid } from '@shared/utils/id';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const fake: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => { store.delete(k); },
    setItem: (k, v) => { store.set(k, String(v)); }
  };
  Object.defineProperty(globalThis, 'localStorage', { value: fake, writable: true });
}

if (typeof globalThis.BroadcastChannel === 'undefined') {
  class FakeBroadcastChannel {
    name: string;
    constructor(name: string) { this.name = name; }
    postMessage(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    close(): void {}
  }
  // @ts-expect-error polyfill
  globalThis.BroadcastChannel = FakeBroadcastChannel;
}

async function deleteIdbDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('task09');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetSessionsForTesting();
  await _resetDbCache();
  _resetSeatMapForTesting();
  _resetTripsForTesting();
  _resetLogsForTesting();
  _setTabIdForTesting(uid('tab-test'));
  logout();
  localStorage.clear();
  await deleteIdbDatabase();
});
