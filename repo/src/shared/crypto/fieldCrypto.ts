import { bytesToB64, b64ToBytes } from './base64';

export interface EncryptedField {
  v: 1;
  ivB64: string;
  ctB64: string;
}

export async function deriveAesKey(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = b64ToBytes(saltB64);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptString(key: CryptoKey, plain: string): Promise<EncryptedField> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain)
  );
  return { v: 1, ivB64: bytesToB64(iv), ctB64: bytesToB64(new Uint8Array(ct)) };
}

export async function decryptString(key: CryptoKey, payload: EncryptedField): Promise<string> {
  const iv = b64ToBytes(payload.ivB64);
  const ct = b64ToBytes(payload.ctB64);
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource
  );
  return new TextDecoder().decode(buf);
}

export function isEncrypted(value: unknown): value is EncryptedField {
  return !!value && typeof value === 'object' && (value as { v?: number }).v === 1
    && typeof (value as EncryptedField).ivB64 === 'string'
    && typeof (value as EncryptedField).ctB64 === 'string';
}
