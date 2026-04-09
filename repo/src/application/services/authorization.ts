import type { Role } from '@domain/auth/role';
import { currentRole, currentUserId } from './authService';
import { logger } from '@shared/logging/logger';

export class AuthorizationError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** Resolve the active session's user id or throw. */
export function requireSession(): string {
  const id = currentUserId();
  if (!id) {
    logger.warn('auth.denied', { reason: 'no_session' });
    throw new AuthorizationError('Authentication required');
  }
  return id;
}

/** Resolve the active session and verify the role is allowed, or throw. */
export function requireRole(...allowed: Role[]): { userId: string; role: Role } {
  const userId = requireSession();
  const role = currentRole();
  if (!role || !allowed.includes(role)) {
    logger.warn('auth.denied', { reason: 'wrong_role', userId, role, required: allowed });
    throw new AuthorizationError(`Role '${role ?? 'anonymous'}' is not authorized`);
  }
  return { userId, role };
}

/** True if the active session's role is one of the supplied roles. */
export function hasAnyRole(...allowed: Role[]): boolean {
  const role = currentRole();
  return role !== null && allowed.includes(role);
}
