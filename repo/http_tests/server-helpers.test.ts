/**
 * Isolated unit tests for the internal server helpers exported from server/app.ts:
 *   readBody   — parses the raw HTTP request body into a plain JS value
 *   serviceCall — maps domain errors to 400/401/403; lets successes pass through
 *   withAuth   — guards authenticated routes via Bearer-token lookup
 *
 * Each helper is tested directly, without routing through the full HTTP server,
 * giving precise branch coverage of the dispatch helpers in isolation.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readBody, send, serviceCall, withAuth,
  _resetSessionsForTesting
} from '../server/app';
import { bootstrapFirstAdmin, login, logout } from '@application/services/authService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for constructing lightweight mock HTTP objects
// ─────────────────────────────────────────────────────────────────────────────

function makeReadable(body: string): IncomingMessage {
  const r = new Readable({ read() {} });
  if (body) r.push(Buffer.from(body, 'utf8'));
  r.push(null);
  return r as unknown as IncomingMessage;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | number>;
  body: string;
  res: ServerResponse;
}

function makeMockResponse(): MockResponse {
  const mock: MockResponse = { statusCode: 0, headers: {}, body: '', res: null as unknown as ServerResponse };
  mock.res = {
    writeHead(status: number, hdrs: Record<string, string | number>) {
      mock.statusCode = status;
      Object.assign(mock.headers, hdrs);
    },
    end(data: string) {
      mock.body = data;
    }
  } as unknown as ServerResponse;
  return mock;
}

function mockReqWithAuth(authorization: string): IncomingMessage {
  const r = new Readable({ read() {} });
  r.push(null);
  return Object.assign(r, { headers: { authorization } }) as unknown as IncomingMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// readBody — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('readBody — unit', () => {
  it('parses a valid JSON object body', async () => {
    const req = makeReadable('{"name":"alice","role":"reviewer"}');
    const result = await readBody(req);
    expect(result).toEqual({ name: 'alice', role: 'reviewer' });
  });

  it('parses a valid JSON array body', async () => {
    const req = makeReadable('[1,2,3]');
    const result = await readBody(req);
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns {} for an empty body', async () => {
    const req = makeReadable('');
    const result = await readBody(req);
    expect(result).toEqual({});
  });

  it('returns {} for a whitespace-only body', async () => {
    const req = makeReadable('   \n\t  ');
    const result = await readBody(req);
    expect(result).toEqual({});
  });

  it('returns {} for malformed JSON (not an Error — graceful fallback)', async () => {
    const req = makeReadable('{not valid json!!}');
    const result = await readBody(req);
    expect(result).toEqual({});
  });

  it('returns {} for truncated JSON', async () => {
    const req = makeReadable('{"key":');
    const result = await readBody(req);
    expect(result).toEqual({});
  });

  it('parses a JSON number body', async () => {
    const req = makeReadable('42');
    const result = await readBody(req);
    expect(result).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// send — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('send — unit', () => {
  it('sets the correct status code', () => {
    const mock = makeMockResponse();
    send(mock.res, 201, { id: 'abc' });
    expect(mock.statusCode).toBe(201);
  });

  it('sets Content-Type: application/json', () => {
    const mock = makeMockResponse();
    send(mock.res, 200, { ok: true });
    expect(mock.headers['Content-Type']).toBe('application/json');
  });

  it('sets Content-Length matching the serialised body', () => {
    const mock = makeMockResponse();
    const body = { message: 'hello' };
    send(mock.res, 200, body);
    const expected = Buffer.byteLength(JSON.stringify(body));
    expect(mock.headers['Content-Length']).toBe(expected);
  });

  it('writes the JSON-serialised body to the response', () => {
    const mock = makeMockResponse();
    send(mock.res, 200, { token: 'tok123', role: 'dispatcher' });
    expect(JSON.parse(mock.body)).toEqual({ token: 'tok123', role: 'dispatcher' });
  });

  it('handles null body correctly', () => {
    const mock = makeMockResponse();
    send(mock.res, 204, null);
    expect(mock.body).toBe('null');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// serviceCall — unit: error mapping branches
// ─────────────────────────────────────────────────────────────────────────────

describe('serviceCall — unit', () => {
  it('does not send anything when fn resolves (success path)', async () => {
    const mock = makeMockResponse();
    await serviceCall(mock.res, async () => { /* noop */ });
    // send() was never called — statusCode stays at initial 0
    expect(mock.statusCode).toBe(0);
  });

  it('maps AuthorizationError → 403 with the error message', async () => {
    const mock = makeMockResponse();
    const err = Object.assign(new Error('You cannot do that'), { name: 'AuthorizationError' });
    await serviceCall(mock.res, async () => { throw err; });
    expect(mock.statusCode).toBe(403);
    expect(JSON.parse(mock.body)).toEqual({ error: 'You cannot do that' });
  });

  it('maps "Invalid credentials" error → 401', async () => {
    const mock = makeMockResponse();
    await serviceCall(mock.res, async () => { throw new Error('Invalid credentials'); });
    expect(mock.statusCode).toBe(401);
    expect(JSON.parse(mock.body)).toEqual({ error: 'Invalid credentials' });
  });

  it('maps any other error → 400 with the error message', async () => {
    const mock = makeMockResponse();
    await serviceCall(mock.res, async () => { throw new Error('Validation failed: name required'); });
    expect(mock.statusCode).toBe(400);
    expect(JSON.parse(mock.body)).toEqual({ error: 'Validation failed: name required' });
  });

  it('calls fn and lets it set its own response when it succeeds', async () => {
    const mock = makeMockResponse();
    await serviceCall(mock.res, async () => {
      send(mock.res, 201, { id: 'created' });
    });
    expect(mock.statusCode).toBe(201);
    expect(JSON.parse(mock.body)).toEqual({ id: 'created' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// withAuth — unit: token guard branches
// ─────────────────────────────────────────────────────────────────────────────

describe('withAuth — unit', () => {
  beforeEach(() => {
    _resetSessionsForTesting();
    logout();
  });

  it('returns 401 "Missing Bearer token" when Authorization header is absent', async () => {
    const req = mockReqWithAuth('');
    const mock = makeMockResponse();
    await withAuth(req, mock.res, async () => { /* should not be called */ });
    expect(mock.statusCode).toBe(401);
    expect(JSON.parse(mock.body)).toEqual({ error: 'Missing Bearer token' });
  });

  it('returns 401 "Missing Bearer token" when Authorization is not Bearer-prefixed', async () => {
    const req = mockReqWithAuth('Basic dXNlcjpwYXNz');
    const mock = makeMockResponse();
    await withAuth(req, mock.res, async () => {});
    expect(mock.statusCode).toBe(401);
    expect(JSON.parse(mock.body)).toEqual({ error: 'Missing Bearer token' });
  });

  it('returns 401 "Invalid session" for a token not in the session store', async () => {
    const req = mockReqWithAuth('Bearer unknown-token-xyz');
    const mock = makeMockResponse();
    await withAuth(req, mock.res, async () => {});
    expect(mock.statusCode).toBe(401);
    expect(JSON.parse(mock.body)).toEqual({ error: 'Invalid session' });
  });

  it('calls fn and logs out when the token is valid', async () => {
    // Bootstrap and login via real authService to get a valid session token
    await bootstrapFirstAdmin('wauth-admin', 'Adm123!');
    const { token } = await import('../server/app').then(async (mod) => {
      // Use the HTTP layer to get a real session token
      const { startTestServer, post } = await import('./serverHelper');
      const s = await startTestServer();
      await post(s.baseUrl, '/api/auth/bootstrap', { username: 'wauth-helper', password: 'Adm123!' })
        .catch(() => { /* may fail if already bootstrapped */ });
      const lr = await post(s.baseUrl, '/api/auth/login', { username: 'wauth-admin', password: 'Adm123!' });
      const body = await lr.json() as { token: string };
      await s.stop();
      return body;
    });

    const req = mockReqWithAuth(`Bearer ${token}`);
    const mock = makeMockResponse();
    let fnCalled = false;
    await withAuth(req, mock.res, async () => {
      fnCalled = true;
      send(mock.res, 200, { ok: true });
    });
    expect(fnCalled).toBe(true);
    expect(mock.statusCode).toBe(200);
  }, 30000);

  it('maps AuthorizationError thrown inside fn to 403', async () => {
    await bootstrapFirstAdmin('wauth-admin2', 'Adm123!');
    const { startTestServer, post } = await import('./serverHelper');
    const s = await startTestServer();
    const lr = await post(s.baseUrl, '/api/auth/login', { username: 'wauth-admin2', password: 'Adm123!' });
    const { token } = await lr.json() as { token: string };
    await s.stop();

    const req = mockReqWithAuth(`Bearer ${token}`);
    const mock = makeMockResponse();
    const authErr = Object.assign(new Error('Cannot access this resource'), { name: 'AuthorizationError' });
    await withAuth(req, mock.res, async () => { throw authErr; });
    expect(mock.statusCode).toBe(403);
    expect(JSON.parse(mock.body)).toEqual({ error: 'Cannot access this resource' });
  }, 30000);

  it('rethrows non-AuthorizationError from fn (propagates to 500 outer handler)', async () => {
    await bootstrapFirstAdmin('wauth-admin3', 'Adm123!');
    const { startTestServer, post } = await import('./serverHelper');
    const s = await startTestServer();
    const lr = await post(s.baseUrl, '/api/auth/login', { username: 'wauth-admin3', password: 'Adm123!' });
    const { token } = await lr.json() as { token: string };
    await s.stop();

    const req = mockReqWithAuth(`Bearer ${token}`);
    const mock = makeMockResponse();
    const infra = new Error('IDB transaction aborted unexpectedly');
    await expect(withAuth(req, mock.res, async () => { throw infra; }))
      .rejects.toThrow('IDB transaction aborted unexpectedly');
  }, 30000);
});
