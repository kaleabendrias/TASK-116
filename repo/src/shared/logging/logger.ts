/**
 * Structured operational logger.
 *
 * Records non-sensitive workflow events (auth denials, queue decisions,
 * grading transitions) so the system can be audited and debugged.
 *
 * Storage:
 *   - In-memory ring buffer (≤ MAX_ENTRIES) for fast synchronous reads.
 *   - IndexedDB `logs` object store, bounded to MAX_ENTRIES via background
 *     pruning, so audit data SURVIVES session restarts.
 *
 * Sensitive-field redaction (ALLOWLIST policy):
 *   - The logger forwards ONLY the keys that appear in `ALLOWED_LOG_KEYS`.
 *     Every other key in the supplied context is replaced with
 *     '[REDACTED]' before the entry is buffered or persisted. This is a
 *     "default-deny" policy: when a developer adds a new field to a log
 *     call, it is redacted automatically until the key is explicitly
 *     allowlisted, so a freshly-introduced sensitive key cannot leak
 *     into the persistence layer by accident.
 *   - Callers must continue to avoid passing secret material in the first
 *     place; redaction is a safety net, not a substitute.
 */

import { idbAll, idbPut, idbDelete } from '@persistence/indexedDb';
import { uid } from '@shared/utils/id';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  event: string;
  context: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
const PRUNE_INTERVAL = 50;

/**
 * ALLOWLIST of context keys that may be forwarded to the log buffer and the
 * persisted IDB store. This is the chokepoint enforced by `redact()`. Add a
 * new key here ONLY after confirming it never carries sensitive material —
 * any key not on this list is replaced with '[REDACTED]' before the entry
 * is buffered or persisted. Default-deny means a freshly-introduced field
 * is safe by default and cannot leak into the persistence layer until it
 * has been audited and explicitly enrolled.
 *
 * The list is intentionally curated to the structural identifiers and
 * decision metadata that the existing operational events emit. New events
 * MUST update the list or use one of the existing structural identifiers.
 */
export const ALLOWED_LOG_KEYS: ReadonlySet<string> = new Set<string>([
  // generic structural identifiers
  'reason', 'state', 'kind', 'phase', 'action',
  // identity & RBAC
  'userId', 'role', 'required', 'requestedRole', 'actor', 'target', 'owner', 'by',
  'department', 'applicableDepartments',
  // grading workflow
  'attemptId', 'grader', 'graderId', 'gradeId', 'existingGradeId', 'questionId',
  'questionType', 'firstScore', 'secondScore', 'finalScore', 'autoBaseline',
  'threshold', 'delta', 'deltaExceeded', 'secondGraderId',
  // messaging
  'sender', 'toUserId', 'messageId', 'attempts', 'nextAttemptAt', 'error',
  'startHour', 'endHour',
  // trips & seatmap
  'tripId', 'rows', 'cols', 'seatId',
  'seatsRemoved', 'holdsRemoved', 'bookingsRemoved'
]);

/**
 * Redact a log context using the default-deny allowlist policy. Keys that
 * are not enrolled in `ALLOWED_LOG_KEYS` are emitted as '[REDACTED]', so
 * sensitive material cannot reach the persistence layer even when a caller
 * forgets to scrub it at the call site.
 */
function redact(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (ALLOWED_LOG_KEYS.has(k)) {
      out[k] = v;
    } else {
      out[k] = '[REDACTED]';
    }
  }
  return out;
}

const buffer: LogEntry[] = [];
const subscribers = new Set<(entry: LogEntry) => void>();

let persistEnabled = true;
let writesSinceLastPrune = 0;
/** Single-writer chain so callers can `await flushLogs()` for determinism. */
let writeChain: Promise<void> = Promise.resolve();

async function pruneIfNeeded(): Promise<void> {
  if (++writesSinceLastPrune < PRUNE_INTERVAL) return;
  writesSinceLastPrune = 0;
  try {
    const all = await idbAll<LogEntry>('logs');
    if (all.length <= MAX_ENTRIES) return;
    all.sort((a, b) => a.ts - b.ts);
    const excess = all.slice(0, all.length - MAX_ENTRIES);
    for (const e of excess) await idbDelete('logs', e.id);
  } catch { /* swallow — pruning is best-effort */ }
}

async function persistEntry(entry: LogEntry): Promise<void> {
  if (!persistEnabled) return;
  try {
    await idbPut('logs', entry);
    await pruneIfNeeded();
  } catch { /* swallow — logger never throws */ }
}

function emit(level: LogLevel, event: string, context: Record<string, unknown> = {}): LogEntry {
  const safeContext = redact(context);
  const entry: LogEntry = {
    id: uid('log'),
    ts: Date.now(),
    level,
    event,
    context: safeContext
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  for (const fn of subscribers) {
    try { fn(entry); } catch { /* logger must never throw */ }
  }
  // Fire-and-forget IDB write; chain so flushLogs() can await all pending.
  writeChain = writeChain.then(() => persistEntry(entry)).catch(() => {});
  return entry;
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => emit('debug', event, context),
  info:  (event: string, context?: Record<string, unknown>) => emit('info',  event, context),
  warn:  (event: string, context?: Record<string, unknown>) => emit('warn',  event, context),
  error: (event: string, context?: Record<string, unknown>) => emit('error', event, context)
};

export function recentLogs(limit = 100): LogEntry[] {
  if (limit >= buffer.length) return [...buffer];
  return buffer.slice(-limit);
}

export function subscribeLog(fn: (entry: LogEntry) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/** Awaits all queued IDB writes. Tests can call this to deterministically observe persistence. */
export async function flushLogs(): Promise<void> {
  await writeChain;
}

/**
 * Repopulate the in-memory ring buffer from the persisted IDB store. This is
 * what makes audit data survive a session restart — call it on app startup
 * (or in a test that just opened a fresh DB connection) to bring the recent
 * history back into view.
 */
export async function loadPersistedLogs(): Promise<void> {
  try {
    const all = await idbAll<LogEntry>('logs');
    all.sort((a, b) => a.ts - b.ts);
    const recent = all.slice(-MAX_ENTRIES);
    buffer.length = 0;
    for (const e of recent) buffer.push(e);
  } catch { /* swallow */ }
}

/** Test-only: clear the in-memory buffer (does NOT touch IDB). */
export function _resetLogsForTesting(): void {
  buffer.length = 0;
  writeChain = Promise.resolve();
  writesSinceLastPrune = 0;
}

/** Test-only: disable IDB persistence (e.g. for unit tests with no IDB shim). */
export function _setLogPersistenceForTesting(enabled: boolean): void {
  persistEnabled = enabled;
}
