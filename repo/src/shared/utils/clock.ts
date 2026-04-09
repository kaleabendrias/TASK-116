export interface QuietHours {
  startHour: number; // 0-23 inclusive
  endHour: number;   // 0-23 inclusive (window is [start, end))
}

/**
 * Validate a quiet-hours window. Both endpoints must be integers in [0, 23]
 * and the window must not be zero-length (start === end is meaningless).
 */
export function isValidQuietHours(value: unknown): value is QuietHours {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<QuietHours>;
  if (!Number.isInteger(v.startHour) || !Number.isInteger(v.endHour)) return false;
  const s = v.startHour as number;
  const e = v.endHour as number;
  if (s < 0 || s > 23 || e < 0 || e > 23) return false;
  if (s === e) return false;
  return true;
}

export function isWithinQuietHours(date: Date, qh: QuietHours): boolean {
  const h = date.getHours();
  if (qh.startHour === qh.endHour) return false;
  if (qh.startHour < qh.endHour) return h >= qh.startHour && h < qh.endHour;
  // Crosses midnight: e.g. 21 → 7
  return h >= qh.startHour || h < qh.endHour;
}

export function nextQuietEnd(date: Date, qh: QuietHours): Date {
  const out = new Date(date);
  out.setMinutes(0, 0, 0);
  while (isWithinQuietHours(out, qh)) {
    out.setHours(out.getHours() + 1);
  }
  return out;
}
