import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/');
  // ensureSeedUsers() seeds 4 accounts via PBKDF2 (100 000 iterations each).
  // The last seed user (reviewer) may not exist yet when the page finishes loading,
  // so we retry the login until it succeeds rather than racing against seeding.
  for (let attempt = 0; attempt < 10; attempt++) {
    // Guard: if the password input is gone we already navigated away (login succeeded)
    const onLoginPage = await page.locator('input[type="password"]').isVisible({ timeout: 2_000 }).catch(() => false);
    if (!onLoginPage) return;

    // Username input has no name/placeholder — select by type exclusion
    await page.fill('label:has-text("Username") input, input:not([type])', username);
    await page.fill('input[type="password"]', password);
    // Playwright's click waits for the button to be actionable (visible, enabled)
    await page.click('button[type="submit"]');

    // Wait up to 4 s for the "Sign out" button — covers PBKDF2 verification + navigation
    const loggedIn = await page.locator('button:has-text("Sign out")').isVisible({ timeout: 4_000 }).catch(() => false);
    if (loggedIn) return;

    // Login likely failed (user not seeded yet) — wait briefly before retrying
    await page.waitForTimeout(500);
  }
  throw new Error(`Login as ${username} failed after retries — seeding may not have completed`);
}

test.describe('Happy Path — admin login and navigation', () => {
  test('logs in as admin and reaches the home dashboard', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');

    // After login, navbar should show username and role
    await expect(page.locator('body')).toContainText('admin');
    await expect(page.locator('body')).toContainText('Administrator');
  });

  test('administrator can navigate to Trips page', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');

    await page.click('a[href*="trip"], a:has-text("Trips")');
    await expect(page.locator('body')).toContainText('Dispatcher · Trips');
  });

  test('administrator can navigate to Configuration page', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');

    await page.click('a[href*="config"], a:has-text("Configuration")');
    await expect(page.locator('body')).toContainText('Configuration Console');
  });

  test('logout clears the session and shows the login screen', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');

    await page.click('button:has-text("Sign out")');

    // Should return to login screen
    await expect(page.locator('body')).toContainText(/sign in/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trip state transitions and data persistence
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trip state transitions and data persistence', () => {
  test('creates a new trip via the UI form and verifies it appears in the list', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');
    await page.click('a[href*="trip"], a:has-text("Trips")');

    // Open the New trip modal
    await page.click('button:has-text("New trip")');
    await expect(page.locator('body')).toContainText('New trip');

    // Fill in trip form — inputs are label-wrapped with no name/id attributes
    await page.fill('label:has-text("Name") input', 'E2E Playwright Trip');
    await page.fill('label:has-text("Origin") input', 'Central Station');
    await page.fill('label:has-text("Destination") input', 'Airport Terminal');

    await page.click('button:has-text("Create")');

    // Trip should now appear in the trips table
    await expect(page.locator('body')).toContainText('E2E Playwright Trip');
    await expect(page.locator('body')).toContainText('Central Station');
    await expect(page.locator('body')).toContainText('Airport Terminal');
  });

  test('trip persists in IndexedDB after navigating away and returning', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');
    await page.click('a[href*="trip"], a:has-text("Trips")');

    // Create a trip
    await page.click('button:has-text("New trip")');
    await page.fill('label:has-text("Name") input', 'Persistence Check Trip');
    await page.fill('label:has-text("Origin") input', 'Uptown Hub');
    await page.fill('label:has-text("Destination") input', 'Downtown Terminal');
    await page.click('button:has-text("Create")');
    await expect(page.locator('body')).toContainText('Persistence Check Trip');

    // Navigate to Configuration page
    await page.click('a[href*="config"], a:has-text("Configuration")');
    await expect(page.locator('body')).toContainText('Configuration Console');

    // Return to Trips — data must still be present (IndexedDB persists within session)
    await page.click('a[href*="trip"], a:has-text("Trips")');
    await expect(page.locator('body')).toContainText('Persistence Check Trip');
    await expect(page.locator('body')).toContainText('Uptown Hub');
  });

  test('empty-state message disappears once a trip is created', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');
    await page.click('a[href*="trip"], a:has-text("Trips")');

    // Verify empty state is shown initially
    await expect(page.locator('body')).toContainText('No trips yet');

    // Create a trip
    await page.click('button:has-text("New trip")');
    await page.fill('label:has-text("Name") input', 'First Trip');
    await page.fill('label:has-text("Origin") input', 'North');
    await page.fill('label:has-text("Destination") input', 'South');
    await page.click('button:has-text("Create")');

    // Empty state should be gone
    await expect(page.locator('body')).not.toContainText('No trips yet');
    await expect(page.locator('body')).toContainText('First Trip');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Role-based access control
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Role-based access control', () => {
  test('dispatcher can access Trips but Configuration link is absent from their nav', async ({ page }) => {
    await login(page, 'dispatcher', 'Disp123!');

    await expect(page.locator('body')).toContainText('dispatcher');
    await expect(page.locator('body')).toContainText('Dispatcher');

    // Dispatcher can navigate to Trips
    await page.click('a[href*="trip"], a:has-text("Trips")');
    await expect(page.locator('body')).toContainText('Dispatcher · Trips');

    // Configuration nav link must not be rendered for a Dispatcher
    await expect(page.locator('a:has-text("Configuration")')).toHaveCount(0);
  });

  test('content author can access Question Management but not Trips nav link', async ({ page }) => {
    await login(page, 'author', 'Author123!');

    await expect(page.locator('body')).toContainText('author');

    // Author can navigate to Questions
    await page.click('a:has-text("Questions"), a[href*="question"]');
    await expect(page.locator('body')).toContainText('Question Management');

    // Trips nav link must not be rendered for a Content Author
    await expect(page.locator('a:has-text("Trips")')).toHaveCount(0);
  });

  test('reviewer can access the Grading page', async ({ page }) => {
    await login(page, 'reviewer', 'Review123!');

    await expect(page.locator('body')).toContainText('reviewer');

    await page.click('a:has-text("Review"), a[href*="review"]');
    await expect(page.locator('body')).toContainText('Grading');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API contract — IndexedDB schema validation
// Validates that UI actions produce correctly-shaped records in the IndexedDB
// persistence layer, enforcing the full FE↔IDB data contract.
// ─────────────────────────────────────────────────────────────────────────────

type IdbRecord = Record<string, unknown>;

async function readIdbStore(page: import('@playwright/test').Page, store: string): Promise<IdbRecord[]> {
  return page.evaluate(async (storeName: string): Promise<IdbRecord[]> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('task09');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) { resolve([]); return; }
        const tx = db.transaction(storeName, 'readonly');
        const getAllReq = tx.objectStore(storeName).getAll();
        getAllReq.onsuccess = () => resolve(getAllReq.result as IdbRecord[]);
        getAllReq.onerror = () => reject(getAllReq.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, store);
}

test.describe('API contract — IndexedDB schema validation', () => {
  test('trip creation writes a complete Trip record to IndexedDB with correct schema', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');
    await page.click('a[href*="trip"], a:has-text("Trips")');

    await page.click('button:has-text("New trip")');
    await page.fill('label:has-text("Name") input', 'IDB Schema Trip');
    await page.fill('label:has-text("Origin") input', 'Alpha Hub');
    await page.fill('label:has-text("Destination") input', 'Beta Terminal');
    await page.click('button:has-text("Create")');
    await expect(page.locator('body')).toContainText('IDB Schema Trip');

    const trips = await readIdbStore(page, 'trips');
    const trip = trips.find(t => t['name'] === 'IDB Schema Trip') as IdbRecord;

    expect(trip).toBeDefined();
    expect(typeof trip['id']).toBe('string');
    expect((trip['id'] as string).length).toBeGreaterThan(0);
    expect(trip['name']).toBe('IDB Schema Trip');
    expect(trip['origin']).toBe('Alpha Hub');
    expect(trip['destination']).toBe('Beta Terminal');
    expect(typeof trip['departureAt']).toBe('number');
    expect(typeof trip['rows']).toBe('number');
    expect(typeof trip['cols']).toBe('number');
    expect(typeof trip['createdBy']).toBe('string');
    expect(typeof trip['createdAt']).toBe('number');
    expect(typeof trip['updatedAt']).toBe('number');
    // createdAt must be a recent epoch timestamp (after 2020)
    expect(trip['createdAt'] as number).toBeGreaterThan(1_577_836_800_000);
    // updatedAt >= createdAt
    expect(trip['updatedAt'] as number).toBeGreaterThanOrEqual(trip['createdAt'] as number);
    // departureAt is in the future (form defaults to tomorrow)
    expect(trip['departureAt'] as number).toBeGreaterThan(Date.now());
    // layout dimensions are positive integers
    expect(trip['rows'] as number).toBeGreaterThan(0);
    expect(trip['cols'] as number).toBeGreaterThan(0);
    // createdBy is a non-empty string (the user's id)
    expect((trip['createdBy'] as string).length).toBeGreaterThan(0);
  });

  test('user bootstrap writes a complete UserRecord to IndexedDB — no plaintext password stored', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');

    const users = await readIdbStore(page, 'users');
    const admin = users.find(u => u['username'] === 'admin') as IdbRecord;

    expect(admin).toBeDefined();
    expect(typeof admin['id']).toBe('string');
    expect((admin['id'] as string).length).toBeGreaterThan(0);
    expect(admin['username']).toBe('admin');
    expect(admin['role']).toBe('administrator');
    // credential must be an object (PBKDF2 hash + salt), not a plaintext string
    expect(typeof admin['credential']).toBe('object');
    expect(admin['credential']).not.toBeNull();
    // credential object must have the PBKDF2 derived key fields
    const cred = admin['credential'] as IdbRecord;
    expect(typeof cred['hashB64']).toBe('string');
    expect(typeof cred['saltB64']).toBe('string');
    // encryptionSaltB64 is a base64 string used for AES-GCM key derivation
    expect(typeof admin['encryptionSaltB64']).toBe('string');
    expect((admin['encryptionSaltB64'] as string).length).toBeGreaterThan(0);
    expect(typeof admin['createdAt']).toBe('number');
    expect(admin['createdAt'] as number).toBeGreaterThan(1_577_836_800_000);
    // password must NOT be stored in plaintext at the top level
    expect('password' in admin).toBe(false);
    // raw PBKDF2 plaintext must not appear anywhere in the serialised record
    const serialised = JSON.stringify(admin);
    expect(serialised).not.toContain('Admin123!');
  });

  test('multiple trips share distinct IDs — no ID collision under sequential inserts', async ({ page }) => {
    await login(page, 'admin', 'Admin123!');
    await page.click('a[href*="trip"], a:has-text("Trips")');

    for (const name of ['Collision A', 'Collision B', 'Collision C']) {
      await page.click('button:has-text("New trip")');
      await page.fill('label:has-text("Name") input', name);
      await page.fill('label:has-text("Origin") input', 'X');
      await page.fill('label:has-text("Destination") input', 'Y');
      await page.click('button:has-text("Create")');
      await expect(page.locator('body')).toContainText(name);
    }

    const trips = await readIdbStore(page, 'trips');
    const ids = trips.map(t => t['id'] as string);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('login error branch: wrong password shows an inline error message in the UI', async ({ page }) => {
    await page.goto('/');
    // Attempt login with wrong password — should stay on login page with error
    await page.fill('label:has-text("Username") input, input:not([type])', 'admin');
    await page.fill('input[type="password"]', 'WrongPassword999!');
    await page.click('button[type="submit"]');

    // The login error should be visible; "Sign out" must NOT appear
    await expect(page.locator('body')).toContainText(/invalid credentials|authentication failed/i, { timeout: 6_000 });
    await expect(page.locator('button:has-text("Sign out")')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Network contract — SPA isolation and HTTP API endpoint verification
//
// The SPA communicates exclusively through IndexedDB — it makes no HTTP calls
// during normal UI interactions. These tests enforce that contract and also
// directly exercise the HTTP API server to verify method + path + payload
// against the documented frontend-to-backend mapping.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Network contract — SPA network isolation', () => {
  test('SPA makes no outgoing HTTP calls to external hosts during login flow', async ({ page }) => {
    const externalRequests: string[] = [];

    page.on('request', req => {
      const url = req.url();
      // Flag any request that is not serving the SPA assets from localhost:8080
      if (!url.startsWith('http://localhost:8080') && !url.startsWith('http://127.0.0.1:8080')) {
        externalRequests.push(`${req.method()} ${url}`);
      }
    });

    await login(page, 'admin', 'Admin123!');

    // No request should have been sent to any host other than the SPA dev server
    expect(externalRequests).toHaveLength(0);
  });

  test('SPA makes no outgoing HTTP calls during trip creation', async ({ page }) => {
    const externalRequests: string[] = [];

    page.on('request', req => {
      const url = req.url();
      if (!url.startsWith('http://localhost:8080') && !url.startsWith('http://127.0.0.1:8080')) {
        externalRequests.push(`${req.method()} ${url}`);
      }
    });

    await login(page, 'admin', 'Admin123!');
    await page.click('a[href*="trip"], a:has-text("Trips")');
    await page.click('button:has-text("New trip")');
    await page.fill('label:has-text("Name") input', 'Network Isolation Test Trip');
    await page.fill('label:has-text("Origin") input', 'Here');
    await page.fill('label:has-text("Destination") input', 'There');
    await page.click('button:has-text("Create")');
    await expect(page.locator('body')).toContainText('Network Isolation Test Trip');

    expect(externalRequests).toHaveLength(0);
  });

  test('SPA makes no outgoing HTTP calls during navigation across all main routes', async ({ page }) => {
    const externalRequests: string[] = [];

    page.on('request', req => {
      const url = req.url();
      if (!url.startsWith('http://localhost:8080') && !url.startsWith('http://127.0.0.1:8080')) {
        externalRequests.push(`${req.method()} ${url}`);
      }
    });

    await login(page, 'admin', 'Admin123!');

    await page.click('a[href*="trip"], a:has-text("Trips")');
    await expect(page.locator('body')).toContainText('Dispatcher · Trips');

    await page.click('a[href*="config"], a:has-text("Configuration")');
    await expect(page.locator('body')).toContainText('Configuration Console');

    expect(externalRequests).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP API contract — direct endpoint verification
//
// Uses page.request to call the HTTP API server (port 3001) directly from the
// Playwright browser context, asserting the exact method, path, payload, and
// response schema for every documented frontend-to-backend endpoint.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HTTP API contract — endpoint method + path + payload assertions', () => {
  const API = 'http://localhost:3001';

  test('POST /api/auth/bootstrap — method, path, and response schema', async ({ page }) => {
    const res = await page.request.post(`${API}/api/auth/bootstrap`, {
      data: { username: 'pw_bootstrap_admin', password: 'Admin123!' }
    });
    expect(res.status()).toBe(201);
    expect(res.headers()['content-type']).toMatch(/application\/json/);
    const body = await res.json() as IdbRecord;
    // Exact field contract: id (string), username (string), role (string)
    expect(typeof body['id']).toBe('string');
    expect((body['id'] as string).length).toBeGreaterThan(0);
    expect(body['username']).toBe('pw_bootstrap_admin');
    expect(body['role']).toBe('administrator');
    // Security: credential fields must NOT be present in the HTTP response
    expect('credential' in body).toBe(false);
    expect('password' in body).toBe(false);
    expect('encryptionSaltB64' in body).toBe(false);
  });

  test('POST /api/auth/register — method, path, payload, and strict response schema', async ({ page }) => {
    // Bootstrap admin first so the server is initialised
    await page.request.post(`${API}/api/auth/bootstrap`, {
      data: { username: 'pw_reg_setup', password: 'Admin123!' }
    });

    const res = await page.request.post(`${API}/api/auth/register`, {
      data: { username: 'pw_dispatcher', password: 'Disp123!', role: 'dispatcher' }
    });
    expect(res.status()).toBe(201);
    const body = await res.json() as IdbRecord;
    expect(typeof body['id']).toBe('string');
    expect(body['username']).toBe('pw_dispatcher');
    expect(body['role']).toBe('dispatcher');
    expect('credential' in body).toBe(false);
    expect('password' in body).toBe(false);
  });

  test('POST /api/auth/login — returns token + userId + role, no credential leak', async ({ page }) => {
    // pw_bootstrap_admin was created by the first test in this describe block
    const res = await page.request.post(`${API}/api/auth/login`, {
      data: { username: 'pw_bootstrap_admin', password: 'Admin123!' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as IdbRecord;
    // token is a UUID-format string
    expect(typeof body['token']).toBe('string');
    expect((body['token'] as string)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(typeof body['userId']).toBe('string');
    expect(body['role']).toBe('administrator');
    expect('password' in body).toBe(false);
    expect('credential' in body).toBe(false);
  });

  test('POST /api/auth/logout — invalidates the bearer token', async ({ page }) => {
    const loginRes = await page.request.post(`${API}/api/auth/login`, {
      data: { username: 'pw_bootstrap_admin', password: 'Admin123!' }
    });
    const { token } = await loginRes.json() as { token: string };

    const logoutRes = await page.request.post(`${API}/api/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {}
    });
    expect(logoutRes.status()).toBe(200);
    const body = await logoutRes.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Token is now invalid
    const tripsRes = await page.request.get(`${API}/api/trips`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(tripsRes.status()).toBe(401);
  });

  test('GET /api/trips — returns array, each element matches Trip schema', async ({ page }) => {
    const { token } = (await (await page.request.post(`${API}/api/auth/login`, {
      data: { username: 'pw_bootstrap_admin', password: 'Admin123!' }
    })).json()) as { token: string };

    // Create a trip first
    const before = Date.now();
    await page.request.post(`${API}/api/trips`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'PW Schema Trip', origin: 'JFK', destination: 'LAX',
        departureAt: Date.now() + 86_400_000, rows: 8, cols: 4
      }
    });

    const listRes = await page.request.get(`${API}/api/trips`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(listRes.status()).toBe(200);
    expect(listRes.headers()['content-type']).toMatch(/application\/json/);
    const list = await listRes.json() as IdbRecord[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);

    for (const trip of list) {
      expect(typeof trip['id']).toBe('string');
      expect(typeof trip['name']).toBe('string');
      expect(typeof trip['origin']).toBe('string');
      expect(typeof trip['destination']).toBe('string');
      expect(typeof trip['departureAt']).toBe('number');
      expect(typeof trip['rows']).toBe('number');
      expect(typeof trip['cols']).toBe('number');
      expect(typeof trip['createdBy']).toBe('string');
      expect(typeof trip['createdAt']).toBe('number');
      expect(trip['createdAt'] as number).toBeGreaterThan(before - 5000);
      expect(typeof trip['updatedAt']).toBe('number');
    }
  });

  test('POST /api/trips — 201 with complete Trip schema; 400 with errors[] for invalid input', async ({ page }) => {
    const { token } = (await (await page.request.post(`${API}/api/auth/login`, {
      data: { username: 'pw_bootstrap_admin', password: 'Admin123!' }
    })).json()) as { token: string };

    // Valid creation
    const validRes = await page.request.post(`${API}/api/trips`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'Contract Trip', origin: 'SFO', destination: 'ORD',
        departureAt: Date.now() + 86_400_000, rows: 6, cols: 4
      }
    });
    expect(validRes.status()).toBe(201);
    const trip = await validRes.json() as IdbRecord;
    expect(trip['name']).toBe('Contract Trip');
    expect(trip['origin']).toBe('SFO');
    expect(trip['destination']).toBe('ORD');
    expect(typeof trip['id']).toBe('string');
    expect(typeof trip['createdBy']).toBe('string');
    expect(typeof trip['createdAt']).toBe('number');

    // Invalid — empty name
    const invalidRes = await page.request.post(`${API}/api/trips`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: '', origin: '', destination: '', departureAt: Date.now() + 86_400_000, rows: 8, cols: 4 }
    });
    expect(invalidRes.status()).toBe(400);
    const errBody = await invalidRes.json() as { errors: unknown[] };
    expect(Array.isArray(errBody['errors'])).toBe(true);
    expect(errBody['errors'].length).toBeGreaterThan(0);
    for (const e of errBody['errors']) {
      expect(typeof e).toBe('string');
    }
  });

  test('GET /api/questions — returns array; 403 for unauthorized role', async ({ page }) => {
    await page.request.post(`${API}/api/auth/register`, {
      data: { username: 'pw_author', password: 'Auth123!', role: 'content_author' }
    });
    await page.request.post(`${API}/api/auth/register`, {
      data: { username: 'pw_reviewer', password: 'Rev123!', role: 'reviewer' }
    });

    const { token: authorToken } = (await (await page.request.post(`${API}/api/auth/login`, {
      data: { username: 'pw_author', password: 'Auth123!' }
    })).json()) as { token: string };

    const { token: reviewerToken } = (await (await page.request.post(`${API}/api/auth/login`, {
      data: { username: 'pw_reviewer', password: 'Rev123!' }
    })).json()) as { token: string };

    // Author can list questions
    const listRes = await page.request.get(`${API}/api/questions`, {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    expect(listRes.status()).toBe(200);
    expect(Array.isArray(await listRes.json())).toBe(true);

    // Reviewer is denied
    const deniedRes = await page.request.get(`${API}/api/questions`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    expect(deniedRes.status()).toBe(403);
    const errBody = await deniedRes.json() as { error: string };
    expect(typeof errBody['error']).toBe('string');
    expect(errBody['error'].toLowerCase()).toContain('not authorized');
  });

  test('error contract — 401 for missing token, 401 for invalid token, 404 for unknown route', async ({ page }) => {
    // Missing Authorization header
    const noTokenRes = await page.request.get(`${API}/api/trips`);
    expect(noTokenRes.status()).toBe(401);
    expect((await noTokenRes.json() as { error: string })['error']).toBe('Missing Bearer token');

    // Invalid/unknown token
    const badTokenRes = await page.request.get(`${API}/api/trips`, {
      headers: { Authorization: 'Bearer completely-invalid-token-xyz' }
    });
    expect(badTokenRes.status()).toBe(401);
    expect((await badTokenRes.json() as { error: string })['error']).toBe('Invalid session');

    // Unknown route
    const notFoundRes = await page.request.get(`${API}/api/no-such-endpoint`);
    expect(notFoundRes.status()).toBe(404);
    const nfBody = await notFoundRes.json() as { error: string };
    expect(nfBody['error']).toContain('GET /api/no-such-endpoint not found');
  });
});
