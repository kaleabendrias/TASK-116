import { describe, it, expect } from 'vitest';
import {
  requireSession,
  requireRole,
  hasAnyRole,
  AuthorizationError
} from '@application/services/authorization';
import {
  bootstrapFirstAdmin,
  login,
  logout,
  register
} from '@application/services/authService';

describe('AuthorizationError', () => {
  it('has the correct name', () => {
    const err = new AuthorizationError();
    expect(err.name).toBe('AuthorizationError');
  });

  it('uses the default message', () => {
    const err = new AuthorizationError();
    expect(err.message).toBe('Forbidden');
  });

  it('accepts a custom message', () => {
    const err = new AuthorizationError('Custom msg');
    expect(err.message).toBe('Custom msg');
  });

  it('is an instance of Error', () => {
    expect(new AuthorizationError()).toBeInstanceOf(Error);
  });
});

describe('requireSession', () => {
  it('throws AuthorizationError when no session is active', () => {
    logout();
    expect(() => requireSession()).toThrow(AuthorizationError);
    expect(() => requireSession()).toThrow('Authentication required');
  });

  it('returns the userId when a session is active', async () => {
    await bootstrapFirstAdmin('admin_rs', 'Admin123!');
    await login('admin_rs', 'Admin123!');
    const id = requireSession();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('requireRole', () => {
  it('throws AuthorizationError when no session is active', () => {
    logout();
    expect(() => requireRole('administrator')).toThrow(AuthorizationError);
  });

  it('throws when session role does not match any allowed role', async () => {
    await register('disp_rr', 'Pass123!', 'dispatcher');
    await login('disp_rr', 'Pass123!');
    expect(() => requireRole('administrator', 'reviewer')).toThrow(AuthorizationError);
  });

  it('returns userId and role when role matches', async () => {
    await bootstrapFirstAdmin('admin_rr', 'Admin123!');
    await login('admin_rr', 'Admin123!');
    const { userId, role } = requireRole('administrator');
    expect(role).toBe('administrator');
    expect(typeof userId).toBe('string');
  });

  it('accepts the first of multiple allowed roles', async () => {
    await register('disp_rr2', 'Pass123!', 'dispatcher');
    await login('disp_rr2', 'Pass123!');
    const { role } = requireRole('dispatcher', 'administrator');
    expect(role).toBe('dispatcher');
  });

  it('error message includes the actual role', async () => {
    await register('disp_rr3', 'Pass123!', 'dispatcher');
    await login('disp_rr3', 'Pass123!');
    expect(() => requireRole('administrator')).toThrow(/dispatcher/);
  });
});

describe('hasAnyRole', () => {
  it('returns false when no session is active', () => {
    logout();
    expect(hasAnyRole('administrator', 'dispatcher')).toBe(false);
  });

  it('returns true when the session role is in the allowed set', async () => {
    await bootstrapFirstAdmin('admin_har', 'Admin123!');
    await login('admin_har', 'Admin123!');
    expect(hasAnyRole('administrator')).toBe(true);
  });

  it('returns true when the role matches one of multiple allowed roles', async () => {
    await bootstrapFirstAdmin('admin_har2', 'Admin123!');
    await login('admin_har2', 'Admin123!');
    expect(hasAnyRole('dispatcher', 'administrator', 'reviewer')).toBe(true);
  });

  it('returns false when the session role is not in the allowed set', async () => {
    await register('rev_har', 'Pass123!', 'reviewer');
    await login('rev_har', 'Pass123!');
    expect(hasAnyRole('administrator', 'dispatcher')).toBe(false);
  });

  it('returns false for content_author when only reviewer allowed', async () => {
    await register('ca_har', 'Pass123!', 'content_author');
    await login('ca_har', 'Pass123!');
    expect(hasAnyRole('reviewer')).toBe(false);
  });
});
