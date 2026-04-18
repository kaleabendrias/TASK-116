/**
 * Frontend-to-backend E2E tests.
 *
 * These tests validate that data written through the HTTP API layer is
 * immediately accessible through the application service layer (as the Svelte
 * frontend uses it), and vice versa — proving that both layers share the same
 * IndexedDB state via fake-indexeddb in tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import { startTestServer, post, get as httpGet, type TestServer } from './serverHelper';
import { login, logout, currentRole, currentUserId } from '@application/services/authService';
import { refreshTrips, trips } from '@application/services/tripsService';
import { refreshQuestions, questions } from '@application/services/questionService';

let server: TestServer;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

const baseTrip = {
  name: 'E2E Flight',
  origin: 'SFO',
  destination: 'JFK',
  departureAt: Date.now() + 86_400_000,
  rows: 8,
  cols: 4
};

const baseQuestion = {
  type: 'short_answer' as const,
  prompt: 'Explain dependency injection.',
  choices: [], correctChoiceIds: [],
  correctNumeric: null, numericTolerance: 0,
  acceptedAnswers: [], caseSensitive: false,
  difficulty: 2 as const, maxScore: 10,
  explanation: '', tags: [], knowledgePoints: [], applicableDepartments: []
};

describe('E2E: trip created via HTTP is visible through service layer', () => {
  it('trip id from HTTP response matches trip in Svelte store', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_admin1', password: 'Admin123!' });
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'e2e_admin1', password: 'Admin123!'
    })).json()) as { token: string };

    // Create trip via HTTP
    const createRes = await post(server.baseUrl, '/api/trips', baseTrip, token);
    expect(createRes.status).toBe(201);
    const { id: httpTripId } = (await createRes.json()) as { id: string };

    // Read via service layer (same path the Svelte frontend takes)
    await login('e2e_admin1', 'Admin123!');
    await refreshTrips();
    const storeTrips = get(trips);
    logout();

    expect(storeTrips.some((t) => t.id === httpTripId)).toBe(true);
  });

  it('multiple trips created via HTTP all appear in the service store', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_admin2', password: 'Admin123!' });
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'e2e_admin2', password: 'Admin123!'
    })).json()) as { token: string };

    await post(server.baseUrl, '/api/trips', { ...baseTrip, name: 'Alpha' }, token);
    await post(server.baseUrl, '/api/trips', { ...baseTrip, name: 'Beta' }, token);

    await login('e2e_admin2', 'Admin123!');
    await refreshTrips();
    const storeTrips = get(trips);
    logout();

    const names = storeTrips.map((t) => t.name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });
});

describe('E2E: question created via HTTP is visible through service layer', () => {
  it('question id from HTTP response matches question in Svelte store', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_admin3', password: 'Admin123!' });
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'e2e_admin3', password: 'Admin123!'
    })).json()) as { token: string };

    const qRes = await post(server.baseUrl, '/api/questions', baseQuestion, token);
    expect(qRes.status).toBe(201);
    const { id: httpQId } = (await qRes.json()) as { id: string };

    await login('e2e_admin3', 'Admin123!');
    await refreshQuestions();
    const storeQs = get(questions);
    logout();

    expect(storeQs.some((q) => q.id === httpQId)).toBe(true);
  });
});

describe('E2E: user registered via HTTP is authenticable via service layer', () => {
  it('service-layer login succeeds for a user registered through HTTP', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_admin4', password: 'Admin123!' });
    await post(server.baseUrl, '/api/auth/register', {
      username: 'e2e_disp', password: 'Disp123!', role: 'dispatcher'
    });

    // Authenticate via the service layer directly (as the Svelte frontend does)
    await login('e2e_disp', 'Disp123!');
    expect(currentRole()).toBe('dispatcher');
    expect(typeof currentUserId()).toBe('string');
    logout();
  });
});

describe('E2E: HTTP login state is independent of service-layer session', () => {
  it('HTTP token login and service login are separate — logging out via service does not revoke HTTP token', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_admin5', password: 'Admin123!' });
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'e2e_admin5', password: 'Admin123!'
    })).json()) as { token: string };

    // Service-layer session is currently logged out (logout() called in beforeEach)
    expect(currentRole()).toBeNull();

    // HTTP token is still valid for API calls
    const res = await httpGet(server.baseUrl, '/api/trips', token);
    expect(res.status).toBe(200);
  });

  it('trip list via HTTP and via service layer are consistent after cross-layer writes', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_admin6', password: 'Admin123!' });
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'e2e_admin6', password: 'Admin123!'
    })).json()) as { token: string };

    // Write via HTTP
    await post(server.baseUrl, '/api/trips', { ...baseTrip, name: 'ConsistencyTrip' }, token);

    // Read via HTTP
    const httpList = (await (await httpGet(server.baseUrl, '/api/trips', token)).json()) as { name: string }[];

    // Read via service layer
    await login('e2e_admin6', 'Admin123!');
    await refreshTrips();
    const serviceList = get(trips);
    logout();

    expect(httpList.some((t) => t.name === 'ConsistencyTrip')).toBe(true);
    expect(serviceList.some((t) => t.name === 'ConsistencyTrip')).toBe(true);
    expect(httpList.length).toBe(serviceList.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E2E strict schema: data written via HTTP matches the service-layer domain type
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: HTTP-created trip schema matches service-layer Trip domain type', () => {
  it('every field from the HTTP response is present and correctly typed in the service store', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_schema1', password: 'Admin123!' });
    const { token, userId } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'e2e_schema1', password: 'Admin123!'
    })).json()) as { token: string; userId: string };

    const before = Date.now();
    const createRes = await post(server.baseUrl, '/api/trips', {
      name: 'Schema Match Trip', origin: 'SFO', destination: 'JFK',
      departureAt: before + 86_400_000, rows: 10, cols: 6
    }, token);
    expect(createRes.status).toBe(201);
    const httpTrip = await createRes.json() as Record<string, unknown>;

    // Strict HTTP response schema
    expect(typeof httpTrip.id).toBe('string');
    expect(httpTrip.name).toBe('Schema Match Trip');
    expect(httpTrip.origin).toBe('SFO');
    expect(httpTrip.destination).toBe('JFK');
    expect(typeof httpTrip.departureAt).toBe('number');
    expect(httpTrip.rows).toBe(10);
    expect(httpTrip.cols).toBe(6);
    expect(httpTrip.createdBy).toBe(userId);
    expect(typeof httpTrip.createdAt).toBe('number');
    expect(httpTrip.createdAt as number).toBeGreaterThanOrEqual(before);
    expect(typeof httpTrip.updatedAt).toBe('number');
    expect(httpTrip.updatedAt as number).toBeGreaterThanOrEqual(httpTrip.createdAt as number);

    // Service layer must return a record with identical field values
    await login('e2e_schema1', 'Admin123!');
    await refreshTrips();
    const serviceList = get(trips);
    logout();

    const serviceTrip = serviceList.find((t) => t.id === (httpTrip.id as string));
    expect(serviceTrip).toBeDefined();
    expect(serviceTrip!.name).toBe(httpTrip.name);
    expect(serviceTrip!.origin).toBe(httpTrip.origin);
    expect(serviceTrip!.destination).toBe(httpTrip.destination);
    expect(serviceTrip!.departureAt).toBe(httpTrip.departureAt);
    expect(serviceTrip!.rows).toBe(httpTrip.rows);
    expect(serviceTrip!.cols).toBe(httpTrip.cols);
    expect(serviceTrip!.createdBy).toBe(httpTrip.createdBy);
    expect(serviceTrip!.createdAt).toBe(httpTrip.createdAt);
    expect(serviceTrip!.updatedAt).toBe(httpTrip.updatedAt);
  });
});

describe('E2E: HTTP-created question schema matches service-layer Question domain type', () => {
  it('every field from the HTTP response is present and correctly typed in the service store', async () => {
    await post(server.baseUrl, '/api/auth/bootstrap', { username: 'e2e_qschema1', password: 'Admin123!' });
    await post(server.baseUrl, '/api/auth/register', {
      username: 'e2e_qauthor1', password: 'Auth123!', role: 'content_author'
    });
    const { token } = (await (await post(server.baseUrl, '/api/auth/login', {
      username: 'e2e_qauthor1', password: 'Auth123!'
    })).json()) as { token: string };

    const before = Date.now();
    const createRes = await post(server.baseUrl, '/api/questions', {
      ...baseQuestion,
      prompt: 'E2E schema question?',
      maxScore: 50,
      difficulty: 4,
      tags: ['e2e-tag'],
      knowledgePoints: ['KP-E2E'],
      applicableDepartments: ['Engineering']
    }, token);
    expect(createRes.status).toBe(201);
    const httpQ = await createRes.json() as Record<string, unknown>;

    // Strict HTTP response schema
    expect(typeof httpQ.id).toBe('string');
    expect(httpQ.type).toBe('short_answer');
    expect(httpQ.prompt).toBe('E2E schema question?');
    expect(httpQ.status).toBe('active');
    expect(httpQ.maxScore).toBe(50);
    expect(httpQ.difficulty).toBe(4);
    expect(Array.isArray(httpQ.choices)).toBe(true);
    expect(Array.isArray(httpQ.correctChoiceIds)).toBe(true);
    expect(httpQ.correctNumeric).toBeNull();
    expect(typeof httpQ.numericTolerance).toBe('number');
    expect(Array.isArray(httpQ.acceptedAnswers)).toBe(true);
    expect(typeof httpQ.caseSensitive).toBe('boolean');
    expect(Array.isArray(httpQ.tags)).toBe(true);
    expect((httpQ.tags as string[]).includes('e2e-tag')).toBe(true);
    expect(Array.isArray(httpQ.knowledgePoints)).toBe(true);
    expect((httpQ.knowledgePoints as string[]).includes('KP-E2E')).toBe(true);
    expect(Array.isArray(httpQ.applicableDepartments)).toBe(true);
    expect((httpQ.applicableDepartments as string[]).includes('Engineering')).toBe(true);
    expect(typeof httpQ.createdAt).toBe('number');
    expect(httpQ.createdAt as number).toBeGreaterThanOrEqual(before);
    expect(typeof httpQ.updatedAt).toBe('number');
    expect(httpQ.deletedAt).toBeNull();

    // Service layer must return a record with identical field values
    await login('e2e_qauthor1', 'Auth123!');
    await refreshQuestions();
    const serviceList = get(questions);
    logout();

    const serviceQ = serviceList.find((q) => q.id === (httpQ.id as string));
    expect(serviceQ).toBeDefined();
    expect(serviceQ!.prompt).toBe(httpQ.prompt);
    expect(serviceQ!.type).toBe(httpQ.type);
    expect(serviceQ!.status).toBe(httpQ.status);
    expect(serviceQ!.maxScore).toBe(httpQ.maxScore);
    expect(serviceQ!.difficulty).toBe(httpQ.difficulty);
    expect(serviceQ!.createdAt).toBe(httpQ.createdAt);
    expect(serviceQ!.updatedAt).toBe(httpQ.updatedAt);
  });
});
