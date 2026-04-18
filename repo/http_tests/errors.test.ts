import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { startTestServer, post, type TestServer } from './serverHelper';
import { _resetDbCache } from '@persistence/indexedDb';

let server: TestServer;
let adminToken: string;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

beforeEach(async () => {
  await post(server.baseUrl, '/api/auth/bootstrap', { username: 'admin_err', password: 'Admin123!' });
  const loginRes = await post(server.baseUrl, '/api/auth/login', {
    username: 'admin_err', password: 'Admin123!'
  });
  adminToken = ((await loginRes.json()) as { token: string }).token;
});

/**
 * Organic IDB fault: delete the on-disk DB and clear the cached connection so
 * the next withAuth() → login() call hits an empty store and throws
 * "Invalid credentials" (not AuthorizationError). withAuth re-throws any
 * non-AuthorizationError, which the outer createServer handler maps to 500.
 */
async function corruptIdb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('task09');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  await _resetDbCache();
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth error contract — exact error strings defined in server/app.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('auth error contract — strict message assertions', () => {
  it('returns 401 with exact "Missing Bearer token" for requests without Authorization header', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Missing Bearer token');
  });

  it('returns 401 with exact "Invalid session" for an unrecognised Bearer token', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`, {
      headers: { 'Authorization': 'Bearer totally-invalid-token-xyz' }
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid session');
  });

  it('returns 404 with method + path embedded in error body for unknown routes', async () => {
    const res = await fetch(`${server.baseUrl}/api/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('GET /api/nonexistent not found');
  });

  it('POST to unknown route embeds method in 404 error body', async () => {
    const res = await fetch(`${server.baseUrl}/api/unknown`, { method: 'POST' });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('POST /api/unknown not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Malformed / empty JSON body
// ─────────────────────────────────────────────────────────────────────────────

describe('malformed JSON body handling', () => {
  it('handles malformed JSON in POST /api/auth/bootstrap gracefully (→ 400)', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json!!}'
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('handles empty body in POST /api/auth/register gracefully (→ 400)', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ''
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('handles non-JSON body in POST /api/auth/login gracefully (→ 400 or 401)', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json at all'
    });
    // readBody() falls back to {} on parse failure → login(undefined, undefined) → service error
    expect([400, 401]).toContain(res.status);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 with a { errors: string[] } validation array for malformed POST /api/trips body', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: '{"name": "Broken", invalid}'
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: string[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors.every((e: unknown) => typeof e === 'string')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unsupported methods on existing endpoints → 404
// ─────────────────────────────────────────────────────────────────────────────

describe('unsupported methods on existing endpoints → 404', () => {
  it('PUT /api/trips returns 404 with method + path in error body', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('PUT /api/trips not found');
  });

  it('PATCH /api/trips returns 404 with method + path in error body', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('PATCH /api/trips not found');
  });

  it('DELETE /api/trips returns 404 with method + path in error body', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('DELETE /api/trips not found');
  });

  it('PUT /api/questions returns 404 with method + path in error body', async () => {
    const res = await fetch(`${server.baseUrl}/api/questions`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('PUT /api/questions not found');
  });

  it('DELETE /api/auth/login returns 404 with method + path in error body', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('DELETE /api/auth/login not found');
  });

  it('GET /api/auth/bootstrap returns 404 (bootstrap is POST-only)', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/bootstrap`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('GET /api/auth/bootstrap not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 500 — organic infrastructure fault resilience (IDB corruption)
// ─────────────────────────────────────────────────────────────────────────────

describe('500-branch: organic infrastructure fault resilience', () => {
  it('returns 500 with exact "Invalid credentials" when IDB is corrupted before an authenticated POST /api/trips', async () => {
    await corruptIdb();
    const res = await post(server.baseUrl, '/api/trips', {
      name: 'T', origin: 'A', destination: 'B',
      departureAt: Date.now() + 86_400_000,
      rows: 8, cols: 4
    }, adminToken);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid credentials');
  });

  it('returns 500 with exact "Invalid credentials" for GET /api/trips on corrupted IDB', async () => {
    await corruptIdb();
    const res = await fetch(`${server.baseUrl}/api/trips`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid credentials');
  });

  it('500 response body always contains a string error field', async () => {
    await corruptIdb();
    const res = await post(server.baseUrl, '/api/trips', {
      name: 'T', origin: 'A', destination: 'B',
      departureAt: Date.now() + 86_400_000,
      rows: 8, cols: 4
    }, adminToken);
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect('error' in body).toBe(true);
    expect(typeof body['error']).toBe('string');
    expect((body['error'] as string).length).toBeGreaterThan(0);
  });
});
