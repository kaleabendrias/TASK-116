import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { startTestServer, post, get, type TestServer } from './serverHelper';

let server: TestServer;
let authorToken: string;
let reviewerToken: string;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

beforeEach(async () => {
  await post(server.baseUrl, '/api/auth/bootstrap', { username: 'admin', password: 'Admin123!' });
  await post(server.baseUrl, '/api/auth/register', {
    username: 'author1', password: 'Author123!', role: 'content_author'
  });
  await post(server.baseUrl, '/api/auth/register', {
    username: 'reviewer1', password: 'Rev123!', role: 'reviewer'
  });
  authorToken = ((await (await post(server.baseUrl, '/api/auth/login', {
    username: 'author1', password: 'Author123!'
  })).json()) as { token: string }).token;
  reviewerToken = ((await (await post(server.baseUrl, '/api/auth/login', {
    username: 'reviewer1', password: 'Rev123!'
  })).json()) as { token: string }).token;
});

const baseQuestion = {
  type: 'short_answer' as const,
  prompt: 'Explain the concept of encapsulation.',
  choices: [],
  correctChoiceIds: [],
  correctNumeric: null,
  numericTolerance: 0,
  acceptedAnswers: [],
  caseSensitive: false,
  difficulty: 2 as const,
  maxScore: 10,
  explanation: '',
  tags: [],
  knowledgePoints: [],
  applicableDepartments: []
};

describe('GET /api/questions', () => {
  it('returns empty list initially', async () => {
    const res = await get(server.baseUrl, '/api/questions', authorToken);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('rejects reviewer access (insufficient role)', async () => {
    const res = await get(server.baseUrl, '/api/questions', reviewerToken);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not authorized');
  });
});

describe('POST /api/questions', () => {
  it('creates a question and returns 201', async () => {
    const res = await post(server.baseUrl, '/api/questions', baseQuestion, authorToken);
    expect(res.status).toBe(201);
    const q = await res.json() as { id: string; type: string; status: string };
    expect(q.type).toBe('short_answer');
    expect(q.status).toBe('active');
    expect(typeof q.id).toBe('string');
  });

  it('validates question input — rejects empty prompt', async () => {
    const res = await post(server.baseUrl, '/api/questions', { ...baseQuestion, prompt: '' }, authorToken);
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: string[] };
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('rejects reviewer creating questions', async () => {
    const res = await post(server.baseUrl, '/api/questions', baseQuestion, reviewerToken);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not authorized');
  });
});

describe('GET /api/questions after creation', () => {
  it('lists created questions', async () => {
    await post(server.baseUrl, '/api/questions', { ...baseQuestion, prompt: 'Q1?' }, authorToken);
    await post(server.baseUrl, '/api/questions', { ...baseQuestion, prompt: 'Q2?' }, authorToken);
    const res = await get(server.baseUrl, '/api/questions', authorToken);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(body.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Strict field-level schema assertions for question endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/questions — strict response schema', () => {
  it('response body contains all required Question fields with correct types', async () => {
    const before = Date.now();
    const res = await post(server.baseUrl, '/api/questions', {
      ...baseQuestion,
      prompt: 'Schema question?',
      maxScore: 50,
      difficulty: 3,
      tags: ['schema-test'],
      knowledgePoints: ['KP-1'],
      applicableDepartments: ['Genomics'],
    }, authorToken);
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const q = await res.json() as Record<string, unknown>;

    expect(typeof q.id).toBe('string');
    expect((q.id as string).length).toBeGreaterThan(0);
    expect(q.type).toBe('short_answer');
    expect(q.prompt).toBe('Schema question?');
    expect(q.status).toBe('active');
    expect(q.maxScore).toBe(50);
    expect(q.difficulty).toBe(3);
    expect(Array.isArray(q.choices)).toBe(true);
    expect(Array.isArray(q.correctChoiceIds)).toBe(true);
    expect(q.correctNumeric).toBeNull();
    expect(typeof q.numericTolerance).toBe('number');
    expect(Array.isArray(q.acceptedAnswers)).toBe(true);
    expect(typeof q.caseSensitive).toBe('boolean');
    expect(q.caseSensitive).toBe(false);
    expect(Array.isArray(q.tags)).toBe(true);
    expect(q.tags).toContain('schema-test');
    expect(Array.isArray(q.knowledgePoints)).toBe(true);
    expect(q.knowledgePoints).toContain('KP-1');
    expect(Array.isArray(q.applicableDepartments)).toBe(true);
    expect(q.applicableDepartments).toContain('Genomics');
    expect(typeof q.createdAt).toBe('number');
    expect(q.createdAt as number).toBeGreaterThanOrEqual(before);
    expect(typeof q.updatedAt).toBe('number');
    expect(q.deletedAt).toBeNull();
  });

  it('400 validation errors array is non-empty strings for empty prompt', async () => {
    const res = await post(server.baseUrl, '/api/questions', {
      ...baseQuestion, prompt: ''
    }, authorToken);
    expect(res.status).toBe(400);
    const body = await res.json() as { errors: unknown[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    for (const e of body.errors) {
      expect(typeof e).toBe('string');
      expect((e as string).toLowerCase()).toContain('prompt');
    }
  });

  it('403 error body contains an exact "not authorized" message for insufficient role', async () => {
    const res = await post(server.baseUrl, '/api/questions', baseQuestion, reviewerToken);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.toLowerCase()).toContain('not authorized');
  });
});

describe('GET /api/questions — strict list schema', () => {
  it('each question in the list has all required fields', async () => {
    await post(server.baseUrl, '/api/questions', {
      ...baseQuestion, prompt: 'List schema Q?'
    }, authorToken);
    const res = await get(server.baseUrl, '/api/questions', authorToken);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const list = await res.json() as Record<string, unknown>[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const q of list) {
      expect(typeof q.id).toBe('string');
      expect(typeof q.type).toBe('string');
      expect(typeof q.prompt).toBe('string');
      expect(typeof q.status).toBe('string');
      expect(typeof q.maxScore).toBe('number');
      expect(typeof q.difficulty).toBe('number');
      expect(Array.isArray(q.choices)).toBe(true);
      expect(typeof q.createdAt).toBe('number');
      expect(typeof q.updatedAt).toBe('number');
    }
  });
});
