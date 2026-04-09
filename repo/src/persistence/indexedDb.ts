const DB_NAME = 'task09';
const DB_VERSION = 4;

export const STORES = [
  'users',
  'questions',
  'attempts',
  'grades',
  'messages',
  'deadLetters',
  'healthProfiles',
  'trips',
  'seats',
  'holds',
  'bookings',
  'catalogs',
  'messagingPolicy',
  'logs'
] as const;

export type StoreName = typeof STORES[number];

let dbPromise: Promise<IDBDatabase> | null = null;

/** Test-only: close and drop the cached DB connection so the next call re-opens. */
export async function _resetDbCache(): Promise<void> {
  if (dbPromise) {
    try { (await dbPromise).close(); } catch { /* noop */ }
  }
  dbPromise = null;
}

export function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const d = req.result;
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      }
      // v2: enforce one-grade-per-attempt with a unique secondary index.
      const tx = (event.target as IDBOpenDBRequest).transaction;
      if (tx) {
        const grades = tx.objectStore('grades');
        if (!grades.indexNames.contains('attemptId')) {
          grades.createIndex('attemptId', 'attemptId', { unique: true });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  const d = await getDb();
  return promisify<T | undefined>(d.transaction(store, 'readonly').objectStore(store).get(id));
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  const d = await getDb();
  return promisify<T[]>(d.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const d = await getDb();
  await promisify(d.transaction(store, 'readwrite').objectStore(store).put(value));
}

export async function idbDelete(store: StoreName, id: string): Promise<void> {
  const d = await getDb();
  await promisify(d.transaction(store, 'readwrite').objectStore(store).delete(id));
}

export async function idbClear(store: StoreName): Promise<void> {
  const d = await getDb();
  await promisify(d.transaction(store, 'readwrite').objectStore(store).clear());
}

