/**
 * How long a standard task takes, learned from every completion of it.
 *
 * The expected hours for a task are not supplied by anyone. They are the mean of every time
 * that same task has been completed anywhere in the organisation — not within one project —
 * so the estimate improves on its own each time the work is repeated.
 *
 * Pure functions, no database: the arithmetic here decides what every person is measured
 * against, so it is kept where it can be read and tested on its own.
 */

/** Never claim a task takes no time. A completed task took at least an hour of someone's day. */
const MIN_EXPECTED_HOURS = 1;

/**
 * What makes two tasks "the same task".
 *
 * Titles come from the project-type templates, so the standard tasks already share exact
 * wording across projects; this only has to absorb the ways the same title gets typed —
 * stray spaces, a capital letter, a line break pasted in from a document.
 *
 * Deliberately NOT stripping punctuation: "Claim charting (US)" and "Claim charting" are
 * different pieces of work, and folding them together would average two unlike things.
 */
export function normaliseTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type StandardTotals = { totalMinutes: number; completions: number };

/**
 * The expected hours, as a WHOLE NUMBER.
 *
 * Rounded once, here, at the end. Rounding each completion on the way in instead would be a
 * different and wrong figure: five sittings of thirty minutes are two and a half hours, which
 * rounds to 3 — not to 0, which is what rounding each half-hour to zero first would give, and
 * not to 5, which is what rounding each up would give.
 */
export function expectedHoursFrom(totals: StandardTotals): number | null {
  if (totals.completions <= 0 || totals.totalMinutes <= 0) return null;
  const hours = totals.totalMinutes / totals.completions / 60;
  return Math.max(MIN_EXPECTED_HOURS, Math.round(hours));
}

/**
 * Fold one more completion into the running total.
 *
 * Sum-and-count rather than a stored average, for two reasons. It is O(1) — no scan of every
 * past task of this kind on each close. And it stays exact: repeatedly folding a new value
 * into an average accumulates floating-point error, whereas an integer sum of integer minutes
 * is precise however many completions there are.
 */
export function addCompletion(prev: StandardTotals, hoursTaken: number): StandardTotals & { expectedHours: number | null } {
  // Minutes, and integral: the unit the totals are accumulated in.
  const minutes = Math.max(0, Math.round(hoursTaken * 60));
  const next: StandardTotals = {
    totalMinutes: prev.totalMinutes + minutes,
    completions: prev.completions + 1,
  };
  return { ...next, expectedHours: expectedHoursFrom(next) };
}

/**
 * Elapsed whole minutes between two instants, floored at zero.
 *
 * Floored because a clock that has gone backwards — a machine correcting its time mid-session
 * — must not subtract from anybody's recorded work.
 */
export function elapsedMinutes(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
}

/**
 * Post a completion, or re-post one after the task was reopened.
 *
 * `alreadyContributed` is what this task has previously added to the running total, in
 * minutes, or null if it has never been completed. A task must count ONCE, at whatever it
 * finally took — so a re-completion posts the difference rather than a second sample.
 *
 * Without this, a task closed at 6h, reopened and closed at 8h would post two completions of
 * 6 and 8, giving a mean of 7 for a task that took 8. Reopening is normal in patent work, so
 * that error would not be rare — it would compound with every reopened task in the system.
 */
export function postCompletion(
  prev: StandardTotals,
  hoursTaken: number,
  alreadyContributed: number | null,
): StandardTotals & { expectedHours: number | null; contributedMinutes: number } {
  const minutes = Math.max(0, Math.round(hoursTaken * 60));
  const isFirst = alreadyContributed === null || alreadyContributed === undefined;
  const next: StandardTotals = {
    // A re-completion replaces its own earlier figure; a first completion simply adds.
    totalMinutes: Math.max(0, prev.totalMinutes - (isFirst ? 0 : alreadyContributed!) + minutes),
    completions: prev.completions + (isFirst ? 1 : 0),
  };
  return { ...next, expectedHours: expectedHoursFrom(next), contributedMinutes: minutes };
}

/**
 * Withdraw a task's contribution entirely — used when a completed task is deleted, so the
 * average stops reflecting work that is no longer on the books.
 */
export function withdrawCompletion(prev: StandardTotals, contributed: number | null): StandardTotals & { expectedHours: number | null } {
  if (contributed === null || contributed === undefined || prev.completions <= 0) {
    return { ...prev, expectedHours: expectedHoursFrom(prev) };
  }
  const next: StandardTotals = {
    totalMinutes: Math.max(0, prev.totalMinutes - contributed),
    completions: Math.max(0, prev.completions - 1),
  };
  return { ...next, expectedHours: expectedHoursFrom(next) };
}
