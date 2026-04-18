import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { get } from 'svelte/store';
import {
  register, login, logout, bootstrapFirstAdmin,
  currentUserId, currentRole
} from '@application/services/authService';
import { refreshTrips, createTrip, trips } from '@application/services/tripsService';
import { refreshQuestions, createQuestion, questions } from '@application/services/questionService';
import type { Role } from '@domain/auth/role';

// ─── session store ────────────────────────────────────────────────────────────

interface SessionEntry { username: string; password: string; }
const sessions = new Map<string, SessionEntry>();

export function _resetSessionsForTesting(): void {
  sessions.clear();
}

// ─── primitives ──────────────────────────────────────────────────────────────

export async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

/**
 * Wraps a service call so that known domain errors are surfaced as proper HTTP
 * 400 / 401 / 403 responses instead of falling through to the 500 outer catch.
 */
export async function serviceCall(res: ServerResponse, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'AuthorizationError') {
      send(res, 403, { error: err.message });
    } else if (err.message?.includes('Invalid credentials')) {
      send(res, 401, { error: err.message });
    } else {
      send(res, 400, { error: err.message });
    }
  }
}

/**
 * Authenticates the request by looking up the Bearer token in the session store,
 * re-establishing the in-process Svelte session, running `fn`, then logging out.
 * Any error thrown by `fn` propagates to the outer 500 catch — this is intentional:
 * unexpected service failures (e.g. IDB corruption) should surface as 500, not 400.
 */
export async function withAuth(
  req: IncomingMessage,
  res: ServerResponse,
  fn: () => Promise<void>
): Promise<void> {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    send(res, 401, { error: 'Missing Bearer token' });
    return;
  }
  const token = auth.slice(7);
  const entry = sessions.get(token);
  if (!entry) {
    send(res, 401, { error: 'Invalid session' });
    return;
  }
  try {
    await login(entry.username, entry.password);
    await fn();
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'AuthorizationError') {
      send(res, 403, { error: err.message });
      return;
    }
    throw e;
  } finally {
    logout();
  }
}

// ─── request dispatcher ───────────────────────────────────────────────────────

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // POST /api/auth/bootstrap
  if (method === 'POST' && url === '/api/auth/bootstrap') {
    const body = (await readBody(req)) as Record<string, unknown>;
    await serviceCall(res, async () => {
      const user = await bootstrapFirstAdmin(
        body.username as string,
        body.password as string,
        (body.department as string | null) ?? null
      );
      send(res, 201, { id: user.id, username: user.username, role: user.role });
    });
    return;
  }

  // POST /api/auth/register
  if (method === 'POST' && url === '/api/auth/register') {
    const body = (await readBody(req)) as Record<string, unknown>;
    await serviceCall(res, async () => {
      const user = await register(
        body.username as string,
        body.password as string,
        body.role as Role,
        (body.department as string | null) ?? null
      );
      send(res, 201, { id: user.id, username: user.username, role: user.role });
    });
    return;
  }

  // POST /api/auth/login
  if (method === 'POST' && url === '/api/auth/login') {
    const body = (await readBody(req)) as Record<string, unknown>;
    await serviceCall(res, async () => {
      const username = body.username as string;
      const password = body.password as string;
      await login(username, password);
      const userId = currentUserId()!;
      const role = currentRole()!;
      const token = crypto.randomUUID();
      sessions.set(token, { username, password });
      logout();
      send(res, 200, { token, userId, role });
    });
    return;
  }

  // POST /api/auth/logout
  if (method === 'POST' && url === '/api/auth/logout') {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) sessions.delete(auth.slice(7));
    send(res, 200, { ok: true });
    return;
  }

  // GET /api/trips
  if (method === 'GET' && url === '/api/trips') {
    await withAuth(req, res, async () => {
      await refreshTrips();
      send(res, 200, get(trips));
    });
    return;
  }

  // POST /api/trips
  if (method === 'POST' && url === '/api/trips') {
    const body = (await readBody(req)) as Record<string, unknown>;
    await withAuth(req, res, async () => {
      const result = await createTrip(body as Parameters<typeof createTrip>[0]);
      if (result.ok) send(res, 201, result.trip);
      else send(res, 400, { errors: result.errors });
    });
    return;
  }

  // GET /api/questions
  if (method === 'GET' && url === '/api/questions') {
    await withAuth(req, res, async () => {
      await refreshQuestions();
      send(res, 200, get(questions));
    });
    return;
  }

  // POST /api/questions
  if (method === 'POST' && url === '/api/questions') {
    const body = (await readBody(req)) as Record<string, unknown>;
    await withAuth(req, res, async () => {
      const result = await createQuestion(body as Parameters<typeof createQuestion>[0]);
      if (result.ok) send(res, 201, result.question);
      else send(res, 400, { errors: result.errors });
    });
    return;
  }

  // GET /api/health — liveness probe used by Playwright webServer readiness check
  if (method === 'GET' && url === '/api/health') {
    send(res, 200, { ok: true });
    return;
  }

  send(res, 404, { error: `${method} ${url} not found` });
}

// ─── server factory ───────────────────────────────────────────────────────────

export function createApiServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await dispatch(req, res);
    } catch (e: unknown) {
      // Only truly unexpected infrastructure failures reach here.
      // Service-level domain errors are handled inside serviceCall (→ 400/401/403).
      // withAuth deliberately does NOT catch fn() errors so that IDB/unexpected
      // failures surface as 500 rather than being silently mapped to 400.
      const err = e as Error;
      send(res, 500, { error: err.message ?? 'Internal server error' });
    }
  });
}
