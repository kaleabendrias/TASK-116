/** Per-store record schema validators used during snapshot import. */

type Validator = (item: unknown) => string | null;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function requireString(o: Record<string, unknown>, key: string): string | null {
  return typeof o[key] === 'string' && (o[key] as string).length > 0 ? null : `${key} must be a non-empty string`;
}

function requireNumber(o: Record<string, unknown>, key: string): string | null {
  return typeof o[key] === 'number' && Number.isFinite(o[key] as number) ? null : `${key} must be a finite number`;
}

function requireBoolean(o: Record<string, unknown>, key: string): string | null {
  return typeof o[key] === 'boolean' ? null : `${key} must be a boolean`;
}

function requireArray(o: Record<string, unknown>, key: string): string | null {
  return Array.isArray(o[key]) ? null : `${key} must be an array`;
}

function checkAll(...errors: (string | null)[]): string | null {
  for (const e of errors) if (e) return e;
  return null;
}

/**
 * Strict allowlist of canonical question types accepted at the snapshot
 * import boundary. The legacy generic 'text' kind has been replaced by the
 * explicit 'short_answer' taxonomy — only the explicit form is allowed
 * through so that imported records carry traceable metadata.
 */
const ALLOWED_QUESTION_TYPES = new Set(['single_choice','multi_choice','numeric','short_answer','true_false','fill_in_blank']);
const ALLOWED_QUESTION_STATUS = new Set(['active','inactive','deleted']);

const questionValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  const e = checkAll(
    requireString(item, 'id'),
    requireString(item, 'prompt'),
    requireNumber(item, 'difficulty'),
    requireNumber(item, 'maxScore'),
    requireArray(item, 'choices'),
    requireArray(item, 'correctChoiceIds'),
    requireArray(item, 'tags'),
    requireArray(item, 'knowledgePoints'),
    requireArray(item, 'applicableDepartments')
  );
  if (e) return e;
  if (typeof item.type !== 'string' || !ALLOWED_QUESTION_TYPES.has(item.type)) return 'Invalid question type';
  if (typeof item.status !== 'string' || !ALLOWED_QUESTION_STATUS.has(item.status)) return 'Invalid status';
  return null;
};

const attemptValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  return checkAll(
    requireString(item, 'id'),
    requireString(item, 'userId'),
    requireString(item, 'questionId'),
    requireBoolean(item, 'needsManualGrading'),
    requireNumber(item, 'submittedAt')
  );
};

const gradeValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  const e = checkAll(
    requireString(item, 'id'),
    requireString(item, 'attemptId'),
    requireString(item, 'questionId'),
    requireString(item, 'graderId'),
    requireNumber(item, 'firstScore'),
    requireBoolean(item, 'awaitingSecondReview'),
    requireNumber(item, 'createdAt'),
    requireNumber(item, 'updatedAt')
  );
  if (e) return e;
  if (item.finalScore !== null && typeof item.finalScore !== 'number') return 'finalScore must be number or null';
  return null;
};

const messageValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  const e = checkAll(
    requireString(item, 'id'),
    requireString(item, 'fromUserId'),
    requireString(item, 'toUserId'),
    requireString(item, 'category'),
    requireNumber(item, 'attempts'),
    requireString(item, 'status'),
    requireNumber(item, 'createdAt')
  );
  return e;
};

const healthProfileValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  return checkAll(
    requireString(item, 'id'),
    requireString(item, 'userId'),
    requireNumber(item, 'updatedAt')
  );
};

const ALLOWED_SAMPLE_TYPES_SET = new Set(['blood','tissue','serum','saliva','plasma','urine']);

const catalogValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  if (typeof item.id !== 'string' || item.id.length === 0) return 'id must be non-empty string';
  // Catalog envelopes can be config records (id starts with cfgrec:), seed flags, or
  // subscription envelopes. Only validate config records strictly.
  if (item.id.startsWith('cfgrec:')) {
    if (!isObject(item.record)) return 'record missing';
    const r = item.record as Record<string, unknown>;
    const e = checkAll(
      requireString(r, 'id'),
      requireString(r, 'name'),
      requireString(r, 'device'),
      requireString(r, 'department'),
      requireString(r, 'project'),
      requireString(r, 'sampleQueue'),
      requireString(r, 'sampleType'),
      requireString(r, 'effectiveFrom'),
      requireString(r, 'effectiveTo'),
      requireNumber(r, 'priceUsd'),
      requireBoolean(r, 'valid'),
      requireArray(r, 'tags')
    );
    if (e) return `record.${e}`;
    if (!ALLOWED_SAMPLE_TYPES_SET.has(r.sampleType as string)) return `record.sampleType invalid`;
  }
  return null;
};

const tripValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  return checkAll(
    requireString(item, 'id'),
    requireString(item, 'name'),
    requireString(item, 'origin'),
    requireString(item, 'destination'),
    requireNumber(item, 'departureAt'),
    requireNumber(item, 'rows'),
    requireNumber(item, 'cols'),
    requireString(item, 'createdBy'),
    requireNumber(item, 'createdAt')
  );
};

const ALLOWED_SEAT_KIND = new Set(['standard', 'ada', 'crew']);

const seatValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  const e = checkAll(
    requireString(item, 'id'),
    requireString(item, 'tripId'),
    requireString(item, 'seatId'),
    requireString(item, 'label'),
    requireNumber(item, 'row'),
    requireNumber(item, 'column')
  );
  if (e) return e;
  if (typeof item.kind !== 'string' || !ALLOWED_SEAT_KIND.has(item.kind)) return 'kind must be standard|ada|crew';
  return null;
};

const holdValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  return checkAll(
    requireString(item, 'id'),
    requireString(item, 'tripId'),
    requireString(item, 'seatId'),
    requireString(item, 'ownerTabId'),
    requireNumber(item, 'expiresAt')
  );
};

const bookingValidator: Validator = (item) => {
  if (!isObject(item)) return 'Not an object';
  return checkAll(
    requireString(item, 'id'),
    requireString(item, 'tripId'),
    requireString(item, 'seatId'),
    requireNumber(item, 'bookedAt')
  );
};

const deadLetterValidator: Validator = messageValidator;

export const STORE_VALIDATORS: Record<string, Validator> = {
  questions: questionValidator,
  attempts: attemptValidator,
  grades: gradeValidator,
  messages: messageValidator,
  deadLetters: deadLetterValidator,
  healthProfiles: healthProfileValidator,
  catalogs: catalogValidator,
  trips: tripValidator,
  seats: seatValidator,
  holds: holdValidator,
  bookings: bookingValidator
};
