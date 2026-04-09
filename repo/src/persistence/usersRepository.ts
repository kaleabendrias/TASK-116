import type { Role } from '@domain/auth/role';
import type { PasswordCredential } from '@shared/crypto/passwordHash';
import { idbAll, idbGet, idbPut } from './indexedDb';

export interface UserRecord {
  id: string;
  username: string;
  role: Role;
  /**
   * Functional department membership. `null` for accounts created without
   * a department — they are limited to questions that have NO department
   * scope at all (empty `applicableDepartments`).
   */
  department: string | null;
  credential: PasswordCredential;
  /** Salt for AES key derivation, base64. Reused across logins. */
  encryptionSaltB64: string;
  createdAt: number;
}

export const usersRepository = {
  list: (): Promise<UserRecord[]> => idbAll<UserRecord>('users'),
  get: (id: string): Promise<UserRecord | undefined> => idbGet<UserRecord>('users', id),
  async findByUsername(username: string): Promise<UserRecord | undefined> {
    const all = await idbAll<UserRecord>('users');
    return all.find((u) => u.username.toLowerCase() === username.toLowerCase());
  },
  put: (user: UserRecord): Promise<void> => idbPut('users', user)
};
