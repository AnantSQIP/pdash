/**
 * Tests for the Timesheets summary windows — apps/web/lib/timesheet-window.ts.
 *
 *   TZ=Asia/Kolkata npx ts-node --compiler-options '{"module":"commonjs"}' tools/timesheet-window.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because "This week" and "This month" sat beside each other on the same row of tiles
 * measuring two different KINDS of period. The month tile meant the calendar month; the week tile
 * meant the last seven days, ending today. On Wednesday 16 September the week tile read 47h30m
 * while the week itself — Monday, Tuesday, Wednesday — held 33.5h. Fourteen hours belonging to
 * the week before were answering the question "have I filed enough this week?", and nothing on
 * the screen admitted it.
 *
 * Every case below is a day somebody would be standing on when they glance at that tile, and the
 * rolling window's answer is kept alongside the calendar one wherever the two disagree — the gap
 * IS the bug. The suite pins the TZ to Asia/Kolkata, so a UTC container agrees with a laptop in
 * Gurgaon.
 *
 * September 2026 runs: Mon 14, Tue 15, Wed 16, Thu 17, Fri 18, Sat 19, Sun 20.
 */
process.env.TZ = 'Asia/Kolkata';

import { shiftDay } from '../apps/web/lib/date';
import { monthStartDay, weekStartDay } from '../apps/web/lib/timesheet-window';

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
  failures.push(`${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

/** The window the OLD tile used, kept here so the difference stays visible and testable. */
const rollingSeven = (day: string) => shiftDay(day, -6);

// ── the reported case ───────────────────────────────────────────────────────
// Wednesday. The calendar week began on Monday; the rolling window reached back into Thursday of
// the week before and counted two days nobody was asking about.
eq(weekStartDay('2026-09-16'), '2026-09-14', 'on a Wednesday, the week starts on the Monday of that week');
eq(rollingSeven('2026-09-16'), '2026-09-10', 'the old rolling window reached back to the previous Thursday');
eq(
  [weekStartDay('2026-09-16') > rollingSeven('2026-09-16'), rollingSeven('2026-09-16') < '2026-09-14'],
  [true, true],
  'and it counted days belonging to the week before',
);

// ── every day of one week lands on the same Monday ──────────────────────────
// This is the whole point: a week is a thing you are IN, not a length measured backwards from
// wherever you happen to be standing. All seven days must agree on which week that is.
const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
eq(week.map(weekStartDay), Array(7).fill('2026-09-14'), 'Monday through Sunday all report the same Monday');
eq(
  new Set(week.map(rollingSeven)).size,
  7,
  'where the rolling window gave each of them a different answer',
);
eq(weekStartDay('2026-09-21'), '2026-09-21', 'the next Monday starts a new week, not a continuation');
eq(weekStartDay('2026-09-13'), '2026-09-07', 'and the Sunday before belongs to the week before');

// ── Monday-first, not Sunday-first ──────────────────────────────────────────
// getDay() is Sunday-indexed; taking it literally puts Sunday at the head of the week and makes
// "this week" start the evening before the working week does. The rest of the dashboard — the
// month grids, the "Weeks start Monday" control, the Mon–Fri day target — is Monday-first.
eq(weekStartDay('2026-09-20'), '2026-09-14', 'Sunday closes its week rather than opening the next one');
eq(new Date(`${weekStartDay('2026-09-16')}T00:00:00`).getDay(), 1, 'the day returned really is a Monday');
eq(week.every(d => new Date(`${weekStartDay(d)}T00:00:00`).getDay() === 1), true, 'for every day of the week');

// ── boundaries, where the arithmetic goes wrong first ───────────────────────
eq(weekStartDay('2026-10-01'), '2026-09-28', 'a week straddling the end of September keeps its September Monday');
eq(weekStartDay('2027-01-01'), '2026-12-28', 'and one straddling New Year keeps its December Monday');
eq(weekStartDay('2027-02-28'), '2027-02-22', 'a week ending on the last day of a 28-day February');
eq(weekStartDay('2028-03-01'), '2028-02-28', 'and after a leap one, where the 29th is a Tuesday');
eq(weekStartDay('2028-02-29'), '2028-02-28', 'the leap day itself belongs to its Monday');

// ── the month tile, unchanged but stated ────────────────────────────────────
eq(monthStartDay('2026-09-16'), '2026-09-01', 'the month starts on the 1st');
eq(monthStartDay('2026-09-01'), '2026-09-01', 'including when today IS the 1st');
eq(monthStartDay('2026-12-31'), '2026-12-01', 'and on the last day of the year');
// The two tiles must never disagree about what kind of thing they are measuring again: both are
// calendar periods, so both start on or before today and never in the future.
eq(
  week.every(d => weekStartDay(d) <= d && monthStartDay(d) <= d),
  true,
  'neither window ever begins after the day it was asked on',
);

// ── a half-typed or absent day ──────────────────────────────────────────────
// Returned unchanged rather than parsed: a window that silently became "the beginning of time"
// would show every hour ever logged under "This week", which is worse than showing nothing.
eq(weekStartDay('2026-09-0'), '2026-09-0', 'a half-typed day is handed back, not guessed at');
eq(weekStartDay(''), '', 'and so is an empty one');
eq(monthStartDay('not-a-day'), 'not-a-day', 'the month start is just as unwilling to guess');
// 2026-02-31 passes the shape check and parses — to 3 March. Its week is the week of 3 March,
// which is the honest answer for a date that does not exist: do not invent a February one.
eq(weekStartDay('2026-02-31'), '2026-03-02', 'a date that does not exist resolves where the calendar puts it');

// ── the same question twice ─────────────────────────────────────────────────
eq(
  [weekStartDay('2026-09-16'), weekStartDay('2026-09-16')],
  ['2026-09-14', '2026-09-14'],
  'resolving is pure — the clock gets no vote',
);

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${pass} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ timesheet window: ${pass}/${pass} passed`);
