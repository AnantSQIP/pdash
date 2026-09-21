/**
 * Tests for what a capacity row says about a person — apps/api/src/modules/capacity/capacity.module.ts
 * (daysStillAhead, summariseAhead).
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","experimentalDecorators":true}' tools/capacity-window.spec.ts
 *
 * Plain assertions, no framework — this repo has none. The decorator flag is here because the
 * functions under test live in the Nest module file beside the board that uses them, rather than
 * in a file of their own; nothing in this spec constructs a service.
 *
 * These exist because the board's window used to begin on today and now may begin before it, and
 * every summary figure quietly went on counting the whole window. Days that have gone carry no
 * load — placement never puts work behind today — so each elapsed day read as eight free hours.
 * Opened on a Wednesday, the default Monday-start work week reported all twenty-six people
 * available now, a person carrying 11.6 hours of overload among them, with thirty-two hours free
 * and a "next free" date two days in the past. Every case below is a window somebody actually
 * picks from the range dropdown.
 *
 * September 2026 runs: Mon 14, Tue 15, Wed 16 — today throughout — Thu 17, Fri 18, Sat 19, Sun 20.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  daysStillAhead,
  summariseAhead,
  type CapacityDay,
} from '../apps/api/src/modules/capacity/capacity.module';

let passed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

const TODAY = '2026-09-16'; // Wednesday
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A working day with `load` hours already placed on it — drawn exactly as the board draws one. */
function work(date: string, load = 0, capacity = 8): CapacityDay {
  return {
    date,
    state: load / capacity >= 0.75 ? 'BUSY' : load / capacity > 0.25 ? 'LIGHT' : 'FREE',
    load,
    capacity,
    utilization: r2(load / capacity),
    free: Math.max(0, r2(capacity - load)),
  };
}
const weekend = (date: string): CapacityDay => ({ date, state: 'WEEKEND', load: 0, capacity: 0, utilization: 0, free: 0 });
const holiday = (date: string): CapacityDay => ({ date, state: 'HOLIDAY', load: 0, capacity: 0, utilization: 0, free: 0, note: 'Diwali' });
const onLeave = (date: string): CapacityDay => ({ date, state: 'LEAVE', load: 0, capacity: 0, utilization: 0, free: 0, note: 'EL leave' });

// ── which days a summary is allowed to count ───────────────────────────────────
const workWeek = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].map(d => work(d));
check(
  'a window anchored on Monday counts from today on',
  daysStillAhead(workWeek, TODAY).map(d => d.date),
  ['2026-09-16', '2026-09-17', '2026-09-18'],
);
check('a window starting today counts all of itself', daysStillAhead(workWeek.slice(2), TODAY).length, 3);
check('a window entirely behind us counts nothing', daysStillAhead(['2026-08-10', '2026-08-11'].map(d => work(d)), TODAY), []);

// ── the row that started all of this ───────────────────────────────────────────
// Monday and Tuesday empty and gone; today holding 19.6h against an eight-hour day; Thursday and
// Friday clear. The person is 11.6 hours over, and the board said they were free.
const overloadedToday = [
  work('2026-09-14', 0), work('2026-09-15', 0),
  work('2026-09-16', 19.6),
  work('2026-09-17', 0), work('2026-09-18', 0),
];
const now = summariseAhead(overloadedToday, TODAY);
check('somebody buried today is not available now', now.availableNow, false);
check('their free hours are the hours still to come', now.freeHours, 16);
check('their capacity is the days still to come', now.capacityHours, 24);
check('the overload is reported in full', now.overCommittedHours, 11.6);
check('utilization is measured against what is left of the window', now.utilization, 82);
check('the next free day is never in the past', now.nextFreeDate, '2026-09-17');
check('and the free run counts only days still to come', now.freeRunDays, 2);

// The same days asked as a FORWARD window — a Monday board opened on the Monday. This is what the
// board reported every day of this week, and what it is right to report only on the Monday.
const fromMonday = summariseAhead(overloadedToday, '2026-09-14');
check('a forward window is unchanged: it counts every day it draws', fromMonday.capacityHours, 40);
check('a forward window is unchanged: free hours', fromMonday.freeHours, 32);
check('a forward window is unchanged: free on the first day means available', fromMonday.availableNow, true);
check('a forward window is unchanged: next free is its own first day', fromMonday.nextFreeDate, '2026-09-14');

// ── a window entirely in the past ──────────────────────────────────────────────
const august = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].map(d => work(d, 3));
const past = summariseAhead(august, TODAY);
check('a retrospective window promises nobody', past.availableNow, false);
check('it offers no free hours', past.freeHours, 0);
check('it has no capacity left to measure', past.capacityHours, 0);
check('and no next free day', past.nextFreeDate, null);
check('utilization does not divide by a capacity of zero', past.utilization, 0);
check('nor is any figure NaN', Object.values(past).every(v => typeof v !== 'number' || Number.isFinite(v)), true);

// ── the ordinary shapes of a week ──────────────────────────────────────────────
const clearWeek = [work('2026-09-16'), work('2026-09-17'), work('2026-09-18'), weekend('2026-09-19'), weekend('2026-09-20')];
const clear = summariseAhead(clearWeek, TODAY);
check('a clear week is available now', clear.availableNow, true);
check('a weekend adds no capacity', clear.capacityHours, 24);
check('a weekend does not break a free run', clear.freeRunDays, 3);

check(
  'a holiday is skipped rather than counted as free',
  summariseAhead([holiday('2026-09-16'), work('2026-09-17'), work('2026-09-18')], TODAY).capacityHours,
  16,
);
check(
  'available now reads the next day that can be worked, not the holiday',
  summariseAhead([holiday('2026-09-16'), work('2026-09-17'), work('2026-09-18')], TODAY).availableNow,
  true,
);
check(
  'a full day of leave leaves nobody available on it',
  summariseAhead([onLeave('2026-09-16'), work('2026-09-17', 8)], TODAY).availableNow,
  false,
);

// A half day is a working day at half strength — four hours of capacity, not eight and not none.
const halfDay = summariseAhead([work('2026-09-16', 1, 4), work('2026-09-17', 0)], TODAY);
check('a half day contributes four hours of capacity', halfDay.capacityHours, 12);
check('a half day contributes the three hours left on it', halfDay.freeHours, 11);
check('a quarter of a half day still counts as free', halfDay.availableNow, true);

// A day at exactly the free threshold is free; a hair over it is not. This is the line the board
// paints on, so it is the line the summary has to agree with.
check('a day at a quarter full is free', summariseAhead([work('2026-09-16', 2)], TODAY).availableNow, true);
check('a day past a quarter full is not', summariseAhead([work('2026-09-16', 2.1)], TODAY).availableNow, false);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ capacity window: ${passed}/${passed} passed`);
