import { describe, it, expect } from 'vitest';
import {
  register, login, logout, currentRole, currentUserId, currentEncryptionKey, authorize,
  bootstrapFirstAdmin, promoteRole, isAdminBootstrapped
} from '@application/services/authService';
import { usersRepository } from '@persistence/usersRepository';

describe('authService', () => {
  it('public registration cannot mint administrators', async () => {
    await expect(register('eve', 'longenough', 'administrator')).rejects.toThrow(/not allowed/);
  });

  it('registers a non-admin user, persists hashed credentials, and logs in', async () => {
    const user = await register('alice', 'hunter22', 'reviewer');
    expect(user.credential.algo).toBe('PBKDF2-SHA256');
    expect(user.credential.hashB64).toBeTruthy();
    expect(await usersRepository.findByUsername('alice')).toBeTruthy();

    await login('alice', 'hunter22');
    expect(currentRole()).toBe('reviewer');
    expect(currentUserId()).toBe(user.id);
    expect(currentEncryptionKey()).not.toBeNull();
    expect(authorize('review')).toBe(true);
  }, 30000);

  it('rejects bad passwords and unknown users', async () => {
    await register('bob', 'longenough', 'reviewer');
    await expect(login('bob', 'wrong')).rejects.toThrow(/Invalid/);
    await expect(login('ghost', 'whatever')).rejects.toThrow(/Invalid/);
  }, 30000);

  it('rejects duplicate username and weak passwords', async () => {
    await register('carol', 'longenough', 'dispatcher');
    await expect(register('carol', 'anotherlong', 'dispatcher')).rejects.toThrow(/taken/);
    await expect(register('dave', 'short', 'dispatcher')).rejects.toThrow(/6/);
    await expect(register('   ', 'longenough', 'dispatcher')).rejects.toThrow(/required/);
  }, 30000);

  it('logout clears the in-memory session and key', async () => {
    await register('eve', 'longenough', 'reviewer');
    await login('eve', 'longenough');
    logout();
    expect(currentRole()).toBeNull();
    expect(currentEncryptionKey()).toBeNull();
    expect(authorize('review')).toBe(false);
  }, 30000);

  it('bootstrapFirstAdmin creates the first admin and refuses subsequent calls', async () => {
    const admin = await bootstrapFirstAdmin('root', 'longenough');
    expect(admin.role).toBe('administrator');
    await expect(bootstrapFirstAdmin('root2', 'longenough')).rejects.toThrow(/already exists/);
    await expect(bootstrapFirstAdmin('   ', 'longenough')).rejects.toThrow(/required/);
    await expect(bootstrapFirstAdmin('x', 'short')).rejects.toThrow(/6/);
  }, 60000);

  it('bootstrapFirstAdmin rejects duplicate username', async () => {
    await register('alice', 'longenough', 'reviewer');
    await expect(bootstrapFirstAdmin('alice', 'longenough')).rejects.toThrow(/taken/);
  }, 30000);

  it('promoteRole requires an active administrator session', async () => {
    const target = await register('bob', 'longenough', 'reviewer');
    await expect(promoteRole(target.id, 'administrator')).rejects.toThrow(/administrator/);

    // Even a logged-in non-admin cannot promote
    await login('bob', 'longenough');
    await expect(promoteRole(target.id, 'administrator')).rejects.toThrow(/administrator/);
    logout();

    // Bootstrap an admin and try again
    await bootstrapFirstAdmin('root', 'longenough');
    await login('root', 'longenough');
    const promoted = await promoteRole(target.id, 'administrator');
    expect(promoted.role).toBe('administrator');

    await expect(promoteRole('nope', 'reviewer')).rejects.toThrow(/not found/);
  }, 90000);

  it('isAdminBootstrapped reflects the existence of the first admin (bootstrap contract)', async () => {
    expect(await isAdminBootstrapped()).toBe(false);
    // Public registration must NOT flip the flag, even if a non-admin user is created.
    await register('alice', 'longenough', 'reviewer');
    expect(await isAdminBootstrapped()).toBe(false);
    await bootstrapFirstAdmin('root', 'longenough');
    expect(await isAdminBootstrapped()).toBe(true);
  }, 60000);

  it('admin onboarding contract: only the bootstrap path can mint the first administrator', async () => {
    // 1. Public registration is closed for administrators
    await expect(register('mallory', 'longenough', 'administrator')).rejects.toThrow(/not allowed/);
    expect(await isAdminBootstrapped()).toBe(false);

    // 2. Bootstrap path successfully mints the first admin
    const admin = await bootstrapFirstAdmin('root', 'longenough');
    expect(admin.role).toBe('administrator');
    expect(await isAdminBootstrapped()).toBe(true);

    // 3. Bootstrap path is closed once an admin exists
    await expect(bootstrapFirstAdmin('root2', 'longenough')).rejects.toThrow(/already exists/);

    // 4. Subsequent admins must come through admin-gated promoteRole
    await login('root', 'longenough');
    const target = await register('newadmin', 'longenough', 'reviewer');
    const promoted = await promoteRole(target.id, 'administrator');
    expect(promoted.role).toBe('administrator');
  }, 120000);

  it('users repository lists registered accounts', async () => {
    await register('frank', 'longenough', 'dispatcher');
    await register('grace', 'longenough', 'reviewer');
    const all = await usersRepository.list();
    expect(all.map((u) => u.username).sort()).toEqual(['frank', 'grace']);
  }, 30000);
});
