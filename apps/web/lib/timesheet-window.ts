/**
 * The windows the Timesheets summary tiles add up.
 *
 * "This week" used to be a ROLLING SEVEN DAYS ending today, sitting next to a "This month" that
 * was the calendar month. On a Wednesday the tile read 47h30m while Monday-to-Wednesday held
 * 33.5h — fourteen hours of the *previous* week counted toward the question the tile is actually
 * asked, which is "have I filed enough this week?". Two tiles side by side, one answering about a
 * calendar period and the other about a sliding one, and nothing on screen saying so.
 *
 * Everything else in the dashboard is firmly Monday-first: the calendar grids, the "Weeks start
 * Monday" control, the Mon–Fri day target. So is this now.
 *
 * Both take and return `YYYY-MM-DD`, which compares correctly as a plain string. The day handed
 * in should be the IST day (`todayIST()`) — the org runs on IST and a viewer's device clock is
 * not allowed a vote on which week they are in.
 */

import { localDay, startOfWeekMonday } from './date';

/** A complete `YYYY-MM-DD` day; anything else we refuse to do arithmetic on. */
const isDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * The Monday on or before `day` — the first day of the calendar week `day` falls in.
 *
 * Built by parsing to LOCAL midnight and reading local fields back out, never through
 * `toISOString()`: a Date at local midnight is the previous day in UTC east of Greenwich, and
 * slicing its ISO string would hand back the Sunday.
 *
 * An unparseable day is returned unchanged, so a half-typed value can never widen the window to
 * the beginning of time.
 */
export function weekStartDay(day: string): string {
  if (!isDay(day)) return day;
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return localDay(startOfWeekMonday(d));
}

/** The 1st of the month `day` falls in. */
export function monthStartDay(day: string): string {
  return isDay(day) ? `${day.slice(0, 7)}-01` : day;
}
