/**
 * What it means for a deadline to MOVE — the arithmetic behind every DeadlineChange row.
 *
 * This is a pure module on purpose. The Performance module counts DeadlineChange rows directly
 * to answer "how many times did this project's deadline have to be shifted, and by how much?",
 * and that number ends up beside a real person's name. A figure that arrives at a review meeting
 * has to be reproducible from the two dates alone, with no database, no clock and no request
 * context in the way — so the rules live here, in one place, under test.
 *
 * WHY MONDAY–FRIDAY AND NOT THE ORG'S HOLIDAY CALENDAR
 *
 * The obvious refinement is to subtract the firm's declared holidays as well. It is deliberately
 * not done, for a reason that only shows up months later: holidays are editable. An HR change to
 * last March's calendar would silently restate a shift that was already reported, so the same
 * project would answer "delayed by 6 days" one quarter and "delayed by 5" the next, with nothing
 * in the record to explain the difference. A weekend never moves. Counting only weekends keeps a
 * recorded shift permanently re-derivable from the row itself.
 *
 * A same-office consequence worth stating plainly: a deadline pushed from Friday to the
 * following Monday is ONE working day, not three. That is the number a delivery lead means when
 * they ask how much a slip cost.
 */
import { startOfUtcDay } from '../../common/dates';

/**
 * Saturday or Sunday, read on the UTC day boundary.
 *
 * Deadlines are stored as UTC midnight standing for an IST calendar day (see `startOfIstDay`),
 * so the UTC weekday IS the local weekday for every date-only value — reading it in local time
 * would put a Monday deadline on Sunday for anyone west of Greenwich.
 *
 * The capacity board keeps a private copy of this predicate for its own scheduling; this is the
 * exported one, and the two must stay in agreement about what a working day is.
 */
export function isWeekendDay(d: Date): boolean {
  const wd = startOfUtcDay(d).getUTCDay();
  return wd === 0 || wd === 6;
}

/**
 * Signed working days from `from` to `to`.
 *
 * The interval is half-open — the origin day is not counted, the destination day is — so moving
 * a deadline by one day reads as 1 rather than 2, and a deadline that did not move reads as 0.
 * Negative when `to` is earlier than `from`, i.e. when a deadline was pulled IN. A shift that
 * lands on a weekend (Friday → Saturday) is 0 working days: nobody gained a day of work.
 */
export function workingDaysBetween(from: Date, to: Date): number {
  const a = startOfUtcDay(from);
  const b = startOfUtcDay(to);
  if (a.getTime() === b.getTime()) return 0;
  const backwards = b < a;
  const start = backwards ? b : a;
  const end = backwards ? a : b;
  let days = 0;
  const cursor = new Date(start);
  // Step from the day AFTER the origin up to and including the destination.
  for (;;) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor > end) break;
    if (!isWeekendDay(cursor)) days++;
  }
  return backwards ? -days : days;
}

/** A real, parseable date. `new Date('not a date')` is a Date object whose time is NaN. */
function valid(d: Date | null | undefined): boolean {
  return !!d && !Number.isNaN(d.getTime());
}

/** A deadline movement worth recording, already reduced to the columns DeadlineChange stores. */
export interface DeadlineShift {
  previousDate: Date;
  newDate: Date | null;
  shiftDays: number;
}

/**
 * Decide whether a deadline edit is a SHIFT, and by how much. `null` means "record nothing".
 *
 * The three cases that must not produce a row, because each would become a performance figure
 * about somebody that nothing actually happened to:
 *
 *   · previous is null — the deadline is being set for the FIRST time. Giving a project its
 *     date is not the project slipping, and a system that counted it that way would report
 *     every project in the firm as having been shifted once before any work began.
 *   · nothing changed — a PATCH that re-sends the same date (the UI resubmits the whole form)
 *     is an edit to something else entirely.
 *   · both null — no deadline before, none after.
 *
 * CLEARING an existing deadline IS recorded, with `newDate: null` and `shiftDays: 0`. The
 * commitment that existed has been withdrawn, which is exactly the kind of thing the question
 * "how many times did this move?" is asking about; there is simply no second date to measure to.
 */
export function describeShift(
  previous: Date | null | undefined,
  next: Date | null | undefined,
): DeadlineShift | null {
  // An unparseable date reaching here means the write that produced it is ALREADY wrong (one
  // team-space route still takes the date string unvalidated). Record nothing rather than guess:
  // `shiftDays` would be NaN, which the Int column rejects, and treating an unparseable NEW date
  // as a clear would write "the deadline was withdrawn" about something that never happened.
  if ((previous && !valid(previous)) || (next && !valid(next))) return null;
  const before = previous ? startOfUtcDay(previous) : null;
  const after = next ? startOfUtcDay(next) : null;
  if (!before) return null;                                      // first-time set, or never set
  if (!after) return { previousDate: before, newDate: null, shiftDays: 0 };  // withdrawn
  if (before.getTime() === after.getTime()) return null;         // re-saved, not moved
  return { previousDate: before, newDate: after, shiftDays: workingDaysBetween(before, after) };
}
