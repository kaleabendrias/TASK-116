import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, post, type TestServer } from './serverHelper';

let server: TestServer;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

describe('POST /api/auth/bootstrap', () => {
  it('creates the first admin user', async () => {
    const res = await post(server.baseUrl, '/api/auth/bootstrap', {
      username: 'admin', password: 'Admin123!'
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { role: string; username: string };
    expect(body.role).toBe('administrator');
    expect(body.username).toBe('admin');
  });

  it('rejects a second bootstrap attempt', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'admin', password: 'Admin123!' });
    const res = await post(server.baseUrl, '/api/auth/bootstrap', { username: 'admin2', password: 'Admin123!' });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('administrator already exists');
  });
});

describe('POST /api/auth/register', () => {
  it('registers a non-admin user', async () => {
    const res = await post(server.baseUrl, '/api/auth/register', {
      username: 'dispatcher1', password: 'Pass123!', role: 'dispatcher'
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { role: string };
    expect(body.role).toBe('dispatcher');
  });

  it('rejects public registration for administrator role', async () => {
    const res = await post(server.baseUrl, '/api/auth/register', {
      username: 'bad', password: 'Pass123!', role: 'administrator'
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not allowed');
  });

  it('rejects duplicate usernames', async () => {
    await post(server.baseUrl, '/api/auth/register', {
      username: 'dispatcher1', password: 'Pass123!', role: 'dispatcher'
    });
    const res = await post(server.baseUrl, '/api/auth/register', {
      username: 'dispatcher1', password: 'Pass456!', role: 'dispatcher'
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('already taken');
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token on valid credentials', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'admin', password: 'Admin123!' });
    const res = await post(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'Admin123!' });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string; role: string };
    expect(typeof body.token).toBe('string');
    expect(body.role).toBe('administrator');
  });

  it('rejects invalid credentials', async () => {
    const res = await post(server.baseUrl, '/api/auth/login', { username: 'nobody', password: 'wrong' });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid credentials');
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the session token', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'admin', password: 'Admin123!' });
    const loginRes = await post(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'Admin123!' });
    const { token } = await loginRes.json() as { token: string };

    const logoutRes = await post(server.baseUrl, '/api/auth/logout', {}, token);
    expect(logoutRes.status).toBe(200);

    // Token is now invalid
    const tripRes = await fetch(`${server.baseUrl}/api/trips`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(tripRes.status).toBe(401);
  });

  it('logout without token still returns 200', async () => {
    const res = await post(server.baseUrl, '/api/auth/logout', {});
    expect(res.status).toBe(200);
  });
});

describe('authenticated endpoint guard', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Missing Bearer token');
  });

  it('returns 401 with unknown token', async () => {
    const res = await fetch(`${server.baseUrl}/api/trips`, {
      headers: { Authorization: 'Bearer unknown-token-xyz' }
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid session');
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${server.baseUrl}/api/unknown`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not found');
    expect(body.error).toContain('/api/unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Strict field-level schema assertions for every auth endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('auth response schema — strict field-level assertions', () => {
  it('bootstrap returns exactly { id, username, role } with no credential leak', async () => {
    const res = await post(server.baseUrl, '/api/auth/bootstrap', {
      username: 'schema_admin', password: 'Admin123!'
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('string');
    expect((body.id as string).length).toBeGreaterThan(0);
    expect(body.username).toBe('schema_admin');
    expect(body.role).toBe('administrator');
    expect('credential' in body).toBe(false);
    expect('password' in body).toBe(false);
    expect('encryptionSaltB64' in body).toBe(false);
  });

  it('register returns exactly { id, username, role } with correct role and no credential leak', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'regadmin', password: 'Admin123!' });
    const res = await post(server.baseUrl, '/api/auth/register', {
      username: 'schema_disp', password: 'Disp123!', role: 'dispatcher'
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('string');
    expect((body.id as string).length).toBeGreaterThan(0);
    expect(body.username).toBe('schema_disp');
    expect(body.role).toBe('dispatcher');
    expect('credential' in body).toBe(false);
    expect('password' in body).toBe(false);
  });

  it('login returns exactly { token, userId, role } with correct types and no credential leak', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'loginschema', password: 'Admin123!' });
    const res = await post(server.baseUrl, '/api/auth/login', {
      username: 'loginschema', password: 'Admin123!'
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.token).toBe('string');
    expect((body.token as string).length).toBeGreaterThan(0);
    expect(typeof body.userId).toBe('string');
    expect((body.userId as string).length).toBeGreaterThan(0);
    expect(body.role).toBe('administrator');
    expect('password' in body).toBe(false);
    expect('credential' in body).toBe(false);
  });

  it('login token is a UUID-format string', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'uuidcheck', password: 'Admin123!' });
    const res = await post(server.baseUrl, '/api/auth/login', {
      username: 'uuidcheck', password: 'Admin123!'
    });
    const { token } = await res.json() as { token: string };
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('logout returns { ok: true }', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'logoutsvc', password: 'Admin123!' });
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'logoutsvc', password: 'Admin123!'
    })).json()) as { token: string };
    const res = await post(server.baseUrl, '/api/auth/logout', {}, token);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('register with department stores role correctly', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'deptadmin', password: 'Admin123!' });
    const res = await post(server.baseUrl, '/api/auth/register', {
      username: 'dept_author', password: 'Auth123!', role: 'content_author', department: 'Genomics'
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { role: string; username: string };
    expect(body.role).toBe('content_author');
    expect(body.username).toBe('dept_author');
  });
});
