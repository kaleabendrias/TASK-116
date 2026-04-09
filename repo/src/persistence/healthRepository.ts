import type { HealthProfile } from '@domain/health/healthProfile';
import { idbAll, idbGet, idbPut } from './indexedDb';

export const healthRepository = {
  list: (): Promise<HealthProfile[]> => idbAll<HealthProfile>('healthProfiles'),
  get: (userId: string): Promise<HealthProfile | undefined> => idbGet<HealthProfile>('healthProfiles', userId),
  put: (p: HealthProfile): Promise<void> => idbPut('healthProfiles', p)
};
