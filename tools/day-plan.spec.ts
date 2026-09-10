/**
 * Tests for what a day sheet says about a line — apps/web/lib/day-plan.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/day-plan.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because the day sheet asks a question nothing can verify: did you actually do this
 * work? Only the person knows. So the rules below are not about catching liars, they are about
 * which entries deserve a second look before they become an invoice — and, just as importantly,
 * which do NOT. A sheet that remarks on ordinary lines teaches people to click past warnings, and
 * then the one that mattered goes past too.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  warningsFor, warningsForSheet, sheetSummary, FULL_DAY_HOURS,
  type DayPlanRow,
} from '../apps/web/lib/day-plan';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}
const codes = (row: DayPlanRow, hours: number) => warningsFor(row, hours).map(w => w.code);

/** A line for work that WAS planned today, with plenty left on it. The ordinary case. */
const planned = (over: Partial<DayPlanRow> = {}): DayPlanRow => ({
  taskId: 't1', plannedHours: 4, loggedToday: 0, remainingHours: 10, closed: false, when: 'TODAY', ...over,
});

// ── the ordinary line says nothing ──────────────────────────────────────────
check('planned work, sensible hours, says nothing at all', codes(planned(), 3), []);
check('exactly the planned hours says nothing', codes(planned(), 4), []);
check('a bit more than planned is still ordinary — plans are not stopwatches', codes(planned(), 5), []);
check('a full eight-hour day on planned work says nothing', codes(planned({ remainingHours: 20 }), 8), []);

// ── an untouched line is not a line ─────────────────────────────────────────
check('no hours means no remarks', codes(planned({ plannedHours: 0 }), 0), []);
check('zero hours on unplanned work is still nothing to say', codes(planned({ plannedHours: 0, when: 'OTHER' }), 0), []);
check('a negative is treated as untouched, not argued with', codes(planned(), -3), []);

// ── the case the whole design exists for ────────────────────────────────────
// Hours against something the plan did not have them doing. Normal, allowed, and exactly the
// shape a mistyped row takes — so it is the one line worth showing.
check('hours on work that was not planned for the day are questioned',
  codes(planned({ plannedHours: 0, when: 'OTHER' }), 2), ['NOT_PLANNED']);
check("and tomorrow's work logged today says which day it belonged to",
  warningsFor(planned({ plannedHours: 0, when: 'TOMORROW' }), 2)[0].message,
  'This was planned for tomorrow, not this day.');
check('work planned for the day is never questioned for being unplanned',
  codes(planned({ plannedHours: 0.5 }), 2), []);

// ── more than the task had left ─────────────────────────────────────────────
check('logging more than the task has left is questioned',
  codes(planned({ remainingHours: 2 }), 5), ['OVER_REMAINING']);
check('and it says how much was actually left',
  warningsFor(planned({ remainingHours: 2 }), 5)[0].message,
  'Only 2h were left on this task — logging 5h.');
check('what is already filed today counts against what is left',
  codes(planned({ remainingHours: 4, loggedToday: 3 }), 3), ['OVER_REMAINING']);
check('a quarter of an hour over is rounding, not a discrepancy', codes(planned({ remainingHours: 2 }), 2.2), []);
// A task with nothing left is a task whose estimate was wrong, and saying so on every line of it
// would be nagging about a decision somebody already made.
check('a task with no estimate left is not nagged about', codes(planned({ remainingHours: 0 }), 3), []);

// ── a task already finished ─────────────────────────────────────────────────
check('hours on a finished task are questioned', codes(planned({ closed: true, plannedHours: 0 }), 1), ['ALREADY_FINISHED']);
check('and finishing does not ALSO accuse it of being unplanned — one remark, not two',
  codes(planned({ closed: true, plannedHours: 0, when: 'OTHER' }), 1), ['ALREADY_FINISHED']);

// ── more than a day on one task ─────────────────────────────────────────────
check('more than eight hours on one task in one day is questioned',
  codes(planned({ remainingHours: 40 }), 9), ['MORE_THAN_A_DAY']);
check('exactly eight is a long day, not a suspicious one', codes(planned({ remainingHours: 40 }), FULL_DAY_HOURS), []);

// ── several reasons at once, most actionable first ──────────────────────────
check('the most actionable reason comes first',
  codes(planned({ plannedHours: 0, remainingHours: 1, when: 'OTHER' }), 9),
  ['NOT_PLANNED', 'OVER_REMAINING', 'MORE_THAN_A_DAY']);

// ── a whole sheet ───────────────────────────────────────────────────────────
const sheet: DayPlanRow[] = [
  planned({ taskId: 'ok' }),
  planned({ taskId: 'unplanned', plannedHours: 0, when: 'OTHER' }),
  planned({ taskId: 'untouched', plannedHours: 0, when: 'OTHER' }),
];
const hours = { ok: 3, unplanned: 2, untouched: 0 };
check('only the lines worth looking at are returned',
  Object.keys(warningsForSheet(sheet, hours)), ['unplanned']);
check('a clean sheet has no summary', sheetSummary(warningsForSheet([planned()], { t1: 3 })), null);
check('one questioned line reads as one line',
  sheetSummary(warningsForSheet(sheet, hours)),
  '1 line needs a look — work that was not on your plan.');

const messy: DayPlanRow[] = [
  planned({ taskId: 'a', plannedHours: 0, when: 'OTHER' }),
  planned({ taskId: 'b', remainingHours: 1 }),
];
check('several reasons are listed as a sentence, counted by LINE not by remark',
  sheetSummary(warningsForSheet(messy, { a: 2, b: 6 })),
  '2 lines need a look — work that was not on your plan and more hours than a task had left.');

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ day-sheet warnings: ${passed}/${passed} passed`);
