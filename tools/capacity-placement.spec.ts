/**
 * Tests for placing work on days — apps/api/src/modules/capacity/placement.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/capacity-placement.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because the capacity board spent its whole life spreading a task's effort evenly
 * from today to its deadline, which answers "when is this due" and never "when am I doing it".
 * Seven hours due in ten days showed as 0.7h on each of ten days: nobody ever looked free, a day
 * could not be claimed for one job, and a genuinely impossible fortnight read as a mildly full
 * one. Placing work instead makes tasks compete for a day, and competition is where the
 * arithmetic gets subtle — a day already spoken for, a ceiling on how much of a day one job may
 * take, and hours that outlast the days available.
 *
 * Every case below is one a person planning a patent matter would actually hit.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  compareScheduled,
  placeForward,
  priorityRank,
  type ScheduledSeat,
} from '../apps/api/src/modules/capacity/placement';

let passed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

/** Ten consecutive working days, so a case reads like the board's own window. */
const DAY = 86_400_000;
const d0 = Date.UTC(2026, 8, 14); // Mon 14 Sep 2026
const days = (from: number, count: number): Date[] =>
  Array.from({ length: count }, (_, i) => new Date(d0 + (from + i) * DAY));
const hoursOn = (out: { date: Date; hours: number }[]) =>
  out.map(p => [Math.round((p.date.getTime() - d0) / DAY), Math.round(p.hours * 100) / 100]);

const NOTHING_USED = () => 0;

// ── the case that started all of this ───────────────────────────────────────
// Seven hours, starting on day 8 of a ten-day window. It belongs on day 8, and nowhere else.
check(
  'seven hours starting on day 8 land entirely on day 8',
  hoursOn(placeForward({ remaining: 7, days: days(7, 3), perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED })),
  [[7, 7]],
);

// A full day's work is a full day, not a day and a sliver.
check(
  'exactly eight hours fill one day and do not spill',
  hoursOn(placeForward({ remaining: 8, days: days(0, 5), perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED })),
  [[0, 8]],
);

// ── work longer than a day ──────────────────────────────────────────────────
check(
  'twenty hours fill two days and part of a third',
  hoursOn(placeForward({ remaining: 20, days: days(0, 5), perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED })),
  [[0, 8], [1, 8], [2, 4]],
);

// ── a ceiling on how much of a day one job may take ─────────────────────────
check(
  'a two-hour-a-day ceiling stretches seven hours over four days',
  hoursOn(placeForward({ remaining: 7, days: days(0, 6), perDayCap: 2, dayCapacity: 8, usedOn: NOTHING_USED })),
  [[0, 2], [1, 2], [2, 2], [3, 1]],
);

check(
  'a ceiling above a day is clamped to the day — no seat claims 30h of an 8h day',
  hoursOn(placeForward({ remaining: 12, days: days(0, 4), perDayCap: 30, dayCapacity: 8, usedOn: NOTHING_USED })),
  [[0, 8], [1, 4]],
);

// ── competing for a day that is already spoken for ──────────────────────────
// Day 0 already carries 6h of placed work, so only 2h fit before this moves on.
check(
  'a partly-claimed day takes what fits and the rest moves to the next day',
  hoursOn(placeForward({
    remaining: 6, days: days(0, 4), perDayCap: null, dayCapacity: 8,
    usedOn: d => (d.getTime() === d0 ? 6 : 0),
  })),
  [[0, 2], [1, 4]],
);

// A day with nothing left is skipped entirely rather than receiving a zero-hour placement.
check(
  'a full day is skipped, not given a zero-hour slice',
  hoursOn(placeForward({
    remaining: 5, days: days(0, 3), perDayCap: null, dayCapacity: 8,
    usedOn: d => (d.getTime() === d0 ? 8 : 0),
  })),
  [[1, 5]],
);

// ── more work than there are days ───────────────────────────────────────────
// The remainder must stay visible. Dropping it would hide the overload that placing work exists
// to reveal, so the last day carries 8h of its own plus everything that did not fit.
check(
  'hours that outlast the window pile onto the last day rather than vanishing',
  hoursOn(placeForward({ remaining: 30, days: days(0, 3), perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED })),
  [[0, 8], [1, 8], [2, 14]],
);

check(
  'the overflow is added to the last day, not appended as a second entry for it',
  placeForward({ remaining: 30, days: days(0, 3), perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED }).length,
  3,
);

// ── nothing to do ───────────────────────────────────────────────────────────
check('no remaining effort places nothing', placeForward({ remaining: 0, days: days(0, 5), perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED }), []);
check('no workable days place nothing', placeForward({ remaining: 5, days: [], perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED }), []);
check(
  'a floating-point sliver is not spread across a run of days',
  hoursOn(placeForward({ remaining: 8.001, days: days(0, 5), perDayCap: null, dayCapacity: 8, usedOn: NOTHING_USED })),
  [[0, 8]],
);

// ── the order days are claimed in ───────────────────────────────────────────
const seat = (over: Partial<ScheduledSeat> & { taskId: string }): ScheduledSeat => ({
  userId: 'u1', remaining: 4, startAt: new Date(d0), cap: null, priority: 'MEDIUM', due: null, ...over,
});
const order = (seats: ScheduledSeat[]) => [...seats].sort(compareScheduled).map(s => s.taskId);

check('an unknown priority is treated as MEDIUM, the column default', priorityRank('nonsense'), priorityRank('MEDIUM'));
check('a missing priority is treated as MEDIUM', priorityRank(null), priorityRank('MEDIUM'));

check(
  'critical work claims the day before high, medium and low',
  order([
    seat({ taskId: 'low', priority: 'LOW' }),
    seat({ taskId: 'crit', priority: 'CRITICAL' }),
    seat({ taskId: 'med', priority: 'MEDIUM' }),
    seat({ taskId: 'high', priority: 'HIGH' }),
  ]),
  ['crit', 'high', 'med', 'low'],
);

check(
  'at equal priority the earlier deadline goes first',
  order([
    seat({ taskId: 'later', due: new Date(d0 + 5 * DAY) }),
    seat({ taskId: 'sooner', due: new Date(d0 + 1 * DAY) }),
  ]),
  ['sooner', 'later'],
);

check(
  'a seat with no deadline sorts after every seat that has one',
  order([
    seat({ taskId: 'undated', due: null }),
    seat({ taskId: 'dated', due: new Date(d0 + 40 * DAY) }),
  ]),
  ['dated', 'undated'],
);

check(
  'with priority and deadline equal, the earlier start goes first',
  order([
    seat({ taskId: 'starts-later', startAt: new Date(d0 + 3 * DAY) }),
    seat({ taskId: 'starts-sooner', startAt: new Date(d0) }),
  ]),
  ['starts-sooner', 'starts-later'],
);

// Total and stable: two seats alike in every planning respect must still have a fixed order, or
// the board deals the days differently on each refresh and nobody can trust what they just saw.
check(
  'seats identical in every other respect are ordered by id, so the board never reshuffles',
  order([seat({ taskId: 'bbb' }), seat({ taskId: 'aaa' }), seat({ taskId: 'ccc' })]),
  ['aaa', 'bbb', 'ccc'],
);

const twice = [seat({ taskId: 'zz', priority: 'HIGH' }), seat({ taskId: 'aa', priority: 'HIGH' })];
check('sorting is stable across repeated runs', [order(twice), order(twice)], [['aa', 'zz'], ['aa', 'zz']]);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ capacity placement: ${passed}/${passed} passed`);
