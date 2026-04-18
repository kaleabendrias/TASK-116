import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { startTestServer, post, get, type TestServer } from './serverHelper';

let server: TestServer;
let adminToken: string;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

beforeEach(async () => {
  await post(server.baseUrl, '/api/auth/bootstrap', { username: 'admin', password: 'Admin123!' });
  const loginRes = await post(server.baseUrl, '/api/auth/login', { username: 'admin', password: 'Admin123!' });
  adminToken = ((await loginRes.json()) as { token: string }).token;
});

const baseTrip = {
  name: 'Flight 1',
  origin: 'JFK',
  destination: 'LAX',
  departureAt: Date.now() + 86_400_000,
  rows: 8,
  cols: 4
};

describe('GET /api/trips', () => {
  it('returns empty list when no trips exist', async () => {
    const res = await get(server.baseUrl, '/api/trips', adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});

describe('POST /api/trips', () => {
  it('creates a trip and returns 201', async () => {
    const res = await post(server.baseUrl, '/api/trips', baseTrip, adminToken);
    expect(res.status).toBe(201);
    const trip = await res.json() as { id: string; name: string };
    expect(trip.name).toBe('Flight 1');
    expect(typeof trip.id).toBe('string');
  });

  it('validates trip input — rejects empty name', async () => {
    const res = await post(server.baseUrl, '/api/trips', { ...baseTrip, name: '' }, adminToken);
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: string[] };
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('validates trip input — rejects invalid row count', async () => {
    const res = await post(server.baseUrl, '/api/trips', { ...baseTrip, rows: 0 }, adminToken);
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: string[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.some((e) => e.toLowerCase().includes('rows'))).toBe(true);
  });
});

describe('GET /api/trips after creation', () => {
  it('lists created trips', async () => {
    await post(server.baseUrl, '/api/trips', { ...baseTrip, name: 'Trip A' }, adminToken);
    await post(server.baseUrl, '/api/trips', { ...baseTrip, name: 'Trip B' }, adminToken);
    const res = await get(server.baseUrl, '/api/trips', adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string }[];
    expect(body.length).toBeGreaterThanOrEqual(2);
  });
});

describe('trips role enforcement', () => {
  it('rejects trip creation for reviewer role', async () => {
    await post(server.baseUrl, '/api/auth/register', {
      username: 'reviewer1', password: 'Rev123!', role: 'reviewer'
    });
    const loginRes = await post(server.baseUrl, '/api/auth/login', {
      username: 'reviewer1', password: 'Rev123!'
    });
    const { token } = await loginRes.json() as { token: string };
    const res = await post(server.baseUrl, '/api/trips', baseTrip, token);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not authorized');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Strict field-level schema assertions for trip endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/trips — strict response schema', () => {
  it('response body contains all required Trip fields with correct types', async () => {
    const before = Date.now();
    const res = await post(server.baseUrl, '/api/trips', {
      ...baseTrip,
      name: 'Schema Trip',
    }, adminToken);
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const trip = await res.json() as Record<string, unknown>;

    expect(typeof trip.id).toBe('string');
    expect((trip.id as string).length).toBeGreaterThan(0);
    expect(trip.name).toBe('Schema Trip');
    expect(trip.origin).toBe(baseTrip.origin);
    expect(trip.destination).toBe(baseTrip.destination);
    expect(typeof trip.departureAt).toBe('number');
    expect(trip.departureAt as number).toBeGreaterThan(before);
    expect(trip.rows).toBe(baseTrip.rows);
    expect(trip.cols).toBe(baseTrip.cols);
    expect(typeof trip.createdBy).toBe('string');
    expect((trip.createdBy as string).length).toBeGreaterThan(0);
    expect(typeof trip.createdAt).toBe('number');
    expect(trip.createdAt as number).toBeGreaterThanOrEqual(before);
    expect(typeof trip.updatedAt).toBe('number');
  });

  it('createdAt and updatedAt are in milliseconds epoch (>2020)', async () => {
    const EPOCH_2020 = 1_577_836_800_000;
    const res = await post(server.baseUrl, '/api/trips', baseTrip, adminToken);
    const { createdAt, updatedAt } = await res.json() as { createdAt: number; updatedAt: number };
    expect(createdAt).toBeGreaterThan(EPOCH_2020);
    expect(updatedAt).toBeGreaterThanOrEqual(createdAt);
  });

  it('createdBy matches the authenticated user id', async () => {
    const bootstrapRes = await post(server.baseUrl, '/api/auth/bootstrap', {
      username: 'owner_check', password: 'Admin123!'
    });
    const { id: adminId } = await bootstrapRes.json() as { id: string };
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'owner_check', password: 'Admin123!'
    })).json()) as { token: string };
    const tripRes = await post(server.baseUrl, '/api/trips', baseTrip, token);
    const trip = await tripRes.json() as { createdBy: string };
    expect(trip.createdBy).toBe(adminId);
  });

  it('400 validation errors array is non-empty and contains strings', async () => {
    const res = await post(server.baseUrl, '/api/trips', {
      ...baseTrip, name: '', origin: '', destination: ''
    }, adminToken);
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: unknown[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    for (const e of body.errors) {
      expect(typeof e).toBe('string');
      expect((e as string).length).toBeGreaterThan(0);
    }
  });
});

describe('GET /api/trips — strict list schema', () => {
  it('each trip in the list has all required fields', async () => {
    await post(server.baseUrl, '/api/trips', { ...baseTrip, name: 'List Check' }, adminToken);
    const res = await get(server.baseUrl, '/api/trips', adminToken);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const list = await res.json() as Record<string, unknown>[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const trip of list) {
      expect(typeof trip.id).toBe('string');
      expect(typeof trip.name).toBe('string');
      expect(typeof trip.origin).toBe('string');
      expect(typeof trip.destination).toBe('string');
      expect(typeof trip.departureAt).toBe('number');
      expect(typeof trip.rows).toBe('number');
      expect(typeof trip.cols).toBe('number');
      expect(typeof trip.createdBy).toBe('string');
      expect(typeof trip.createdAt).toBe('number');
      expect(typeof trip.updatedAt).toBe('number');
    }
  });
});
