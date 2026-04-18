/**
 * Docker-contained API verification script.
 * Run inside the web container: docker compose exec web node /app/scripts/verify.mjs
 *
 * Bootstraps a temporary admin, obtains a session token, and exercises every
 * public API endpoint. Exits 0 on full pass, 1 on any failure.
 */

const BASE = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_USER = `verify_admin_${Date.now()}`;
const ADMIN_PASS = 'Admin123!';

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ✗  ${label}`);
  if (detail) console.error(`     ${detail}`);
  failed++;
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

async function run() {
  console.log(`\nAPI verification — ${BASE}\n`);

  // ── 1. Bootstrap first admin ──────────────────────────────────────────────
  {
    const { status, json } = await req('POST', '/api/auth/bootstrap', {
      username: ADMIN_USER,
      password: ADMIN_PASS,
    });
    if (status === 201 && json?.role === 'administrator') {
      ok('POST /api/auth/bootstrap → 201, role=administrator');
    } else {
      fail('POST /api/auth/bootstrap', `status=${status} body=${JSON.stringify(json)}`);
    }
  }

  // ── 2. Login and obtain token ─────────────────────────────────────────────
  let token;
  {
    const { status, json } = await req('POST', '/api/auth/login', {
      username: ADMIN_USER,
      password: ADMIN_PASS,
    });
    if (status === 200 && typeof json?.token === 'string') {
      token = json.token;
      ok('POST /api/auth/login → 200, token received');
    } else {
      fail('POST /api/auth/login', `status=${status} body=${JSON.stringify(json)}`);
      process.exit(1); // Cannot continue without a token
    }
  }

  // ── 3. Missing Bearer token → 401 "Missing Bearer token" ─────────────────
  {
    const { status, json } = await req('GET', '/api/trips');
    if (status === 401 && json?.error === 'Missing Bearer token') {
      ok('GET /api/trips (no auth) → 401 "Missing Bearer token"');
    } else {
      fail('GET /api/trips (no auth)', `status=${status} error="${json?.error}"`);
    }
  }

  // ── 4. Invalid session token → 401 "Invalid session" ─────────────────────
  {
    const { status, json } = await req('GET', '/api/trips', undefined, 'bad-token');
    if (status === 401 && json?.error === 'Invalid session') {
      ok('GET /api/trips (bad token) → 401 "Invalid session"');
    } else {
      fail('GET /api/trips (bad token)', `status=${status} error="${json?.error}"`);
    }
  }

  // ── 5. List trips (empty) ─────────────────────────────────────────────────
  {
    const { status, json } = await req('GET', '/api/trips', undefined, token);
    if (status === 200 && Array.isArray(json)) {
      ok(`GET /api/trips → 200, array (${json.length} items)`);
    } else {
      fail('GET /api/trips', `status=${status} body=${JSON.stringify(json)}`);
    }
  }

  // ── 6. Create a trip → 201 with full trip object ──────────────────────────
  let tripId;
  {
    const { status, json } = await req('POST', '/api/trips', {
      name: 'Verification Express',
      origin: 'Central Station',
      destination: 'Airport Terminal',
      departureAt: Date.now() + 86_400_000,
      rows: 8,
      cols: 4,
    }, token);
    if (status === 201 && typeof json?.id === 'string' && json?.name === 'Verification Express') {
      tripId = json.id;
      ok('POST /api/trips → 201, trip.id and trip.name present');
    } else {
      fail('POST /api/trips', `status=${status} body=${JSON.stringify(json)}`);
    }
  }

  // ── 7. Trip appears in list after creation ────────────────────────────────
  if (tripId) {
    const { status, json } = await req('GET', '/api/trips', undefined, token);
    if (status === 200 && Array.isArray(json) && json.some((t) => t.id === tripId)) {
      ok('GET /api/trips → newly created trip is present in list');
    } else {
      fail('GET /api/trips after create', `status=${status} tripId=${tripId}`);
    }
  }

  // ── 8. Trip validation failure → 400 { errors: string[] } ─────────────────
  {
    const { status, json } = await req('POST', '/api/trips', { name: '' }, token);
    if (status === 400 && Array.isArray(json?.errors) && json.errors.length > 0) {
      ok('POST /api/trips (invalid) → 400 { errors: string[] }');
    } else {
      fail('POST /api/trips (invalid)', `status=${status} body=${JSON.stringify(json)}`);
    }
  }

  // ── 9. List questions ─────────────────────────────────────────────────────
  {
    const { status, json } = await req('GET', '/api/questions', undefined, token);
    if (status === 200 && Array.isArray(json)) {
      ok(`GET /api/questions → 200, array (${json.length} items)`);
    } else {
      fail('GET /api/questions', `status=${status} body=${JSON.stringify(json)}`);
    }
  }

  // ── 10. Create a question → 201 ───────────────────────────────────────────
  {
    const { status, json } = await req('POST', '/api/questions', {
      type: 'single_choice',
      prompt: 'Verification question?',
      choices: [{ id: 'c1', label: 'Yes' }, { id: 'c2', label: 'No' }],
      correctChoiceIds: ['c1'],
      correctNumeric: null,
      numericTolerance: 0,
      acceptedAnswers: [],
      caseSensitive: false,
      difficulty: 1,
      maxScore: 10,
      explanation: '',
      tags: [],
      knowledgePoints: [],
      applicableDepartments: [],
    }, token);
    if (status === 201 && typeof json?.id === 'string') {
      ok('POST /api/questions → 201, question.id present');
    } else {
      fail('POST /api/questions', `status=${status} body=${JSON.stringify(json)}`);
    }
  }

  // ── 11. Unknown route → 404 with embedded method + path ───────────────────
  {
    const { status, json } = await req('GET', '/api/nonexistent');
    if (status === 404 && json?.error === 'GET /api/nonexistent not found') {
      ok('GET /api/nonexistent → 404 "GET /api/nonexistent not found"');
    } else {
      fail('GET /api/nonexistent', `status=${status} error="${json?.error}"`);
    }
  }

  // ── 12. Logout ────────────────────────────────────────────────────────────
  {
    const { status, json } = await req('POST', '/api/auth/logout', undefined, token);
    if (status === 200 && json?.ok === true) {
      ok('POST /api/auth/logout → 200 { ok: true }');
    } else {
      fail('POST /api/auth/logout', `status=${status} body=${JSON.stringify(json)}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.error('\nVerification FAILED — see errors above.\n');
    process.exit(1);
  } else {
    console.log('\nAll checks passed — API server is fully operational.\n');
  }
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
