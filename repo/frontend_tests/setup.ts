import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { _resetDbCache } from '@persistence/indexedDb';
import { _resetLogsForTesting } from '@shared/logging/logger';
import { logout } from '@application/services/authService';
import { _resetTripsForTesting } from '@application/services/tripsService';
import { _resetSeatMapForTesting } from '@application/services/seatMapService';

// BroadcastChannel is not available in happy-dom
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
  await _resetDbCache();
  _resetTripsForTesting();
  _resetSeatMapForTesting();
  _resetLogsForTesting();
  logout();
  await deleteIdbDatabase();
  document.body.innerHTML = '';
});
