# task-09 — Full-Stack Role-Driven SPA with HTTP API Layer

**Project Type: fullstack**

A full-stack application combining a role-driven Svelte 4 Single-Page Application with a Node.js HTTP API layer. The SPA persists all data to IndexedDB, enforces fine-grained role-based access control, and applies browser-side AES-GCM encryption for sensitive fields. The HTTP API layer exposes the same application services over REST endpoints and runs alongside the SPA under a single `docker-compose up`.

## Architecture & Tech Stack

* **Frontend:** Svelte 4, TypeScript, svelte-spa-router, Vite 5
* **Backend:** Node.js built-in `http` module (no framework) — wraps the existing application-service layer
* **Database:** IndexedDB (browser-native, via fake-indexeddb in tests) — no external database required
* **Cryptography:** Web Crypto API — PBKDF2-SHA256 (100 000 iterations) for passwords; AES-GCM for health preferences and grading notes
* **Containerization:** Docker & Docker Compose (Required)

## Project Structure

```text
.
├── Dockerfile              # Web service image — installs deps via npm ci at build time
├── Dockerfile.test         # Test service image — installs deps via npm ci at build time
├── docker-compose.yml      # Production web service
├── docker-compose.test.yml # Test runner service
├── run_tests.sh            # Standardised test execution script - MANDATORY
├── config/
│   ├── app.json            # Feature flags
│   └── business.json       # Business rules (quiet hours, grading weights, food catalog …)
├── server/
│   └── app.ts              # HTTP API server (Node http, wraps application services)
├── src/
│   ├── main.ts             # SPA bootstrap + seed-user initialisation
│   ├── seed/               # Demo-user seeding (ensureSeedUsers)
│   ├── ui/                 # Svelte routes, components, styles
│   ├── application/        # Use-case services (auth, trips, grading, messaging …)
│   ├── domain/             # Pure business rules (no I/O, no Svelte)
│   ├── persistence/        # IndexedDB & localStorage adapters
│   └── shared/             # Crypto, logger, clock, validators
├── unit_tests/             # Domain + shared pure-function tests
├── API_tests/              # Service-layer + persistence integration tests
├── http_tests/             # True HTTP tests hitting the Node API server
├── frontend_tests/         # Svelte component tests (happy-dom)
├── playwright_tests/       # Browser E2E Happy-Path suite (runs in Docker via run_tests.sh)
├── vitest.unit.config.ts
├── vitest.api.config.ts
├── vitest.http.config.ts
├── vitest.frontend.config.ts
└── playwright.config.ts
```

## Prerequisites

To ensure a consistent environment, this project runs entirely within containers. Only Docker is strictly required on the host:

* [Docker](https://docs.docker.com/get-docker/) — **required**
* [Docker Compose](https://docs.docker.com/compose/install/) — **required**
* [curl](https://curl.se/) — *optional*, only needed if you want to run the manual API verification snippets in the [Verification](#verification) section
* [jq](https://jqlang.github.io/jq/) — *optional*, only needed to pretty-print JSON in the verification snippets; the `docker-compose exec` verification script works without it

All Node.js dependencies are resolved exclusively via `npm ci` during the Docker image build phase. **No runtime `npm install` is performed** — the container environment is strictly immutable after the build.

## Running the Application

1. **Build and Start Containers:**

   ```bash
   docker-compose up --build -d
   ```

2. **Access the App:**
   * Frontend SPA: `http://localhost:8080`
   * HTTP API server: `http://localhost:3001`

   The SPA seeds four demo accounts into IndexedDB automatically on first load (see [Seeded Credentials](#seeded-credentials)).

3. **Stop the Application:**

   ```bash
   docker-compose down
   ```

## Testing

All unit, integration, HTTP, and frontend tests are executed via a single, standardised shell script. The script builds the test image (`npm ci` runs in the Dockerfile at build time) then runs all four suites inside the container.

Make sure the script is executable, then run it:

```bash
chmod +x run_tests.sh
./run_tests.sh
```

*Note: The `run_tests.sh` script outputs a standard exit code (`0` for success, non-zero for failure) to integrate smoothly with CI/CD validators.*

### Test suites

| Suite | Files | Scope | Environment | Config |
|---|---|---|---|---|
| `unit` | `unit_tests/**` | `src/domain/**`, `src/shared/**` | Node | `vitest.unit.config.ts` |
| `api` | `API_tests/**` | `src/application/**`, `src/persistence/**` | Node + fake-indexeddb | `vitest.api.config.ts` |
| `http` | `http_tests/**` | `server/**` | Node + fake-indexeddb + real HTTP | `vitest.http.config.ts` |
| `frontend` | `frontend_tests/**` | `src/ui/**`, `src/main.ts` | happy-dom + Svelte plugin | `vitest.frontend.config.ts` |
| `e2e` | `playwright_tests/**` | Full browser happy-path | Chromium (Docker) | `playwright.config.ts` |

Each suite enforces **≥ 90 % coverage** on statements, functions, and lines. The frontend suite uses **≥ 85 % branch coverage** to account for Svelte 4 compiled template update-path branches that are untestable via v8 source maps.

### Browser E2E (Playwright)

The `playwright_tests/` directory contains a Happy-Path suite that automates a full user journey through the live SPA. It runs inside the Docker test container as part of the standard `run_tests.sh` pipeline — no local browser or Node installation is required. Chromium is installed into the image automatically during `docker-compose` build.

## Verification

After `docker-compose up --build -d` completes, follow these steps to confirm the system is fully operational.

### 1 — UI login flow

1. Open **http://localhost:8080** in a browser.
2. The SPA seeds four demo accounts on first load. At the login screen enter:
   * **Username:** `admin`
   * **Password:** `Admin123!`
3. Click **Sign in**. You should land on the home dashboard; the top bar displays `admin · Administrator`.
4. Navigate to **Configuration** — only the Administrator role can access it, confirming role-based access control is enforced.

### 2 — API health check

The HTTP API server is available on port **3001**. Use `curl` (and optionally `jq`) to verify it responds correctly.

**Bootstrap the first admin account:**

```bash
curl -s -X POST http://localhost:3001/api/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"username":"api-admin","password":"Admin123!"}' | jq .
```

Expected response:

```json
{
  "id": "<uuid>",
  "username": "api-admin",
  "role": "administrator"
}
```

**Obtain a session token and list trips (empty on a fresh server):**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"api-admin","password":"Admin123!"}' | jq -r .token)

curl -s http://localhost:3001/api/trips \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected response: `[]`

## Seeded Credentials

The SPA seeds the following demo accounts into IndexedDB on first launch. Use these credentials to log in immediately and explore role-based access.

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `Admin123!` | Has full access to all system modules. |
| **Dispatcher** | `dispatcher` | `Disp123!` | Trips, Messaging Center, Wellness Profile. |
| **Content Author** | `author` | `Author123!` | Question Management, Messaging Center, Wellness Profile. |
| **Reviewer / Grader** | `reviewer` | `Review123!` | Review / Grading, Messaging Center, Wellness Profile. |

## Fullstack Integration

The SPA (port 8080) and the HTTP API server (port 3001) both share the same application-service layer but maintain **independent IndexedDB stores**: the SPA stores data in the browser's IndexedDB while the API server stores data in its own server-side IndexedDB. They are separate persistence contexts connected through the same domain and service code.

### Frontend action → API endpoint mapping

| Frontend Action | HTTP Method | Endpoint | Auth Required | Success Response |
| :--- | :--- | :--- | :--- | :--- |
| Bootstrap first admin (first-run form) | `POST` | `/api/auth/bootstrap` | No | `201 { id, username, role }` |
| Register a new user (admin panel) | `POST` | `/api/auth/register` | No | `201 { id, username, role }` |
| Sign in | `POST` | `/api/auth/login` | No | `200 { token, userId, role }` |
| Sign out | `POST` | `/api/auth/logout` | Bearer token | `200 { ok: true }` |
| View trips list | `GET` | `/api/trips` | Bearer token | `200 Trip[]` |
| Create a trip | `POST` | `/api/trips` | Bearer token | `201 Trip` or `400 { errors }` |
| View questions list | `GET` | `/api/questions` | Bearer token | `200 Question[]` |
| Create a question | `POST` | `/api/questions` | Bearer token | `201 Question` or `400 { errors }` |

### Error response contract

| Condition | Status | Body shape |
| :--- | :--- | :--- |
| No `Authorization` header | `401` | `{ "error": "Missing Bearer token" }` |
| Unrecognised session token | `401` | `{ "error": "Invalid session" }` |
| Wrong credentials | `401` | `{ "error": "Invalid credentials" }` |
| Role / permission denied | `403` | `{ "error": "<reason>" }` |
| Validation failure | `400` | `{ "errors": string[] }` |
| Unknown route | `404` | `{ "error": "<METHOD> <path> not found" }` |
| Infrastructure fault | `500` | `{ "error": "<message>" }` |

### Docker-contained API verification

Run the verification script inside the already-running web container — no host-side `curl` or `jq` required:

```bash
docker-compose exec web node /app/scripts/verify.mjs
```

The script bootstraps a temporary admin account, obtains a token, exercises every public endpoint, and prints a pass/fail summary. A zero exit code confirms the API server is fully operational.

To build and start the containers first:

```bash
docker-compose up --build -d
docker-compose exec web node /app/scripts/verify.mjs
```
