// Choosing the window the capacity board plans over.
//
// The board's window used to be a horizon and nothing else — N days, always beginning today —
// and that is the wrong shape for the way this firm plans. The allocation exercise happens on a
// Friday and covers the week ahead, so a seven-day horizon taken on Friday the 11th ran to
// Thursday the 17th and left out Friday the 18th: the one day the meeting was actually about.
// The bug was not an off-by-one, it was the missing degree of freedom. A window has to be a
// START plus a LENGTH, with the start something a person can name.
//
// Everything here is pure arithmetic on `YYYY-MM-DD` calendar days — no React, no fetching, no
// clock of its own (the caller passes the reference day, so "what does this show on a Tuesday"
// is a question you can ask in a test). Days are read as UTC midnight, the encoding the whole
// dashboard uses for date-only values, via the shared helpers in ./date. The import is relative
// rather than through the `@/` alias so the spec can run under plain ts-node.
//
// Tested by tools/work-week.spec.ts.

import { shiftDay, toUtcDay, WEEKDAYS_FULL, WEEKDAYS_SHORT } from './date';

/** A day of the week as `Date#getUTCDay` numbers them: Sunday = 0 … Saturday = 6. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The length bounds a window may take.
 *
 * These MIRROR `MIN_DAYS`/`MAX_DAYS` in apps/api/src/modules/capacity/capacity.module.ts, which
 * clamps the `days` query parameter. They have to agree: if the picker offered a four-day window
 * the header would say "Mon–Thu" while the server drew five days, and the dates under the columns
 * would no longer be the dates in the label. A five-day floor is also exactly a work week, so
 * nothing the UI offers is clamped out from under it.
 */
export const MIN_WINDOW_DAYS = 5;
export const MAX_WINDOW_DAYS = 60;

/** Monday to Friday — the default work week, and the shape of the Friday planning meeting. */
export const DEFAULT_WORK_WEEK_DAYS = 5;

/** Weekdays in the order a picker should list them: Monday first, Sunday last. */
export const WEEKDAYS_IN_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * How the window is chosen.
 *
 *   rolling         N days from the reference day. The original behaviour, kept so every
 *                   existing "Next 14 days" habit still works.
 *   work-week       the work week the reference day is in — or the next one if this one has
 *                   already ended (see `startOfWorkWeek`).
 *   next-work-week  the work week after that. This is the Friday planning window.
 *   from-weekday    N days beginning on the next named weekday, so "the next seven days" can
 *                   be made to start on a Monday instead of on whatever day it happens to be.
 *   custom          N days from a date typed in by hand — past or future, no second-guessing.
 */
export type WindowMode = 'rolling' | 'work-week' | 'next-work-week' | 'from-weekday' | 'custom';

export interface WindowChoice {
  mode: WindowMode;
  /** rolling / from-weekday / custom: how many calendar days the window spans. */
  length?: number;
  /**
   * Which day a week begins on — for the work-week modes, and the day `from-weekday` starts on.
   * Monday here, Sunday and Saturday elsewhere: the firm has offices that do not share a weekend
   * convention, and a board that cannot express that is a board somebody keeps in a spreadsheet.
   */
  weekStartsOn?: Weekday;
  /** How many days of that week the work week covers. 5 = Monday to Friday. */
  workWeekDays?: number;
  /** custom: the first day of the window, `YYYY-MM-DD`. */
  start?: string;
}

/** A concrete window: both ends INCLUSIVE, plus the length the API's `days` parameter wants. */
export interface ResolvedWindow {
  /** First day, `YYYY-MM-DD`. */
  start: string;
  /** Last day, `YYYY-MM-DD` — inclusive, so a five-day window ending Friday says Friday. */
  end: string;
  /** Calendar days from start to end inclusive. */
  days: number;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalise a reference or start value to a `YYYY-MM-DD` day, or null when it is not one.
 *
 * The round-trip through the Date it names is what rejects a day that does not exist: `2026-02-31`
 * matches the pattern and parses, but it parses to 3 March, so a window "starting" on it would
 * silently begin three days after the date on the screen.
 */
function asDay(value: string | Date): string | null {
  if (value instanceof Date) return toUtcDay(value) || null;
  const day = value.slice(0, 10);
  if (!DAY_PATTERN.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toUtcDay(parsed) === day ? day : null;
}

/** The weekday a `YYYY-MM-DD` day falls on (Sunday = 0). */
export function weekdayOf(day: string): Weekday {
  return new Date(`${day}T00:00:00Z`).getUTCDay() as Weekday;
}

/** "Monday", "Sunday" — for labels. WEEKDAYS_FULL is Monday-indexed, these numbers are not. */
export function weekdayName(w: Weekday): string {
  return WEEKDAYS_FULL[(w + 6) % 7];
}

/** "Mon", "Sun" — the same, abbreviated. */
export function weekdayShort(w: Weekday): string {
  return WEEKDAYS_SHORT[(w + 6) % 7];
}

function normaliseWeekday(w: Weekday | undefined, fallback: Weekday): Weekday {
  return w === undefined || !Number.isInteger(w) || w < 0 || w > 6 ? fallback : w;
}

/**
 * Clamp a length to something the server will actually draw.
 *
 * A non-number is the caller's fallback rather than NaN: NaN would flow into the day arithmetic
 * and produce an Invalid Date, and an invalid date renders as a blank board with no error to
 * explain it — the failure mode this whole file exists to keep out of the window.
 */
function clampLength(n: number | undefined, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(MIN_WINDOW_DAYS, Math.min(MAX_WINDOW_DAYS, v));
}

/** How far into its week a day sits, counting from `weekStartsOn` (0 when it IS that day). */
export function offsetIntoWeek(day: string, weekStartsOn: Weekday): number {
  return (weekdayOf(day) - weekStartsOn + 7) % 7;
}

/** The `weekStartsOn` day on or before `day`. */
export function startOfWeekOn(day: string, weekStartsOn: Weekday): string {
  return shiftDay(day, -offsetIntoWeek(day, weekStartsOn));
}

/** The next `weekday` on or after `day` — today itself when the two already match. */
export function nextWeekdayOnOrAfter(day: string, weekday: Weekday): string {
  return shiftDay(day, (weekday - weekdayOf(day) + 7) % 7);
}

/**
 * The start of the work week `day` belongs to — or of the NEXT one when this week's working days
 * are already behind it.
 *
 * Standing on a Saturday, "this work week" is not a window anybody wants: Monday to Friday of the
 * week just gone is five days of history on a board whose whole purpose is deciding what happens
 * next. Rolling forward also keeps the pair of options honest — "this work week" and "next work
 * week" are always two different weeks, and neither is ever entirely in the past.
 */
export function startOfWorkWeek(day: string, weekStartsOn: Weekday, workWeekDays: number): string {
  const start = startOfWeekOn(day, weekStartsOn);
  return offsetIntoWeek(day, weekStartsOn) >= workWeekDays ? shiftDay(start, 7) : start;
}

function windowOf(start: string, days: number): ResolvedWindow {
  return { start, end: shiftDay(start, days - 1), days };
}

/**
 * Turn a choice into the concrete window the board draws and the API is asked for.
 *
 * `reference` is the day the choice is being made ON — `todayIST()` in the app, a fixed day in the
 * tests. It is required rather than read from the clock so that every mode is a pure function of
 * its inputs; a board that answers differently depending on when you run it cannot be tested, and
 * the Friday bug was precisely a disagreement about what day it was.
 *
 * Throws on an unparseable reference, which is a programming error — the one day value that is
 * never user input. A custom START, which IS typed in by a person, falls back to the reference
 * instead: half-typed dates arrive on every keystroke of a date field.
 */
export function resolveWindow(reference: string | Date, choice: WindowChoice): ResolvedWindow {
  const today = asDay(reference);
  if (!today) throw new RangeError(`resolveWindow: reference is not a YYYY-MM-DD day (${String(reference)})`);

  const weekStartsOn = normaliseWeekday(choice.weekStartsOn, 1); // Monday
  const workWeekDays = clampLength(choice.workWeekDays, DEFAULT_WORK_WEEK_DAYS);

  switch (choice.mode) {
    case 'work-week':
      return windowOf(startOfWorkWeek(today, weekStartsOn, workWeekDays), workWeekDays);
    case 'next-work-week':
      return windowOf(shiftDay(startOfWorkWeek(today, weekStartsOn, workWeekDays), 7), workWeekDays);
    case 'from-weekday':
      return windowOf(nextWeekdayOnOrAfter(today, weekStartsOn), clampLength(choice.length, 7));
    case 'custom':
      return windowOf(asDay(choice.start ?? '') ?? today, clampLength(choice.length, 7));
    case 'rolling':
    default:
      return windowOf(today, clampLength(choice.length, 14));
  }
}

/** Every day in the window, in order. */
export function daysOf(win: ResolvedWindow): string[] {
  const out: string[] = [];
  for (let i = 0; i < win.days; i++) out.push(shiftDay(win.start, i));
  return out;
}

/** Is this day inside the window? Both ends inclusive. */
export function includesDay(win: ResolvedWindow, day: string): boolean {
  return day >= win.start && day <= win.end;
}

/**
 * Working days in the window: not a weekend, not a company holiday.
 *
 * The window's LENGTH is not the number of days anybody can be given work on. A five-day week
 * with Independence Day in it is four, and "39h allocated" reads very differently against four
 * days of capacity than against five — which is why the header says how many of the days are
 * workable rather than leaving the reader to count the amber columns.
 */
export function countWorkingDays(
  win: ResolvedWindow,
  opts?: { holidays?: ReadonlySet<string>; weekend?: readonly Weekday[] },
): number {
  const weekend = opts?.weekend ?? [0, 6]; // Sunday and Saturday
  const holidays = opts?.holidays;
  return daysOf(win).filter(d => !weekend.includes(weekdayOf(d)) && !holidays?.has(d)).length;
}
