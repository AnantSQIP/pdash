// Date-only formatting helpers.
//
// Task/project start & due dates carry no time-of-day — the backend stores them
// at UTC midnight. Formatting or comparing them in the browser's local zone
// shifts the calendar day by one in negative-offset zones (e.g. a Jul-6 due date
// renders as "Jul 5"). Everything here treats those values as pure UTC dates so
// the day is stable everywhere.

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** Format a date-only value without timezone drift. Returns em-dash for empty. */
export function formatDate(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = DEFAULT_OPTS,
): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

/** Today as a UTC `YYYY-MM-DD` string. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The UTC `YYYY-MM-DD` day of a date-only value. */
export function toUtcDay(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

/** True when a due date is strictly before today (UTC) — i.e. overdue. */
export function isPastDue(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  return toUtcDay(dueDate) < todayUtc();
}
