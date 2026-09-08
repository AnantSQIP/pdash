/**
 * Turning work sessions into a day's hours.
 *
 * A session is a real interval — 14:20 to 16:05 — while a timesheet entry belongs to a calendar
 * day. The two only line up if a sitting that crosses midnight is SPLIT at midnight: 22:00 to
 * 01:00 is two hours on one day and one on the next. Without that, a night's work belongs to
 * neither day and no day's tracked hours can ever be reconciled against what was filed.
 *
 * These are pure functions on purpose. They are the arithmetic three services agree on (the
 * timer, attendance's punch-out check, and the morning catch-up), and they are the part worth
 * being able to reason about without a database.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * A clock nobody stopped stops counting after this.
 *
 * Twelve hours is longer than any real sitting and shorter than a night, so it bounds the damage
 * of a forgotten timer without truncating anybody's actual day. Shared, because the timer, the
 * day's arithmetic and the catch-up must all agree on where a session ends — the catch-up in
 * particular recognises a forgotten clock BY this figure.
 */
export const SESSION_CAP_MINUTES = 12 * 60;

/** Whole minutes between two instants, never negative — a clock that went backwards is zero. */
export function elapsedMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

/**
 * The real UTC instants during which an IST calendar day was happening.
 *
 * `dayMarker` is the UTC-midnight encoding of an IST date that the rest of the API uses (see
 * `startOfIstDay`). The day itself ran from 18:30 UTC the previous evening for 24 hours.
 */
export function istDayWindow(dayMarker: Date): { from: Date; to: Date } {
  const from = new Date(dayMarker.getTime() - IST_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

/** A session, as every caller here needs it. */
export type SessionSpan = { startedAt: Date; endedAt: Date | null; minutes?: number | null };

/**
 * When a session effectively ended: its own end, or — while it is still running — now, capped
 * so a timer somebody forgot cannot accrue for ever.
 */
export function sessionEnd(s: SessionSpan, now: Date, capMinutes: number): Date {
  if (s.endedAt) return s.endedAt;
  const cap = new Date(s.startedAt.getTime() + capMinutes * 60_000);
  return now < cap ? now : cap;
}

/**
 * Minutes of one session that fall inside a window — the midnight split, and the punched-in
 * window, both come out of this one function.
 */
export function overlapMinutes(s: SessionSpan, from: Date, to: Date, now: Date, capMinutes: number): number {
  const end = sessionEnd(s, now, capMinutes);
  const lo = Math.max(s.startedAt.getTime(), from.getTime());
  const hi = Math.min(end.getTime(), to.getTime());
  return hi <= lo ? 0 : Math.floor((hi - lo) / 60_000);
}

/** Total minutes of a session, running or finished. */
export function totalMinutes(s: SessionSpan, now: Date, capMinutes: number): number {
  return s.endedAt ? (s.minutes ?? elapsedMinutes(s.startedAt, s.endedAt)) : elapsedMinutes(s.startedAt, sessionEnd(s, now, capMinutes));
}

/**
 * Hours rounded UP to the quarter hour.
 *
 * Up, not to-nearest: seven minutes of real work rounded down is work that happened and was
 * never paid for. The quarter hour is the unit the timesheet already speaks in.
 */
export function ceilQuarter(hours: number): number {
  return Math.ceil(hours * 4 - 1e-9) / 4;
}

/** Minutes as hours, to two decimals — the shape the ledger stores. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
