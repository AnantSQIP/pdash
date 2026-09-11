/**
 * Tests for choosing the capacity board's window — apps/web/lib/work-week.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/work-week.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because the board's window always began on TODAY, and the firm plans on a Friday.
 * A seven-day horizon taken on Friday 11 September ran Friday-to-Thursday and left out Friday the
 * 18th — the single day the planning meeting was about. Nobody could see it because the window had
 * no start of its own to look at; it was a length and an assumption. Every case below is one
 * somebody standing in front of that board on a Friday afternoon would actually hit.
 *
 * September 2026, which most cases use, runs: Mon 7, Fri 11, Sat 12, Sun 13, Mon 14, Fri 18.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  countWorkingDays,
  daysOf,
  includesDay,
  nextWeekdayOnOrAfter,
  offsetIntoWeek,
  resolveWindow,
  startOfWeekOn,
  startOfWorkWeek,
  weekdayName,
  weekdayOf,
  type Weekday,
  type WindowChoice,
} from '../apps/web/lib/work-week';

let passed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

/** A window as "start→end×days", which reads in a failure message. */
const span = (w: { start: string; end: string; days: number }) => `${w.start}→${w.end}×${w.days}`;
const win = (reference: string | Date, choice: WindowChoice) => span(resolveWindow(reference, choice));

const MON: Weekday = 1, SAT: Weekday = 6, SUN: Weekday = 0;
const WORK_WEEK: WindowChoice = { mode: 'work-week', weekStartsOn: MON };
const NEXT_WORK_WEEK: WindowChoice = { mode: 'next-work-week', weekStartsOn: MON };

// ── the case that started all of this (requirement 28) ──────────────────────
// Standing on Friday 11 September and asking for next week. The answer has to contain Friday
// the 18th; a window that stops on Thursday is the bug.
check(
  'planning on a Friday, next work week runs Monday to Friday of the following week',
  win('2026-09-11', NEXT_WORK_WEEK),
  '2026-09-14→2026-09-18×5',
);
check(
  'and it contains the Friday being planned for',
  includesDay(resolveWindow('2026-09-11', NEXT_WORK_WEEK), '2026-09-18'),
  true,
);

// The old behaviour, kept as a range option, and exactly why it was not enough: seven days from
// Friday stops on Thursday, one day short of the Friday the meeting is about.
check(
  'a rolling seven days from Friday ends on Thursday',
  win('2026-09-11', { mode: 'rolling', length: 7 }),
  '2026-09-11→2026-09-17×7',
);
check(
  'and misses the following Friday — the whole complaint',
  includesDay(resolveWindow('2026-09-11', { mode: 'rolling', length: 7 }), '2026-09-18'),
  false,
);

// ── computed on each of the seven weekdays ──────────────────────────────────
// Mon–Fri all sit inside the current work week and get it. Saturday and Sunday are past its last
// working day, so "this work week" rolls forward rather than offering five days of history.
const septWeek = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
check(
  'the week under test really is Monday through Sunday',
  septWeek.map(d => weekdayName(weekdayOf(d))),
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
);
check(
  'this work week, asked on each of the seven days',
  septWeek.map(d => win(d, WORK_WEEK)),
  [
    '2026-09-07→2026-09-11×5', // Mon
    '2026-09-07→2026-09-11×5', // Tue
    '2026-09-07→2026-09-11×5', // Wed
    '2026-09-07→2026-09-11×5', // Thu
    '2026-09-07→2026-09-11×5', // Fri — today is still in it
    '2026-09-14→2026-09-18×5', // Sat — this one is over, roll on
    '2026-09-14→2026-09-18×5', // Sun
  ],
);
check(
  'next work week, asked on each of the seven days',
  septWeek.map(d => win(d, NEXT_WORK_WEEK)),
  [
    '2026-09-14→2026-09-18×5', '2026-09-14→2026-09-18×5', '2026-09-14→2026-09-18×5',
    '2026-09-14→2026-09-18×5', '2026-09-14→2026-09-18×5',
    '2026-09-21→2026-09-25×5', '2026-09-21→2026-09-25×5',
  ],
);
// The pair must never name the same week, on any day: two options that agree are one option.
check(
  'this week and next week are always different weeks',
  septWeek.filter(d => win(d, WORK_WEEK) === win(d, NEXT_WORK_WEEK)).length,
  0,
);
// Nor may "this work week" ever be entirely behind the person looking at it.
check(
  'this work week never ends before the day it was asked on',
  septWeek.filter(d => resolveWindow(d, WORK_WEEK).end < d).length,
  0,
);

// ── a start day other than Monday (requirement 30) ──────────────────────────
// Sunday-first is the Gulf working week: Sunday through Thursday, with Friday already outside it.
check('a Sunday-start work week, asked on a Friday, is Sunday to Thursday', win('2026-09-11', { mode: 'work-week', weekStartsOn: SUN }), '2026-09-13→2026-09-17×5');
check('a Sunday-start work week, asked on the Sunday itself, starts that day', win('2026-09-13', { mode: 'work-week', weekStartsOn: SUN }), '2026-09-13→2026-09-17×5');
check('a Saturday-start work week, asked on a Friday, is Saturday to Wednesday', win('2026-09-11', { mode: 'work-week', weekStartsOn: SAT }), '2026-09-12→2026-09-16×5');
check('a Saturday-start work week, asked on the Saturday itself, starts that day', win('2026-09-12', { mode: 'work-week', weekStartsOn: SAT }), '2026-09-12→2026-09-16×5');
check('a Monday-start work week, asked on a Monday, starts that day', win('2026-09-14', WORK_WEEK), '2026-09-14→2026-09-18×5');

check('the start of the week is the chosen day on or before the date', [
  startOfWeekOn('2026-09-11', MON), startOfWeekOn('2026-09-11', SUN), startOfWeekOn('2026-09-11', SAT),
], ['2026-09-07', '2026-09-06', '2026-09-05']);
check('a date on its own week-start day is the start of its week', startOfWeekOn('2026-09-07', MON), '2026-09-07');
check('Friday is the fifth day of a Monday week and the sixth of a Sunday one', [offsetIntoWeek('2026-09-11', MON), offsetIntoWeek('2026-09-11', SUN)], [4, 5]);
check('a week of seven working days never rolls forward', startOfWorkWeek('2026-09-13', MON, 7), '2026-09-07');

// ── starting the window on a named weekday (requirement 27) ─────────────────
// "The next seven days, but start it on a Monday" — the thing the plain horizon could not say.
check('seven days from the next Monday, asked on a Friday', win('2026-09-11', { mode: 'from-weekday', weekStartsOn: MON, length: 7 }), '2026-09-14→2026-09-20×7');
check('asked ON a Monday, it starts today rather than skipping a week', win('2026-09-14', { mode: 'from-weekday', weekStartsOn: MON, length: 7 }), '2026-09-14→2026-09-20×7');
check('fourteen days from the next Monday', win('2026-09-11', { mode: 'from-weekday', weekStartsOn: MON, length: 14 }), '2026-09-14→2026-09-27×14');
check('the next weekday on or after a date is that date when they match', nextWeekdayOnOrAfter('2026-09-11', 5), '2026-09-11');
check('and otherwise the next one along', nextWeekdayOnOrAfter('2026-09-11', SAT), '2026-09-12');

// ── a work week containing a public holiday ─────────────────────────────────
// The window's LENGTH is not the number of days work can be given on. A holiday inside it takes a
// day of capacity away, and "39h allocated" reads very differently against four days than five.
const nextWeek = resolveWindow('2026-09-11', NEXT_WORK_WEEK);
const holidays = new Set(['2026-09-16']); // a Wednesday inside Mon 14 – Fri 18
check('a clean work week is five working days', countWorkingDays(nextWeek), 5);
check('a public holiday inside it takes one away', countWorkingDays(nextWeek, { holidays }), 4);
check('the window itself is unchanged by the holiday — the columns are still drawn', span(nextWeek), '2026-09-14→2026-09-18×5');
check(
  'a holiday outside the window changes nothing',
  countWorkingDays(nextWeek, { holidays: new Set(['2026-09-21']) }),
  5,
);
// A rolling fortnight from Friday spans two weekends; the holiday lands in the first week.
check(
  'a fortnight from Friday has ten working days, nine with a holiday in it',
  [
    countWorkingDays(resolveWindow('2026-09-11', { mode: 'rolling', length: 14 })),
    countWorkingDays(resolveWindow('2026-09-11', { mode: 'rolling', length: 14 }), { holidays }),
  ],
  [10, 9],
);
// Offices that do not share a weekend: a Friday/Saturday weekend moves which days count.
check(
  'a Friday–Saturday weekend counts a different five days',
  countWorkingDays(resolveWindow('2026-09-13', { mode: 'rolling', length: 7 }), { weekend: [5, 6] }),
  5,
);

// ── month boundaries ────────────────────────────────────────────────────────
check('a work week that straddles the end of September', win('2026-09-28', WORK_WEEK), '2026-09-28→2026-10-02×5');
check('a fortnight that straddles a month end', win('2026-09-25', { mode: 'rolling', length: 14 }), '2026-09-25→2026-10-08×14');
check('a window ending on the 31st', win('2026-10-27', { mode: 'rolling', length: 5 }), '2026-10-27→2026-10-31×5');
// February, where an off-by-one in the day arithmetic shows up first.
check('a window through the end of a 28-day February', win('2027-02-24', { mode: 'rolling', length: 7 }), '2027-02-24→2027-03-02×7');
check('a window through the end of a LEAP February keeps the 29th', win('2028-02-24', { mode: 'rolling', length: 7 }), '2028-02-24→2028-03-01×7');
check('the leap day really is in it', daysOf(resolveWindow('2028-02-24', { mode: 'rolling', length: 7 })).includes('2028-02-29'), true);

// ── year boundaries ─────────────────────────────────────────────────────────
check('a work week that straddles New Year', win('2026-12-28', WORK_WEEK), '2026-12-28→2027-01-01×5');
check('planning the new year from the last Friday of the old one', win('2026-12-25', NEXT_WORK_WEEK), '2026-12-28→2027-01-01×5');
check('a rolling window across the year end', win('2026-12-30', { mode: 'rolling', length: 7 }), '2026-12-30→2027-01-05×7');
check('the days across the year end are consecutive and correct', daysOf(resolveWindow('2026-12-30', { mode: 'rolling', length: 5 })), [
  '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
]);

// ── a custom start ──────────────────────────────────────────────────────────
// In the past: a week already gone, asked for deliberately — no clamping to today, because
// "show me what last month looked like" is a question and not a mistake.
check('a custom start in the past is honoured exactly', win('2026-09-11', { mode: 'custom', start: '2026-08-03', length: 7 }), '2026-08-03→2026-08-09×7');
check('a custom start in the past, across a month boundary', win('2026-09-11', { mode: 'custom', start: '2026-07-29', length: 7 }), '2026-07-29→2026-08-04×7');
check('a custom start in a previous year', win('2026-09-11', { mode: 'custom', start: '2025-12-29', length: 7 }), '2025-12-29→2026-01-04×7');
// Far in the future: a matter with a filing date next spring.
check('a custom start far in the future', win('2026-09-11', { mode: 'custom', start: '2031-02-24', length: 14 }), '2031-02-24→2031-03-09×14');
check('a custom start today is a plain horizon', win('2026-09-11', { mode: 'custom', start: '2026-09-11', length: 7 }), '2026-09-11→2026-09-17×7');

// ── lengths the server will actually draw ───────────────────────────────────
// The bounds mirror the API's clamp on `days`. If they disagreed the header would name dates the
// board never drew, which is a worse bug than the one being fixed.
check('a length below the floor is raised to it', win('2026-09-11', { mode: 'rolling', length: 2 }), '2026-09-11→2026-09-15×5');
check('a length above the ceiling is capped', resolveWindow('2026-09-11', { mode: 'rolling', length: 500 }).days, 60);
check('a nonsense length falls back rather than producing an Invalid Date', win('2026-09-11', { mode: 'rolling', length: Number.NaN }), '2026-09-11→2026-09-24×14');
check('a missing length falls back too', win('2026-09-11', { mode: 'rolling' }), '2026-09-11→2026-09-24×14');
check('a fractional length is rounded, not truncated into a gap', resolveWindow('2026-09-11', { mode: 'rolling', length: 13.6 }).days, 14);

// ── bad input from a half-typed date field ──────────────────────────────────
// A date input reports on every keystroke, so `2026-09-0` arrives before `2026-09-05` does.
check('a half-typed custom start falls back to the reference day', win('2026-09-11', { mode: 'custom', start: '2026-09-0', length: 7 }), '2026-09-11→2026-09-17×7');
check('an empty custom start falls back to the reference day', win('2026-09-11', { mode: 'custom', length: 7 }), '2026-09-11→2026-09-17×7');
// 2026-02-31 passes a regex and parses — to 3 March. A window "starting" on it would quietly
// begin three days after the date on the screen.
check('a date that does not exist is not accepted as a start', win('2026-09-11', { mode: 'custom', start: '2026-02-31', length: 7 }), '2026-09-11→2026-09-17×7');
check('an out-of-range week start falls back to Monday', win('2026-09-11', { mode: 'work-week', weekStartsOn: 9 as Weekday }), '2026-09-07→2026-09-11×5');

let threw = '';
try { resolveWindow('not-a-day', WORK_WEEK); } catch (e) { threw = e instanceof RangeError ? 'RangeError' : 'wrong'; }
check('an unparseable reference day is a programming error, and says so', threw, 'RangeError');

// ── the window as the rest of the board reads it ────────────────────────────
check('the days listed match the length', daysOf(nextWeek).length, nextWeek.days);
check('the last day listed is the end, inclusive', daysOf(nextWeek)[nextWeek.days - 1], nextWeek.end);
check('both ends are inside the window', [includesDay(nextWeek, nextWeek.start), includesDay(nextWeek, nextWeek.end)], [true, true]);
check('the day before the start is not', includesDay(nextWeek, '2026-09-13'), false);
check('the day after the end is not', includesDay(nextWeek, '2026-09-19'), false);
// Resolving is pure: the same question twice gets the same answer, whatever the clock says.
check('resolving twice gives the same window', [win('2026-09-11', NEXT_WORK_WEEK), win('2026-09-11', NEXT_WORK_WEEK)], ['2026-09-14→2026-09-18×5', '2026-09-14→2026-09-18×5']);
// A Date is accepted as the reference, read through its UTC fields like every other date-only
// value in the dashboard — a board built from a locally-parsed midnight is a day out.
check('a Date reference is read as a UTC calendar day', win(new Date('2026-09-11T00:00:00Z'), NEXT_WORK_WEEK), '2026-09-14→2026-09-18×5');
check('and late in the IST evening it is still that same day', win(new Date('2026-09-11T18:29:00Z'), NEXT_WORK_WEEK), '2026-09-14→2026-09-18×5');

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ work week: ${passed}/${passed} passed`);
