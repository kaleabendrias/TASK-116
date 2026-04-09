import type { Trip } from '@domain/trips/trip';
import { idbAll, idbGet, idbPut } from './indexedDb';

export const tripsRepository = {
  list: (): Promise<Trip[]> => idbAll<Trip>('trips'),
  get: (id: string): Promise<Trip | undefined> => idbGet<Trip>('trips', id),
  put: (t: Trip): Promise<void> => idbPut('trips', t)
};
