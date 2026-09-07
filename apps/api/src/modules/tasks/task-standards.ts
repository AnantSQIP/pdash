/**
 * The two pure rules behind "how long does this kind of task take".
 *
 * The ARITHMETIC does not live here. Folding a completion into a standard's running totals
 * happens inside a single SQL statement in TaskTimeService.applyDelta, because two tasks of
 * the same kind closing in the same instant would otherwise each read the same totals and
 * each overwrite the other — one completion silently lost, with nothing to show it happened.
 *
 * This file previously ALSO carried a TypeScript implementation of that arithmetic
 * (expectedHoursFrom, postCompletion, withdrawCompletion). Nothing called it. Two documented
 * sources of truth for the numbers that decide how everybody is measured, one of which did
 * nothing, is worse than one — the next person to correct the rounding would have corrected
 * the copy that never runs. It is gone; the rules it encoded are recorded below, next to the
 * SQL that actually enforces them.
 *
 * The rules the SQL implements:
 *
 *   expected hours = ROUND(totalMinutes / completions / 60), floored at 1
 *
 *   · Sum-and-count, not a stored average. It is O(1) — no scan of every past task of this
 *     kind on each close — and it stays exact, where repeatedly folding a new value into an
 *     average accumulates floating-point error.
 *   · Rounded ONCE, at the end. Rounding each completion on the way in gives a different and
 *     wrong figure: five sittings of thirty minutes are two and a half hours, which rounds to
 *     3 — not to 0, which rounding each half-hour down first would give.
 *   · Floored at 1. A completed task never took no time at all.
 *   · A task counts ONCE, at whatever it finally took, however often it is reopened. That is
 *     why TaskAssignee stores standardMinutes: a re-completion posts the DIFFERENCE.
 */

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

/**
 * Elapsed whole minutes between two instants, floored at zero.
 *
 * Floored because a clock that has gone backwards — a machine correcting its time mid-session
 * — must not subtract from anybody's recorded work. Returns 0 rather than NaN for an
 * unparseable instant: a NaN here would propagate into a standard's integer totals and
 * poison every future estimate for that kind of task.
 */
export function elapsedMinutes(startedAt: Date, endedAt: Date): number {
  const ms = endedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 60_000));
}
