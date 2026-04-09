import { writable, derived, get } from 'svelte/store';
import type { Principal, Role } from '@domain/auth/role';
import { canAccess, type RouteKey } from '@domain/auth/permissions';
import { hashPassword, verifyPassword } from '@shared/crypto/passwordHash';
import { deriveAesKey } from '@shared/crypto/fieldCrypto';
import { bytesToB64 } from '@shared/crypto/base64';
import { uid } from '@shared/utils/id';
import { logger } from '@shared/logging/logger';
import { usersRepository, type UserRecord } from '@persistence/usersRepository';
// Imported as a value (class), but only referenced inside function bodies —
// the ESM circular dependency with authorization.ts is therefore safe.
import { AuthorizationError } from './authorization';

interface SessionState {
  principal: Principal | null;
  userId: string | null;
  encryptionKey: CryptoKey | null;
}

const session = writable<SessionState>({ principal: null, userId: null, encryptionKey: null });

export const principal = derived(session, ($s) => $s.principal);
export const isAuthenticated = derived(session, ($s) => $s.principal !== null);

export function currentRole(): Role | null {
  return get(session).principal?.role ?? null;
}

export function currentUserId(): string | null {
  return get(session).userId;
}

export function currentDepartment(): string | null {
  return get(session).principal?.department ?? null;
}

export function currentEncryptionKey(): CryptoKey | null {
  return get(session).encryptionKey;
}

export function authorize(route: RouteKey): boolean {
  return canAccess(route, currentRole());
}

const PUBLIC_ROLES: readonly Role[] = ['dispatcher', 'content_author', 'reviewer'];

async function buildUserRecord(
  username: string,
  password: string,
  role: Role,
  department: string | null
): Promise<UserRecord> {
  const credential = await hashPassword(password);
  const encSalt = crypto.getRandomValues(new Uint8Array(16));
  return {
    id: uid('user'),
    username: username.trim(),
    role,
    department: department && department.trim() ? department.trim() : null,
    credential,
    encryptionSaltB64: bytesToB64(encSalt),
    createdAt: Date.now()
  };
}

/**
 * Public registration. Cannot mint administrators — that path requires
 * the bootstrap helper or an admin-only promotion.
 */
export async function register(
  username: string,
  password: string,
  role: Role,
  department: string | null = null
): Promise<UserRecord> {
  if (!username.trim()) throw new Error('Username required');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  if (!PUBLIC_ROLES.includes(role)) {
    logger.warn('auth.register.denied', { reason: 'role_not_public', requestedRole: role });
    throw new Error('Role not allowed for public registration');
  }
  const existing = await usersRepository.findByUsername(username);
  if (existing) throw new Error('Username already taken');
  const user = await buildUserRecord(username, password, role, department);
  await usersRepository.put(user);
  logger.info('auth.register.success', { userId: user.id, role, department: user.department });
  return user;
}

/**
 * Returns true once at least one administrator exists. The login screen uses
 * this to decide whether to expose the first-run bootstrap form.
 */
export async function isAdminBootstrapped(): Promise<boolean> {
  const all = await usersRepository.list();
  return all.some((u) => u.role === 'administrator');
}

/**
 * Bootstrap the very first administrator. Idempotent in the sense that it
 * REFUSES to mint a second admin via this path — once any administrator
 * exists, callers must use the admin-only `promoteRole` helper.
 */
export async function bootstrapFirstAdmin(
  username: string,
  password: string,
  department: string | null = null
): Promise<UserRecord> {
  if (!username.trim()) throw new Error('Username required');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  const all = await usersRepository.list();
  if (all.some((u) => u.role === 'administrator')) {
    logger.warn('auth.bootstrap.denied', { reason: 'admin_exists' });
    throw new Error('An administrator already exists; use promoteRole instead');
  }
  if (await usersRepository.findByUsername(username)) {
    throw new Error('Username already taken');
  }
  const user = await buildUserRecord(username, password, 'administrator', department);
  await usersRepository.put(user);
  logger.info('auth.bootstrap.success', { userId: user.id });
  return user;
}

/**
 * Admin-only role promotion. Routes through the SAME centralized
 * `AuthorizationError` shape used everywhere else in the service layer
 * so callers can handle authorization failures uniformly. The hand-rolled
 * shape that lived here previously was a local-bypass risk: it could
 * drift out of sync with the central `requireRole` policy and silently
 * accept different rejection paths.
 */
export async function promoteRole(userId: string, role: Role): Promise<UserRecord> {
  const me = get(session);
  if (!me.userId || !me.principal || me.principal.role !== 'administrator') {
    logger.warn('auth.denied', {
      reason: me.principal ? 'wrong_role' : 'no_session',
      actor: me.userId, role: me.principal?.role ?? null,
      required: ['administrator'],
      action: 'promoteRole', target: userId, requestedRole: role
    });
    throw new AuthorizationError(
      `Only administrators can change roles (caller role: '${me.principal?.role ?? 'anonymous'}')`
    );
  }
  const target = (await usersRepository.list()).find((u) => u.id === userId);
  if (!target) throw new Error('User not found');
  const updated = { ...target, role };
  await usersRepository.put(updated);
  logger.info('auth.promote.success', { actor: me.userId, target: userId, role });
  return updated;
}

export async function login(username: string, password: string): Promise<void> {
  const user = await usersRepository.findByUsername(username);
  if (!user) {
    logger.warn('auth.login.failure', { reason: 'unknown_user' });
    throw new Error('Invalid credentials');
  }
  const ok = await verifyPassword(password, user.credential);
  if (!ok) {
    logger.warn('auth.login.failure', { reason: 'bad_password', userId: user.id });
    throw new Error('Invalid credentials');
  }
  const key = await deriveAesKey(password, user.encryptionSaltB64);
  session.set({
    principal: {
      username: user.username,
      role: user.role,
      department: user.department ?? null
    },
    userId: user.id,
    encryptionKey: key
  });
  logger.info('auth.login.success', { userId: user.id, role: user.role, department: user.department });
}

export function logout(): void {
  const me = get(session);
  if (me.userId) logger.info('auth.logout', { userId: me.userId });
  session.set({ principal: null, userId: null, encryptionKey: null });
}
