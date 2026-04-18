import { bootstrapFirstAdmin, register, isAdminBootstrapped } from '@application/services/authService';
import { usersRepository } from '@persistence/usersRepository';
import type { Role } from '@domain/auth/role';

export interface SeedUser {
  username: string;
  password: string;
  role: Role;
  department: string | null;
}

/** Predefined demo accounts created on first browser launch. */
export const SEED_USERS: SeedUser[] = [
  { username: 'admin',      password: 'Admin123!',    role: 'administrator',  department: null },
  { username: 'dispatcher', password: 'Disp123!',     role: 'dispatcher',     department: 'Operations' },
  { username: 'author',     password: 'Author123!',   role: 'content_author', department: 'Training' },
  { username: 'reviewer',   password: 'Review123!',   role: 'reviewer',       department: null }
];

/**
 * Idempotently seeds predefined demo users into IndexedDB on first launch.
 * Skips individual users that already exist to preserve manual changes.
 */
export async function ensureSeedUsers(): Promise<void> {
  try {
    const adminAlreadyExists = await isAdminBootstrapped();

    if (!adminAlreadyExists) {
      const adminSeed = SEED_USERS[0];
      await bootstrapFirstAdmin(adminSeed.username, adminSeed.password, adminSeed.department);
    }

    for (const seed of SEED_USERS.slice(1)) {
      const exists = await usersRepository.findByUsername(seed.username);
      if (!exists) {
        await register(seed.username, seed.password, seed.role, seed.department);
      }
    }
  } catch {
    // Seed failures must not break the application startup
  }
}
