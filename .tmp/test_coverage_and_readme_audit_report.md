# Test Coverage Audit

## Scope and Method
- Audit mode: static inspection only (no execution).
- Endpoint source of truth: `server/app.ts` dispatch conditions.
- Test evidence sources: `http_tests/**`, `API_tests/**`, `unit_tests/**`, `frontend_tests/**`, `playwright_tests/happy-path.spec.ts`.

## Project Type Detection
- README declaration: **fullstack** (`repo/README.md:3`).
- Inference result: fullstack confirmed.

## Backend Endpoint Inventory
Derived from `repo/server/app.ts:99`, `repo/server/app.ts:113`, `repo/server/app.ts:128`, `repo/server/app.ts:145`, `repo/server/app.ts:153`, `repo/server/app.ts:162`, `repo/server/app.ts:173`, `repo/server/app.ts:182`, `repo/server/app.ts:193`.

1. `POST /api/auth/bootstrap`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `POST /api/auth/logout`
5. `GET /api/trips`
6. `POST /api/trips`
7. `GET /api/questions`
8. `POST /api/questions`
9. `GET /api/health`

## API Test Mapping Table
| Endpoint | Covered | Test Type | Test Files | Evidence |
|---|---|---|---|---|
| `POST /api/auth/bootstrap` | yes | true no-mock HTTP | `repo/http_tests/auth.test.ts`, `repo/http_tests/errors.test.ts`, `repo/http_tests/e2e.test.ts`, `repo/playwright_tests/happy-path.spec.ts` | `describe('POST /api/auth/bootstrap'...)` in `repo/http_tests/auth.test.ts:9`; malformed JSON branch in `repo/http_tests/errors.test.ts:76`; Playwright contract in `repo/playwright_tests/happy-path.spec.ts:381` |
| `POST /api/auth/register` | yes | true no-mock HTTP | `repo/http_tests/auth.test.ts`, `repo/http_tests/errors.test.ts`, `repo/http_tests/e2e.test.ts`, `repo/playwright_tests/happy-path.spec.ts` | `describe('POST /api/auth/register'...)` in `repo/http_tests/auth.test.ts:29`; empty-body handling in `repo/http_tests/errors.test.ts:88`; Playwright contract in `repo/playwright_tests/happy-path.spec.ts:404` |
| `POST /api/auth/login` | yes | true no-mock HTTP | `repo/http_tests/auth.test.ts`, `repo/http_tests/errors.test.ts`, `repo/http_tests/e2e.test.ts`, `repo/playwright_tests/happy-path.spec.ts` | `describe('POST /api/auth/login'...)` in `repo/http_tests/auth.test.ts:61`; non-JSON handling in `repo/http_tests/errors.test.ts:100`; Playwright contract in `repo/playwright_tests/happy-path.spec.ts:423` |
| `POST /api/auth/logout` | yes | true no-mock HTTP | `repo/http_tests/auth.test.ts`, `repo/playwright_tests/happy-path.spec.ts` | `describe('POST /api/auth/logout'...)` in `repo/http_tests/auth.test.ts:79`; token invalidation in `repo/playwright_tests/happy-path.spec.ts:440` |
| `GET /api/trips` | yes | true no-mock HTTP | `repo/http_tests/trips.test.ts`, `repo/http_tests/auth.test.ts`, `repo/http_tests/errors.test.ts`, `repo/http_tests/e2e.test.ts`, `repo/http_tests/start.test.ts`, `repo/playwright_tests/happy-path.spec.ts` | `describe('GET /api/trips'...)` in `repo/http_tests/trips.test.ts:25`; guard checks in `repo/http_tests/auth.test.ts:101`; Playwright schema contract in `repo/playwright_tests/happy-path.spec.ts:459` |
| `POST /api/trips` | yes | true no-mock HTTP | `repo/http_tests/trips.test.ts`, `repo/http_tests/errors.test.ts`, `repo/http_tests/e2e.test.ts`, `repo/playwright_tests/happy-path.spec.ts` | `describe('POST /api/trips'...)` in `repo/http_tests/trips.test.ts:35`; malformed-body validation in `repo/http_tests/errors.test.ts:113`; Playwright contract in `repo/playwright_tests/happy-path.spec.ts:500` |
| `GET /api/questions` | yes | true no-mock HTTP | `repo/http_tests/questions.test.ts`, `repo/playwright_tests/happy-path.spec.ts` | `describe('GET /api/questions'...)` in `repo/http_tests/questions.test.ts:44`; Playwright role-deny check in `repo/playwright_tests/happy-path.spec.ts:528` |
| `POST /api/questions` | yes | true no-mock HTTP | `repo/http_tests/questions.test.ts`, `repo/http_tests/e2e.test.ts` | `describe('POST /api/questions'...)` in `repo/http_tests/questions.test.ts:61`; cross-layer schema e2e in `repo/http_tests/e2e.test.ts:209` |
| `GET /api/health` | yes | true no-mock HTTP | `repo/http_tests/start.test.ts` | `it('GET /api/health returns 200 { ok: true } ...')` in `repo/http_tests/start.test.ts:48` |

## API Test Classification
### 1) True No-Mock HTTP
- `repo/http_tests/auth.test.ts`
- `repo/http_tests/trips.test.ts`
- `repo/http_tests/questions.test.ts`
- `repo/http_tests/errors.test.ts`
- `repo/http_tests/e2e.test.ts`
- `repo/http_tests/start.test.ts`
- `repo/playwright_tests/happy-path.spec.ts` (contains direct endpoint calls via `page.request` at `repo/playwright_tests/happy-path.spec.ts:378`)

Why this classification is valid:
- Real server bootstrap path used: `startTestServer()` calls `createApiServer()` and binds an actual TCP listener (`repo/http_tests/serverHelper.ts:8`).
- Requests sent through HTTP (`fetch` in helper and tests, e.g., `repo/http_tests/serverHelper.ts:23`).
- No `vi.mock`/`jest.mock`/`sinon.stub` found under `repo/http_tests/**`.

### 2) HTTP with Mocking
- **None found** for backend endpoint tests.

### 3) Non-HTTP (unit/integration without HTTP)
- Entire `repo/API_tests/**` suite (direct service/repository calls; no route dispatch).
- Entire `repo/unit_tests/**` suite (domain/shared pure logic).
- `repo/http_tests/server-helpers.test.ts` (direct unit tests of `readBody`, `send`, `serviceCall`, `withAuth` from `repo/server/app.ts`).

## Mock Detection Findings
### Detected mocks/stubs
- Frontend suite has extensive service-level mocks (expected for UI isolation):
  - `vi.mock('@application/services/seatMapService'...)` in `repo/frontend_tests/SeatMap.test.ts:6`, `repo/frontend_tests/components.test.ts:9`, `repo/frontend_tests/Trips.test.ts:30`, `repo/frontend_tests/routes-extra.test.ts:17`.
  - `vi.mock('@application/services/messagingService'...)` in `repo/frontend_tests/routes-extra.test.ts:60`.
  - `vi.mock('@application/services/gradingService'...)` in `repo/frontend_tests/routes-extra.test.ts:84`.
  - Router/config mocks in `repo/frontend_tests/main.test.ts:8`, `repo/frontend_tests/main.test.ts:19`, `repo/frontend_tests/main.test.ts:30`.
- Spy-based behavior override:
  - `vi.spyOn(authModule, 'login')...` in `repo/frontend_tests/routes.test.ts:457`, `repo/frontend_tests/routes.test.ts:480`.

### Bypass of HTTP layer (non-HTTP category)
- Direct helper invocation from server module in `repo/http_tests/server-helpers.test.ts` (`readBody`, `serviceCall`, `withAuth`), beginning at `repo/http_tests/server-helpers.test.ts:62`.
- Direct service calls across `repo/API_tests/**` (e.g., `tripsService` describe in `repo/API_tests/trips.test.ts:19`).

## Coverage Summary
- Total endpoints: **9**
- Endpoints with HTTP tests: **9**
- Endpoints with true no-mock HTTP tests: **9**
- HTTP coverage %: **100%** ($9/9 \times 100$)
- True API coverage %: **100%** ($9/9 \times 100$)

## Unit Test Analysis
### Backend Unit Tests
Backend-oriented test files include:
- `repo/unit_tests/*.test.ts` (15 files)
- `repo/API_tests/*.test.ts` (19 files)
- `repo/http_tests/server-helpers.test.ts`

Modules covered (evidence):
- Services:
  - `authService` in `repo/API_tests/auth.test.ts:8`
  - `tripsService` in `repo/API_tests/trips.test.ts:19`
  - `questionService` in `repo/API_tests/questions.test.ts:28`
  - `attemptService` in `repo/API_tests/attempts.test.ts:27`
  - `healthService` in `repo/API_tests/health.test.ts:11`
  - `messagingService` in `repo/API_tests/messaging.test.ts`
  - `gradingService` in `repo/API_tests/grading.test.ts`
  - `configService` / `businessConfig` in `repo/API_tests/configService.test.ts:4`, `repo/API_tests/config.test.ts:5`
  - `exportService` in `repo/API_tests/export.test.ts`
  - `seatMapService` coverage via `repo/API_tests/seatMap.test.ts`
- Repositories:
  - `tripsRepository`, `questionsRepository` in `repo/API_tests/repositories.test.ts:56`
  - users/messages/grades/health/config/prefs repositories referenced across API tests (imports in `repo/API_tests/**`).
- Auth/guards/middleware style logic:
  - `authorization` rules in `repo/API_tests/authorization.test.ts:36`
  - route permission logic in `repo/API_tests/routeGuard.test.ts`
  - HTTP auth helper branch logic in `repo/http_tests/server-helpers.test.ts:192`
- Controllers:
  - No explicit controller layer exists in codebase; route dispatch is in `repo/server/app.ts`.

Important backend modules not tested:
- No critical backend service/repository appears completely untested.
- Residual low-depth/branch risk areas (tested but weaker branch depth):
  - `src/domain/config/configRules.ts` (71.42% lines in unit coverage summary)
  - `src/shared/logging/logger.ts` (76% lines in unit coverage summary)
  - `src/application/services/gradingService.ts` branch depth lower in API coverage summary

### Frontend Unit Tests (STRICT REQUIREMENT)
Frontend unit test detection result (all required conditions met):
- Frontend test files exist: `repo/frontend_tests/*.test.ts`.
- Tests target frontend components/routes: e.g., `repo/frontend_tests/App.test.ts`, `repo/frontend_tests/routes.test.ts`, `repo/frontend_tests/routes-extra.test.ts`, `repo/frontend_tests/components.test.ts`.
- Framework/tooling evident: Vitest imports (`describe/it/expect/vi`) and Svelte component mounting (`new Component({ target })`).
- Tests import/render real frontend modules/components:
  - `import App from '../src/ui/App.svelte'` (`repo/frontend_tests/App.test.ts`)
  - `import Trips from '../src/ui/routes/Trips.svelte'` (`repo/frontend_tests/Trips.test.ts`)
  - `import RouteGuard from '../src/ui/components/RouteGuard.svelte'` (`repo/frontend_tests/RouteGuard.test.ts`)
  - `import SeatMap from '../src/ui/components/SeatMap.svelte'` (`repo/frontend_tests/SeatMap.test.ts`)

Frontend test files:
- `repo/frontend_tests/App.test.ts`
- `repo/frontend_tests/Trips.test.ts`
- `repo/frontend_tests/components.test.ts`
- `repo/frontend_tests/RouteGuard.test.ts`
- `repo/frontend_tests/SeatMap.test.ts`
- `repo/frontend_tests/routes.test.ts`
- `repo/frontend_tests/routes-extra.test.ts`
- `repo/frontend_tests/main.test.ts`

Frameworks/tools detected:
- Vitest
- Svelte runtime component mounting in test environment
- happy-dom (declared test suite scope in README)

Components/modules covered:
- App shell, router, login/home/notfound routes
- Protected route components: Trips, Questions, Messaging, Review, Wellness, Configuration
- Shared components: Modal, Drawer, PageHeader, HoldCountdown, BookingPanel, RouteGuard, SeatMap, ConfigTable

Important frontend components/modules not tested:
- No core route/component appears completely untested in `src/ui/routes` and `src/ui/components`.
- Residual gap: no meaningful assertion coverage for styling assets (`src/ui/styles/*`), and many route tests are service-mocked (behavioral realism reduced).

**Frontend unit tests: PRESENT**

Strict failure rule outcome for fullstack/web frontend unit tests:
- Not triggered (frontend unit tests are present).

### Cross-Layer Observation
- Backend and frontend are both heavily tested.
- Additional cross-layer coverage exists via:
  - HTTP↔service synchronization tests in `repo/http_tests/e2e.test.ts`
  - Browser-level fullstack tests in `repo/playwright_tests/happy-path.spec.ts`
- Balance verdict: **balanced**, not backend-only.

## API Observability Check
Observability quality: **mostly strong**.
- Endpoint + method explicit in many test names (`describe('POST /api/trips'...)`, etc.).
- Request payloads are explicit in test calls (`post(..., body, token)` and Playwright `page.request` data blocks).
- Response shape assertions are detailed (status + body schema checks).

Weaknesses:
- Some helper-based tests abstract raw request construction (`repo/http_tests/serverHelper.ts`), which reduces per-test request verbosity.
- `/api/health` observability depth is minimal (status/body only, no negative-path coverage).

## Test Quality & Sufficiency
Strengths:
- Success paths + permission failures + validation failures covered across auth/trips/questions.
- Error-contract coverage for 401/403/404/500 in `repo/http_tests/errors.test.ts`.
- Strong schema assertions in HTTP and Playwright contracts.
- Cross-layer consistency checks beyond simple endpoint smoke.

Gaps:
- `/api/health` has narrow assertions only.
- Many frontend tests rely on mocked service dependencies; good for UI state checks, weaker for true FE↔BE realism.

`run_tests.sh` compliance:
- Docker-based and containerized (`docker compose -f docker-compose.test.yml ...`) in `repo/run_tests.sh`.
- No local dependency install requirement in script path.

## End-to-End Expectations (Fullstack)
- Expectation: real FE↔BE tests should exist.
- Evidence found:
  - Browser E2E in `repo/playwright_tests/happy-path.spec.ts`.
  - Direct HTTP contract checks inside Playwright (`repo/playwright_tests/happy-path.spec.ts:378`).
- Verdict: expectation met.

## Tests Check
- Endpoint inventory complete and mapped.
- Mocking separation complete (HTTP vs non-HTTP vs frontend mocked UI).
- Frontend unit test presence explicitly verified and satisfied.
- Static-only constraint respected.

## Test Coverage Score (0-100)
- **93/100**

## Score Rationale
- + Full endpoint HTTP coverage with true no-mock route execution.
- + Rich negative-path and schema assertions.
- + Fullstack E2E presence (UI and API contract checks).
- - Some modules show weaker branch/line depth despite broad suite count.
- - `/api/health` endpoint testing depth is minimal.
- - Frontend unit tests are partially service-mocked, reducing integration realism.

## Key Gaps
1. Limited depth for `GET /api/health` (single happy-path assertion).
2. Non-trivial branch-risk residuals in selected domain/shared modules (`configRules`, `logger`).
3. Frontend tests prioritize component isolation over real service integration for several routes.

## Confidence & Assumptions
- Confidence: **high** for endpoint inventory and HTTP mapping; **medium-high** for module-level sufficiency judgment.
- Assumptions:
  - `server/app.ts` is the complete API surface for this repository.
  - No hidden/generated routes outside inspected files.

---

# README Audit

## Target File Check
- Required README exists at `repo/README.md`.

## Hard Gate Evaluation
### Formatting
- PASS: markdown structure is clear and readable (headings, tables, code blocks).

### Startup Instructions (fullstack)
- PASS: contains required docker startup command pattern (`docker-compose up --build -d`) at `repo/README.md:65` and `repo/README.md:210`.

### Access Method
- PASS: explicit URLs and ports provided:
  - SPA `http://localhost:8080`
  - API `http://localhost:3001`
  (see `repo/README.md:68-69` region)

### Verification Method
- PASS:
  - UI verification flow documented (`repo/README.md` Verification section).
  - API verification via curl examples and expected responses (`repo/README.md:124` onward).
  - Docker-contained verification alternative provided (`docker-compose exec web node /app/scripts/verify.mjs` at `repo/README.md:203`).

### Environment Rules (strict)
- PASS with note:
  - No runtime install instructions found.
  - README explicitly states no runtime `npm install` (`repo/README.md:58`).
  - Optional host tools (`curl`, `jq`) are documented as optional; docker-contained verification is also provided.

### Demo Credentials (auth present)
- PASS:
  - Auth exists and README provides credentials including multiple roles (`repo/README.md:157` onward).
  - Roles documented: Administrator, Dispatcher, Content Author, Reviewer.

## Engineering Quality Review
### Tech stack clarity
- Strong, explicit FE/BE/DB/crypto/container stack section.

### Architecture explanation
- Strong; describes shared service layer and persistence model.

### Testing instructions
- Strong; includes suite matrix and standardized script usage.

### Security/roles
- Strong; role matrix and error contract are present.

### Workflows
- Good; startup, stop, test, verification, and API mapping documented.

### Presentation quality
- High; consistent structure and practical examples.

## High Priority Issues
- None.

## Medium Priority Issues
1. Host-side optional verification tools (`curl`, `jq`) may be interpreted as non-container dependency under very strict graders, despite container-native alternative being present.

## Low Priority Issues
1. README is long and somewhat redundant in verification sections (manual curl and container script both repeated).

## Hard Gate Failures
- **None detected**.

## README Verdict
- **PASS**

## Final Combined Verdicts
- Test Coverage Audit Verdict: **PASS (strong, with targeted depth gaps)**
- README Audit Verdict: **PASS**

