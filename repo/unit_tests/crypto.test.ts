import { describe, it, expect } from 'vitest';
import { sha256Hex } from '@shared/crypto/sha256';
import { hashPassword, verifyPassword } from '@shared/crypto/passwordHash';
import { deriveAesKey, encryptString, decryptString, isEncrypted } from '@shared/crypto/fieldCrypto';
import { bytesToB64, b64ToBytes } from '@shared/crypto/base64';

describe('sha256Hex', () => {
  it('hashes empty string to known value', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('handles ArrayBuffer and Uint8Array inputs', async () => {
    const hex1 = await sha256Hex(new Uint8Array([1,2,3]));
    const hex2 = await sha256Hex(new Uint8Array([1,2,3]).buffer);
    expect(hex1).toBe(hex2);
    expect(hex1).toHaveLength(64);
  });
});

describe('base64', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(b64ToBytes(bytesToB64(bytes))).toEqual(bytes);
  });
});

describe('passwordHash', () => {
  it('verifies a correct password and rejects an incorrect one', async () => {
    const cred = await hashPassword('hunter2');
    expect(await verifyPassword('hunter2', cred)).toBe(true);
    expect(await verifyPassword('wrong', cred)).toBe(false);
  }, 30000);

  it('different salts produce different hashes for the same password', async () => {
    const c1 = await hashPassword('same');
    const c2 = await hashPassword('same');
    expect(c1.hashB64).not.toBe(c2.hashB64);
  }, 30000);
});

describe('fieldCrypto', () => {
  it('encrypts and decrypts a string round-trip', async () => {
    const salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await deriveAesKey('password', salt);
    const cipher = await encryptString(key, 'secret notes');
    expect(isEncrypted(cipher)).toBe(true);
    const back = await decryptString(key, cipher);
    expect(back).toBe('secret notes');
  }, 30000);

  it('isEncrypted rejects non-payloads', () => {
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted({ v: 1 })).toBe(false);
    expect(isEncrypted({ v: 1, ivB64: 'a', ctB64: 'b' })).toBe(true);
  });
});
