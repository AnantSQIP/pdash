// Date / time / number formatting helpers.
//
// Two distinct kinds of value live here:
//  1. Date-only values (task/project start & due dates, holidays, leave dates). The
//     backend stores these at UTC midnight, so they must be formatted/compared as pure
//     UTC dates — formatting them in the browser's local zone shifts the calendar day
//     by one in negative-offset zones.
//  2. Real instants (punch times, "today", the greeting). SquarkIP runs on IST, so these
//     are pinned to Asia/Kolkata regardless of the viewer's device clock. Because the
//     timeZone is explicit, server (UTC container) and client render the SAME string —
//     which also removes the SSR/CSR hydration mismatch on the banner.

/** The organisation's operating timezone. Working hours are 9am–6pm IST. */
export const ORG_TZ = 'Asia/Kolkata';

// ── Week convention ─────────────────────────────────────────────────────────
// EVERY calendar in the dashboard starts its week on MONDAY and ends on Sunday — the
// working week people here actually think in. These helpers are the single source of
// that convention; build month grids and week strips from them rather than from a raw
// getDay(), which is Sunday-indexed and silently reintroduces a Sunday-first grid.

/** Weekday headers in display order, Monday first. */
export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
/** Single-letter headers for dense grids (Monday first). */
export const WEEKDAYS_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** A date's column in a Monday-first week: Mon=0 … Sun=6. Use instead of getDay(). */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}
/** Same, for a date-only value stored at UTC midnight. */
export function weekdayIndexUtc(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}
/** How many blank cells a month grid needs before the 1st (Monday-first). */
export function monthLeadPad(year: number, monthIndex0: number): number {
  return (new Date(year, monthIndex0, 1).getDay() + 6) % 7;
}
/** The Monday on or before `d`, at local midnight. */
export function startOfWeekMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - weekdayIndex(r));
  return r;
}

/**
 * Format a date-only value without timezone drift. The year is added automatically
 * when the date is not in the current year, so a due date from a different year can't
 * be mistaken for this one. Returns an em-dash for empty/invalid values.
 */
export function formatDate(
  value: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const base: Intl.DateTimeFormatOptions = opts ?? {
    day: 'numeric',
    month: 'short',
    ...(d.getUTCFullYear() !== new Date().getUTCFullYear() ? { year: 'numeric' } : {}),
  };
  return d.toLocaleDateString('en-IN', { ...base, timeZone: 'UTC' });
}

/** Format a real timestamp as a time-of-day in the org timezone (IST), e.g. "09:05 am". */
export function formatTimeIST(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: ORG_TZ });
}

/** Today as a UTC `YYYY-MM-DD` string. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today's calendar day in the org timezone (IST) as `YYYY-MM-DD`. */
export function todayIST(now: Date = new Date()): string {
  // en-CA renders ISO `YYYY-MM-DD`; the explicit timeZone makes it IST everywhere.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ORG_TZ }).format(now);
}

/** The current hour (0–23) in the org timezone (IST). */
export function hourIST(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: ORG_TZ }).format(now)) % 24;
}

/** A short date + time-of-day for a real TIMESTAMP, in the org timezone (IST), e.g.
 *  "25 Jul, 09:05 am". Use for comment/activity timestamps so the whole app reads en-IN/IST. */
export function formatDateTimeIST(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ORG_TZ,
  });
}

/** Long, human date in the org timezone (IST), e.g. "Friday, 25 July 2026". */
export function longDateIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ORG_TZ,
  }).format(now);
}

/** The UTC `YYYY-MM-DD` day of a date-only value. */
export function toUtcDay(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

/** True when a due date is strictly before today (IST) — i.e. overdue. */
export function isPastDue(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  return toUtcDay(dueDate) < todayIST();
}

// ── Number formatting ────────────────────────────────────────────────────────

/** Hours, rounded to at most one decimal, with a trailing "h" (e.g. "8h", "8.5h"). */
export function fmtHours(h?: number | null): string {
  const n = Math.round(Math.max(0, h ?? 0) * 10) / 10;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}h`;
}

/** A whole number with Indian-grouping separators (e.g. 100000 → "1,00,000"). */
export function fmtNum(n?: number | null): string {
  return Math.round(n ?? 0).toLocaleString('en-IN');
}

/** A rounded percentage with a trailing "%". */
export function fmtPct(n?: number | null): string {
  return `${Math.round(n ?? 0)}%`;
}

/** "1 day" / "2 days" — count with a correctly-pluralised noun. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

/**
 * "5m ago" / "3h ago" / "2d ago" for a past TIMESTAMP.
 *
 * Unlike the date-only helpers these are real instants, so the local zone is the right
 * frame — "asked 5m ago" means five minutes ago wherever you are.
 */
export function relativePast(iso: string | Date): string {
  const diff = Date.now() - (iso instanceof Date ? iso : new Date(iso)).getTime();
  const m = Math.max(0, Math.round(diff / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
