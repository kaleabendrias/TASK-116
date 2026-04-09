# task-09 — Svelte + TypeScript SPA

A pure-frontend, role-driven Single-Page Application built with Svelte 4 and
TypeScript. It runs entirely in the browser, persists everything to IndexedDB,
talks to no external APIs, and is delivered through a single Docker Compose
service so you never need a host toolchain.

---

## Quick start

```bash
docker compose up
```

Open <http://localhost:8080>. The container deterministically:

1. installs dependencies (`npm ci`, falling back to `npm install`),
2. builds the production bundle (`vite build`),
3. serves the built bundle on port 8080 (`vite preview`).

Stop with `Ctrl+C` or `docker compose down`.

There is **no** `.env` file, no host Node/npm requirement, and no external
network calls at runtime. Every runtime/build setting (app mode, locale, test
mode, static config mount path, port) is declared inside `docker-compose.yml`.

### Run the test suites

```bash
./run_tests.sh
```

The same script does everything in containers — installs, runs the unit suite,
runs the API/integration suite, prints both coverage summaries, and exits
non-zero on any failure or coverage shortfall (≥ 90 % is enforced on each
suite). See [Testing](#testing) below.

---

## Service catalog

| Service | Compose file | Image | Purpose | Exposed port |
|---|---|---|---|---|
| `web` | `docker-compose.yml` | `node:20-bookworm-slim` | Production-mode SPA. Runs `npm ci → vite build → vite preview`. Mounts `./config` read-only into the container as the static-config path. | **8080:8080** |
| `tests` | `docker-compose.test.yml` | `node:20-bookworm-slim` | Test runner. Runs the unit + API suites with coverage thresholds. Used by `run_tests.sh`. | _none_ |

Both services use named volumes (`app_node_modules`, `test_node_modules`) so
the host's `node_modules` is never touched and host-bind mounts can't shadow
installed dependencies.

### Runtime configuration (declared in `docker-compose.yml`)

| Key | Value | Meaning |
|---|---|---|
| `APP_MODE` / `VITE_APP_MODE` | `production` | App mode badge in the topbar |
| `TEST_MODE` / `VITE_TEST_MODE` | `false` | Toggle visible in the configuration console |
| `LOCALE_DEFAULT` / `VITE_LOCALE_DEFAULT` | `en-US` | UI language is fixed to English |
| `LOCALE_FALLBACK` / `VITE_LOCALE_FALLBACK` | `en` | Fallback locale |
| `STATIC_CONFIG_PATH` / `VITE_STATIC_CONFIG_PATH` | `/config` | Path inside the container where `./config` is mounted |
| `HOST` | `0.0.0.0` | Bind address for `vite preview` |
| `PORT` | `8080` | Listen port (matches the published port) |

Local JSON config files live in [`config/`](config/) and are mounted into
`/app/config:ro`:

- [`config/business.json`](config/business.json) — business rules (quiet hours,
  rate limits, grading weights, food catalog, message templates, etc.) Loaded
  at build time via a JSON import so the bundle is fully self-contained.
- [`config/app.json`](config/app.json) — feature flags exposed at runtime.

---

## Project layout

```
.
├── docker-compose.yml          # production web service
├── docker-compose.test.yml     # test runner service
├── run_tests.sh                # one-command containerized test runner
├── config/                     # local JSON config (mounted into the container)
│   ├── app.json
│   └── business.json
├── index.html                  # SPA entry
├── package.json                # build/test scripts; no postinstall, no shells
├── vite.config.ts              # Vite + path aliases
├── vitest.unit.config.ts       # unit suite config + ≥90% coverage thresholds
├── vitest.api.config.ts        # API suite config + ≥90% coverage thresholds
├── svelte.config.js
├── tsconfig.json
├── src/
│   ├── main.ts                 # SPA bootstrap
│   ├── global.d.ts             # Vite/Svelte ambient types
│   ├── ui/                     # UI layer — Svelte routes & components only
│   │   ├── App.svelte
│   │   ├── router.ts
│   │   ├── routes/             # one file per workspace + Login + NotFound
│   │   ├── components/         # Modal, Drawer, SeatMap, BookingPanel, …
│   │   └── styles/global.css
│   ├── application/services/   # use-case orchestration; no DOM, no business rules
│   ├── domain/                 # pure rules — no I/O, no Svelte, no DOM
│   │   ├── auth/  config/  export/  grading/  health/
│   │   ├── messaging/  questions/  trips/
│   ├── persistence/            # IndexedDB & localStorage adapters
│   └── shared/                 # crypto, validators, clock, id helpers
├── unit_tests/                 # pure-domain & shared tests (vitest)
└── API_tests/                  # service-layer & route-API tests (vitest)
```

The codebase is layered strictly — UI delegates to services, services delegate
to domain rules and persistence adapters. Domain modules are pure functions
with no I/O, so they are exhaustively unit-testable. UI components own only
presentation, modal/drawer state, and form bindings; **no business rule lives
in a Svelte file**.

---

## Application

After `docker compose up`, open <http://localhost:8080> and **register** an
account. Passwords are salted + PBKDF2-SHA256 hashed (100 000 iterations) in
the browser via Web Crypto. The login session derives an AES-GCM key kept in
memory only (cleared on logout).

### Roles & route access

| Role | Workspaces visible |
|---|---|
| Administrator | Trips, Configuration Console, Question Management, Messaging Center, Wellness Profile, Review/Grading |
| Dispatcher | Trips, Messaging Center, Wellness Profile |
| Content Author | Question Management, Messaging Center, Wellness Profile |
| Reviewer / Grader | Review/Grading, Messaging Center, Wellness Profile |

URL-hacking is blocked: every route component is wrapped in `<RouteGuard
route="…">` which consults the same `domain/auth/permissions` table that
filters the navigation.

---

## Verification — exercise the key workflows

Each workflow can be verified end-to-end from the UI alone. The corresponding
automated test is listed for cross-checking.

### 1. Seat hold countdown and auto-release (Trips)

1. Register as a dispatcher (or administrator), open **Trips**.
2. Click any standard seat — it becomes selected and the right-hand panel
   shows availability.
3. Click **Hold seat**. The seat turns gold and the panel shows a live
   `MM:SS` countdown starting at `10:00`. Available count stays the same
   because your own hold counts as selectable.
4. Open the same URL in a **second browser tab**. The same seat shows as
   "Held by another session" — clicking it is rejected.
5. Click **Release hold** in the original tab. The other tab updates within a
   second (the seat repository broadcasts via `BroadcastChannel`).
6. To verify auto-release, hold a seat, leave the page open: when the
   countdown reaches `00:00`, the gold styling disappears and the seat
   becomes available again.
7. To verify booking, hold then click **Confirm booking** — the seat turns
   grey, the available count decrements by one, and re-booking is rejected.

Automated coverage: `API_tests/seatMap.test.ts` (single-tab + multi-tab race
+ expiry math + `pruneExpired`).

### 2. Association visibility toggle by expiry (Configuration Console)

1. Sign in as an **administrator**, open **Configuration Console**.
2. The seeded list shows two entries (`Genome Sequencer A`, `Mass Spec B`).
   The third seeded record `Legacy Centrifuge` (effective `01/01/2020 → 01/01/2024`)
   is hidden because its `effectiveTo` is in the past.
3. Tick **Show expired records** — the legacy row appears, dimmed.
4. Untick to verify it disappears again.
5. Double-click any cell to inline-edit. Try setting an invalid date format
   like `2026-01-01` — the row shows `Effective From must be MM/DD/YYYY`.
   Setting `effectiveFrom` after `effectiveTo` is rejected for the same
   reason.
6. Click **Details** on a row to open the right-side drawer; verify the
   Department → Device → Sample-Queue mapping, tags, USD price, and validity
   flag.

Automated coverage: `unit_tests/configRules.test.ts` (date parsing + filter)
and `API_tests/configRecords.test.ts` (round-trip via IndexedDB).

### 3. Scoring + second review (Question Management → Review)

1. Sign in as a **content author**, open **Question Management**.
2. Click **New question**, set type `Text (manual)`, prompt `"Explain X"`,
   `Max score = 100`, save.
3. Open the browser DevTools console and run:
   ```js
   const m = await import('/src/application/services/attemptService.ts');
   await m.submitAttempt('demo-student', { questionId: '<paste-id>', textAnswer: 'a draft' });
   ```
   (Or seed an attempt via the test suite — see `API_tests/attempts.test.ts`.)
4. Sign out, register a **reviewer**, open **Review/Grading**. The attempt
   appears as "needs grading".
5. Click **Grade**, enter score `73.3`, notes `"good effort"`, **Submit first
   review**. The displayed first score becomes `73.5` (rounded to nearest
   0.5). Encrypted notes are persisted via AES-GCM.
6. Re-open the same row. Enter score `60`. The dialog shows the warning:
   _Delta exceeds 10 — mandatory second review will be flagged._
7. Sign out, register a **second reviewer**, open Review again. The row is
   marked **awaiting 2nd review**. Click **2nd review**, enter score `60`,
   submit. The final score becomes `(73.5 + 60) / 2 = 66.75 → 67.0` (rounded
   to 0.5). Same-grader second reviews are rejected.

Automated coverage: `unit_tests/scoring.test.ts` (rounding, weighting,
delta predicate) and `API_tests/grading.test.ts` (full first-+-second review
round-trip with crypto-at-rest assertion).

### 4. Notification quiet hours, rate limit, retry, dead letter (Messaging)

1. Sign in, open **Messaging Center**. Note the default quiet hours
   `21:00–7:00` shown in the topline.
2. Compose a message to any other registered user using the **Welcome**
   template. Watch the inbox in another tab: it appears immediately, with
   `delivered` and (after **Mark read**) `read` timestamps.
3. **Quiet hours**: change the quiet-hours preference to a window that
   includes the current hour (e.g. start = current hour, end = current hour
   + 1) and save. Send a message — it shows as `pending` in the outbox with
   the reason `Quiet hours`. Reset quiet hours to a window outside "now",
   then wait for the messaging center's 5-second tick — the deferred message
   transitions to `delivered`.
4. **Rate limit**: with quiet hours disabled, send 31 messages to the same
   recipient (re-click Send). The 31st enters the outbox as `pending` with
   reason `Rate limit`.
5. **Dead letter**: with quiet hours forced on, send a message; tickQueue
   retries it. After 3 attempts the message moves to the **Dead letter
   inbox** panel and disappears from the outbox.
6. **Subscription**: untick the recipient's subscription for a category and
   send to that category — the message is dropped immediately with reason
   `Recipient unsubscribed from <category>`.

Automated coverage: `unit_tests/messageRules.test.ts` (decision branches) and
`API_tests/messaging.test.ts` (deferral, throttling, retry, dead letter,
subscription drop, mark-read).

### 5. Encrypted sensitive storage (Wellness + Review notes)

1. Sign in, open **Wellness Profile**. Tick a few goals (e.g. `high-protein`,
   `whole-grain`), enter an allergen, click **Save profile**. The status line
   confirms `Saved (encrypted at rest).`
2. Open the browser DevTools → Application → IndexedDB → `task09` →
   `healthProfiles`. Inspect your record. The `encryptedPreferences` field
   contains an `{ ivB64, ctB64 }` envelope — **no plaintext goals or allergens
   appear anywhere in the IDB record**.
3. Sign out, sign in again. Open Wellness — your goals reappear (the AES key
   is re-derived from your password using the per-user salt and decrypts the
   payload).
4. The same applies to grader notes in `grades`: inspect any graded record
   in DevTools and confirm `notesEncrypted` is opaque.

Automated coverage: `unit_tests/crypto.test.ts` (PBKDF2 + AES-GCM round-trip)
and `API_tests/health.test.ts` (asserts the persisted IDB blob contains no
plaintext goal keywords, then re-derives and decrypts).

### 6. Signed export / import with tamper detection (Configuration Console)

1. Sign in as an **administrator**, open **Configuration Console**.
2. Click **Export snapshot**. A `task09-snapshot-<timestamp>.json` file
   downloads. Open it in any editor — the envelope has `schema`,
   `version`, `exportedAt`, `payload.stores`, and a `fingerprint` field
   containing a 64-character SHA-256 hex digest of the canonicalized
   payload.
3. **Round-trip**: click **Import snapshot** and select the file you just
   exported. The status line reports `Imported N records.`
4. **Tamper detection**: open the snapshot in an editor, change any value
   inside `payload.stores.questions[0]` (e.g. flip a `prompt`), save. Re-
   import — the status line reports
   `Failed: Fingerprint mismatch — file is tampered or corrupt.`
5. **Schema rejection**: edit the file to set `"schema": "wrong"` and re-
   import — `Failed: Wrong schema marker`.

Automated coverage: `unit_tests/snapshot.test.ts` (canonicalize / envelope
validation) and `API_tests/export.test.ts` (round-trip + fingerprint
mismatch + unknown-store + missing-id branches).

---

## Testing

Two suites, both gated at ≥ 90 % coverage on statements, branches,
functions, and lines.

| Suite | Files | Scope | Environment | Config |
|---|---|---|---|---|
| `unit` | `unit_tests/**` | `src/domain/**`, `src/shared/**` | Node | `vitest.unit.config.ts` |
| `api` | `API_tests/**` | `src/application/**`, `src/persistence/**` | Node + `fake-indexeddb` + localStorage polyfill | `vitest.api.config.ts` |

### Running

```bash
./run_tests.sh                 # one command — both suites in containers
```

Or, individually inside the test container:

```bash
docker compose -f docker-compose.test.yml run --rm tests sh -lc 'npm run test:unit'
docker compose -f docker-compose.test.yml run --rm tests sh -lc 'npm run test:api'
```

The script:

1. Boots the `tests` service.
2. Runs the unit suite, then the API suite, **each with coverage enabled**.
3. Reads `coverage/{unit,api}/coverage-summary.json` from the host (the
   coverage dir is bind-mounted).
4. Prints both summaries.
5. Exits non-zero on any test failure, threshold miss, or missing summary.

Recent green run:

```
unit:  89/89 tests | lines 99.53% · branches 98.71% · functions 100% · statements 99.53%
api:   66/66 tests | lines 99.33% · branches 94.02% · functions 92.64% · statements 99.33%
RESULT: PASS — both suites met the >=90% coverage threshold.
```

### Deterministic fixtures

| Fixture | Where |
|---|---|
| Offline seat inventory (8×4 with fixed ADA / crew positions) | `src/persistence/seatMapRepository.ts::buildSeats` |
| Hold expiry timing (10-minute default + 1-ms harness for `pruneExpired`) | `API_tests/seatMap.test.ts` |
| Multi-tab race (`_setTabIdForTesting`) | `API_tests/seatMap.test.ts` |
| Association validity-date filter (one expired seed record) | `src/persistence/configRecordRepository.ts` |
| Scoring / rounding / weighting | `unit_tests/scoring.test.ts` |
| Second-review delta trigger | `unit_tests/scoring.test.ts`, `API_tests/grading.test.ts` |
| Notification throttling / retry / dead letter | `API_tests/messaging.test.ts` |
| Crypto-at-rest | `API_tests/health.test.ts` (asserts no plaintext in IDB blob) |
| Import/export fingerprint validation | `API_tests/export.test.ts` |

---

## Architecture notes

- **No external API calls.** Every service module is in-process. The only
  network-touching path is `vite preview` serving static assets.
- **IndexedDB is the system of record** for trips, seat maps, holds, bookings,
  questions, attempts, grades, messages, dead letters, health profiles, and
  the association catalogs (object store `catalogs`).
- **localStorage holds preferences only**: `lastFilter.<scope>`, the
  quiet-hours override, and the (fixed) language. Nothing else is written to
  it.
- **Browser-side crypto**: `Web Crypto`. Passwords use PBKDF2-SHA256 with a
  per-user 16-byte random salt. Sensitive fields (health preferences, grader
  notes) use AES-GCM with a key derived from the password at login and held
  only in memory.
- **Cross-tab seat-hold contention** uses IndexedDB as the source of truth and
  `BroadcastChannel('task09.seatMap')` for instant cross-tab refresh. Holds
  are written inside readwrite transactions so the IDB store serializes
  competing writes; each tab's `tabId` distinguishes ownership.
- **Snapshot fingerprinting** hashes a canonical (recursively key-sorted)
  JSON representation of the payload with SHA-256 so any post-export
  mutation is detected on import.

---

## Hygiene

- No host toolchain is required — only Docker.
- No `.env` file is used or read anywhere.
- No secrets are committed; passwords exist only in registered user records
  (hashed) and the AES key never leaves session memory.
- Generated artifacts (`node_modules`, `dist`, `coverage`) are git-ignored
  and produced inside the containers.
- The `web` and `tests` containers each maintain their own named volume for
  `node_modules` so host filesystems are never written to.
