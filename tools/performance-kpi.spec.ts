/**
 * Tests for the two performance KPIs — apps/api/src/modules/performance/kpi.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/performance-kpi.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because these numbers land on somebody's appraisal. Every figure the module shows
 * is now derived here, and each one has a way of being quietly wrong that nobody would catch by
 * looking at a chart: a task with no estimate counted as a pass, so a team improves its score by
 * estimating nothing; a task finished ON the deadline counted as late, because the completion
 * instant is past the deadline's midnight; a streak that reports the break that ended a run four
 * deliveries ago as though it had just happened.
 *
 * Every case below is one a real patent matter produces.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  hoursVerdict, overrunRatio, breachedHours, summariseHours,
  deadlineVerdict, summariseDeadlines, daysLate, isOnTime,
  countBreaches, breachesByProject,
  streakVerdict, computeStreak,
  summariseProject, rollUpManagers,
  HOURS_BREACH_RATIO, RED_FLAG_RATIO,
  type Delivery,
} from '../apps/api/src/modules/performance/kpi';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

/** A due date, as the database holds one: a date with no time, at UTC midnight. */
const due = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** A completion, as the database holds one: a real instant. 10:00 UTC is 15:30 IST — office hours. */
const done = (iso: string, hhmmUtc = '10:00') => new Date(`${iso}T${hhmmUtc}:00.000Z`);

let seq = 0;
const task = (over: Partial<Delivery> = {}): Delivery => ({
  taskId: `t${++seq}`,
  projectId: 'p1', projectName: 'Invalidity — Acme', projectCode: 'SQ_26_27_001', roundSeq: 1,
  priority: 'MEDIUM',
  allocatedHours: 8, spentHours: 6,
  dueDate: due('2026-09-10'), completedAt: done('2026-09-09'),
  ...over,
});

// ── KPI 1: time spent against time allocated ────────────────────────────────
check('the ordinary job, comfortably inside its budget', hoursVerdict(task()), 'WITHIN');
check('exactly on budget is within it', hoursVerdict(task({ spentHours: 8 })), 'WITHIN');
// Time is booked in quarter-hours, so an eight-hour job routinely closes at 8.25h with nothing
// having gone wrong. Counting that would fill the report with rounding.
check('a quarter of an hour over eight is rounding, not an over-run', hoursVerdict(task({ spentHours: 8.25 })), 'WITHIN');
check('exactly at the tolerance is still within it', hoursVerdict(task({ spentHours: 8 * HOURS_BREACH_RATIO })), 'WITHIN');
check('past the tolerance is an over-run', hoursVerdict(task({ spentHours: 8.9 })), 'OVER');
check('the owner\'s own example — eight allocated, sixteen taken — is the red flag',
  hoursVerdict(task({ allocatedHours: 8, spentHours: 16 })), 'RED_FLAG');
check('the red flag is drawn at exactly double', RED_FLAG_RATIO, 2);
check('a hair under double is an over-run, not yet a red flag', hoursVerdict(task({ spentHours: 15.9 })), 'OVER');

// A task nobody estimated cannot breach an estimate. It is excluded, not passed — otherwise a
// team improves its score by estimating nothing at all.
check('no estimate cannot be judged', hoursVerdict(task({ allocatedHours: null, spentHours: 40 })), 'UNMEASURED');
check('an estimate of zero cannot be judged either', hoursVerdict(task({ allocatedHours: 0, spentHours: 40 })), 'UNMEASURED');
check('and neither is counted as a pass', breachedHours(task({ allocatedHours: null, spentHours: 40 })), false);
// No hours booked is a timesheet problem, not a budget one, and KPI 1 is not where it is raised.
check('nothing booked at all is not an over-run', hoursVerdict(task({ spentHours: null })), 'WITHIN');
check('an over-run says how far over it went', overrunRatio(task({ allocatedHours: 8, spentHours: 16 })), 2);
check('an unmeasurable job has no ratio', overrunRatio(task({ allocatedHours: null })), null);

const mixed = [
  task({ taskId: 'a', allocatedHours: 8, spentHours: 6 }),
  task({ taskId: 'b', allocatedHours: 8, spentHours: 16 }),
  task({ taskId: 'c', allocatedHours: 4, spentHours: 6 }),
  task({ taskId: 'd', allocatedHours: null, spentHours: 30 }),
];
check('the totals count only what could be judged',
  (({ measured, within, over, redFlag, unmeasured }) => ({ measured, within, over, redFlag, unmeasured }))(summariseHours(mixed)),
  { measured: 3, within: 1, over: 1, redFlag: 1, unmeasured: 1 });
check('and the hours behind them exclude the unmeasurable one too',
  (({ allocatedHours, spentHours, overHours }) => ({ allocatedHours, spentHours, overHours }))(summariseHours(mixed)),
  { allocatedHours: 20, spentHours: 28, overHours: 10 });
check('the within-budget rate is measured against what could be measured',
  summariseHours(mixed).withinRate, 33);
check('and the worst single over-run is named', summariseHours(mixed).worstRatio, 2);
check('somebody with nothing to show has no rate, not a rate of zero',
  summariseHours([]).withinRate, null);
check('a person with no tasks at all reports zeroes and no score',
  summariseHours([]),
  { measured: 0, within: 0, over: 0, redFlag: 0, unmeasured: 0, allocatedHours: 0, spentHours: 0, overHours: 0, withinRate: null, worstRatio: null });
check('a person whose every task was unestimated says so rather than scoring 100%',
  (({ withinRate, unmeasured }) => ({ withinRate, unmeasured }))(summariseHours([task({ allocatedHours: null }), task({ allocatedHours: null })])),
  { withinRate: null, unmeasured: 2 });

// ── deadlines ───────────────────────────────────────────────────────────────
check('delivered the day before is on time', deadlineVerdict(task({ completedAt: done('2026-09-09') })), 'ON_TIME');
// The completion instant is past the deadline's midnight by definition. Judged as an instant,
// every on-time close during office hours reads as late.
check('delivered ON the deadline is ON TIME, not late', deadlineVerdict(task({ completedAt: done('2026-09-10') })), 'ON_TIME');
check('delivered at 11pm IST on the deadline is still on time',
  deadlineVerdict(task({ completedAt: done('2026-09-10', '17:30') })), 'ON_TIME');
check('delivered a week early is on time', deadlineVerdict(task({ completedAt: done('2026-09-03') })), 'ON_TIME');
check('delivered the day after is late', deadlineVerdict(task({ completedAt: done('2026-09-11') })), 'LATE');
check('a task nobody gave a date to is undated, not punctual',
  deadlineVerdict(task({ dueDate: null })), 'UNDATED');
check('the boundary itself', isOnTime(done('2026-09-10'), due('2026-09-10')), true);
check('and the day past it', isOnTime(done('2026-09-11'), due('2026-09-10')), false);
check('a slip is counted in whole days', daysLate(done('2026-09-14'), due('2026-09-10')), 4);
check('an early delivery is not negatively late', daysLate(done('2026-09-01'), due('2026-09-10')), 0);

const dated = [
  task({ taskId: 'e', completedAt: done('2026-09-09') }),
  task({ taskId: 'f', completedAt: done('2026-09-12') }),
  task({ taskId: 'g', completedAt: done('2026-09-15') }),
  task({ taskId: 'h', dueDate: null }),
];
check('the deadline totals split dated from undated',
  (({ dated: n, onTime, late, undated, onTimeRate }) => ({ n, onTime, late, undated, onTimeRate }))(summariseDeadlines(dated)),
  { n: 3, onTime: 1, late: 2, undated: 1, onTimeRate: 33 });
check('and the slips add up', summariseDeadlines(dated).lateDays, 7);
check('with the worst one named', summariseDeadlines(dated).worstLateDays, 5);
check('nothing dated means no rate, not a rate of zero', summariseDeadlines([task({ dueDate: null })]).onTimeRate, null);

// ── times versus things ─────────────────────────────────────────────────────
// Five pushes on one project and five projects slipping once each are completely different
// problems, and one count cannot tell them apart.
check('five crossings on one thing', countBreaches([{ entityId: 'p' }, { entityId: 'p' }, { entityId: 'p' }, { entityId: 'p' }, { entityId: 'p' }]), { times: 5, things: 1 });
check('one crossing on each of five things', countBreaches([1, 2, 3, 4, 5].map(n => ({ entityId: `p${n}` }))), { times: 5, things: 5 });
check('nothing crossed anything', countBreaches([]), { times: 0, things: 0 });

// ── which projects the breaches happened in ─────────────────────────────────
const across = [
  task({ taskId: 'x1', projectId: 'p1', projectName: 'Acme FTO', allocatedHours: 8, spentHours: 20 }),
  task({ taskId: 'x2', projectId: 'p1', projectName: 'Acme FTO', allocatedHours: 4, spentHours: 9, completedAt: done('2026-09-12') }),
  task({ taskId: 'x3', projectId: 'p2', projectName: 'Beta HML', allocatedHours: 6, spentHours: 5 }),
  task({ taskId: 'x4', projectId: null, projectName: null, allocatedHours: 2, spentHours: 5 }),
];
const rows = breachesByProject(across);
check('the worst project comes first', rows.map(r => r.projectName), ['Acme FTO', 'No project', 'Beta HML']);
check('a project that went over twice says so, on two tasks',
  rows[0].hoursBreaches, { times: 2, things: 2 });
check('and its deadline breaches are counted separately',
  rows[0].deadlineBreaches, { times: 1, things: 1 });
check('the project over-run is the whole project, not a mean of its tasks', rows[0].overrun, 2.42);
check('work with no project is grouped rather than dropped', rows[1].projectId, null);
check('a project that behaved has no breaches', rows[2].hoursBreaches, { times: 0, things: 0 });
check('a task with no estimate is reported as unjudgeable on its own project row',
  breachesByProject([task({ projectId: 'p9', projectName: 'Gamma', allocatedHours: null })])[0].unmeasured, 1);
check('and that project has no over-run to report',
  breachesByProject([task({ projectId: 'p9', projectName: 'Gamma', allocatedHours: null })])[0].overrun, null);
check('nothing delivered produces no rows', breachesByProject([]), []);

// ── KPI 2: the streak ───────────────────────────────────────────────────────
// The AND is the point: on the day AND on the budget. A run counting only punctuality would hide
// exactly the case the whole module exists for — delivered on time, at twice the cost.
check('on the day and on the budget', streakVerdict(task()), 'CLEAN');
check('on the day but over the budget breaks it', streakVerdict(task({ spentHours: 20 })), 'BROKEN');
check('on the budget but past the day breaks it', streakVerdict(task({ completedAt: done('2026-09-12') })), 'BROKEN');
// Missing an allocation does not excuse missing the deadline.
check('judged on the one axis it has', streakVerdict(task({ allocatedHours: null, completedAt: done('2026-09-12') })), 'BROKEN');
check('and passes on the one axis it has', streakVerdict(task({ allocatedHours: null })), 'CLEAN');
// Nothing to be reliable at: neither extends a run nor ends one.
check('no deadline and no allocation is passed over', streakVerdict(task({ allocatedHours: null, dueDate: null })), 'SKIPPED');

const clean = (n: number, day: number) => task({ taskId: `c${n}`, completedAt: done(`2026-09-${String(day).padStart(2, '0')}`), dueDate: due('2026-09-30') });
const brokenOn = (n: number, day: number) => task({ taskId: `k${n}`, completedAt: done(`2026-09-${String(day).padStart(2, '0')}`), dueDate: due('2026-09-01') });

check('a clean run is counted',
  (({ current, longest }) => ({ current, longest }))(computeStreak([clean(1, 2), clean(2, 3), clean(3, 4)])),
  { current: 3, longest: 3 });
// Broken then rebuilt: the run standing NOW is the short one, but the best run is remembered.
check('a run broken and then rebuilt keeps both numbers',
  (({ current, longest }) => ({ current, longest }))(computeStreak([clean(1, 2), clean(2, 3), clean(3, 4), brokenOn(1, 5), clean(4, 6), clean(5, 7)])),
  { current: 2, longest: 3 });
check('the order is the order the work finished in, not the order it arrived in',
  (({ current, longest }) => ({ current, longest }))(computeStreak([clean(5, 7), brokenOn(1, 5), clean(1, 2), clean(4, 6), clean(3, 4), clean(2, 3)])),
  { current: 2, longest: 3 });
check('a live run has nothing to blame',
  computeStreak([brokenOn(1, 2), clean(1, 3), clean(2, 4)]).brokenBy, null);
check('a run that is over names what ended it',
  (b => b && { taskId: b.taskId, reason: b.reason, at: b.at })(computeStreak([clean(1, 2), brokenOn(1, 5)]).brokenBy),
  { taskId: 'k1', reason: 'LATE', at: '2026-09-05' });
check('over on both counts says both',
  computeStreak([task({ taskId: 'z', completedAt: done('2026-09-12'), spentHours: 30 })]).brokenBy?.reason, 'BOTH');
check('over only on hours says so',
  computeStreak([task({ taskId: 'z', spentHours: 30 })]).brokenBy?.reason, 'OVER_HOURS');
check('deliveries nothing could judge are skipped and said to be skipped',
  (({ current, judged, skipped }) => ({ current, judged, skipped }))(
    computeStreak([clean(1, 2), task({ taskId: 's', allocatedHours: null, dueDate: null, completedAt: done('2026-09-03') }), clean(2, 4)])),
  { current: 2, judged: 2, skipped: 1 });
check('a person with no tasks at all has no streak and no blame',
  computeStreak([]), { current: 0, longest: 0, judged: 0, skipped: 0, brokenBy: null });

// ── the project, and its manager ────────────────────────────────────────────
const projectA = summariseProject({
  projectId: 'p1', name: 'Acme FTO', code: 'SQ_26_27_001', roundSeq: 1,
  managerIds: ['u-pm'], projectShifts: 2, taskShifts: 3,
  tasks: [
    task({ taskId: 'a1', priority: 'CRITICAL', allocatedHours: 10, spentHours: 25 }),
    task({ taskId: 'a2', priority: 'LOW', allocatedHours: 10, spentHours: 8 }),
    task({ taskId: 'a3', priority: 'HIGH', allocatedHours: 5, spentHours: 5, completedAt: done('2026-09-14') }),
  ],
});
check('a project counts every shift as a TIME and itself as one THING',
  projectA.deadlineShifts, { times: 5, things: 1 });
check('a project that never slipped reports zero, and not an error',
  summariseProject({ projectId: 'p2', name: 'Quiet', code: null, roundSeq: null, managerIds: [], projectShifts: 0, taskShifts: 0, tasks: [] }).deadlineShifts,
  { times: 0, things: 0 });
check('a project with nothing recorded still has a shape to render',
  (({ overrun, tasksCompleted }) => ({ overrun, tasksCompleted }))(
    summariseProject({ projectId: 'p2', name: 'Quiet', code: null, roundSeq: null, managerIds: [], projectShifts: 0, taskShifts: 0, tasks: [] })),
  { overrun: null, tasksCompleted: 0 });
check('the project over-run is aggregate, across everything in it', projectA.overrun, 1.52);
// The important work is the question that gets asked first: a project can look fine in aggregate
// while every critical task in it doubled.
check('the important work is measured on its own', projectA.importantHours.measured, 2);
check('and shows its own over-run', Math.round((projectA.importantHours.spentHours / projectA.importantHours.allocatedHours) * 100) / 100, 2);
check('the project on-time rate ignores its budget', projectA.deadlines.onTimeRate, 67);

const projectB = summariseProject({
  projectId: 'p3', name: 'Beta HML', code: 'SQ_26_27_002', roundSeq: 1,
  managerIds: ['u-pm', 'u-pm2'], projectShifts: 0, taskShifts: 1,
  tasks: [task({ taskId: 'b1', allocatedHours: 20, spentHours: 18 })],
});
const managers = rollUpManagers([projectA, projectB]);
check('a manager carries every project they run', managers.find(m => m.userId === 'u-pm')?.projects, 2);
check('their portfolio over-run is aggregated, not averaged',
  managers.find(m => m.userId === 'u-pm')?.overrun, 1.24);
check('their shifts count times across projects, and things as projects',
  managers.find(m => m.userId === 'u-pm')?.deadlineShifts, { times: 6, things: 2 });
// Splitting a co-managed project between two people would make each look half responsible for a
// thing they are each wholly responsible for.
check('a co-managed project counts in full for each manager',
  managers.find(m => m.userId === 'u-pm2')?.spentHours, 18);
check('the worst portfolio is listed first', managers[0].userId, 'u-pm');
check('nobody managing anything produces no rows', rollUpManagers([]), []);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ performance KPIs: ${passed}/${passed} passed`);
