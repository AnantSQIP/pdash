/**
 * Tests for the calendar-day helpers in apps/web/lib/date.ts.
 *
 *   TZ=Asia/Kolkata npx ts-node --compiler-options '{"module":"commonjs"}' tools/date-helpers.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because four separate bugs shipped from one mistake: deriving a calendar day by
 * slicing an ISO string. IST is UTC+5:30, so that slice is the PREVIOUS day for the first five
 * and a half hours of every day, and it is the wrong day entirely when applied to a Date built
 * from local parts. The team calendar shifted a whole column, the daily digest's date arrows
 * moved the wrong way, and "today" was yesterday before 5:30am in fourteen places.
 *
 * Every case below is a day that a person in the Gurgaon or Jaipur office would be looking at.
 * The suite pins the TZ to Asia/Kolkata itself, so it gives the same answer on a UTC container
 * as on a developer's machine.
 */
process.env.TZ = 'Asia/Kolkata';

import { istDay, localDay, shiftDay, toUtcDay, todayIST, todayUtc } from '../apps/web/lib/date';

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
  failures.push(`${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

// ── istDay: a real INSTANT, read in the office's timezone ─────────────────────
eq(istDay('2026-09-07T04:00:00.000Z'), '2026-09-07', '9:30am IST is the 7th');
eq(istDay('2026-09-07T17:30:00.000Z'), '2026-09-07', '11pm IST is still the 7th, not the 8th');
eq(istDay('2026-09-07T18:31:00.000Z'), '2026-09-08', 'just after midnight IST is the 8th');
eq(istDay('2026-09-06T20:00:00.000Z'), '2026-09-07', '1:30am IST belongs to the 7th, not the 6th');
eq(istDay('not a date'), '', 'an unparseable instant yields no day rather than throwing');

// ── localDay: a Date built from LOCAL parts ───────────────────────────────────
// The bug: toISOString() on local midnight in IST is 18:30 the PREVIOUS day.
eq(localDay(new Date(2026, 8, 7)), '2026-09-07', 'local midnight on the 7th keys as the 7th');
eq(localDay(new Date(2026, 0, 1)), '2026-01-01', 'new year local midnight does not fall back to December');
eq(localDay(new Date(2026, 11, 31)), '2026-12-31', 'the last day of the year keys as itself');
eq(localDay(new Date(NaN)), '', 'an invalid Date yields no day rather than throwing');

// ── toUtcDay: a DATE-ONLY value, stored at UTC midnight ───────────────────────
eq(toUtcDay('2026-09-07T00:00:00.000Z'), '2026-09-07', 'a leave date reads as its own day');
eq(toUtcDay(new Date('2026-09-07T00:00:00.000Z')), '2026-09-07', 'the same, given a Date');
// This is the guard that keeps one malformed row from blanking a whole screen: toISOString()
// raises a RangeError on an Invalid Date, and it used to be called unguarded.
eq(toUtcDay('garbage'), '', 'an unparseable value yields no day rather than throwing');

// ── shiftDay: calendar arithmetic that actually moves ─────────────────────────
// The digest bug: parsing 'YYYY-MM-DD' as local midnight and adding 86_400_000ms gave
// shift(+1) === the same day and shift(-1) === two days earlier.
eq(shiftDay('2026-09-07', 1), '2026-09-08', 'next day moves forward one day');
eq(shiftDay('2026-09-07', -1), '2026-09-06', 'previous day moves back exactly one day');
eq(shiftDay('2026-09-07', 0), '2026-09-07', 'a zero shift is the identity');
eq(shiftDay('2026-09-30', 1), '2026-10-01', 'crossing a month boundary');
eq(shiftDay('2026-03-01', -1), '2026-02-28', 'crossing back into February in a non-leap year');
eq(shiftDay('2024-03-01', -1), '2024-02-29', 'a leap day is not skipped');
eq(shiftDay('2026-12-31', 1), '2027-01-01', 'crossing a year boundary');
eq(shiftDay('2026-01-01', -1), '2025-12-31', 'crossing back over a year boundary');
eq(shiftDay('2026-09-07', -365), '2025-09-07', 'a year back lands on the same date');
eq(shiftDay('not-a-day', 1), 'not-a-day', 'an unparseable day is returned unchanged');

// ── The 5:30am window: the reason todayUtc() is not "today" ───────────────────
// Between midnight and 05:30 IST the UTC date is still yesterday. Everything that means
// "today" — a timesheet's default date, the max on a date picker, matching an approved WFH
// against the current day — has to use todayIST().
const earlyMorningIST = new Date('2026-09-07T03:00:00+05:30');
eq(istDay(earlyMorningIST), '2026-09-07', 'at 3am IST the office day is the 7th');
eq(earlyMorningIST.toISOString().slice(0, 10), '2026-09-06', 'the naive ISO slice says the 6th — the bug');
eq(todayIST(earlyMorningIST), '2026-09-07', 'todayIST() reads the office day at 3am');

// todayIST() and todayUtc() agree for most of the day and disagree before 05:30 IST. Whichever
// side of that line this suite runs on, todayIST() must be a real day and never behind UTC.
const nowIst = todayIST();
const nowUtc = todayUtc();
eq(/^\d{4}-\d{2}-\d{2}$/.test(nowIst), true, 'todayIST() returns a YYYY-MM-DD day');
eq(nowIst >= nowUtc, true, 'IST is ahead of UTC, so the office day is never behind the UTC day');

// ── The composite the team calendar actually performs ─────────────────────────
// A column built from a local Date, and the entries that have to land in it. Before the fix
// the column keyed 2026-09-06 while every entry keyed 2026-09-07, so all of them rendered one
// column to the right.
const column = localDay(new Date(2026, 8, 7));
eq(column, '2026-09-07', 'the column showing "7" keys as the 7th');
eq(toUtcDay('2026-09-07T00:00:00.000Z'), column, 'a leave on the 7th lands in the 7th column');
eq(istDay('2026-09-07T04:00:00.000Z'), column, 'a 9:30am meeting lands in the 7th column');
eq(istDay('2026-09-07T17:30:00.000Z'), column, 'an 11pm block stays in the 7th column');

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n${failures.length} FAILED, ${pass} passed\n`);
  failures.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
  process.exit(1);
}
console.log(`All ${pass} date-helper assertions pass.`);
