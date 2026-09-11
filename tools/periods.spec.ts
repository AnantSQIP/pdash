/**
 * Tests for the windows performance is measured over — apps/web/lib/periods.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/periods.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because of a complaint that sounded like a display bug and was not: "Tasks
 * Completed shows the ongoing week, it must show the past week". Every figure in the module was
 * measured over a window ending TODAY, so the week on screen was always the half-finished one —
 * short by construction, and never comparable with the week before it. Calendar windows fix that,
 * and calendar windows are where date arithmetic goes wrong: the Sunday that belongs to the week
 * that is ending, January whose previous month is in another year, the 31st that has no
 * counterpart in February.
 *
 * Every case below is a day somebody will actually open this page on.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  periodWindow, isoDay, describeWindow, workingDaysBack, periodLabel,
  CALENDAR_PERIODS, DEFAULT_PERIOD, type CalendarPeriodKey,
} from '../apps/web/lib/periods';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

/** A day, at midday, so nothing below depends on the hour it is read at. */
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0);
/** A window as four dates, which is how every case below is easiest to read. */
const w = (key: CalendarPeriodKey, today: Date) => {
  const p = periodWindow(key, today);
  return [isoDay(p.from), isoDay(p.to), isoDay(p.prevFrom), isoDay(p.prevTo)];
};

// ── last week: the week that has FINISHED ───────────────────────────────────
// Sep 2026: the 7th is a Monday, the 13th a Sunday, the 14th the next Monday.
check('asked on a Wednesday, last week is the previous Mon–Sun',
  w('last-week', on(2026, 9, 16)), ['2026-09-07', '2026-09-14', '2026-08-31', '2026-09-07']);
check('asked on a MONDAY, last week is the seven days that ended yesterday',
  w('last-week', on(2026, 9, 14)), ['2026-09-07', '2026-09-14', '2026-08-31', '2026-09-07']);
check('asked on a SUNDAY, the week that Sunday is closing is not over yet',
  w('last-week', on(2026, 9, 13)), ['2026-08-31', '2026-09-07', '2026-08-24', '2026-08-31']);
check('asked on the Saturday, the answer is the same as on the Sunday',
  w('last-week', on(2026, 9, 12)), w('last-week', on(2026, 9, 13)));
check('a last-week window is seven days long',
  (periodWindow('last-week', on(2026, 9, 16)).to.getTime() - periodWindow('last-week', on(2026, 9, 16)).from.getTime()) / 86400000, 7);
check('last week is never partial', periodWindow('last-week', on(2026, 9, 16)).partial, false);

// A week that straddles a month boundary is still one week — the month has no say in it.
check('last week may span two months',
  w('last-week', on(2026, 9, 3)), ['2026-08-24', '2026-08-31', '2026-08-17', '2026-08-24']);
// …or two years. 1 Jan 2027 is a Friday, so the week it sits in began on Mon 28 Dec 2026.
check('last week may span two years',
  w('last-week', on(2027, 1, 1)), ['2026-12-21', '2026-12-28', '2026-12-14', '2026-12-21']);

// ── last five weeks ─────────────────────────────────────────────────────────
check('last five weeks are the five FINISHED weeks',
  w('last-5-weeks', on(2026, 9, 16)), ['2026-08-10', '2026-09-14', '2026-07-06', '2026-08-10']);
check('and the comparison before it is another five',
  (periodWindow('last-5-weeks', on(2026, 9, 16)).prevTo.getTime() - periodWindow('last-5-weeks', on(2026, 9, 16)).prevFrom.getTime()) / 86400000, 35);
check('the five-week window ends where the last-week window ends',
  isoDay(periodWindow('last-5-weeks', on(2026, 9, 16)).to), isoDay(periodWindow('last-week', on(2026, 9, 16)).to));

// ── last month ──────────────────────────────────────────────────────────────
check('last month is the previous whole calendar month',
  w('last-month', on(2026, 9, 16)), ['2026-08-01', '2026-09-01', '2026-07-01', '2026-08-01']);
check('asked on the 1st, last month is still the month before',
  w('last-month', on(2026, 9, 1)), ['2026-08-01', '2026-09-01', '2026-07-01', '2026-08-01']);
check('in JANUARY last month is December of the year before',
  w('last-month', on(2027, 1, 12)), ['2026-12-01', '2027-01-01', '2026-11-01', '2026-12-01']);
check('in February the comparison reaches back to December',
  w('last-month', on(2027, 2, 3)), ['2027-01-01', '2027-02-01', '2026-12-01', '2027-01-01']);

// ── last quarter ────────────────────────────────────────────────────────────
check('in Q3 the last quarter is Apr–Jun',
  w('last-quarter', on(2026, 9, 16)), ['2026-04-01', '2026-07-01', '2026-01-01', '2026-04-01']);
check('in Q1 the last quarter is Oct–Dec of the year before',
  w('last-quarter', on(2027, 2, 20)), ['2026-10-01', '2027-01-01', '2026-07-01', '2026-10-01']);
check('on the first day of a quarter the quarter just ended is the one reported',
  w('last-quarter', on(2026, 10, 1)), ['2026-07-01', '2026-10-01', '2026-04-01', '2026-07-01']);

// ── this month, the only window that is still running ───────────────────────
check('month-to-date runs from the 1st to the end of today',
  w('current-month', on(2026, 9, 11)), ['2026-09-01', '2026-09-12', '2026-08-01', '2026-08-12']);
check('and says that it is not finished', periodWindow('current-month', on(2026, 9, 11)).partial, true);
check('it is compared with the SAME span of the month before, not the whole of it',
  (periodWindow('current-month', on(2026, 9, 11)).prevTo.getTime() - periodWindow('current-month', on(2026, 9, 11)).prevFrom.getTime()) / 86400000, 11);
check('on the 1st the window is exactly one day',
  w('current-month', on(2026, 9, 1)), ['2026-09-01', '2026-09-02', '2026-08-01', '2026-08-02']);
// 31 March against February: there is no 31st to reach, and running past it would count days of
// March twice on both sides of the comparison.
check('on the 31st the comparison is clamped to the end of the shorter month',
  w('current-month', on(2027, 3, 31)), ['2027-03-01', '2027-04-01', '2027-02-01', '2027-03-01']);
check('in January the comparison is the previous December',
  w('current-month', on(2027, 1, 5)), ['2027-01-01', '2027-01-06', '2026-12-01', '2026-12-06']);

// ── every window is well-formed ─────────────────────────────────────────────
for (const p of CALENDAR_PERIODS) {
  const win = periodWindow(p.key, on(2026, 9, 16));
  check(`${p.key}: the window runs forwards`, win.from < win.to, true);
  check(`${p.key}: the comparison runs forwards`, win.prevFrom < win.prevTo, true);
  check(`${p.key}: the comparison ends where the window begins`, win.prevTo <= win.from, true);
  check(`${p.key}: every boundary is a local midnight`,
    [win.from, win.to, win.prevFrom, win.prevTo].every(d => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0), true);
  check(`${p.key}: it carries its own label`, win.label, p.label);
}
check('the module opens on a finished week, never the running one', DEFAULT_PERIOD, 'last-week');
check('the default is one of the periods offered', CALENDAR_PERIODS.some(p => p.key === DEFAULT_PERIOD), true);

// ── how a window reads ──────────────────────────────────────────────────────
// `to` is exclusive, so the last day printed is the day before it. A week labelled "1 – 8" when
// it means "1 – 7" is the kind of off-by-one nobody spots, because it looks like a label.
check('a week inside one month drops the repeated month',
  describeWindow(periodWindow('last-week', on(2026, 9, 16))), '7 – 13 Sep');
check('a whole month is named, not spelled out',
  describeWindow(periodWindow('last-month', on(2026, 9, 16))), 'Aug 2026');
check('a quarter shows both ends',
  describeWindow(periodWindow('last-quarter', on(2026, 9, 16))), '1 Apr – 30 Jun');
check('a running month says that it is running',
  describeWindow(periodWindow('current-month', on(2026, 9, 11))), '1 – 11 Sep (so far)');
check('a five-week window shows both ends',
  describeWindow(periodWindow('last-5-weeks', on(2026, 9, 16))), '10 Aug – 13 Sep');

// ── the rolling windows still work, untouched ───────────────────────────────
// The heatmap and the daily trend lines are genuinely rolling and still import these.
check('five working days from a Friday is the working week itself', workingDaysBack(5, on(2026, 9, 11)), 5);
check('five working days from a Wednesday has to reach back over a weekend', workingDaysBack(5, on(2026, 9, 16)), 7);
check('five working days from a Monday reaches the whole previous week', workingDaysBack(5, on(2026, 9, 14)), 7);
check('five working days from a Saturday still covers five worked days', workingDaysBack(5, on(2026, 9, 12)), 6);
check('a day count with no period name describes itself', periodLabel(17), 'last 17 days');
check('90 days is still the quarter label', periodLabel(90), 'Quarter');
check('a local date is formatted without drifting a day', isoDay(on(2026, 1, 1)), '2026-01-01');

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ performance periods: ${passed}/${passed} passed`);
