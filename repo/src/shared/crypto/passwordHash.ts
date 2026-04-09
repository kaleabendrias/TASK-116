import { bytesToB64, b64ToBytes } from './base64';

export interface PasswordCredential {
  algo: 'PBKDF2-SHA256';
  iterations: number;
  saltB64: string;
  hashB64: string;
}

const ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    KEY_LEN_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<PasswordCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return {
    algo: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    saltB64: bytesToB64(salt),
    hashB64: bytesToB64(hash)
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, cred: PasswordCredential): Promise<boolean> {
  const salt = b64ToBytes(cred.saltB64);
  const hash = await deriveBits(password, salt, cred.iterations);
  return constantTimeEquals(bytesToB64(hash), cred.hashB64);
}
