/**
 * Tests for what counts as a deadline SHIFT — apps/api/src/modules/deadlines/deadline-shift.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/deadline-shift.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because the rows this module decides to write are counted directly by the
 * Performance module and read out in review meetings: "this matter's deadline moved four times,
 * by eleven working days in total." Every case below is one where the naive implementation gets
 * a real person's figure wrong.
 *
 * The two that matter most are the ones where the answer is NOTHING. A project being GIVEN its
 * deadline is not a project slipping — count it and every matter in the firm reads as having
 * been shifted once before any work started. A form that resubmits the same date is an edit to
 * something else entirely — count it and a typo correction becomes a delay.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  describeShift,
  isWeekendDay,
  workingDaysBetween,
} from '../apps/api/src/modules/deadlines/deadline-shift';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

/** A date-only value the way the database stores one: the IST calendar day at UTC midnight. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** The shift as the DeadlineChange row would read it — dates as plain days, or null. */
const row = (prev: Date | null, next: Date | null) => {
  const s = describeShift(prev, next);
  if (!s) return null;
  return {
    previous: s.previousDate.toISOString().slice(0, 10),
    next: s.newDate ? s.newDate.toISOString().slice(0, 10) : null,
    shiftDays: s.shiftDays,
  };
};

// ── the weekday predicate the whole count rests on ──────────────────────────
check('Friday is a working day', isWeekendDay(day(2026, 9, 11)), false);
check('Saturday is not', isWeekendDay(day(2026, 9, 12)), true);
check('Sunday is not', isWeekendDay(day(2026, 9, 13)), true);
check('Monday is a working day', isWeekendDay(day(2026, 9, 14)), false);

// ── a push out ──────────────────────────────────────────────────────────────
// The ordinary slip: a matter due Tuesday now due Thursday. Two working days lost.
check('a deadline pushed out by two working days',
  row(day(2026, 9, 8), day(2026, 9, 10)),
  { previous: '2026-09-08', next: '2026-09-10', shiftDays: 2 });

// ── a pull in ───────────────────────────────────────────────────────────────
// The client wants it sooner. The sign is what distinguishes "we slipped" from "we were
// squeezed", and a report that shows both as positive numbers says the opposite of the truth.
check('a deadline pulled in reads as negative',
  row(day(2026, 9, 10), day(2026, 9, 8)),
  { previous: '2026-09-10', next: '2026-09-08', shiftDays: -2 });

// ── a first-time set records NOTHING ────────────────────────────────────────
// The single most important case. A project being given its deadline has not been shifted.
check('setting a deadline for the first time is not a shift', row(null, day(2026, 9, 10)), null);
check('no deadline before and none after is not a shift', row(null, null), null);

// ── a no-op update records NOTHING ──────────────────────────────────────────
// The edit form resubmits every field, so most PATCHes carry an unchanged deadline.
check('re-saving the same date is not a shift', row(day(2026, 9, 10), day(2026, 9, 10)), null);
// Same calendar day, different clock time — a date-only value that picked up a timestamp
// somewhere. Still the same deadline; comparing raw instants would call it a move.
check('the same day at a different time of day is still not a shift',
  row(day(2026, 9, 10), new Date(Date.UTC(2026, 8, 10, 17, 45))),
  null);

// ── a clear to null IS recorded ─────────────────────────────────────────────
// A commitment that existed has been withdrawn. There is no second date to measure to, so the
// distance is zero — but the row has to exist, because "it used to have a deadline" is exactly
// the kind of thing the question is asking about.
check('clearing an existing deadline is recorded with no new date',
  row(day(2026, 9, 10), null),
  { previous: '2026-09-10', next: null, shiftDays: 0 });

// ── an unparseable date records NOTHING ─────────────────────────────────────
// One team-space route still accepts the date as a bare string, so `new Date(...)` can produce
// an Invalid Date. shiftDays would be NaN (rejected by the Int column), and reading an
// unparseable new date as a clear would record a withdrawal that never happened.
check('an unparseable new date records nothing', row(day(2026, 9, 10), new Date('not a date')), null);
check('an unparseable previous date records nothing', row(new Date('not a date'), day(2026, 9, 10)), null);

// ── across a weekend ────────────────────────────────────────────────────────
// Friday to Monday is ONE working day, not three. This is the number a delivery lead means.
check('Friday to Monday is one working day',
  row(day(2026, 9, 11), day(2026, 9, 14)),
  { previous: '2026-09-11', next: '2026-09-14', shiftDays: 1 });
check('a full week later is five working days, not seven',
  row(day(2026, 9, 11), day(2026, 9, 18)),
  { previous: '2026-09-11', next: '2026-09-18', shiftDays: 5 });
// Landing ON the weekend buys nobody a day of work.
check('Friday to Saturday is no working days at all',
  row(day(2026, 9, 11), day(2026, 9, 12)),
  { previous: '2026-09-11', next: '2026-09-12', shiftDays: 0 });
check('Monday pulled back to the Saturday before is one working day earlier',
  row(day(2026, 9, 14), day(2026, 9, 12)),
  { previous: '2026-09-14', next: '2026-09-12', shiftDays: -1 });

// ── across a month boundary ─────────────────────────────────────────────────
// Mon 31 Aug 2026 → Tue 1 Sep 2026. The month rolls; the count must not.
check('Monday 31 August to Tuesday 1 September is one working day',
  row(day(2026, 8, 31), day(2026, 9, 1)),
  { previous: '2026-08-31', next: '2026-09-01', shiftDays: 1 });
// Thu 27 Aug → Wed 2 Sep: Fri 28, Mon 31, Tue 1, Wed 2 = four working days over a weekend
// AND a month end.
check('a slip over both a weekend and a month end counts only the weekdays',
  row(day(2026, 8, 27), day(2026, 9, 2)),
  { previous: '2026-08-27', next: '2026-09-02', shiftDays: 4 });
// A year boundary is the same arithmetic; Thu 31 Dec 2026 → Fri 1 Jan 2027.
check('a slip across the new year is one working day',
  row(day(2026, 12, 31), day(2027, 1, 1)),
  { previous: '2026-12-31', next: '2027-01-01', shiftDays: 1 });

// ── exactly one working day ─────────────────────────────────────────────────
// The smallest shift that exists. Half-open counting is what makes this 1 and not 0 or 2.
check('Tuesday to Wednesday is exactly one working day',
  row(day(2026, 9, 8), day(2026, 9, 9)),
  { previous: '2026-09-08', next: '2026-09-09', shiftDays: 1 });
check('Wednesday pulled back to Tuesday is exactly minus one',
  row(day(2026, 9, 9), day(2026, 9, 8)),
  { previous: '2026-09-09', next: '2026-09-08', shiftDays: -1 });

// ── the raw counter, on its own ─────────────────────────────────────────────
check('a day to itself is zero', workingDaysBetween(day(2026, 9, 9), day(2026, 9, 9)), 0);
check('a whole weekend on its own is zero', workingDaysBetween(day(2026, 9, 11), day(2026, 9, 13)), 0);
check('a fortnight is ten working days', workingDaysBetween(day(2026, 9, 11), day(2026, 9, 25)), 10);
check('a fortnight backwards is minus ten', workingDaysBetween(day(2026, 9, 25), day(2026, 9, 11)), -10);
// A long slip: 1 Sep 2026 (Tue) → 1 Dec 2026 (Tue). 65 working days, counted the hard way.
check('a three-month slip is sixty-five working days', workingDaysBetween(day(2026, 9, 1), day(2026, 12, 1)), 65);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ deadline shifts: ${passed}/${passed} passed`);
