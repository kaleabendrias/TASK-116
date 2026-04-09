export const isNonEmpty = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

export const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const isEmail = (v: unknown): v is string =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const inRange = (n: number, min: number, max: number): boolean =>
  Number.isFinite(n) && n >= min && n <= max;
