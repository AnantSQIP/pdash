/**
 * Tests for how free a person really is — apps/api/src/modules/capacity/availability.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","experimentalDecorators":true}' tools/availability.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because of one sentence from the owner: "if I see client-wise a person has some
 * free hours in a week but he is working on some other project as well, that must be shown there
 * too, so the person doesn't end up getting another task just because the person allocating saw
 * free hours he doesn't actually have."
 *
 * Every case below is that sentence taken apart: a day that belongs to somebody else must not
 * read as an empty one, a client nobody is allowed to open must still be counted, and an
 * assignment that will not fit must say so before it is made rather than after.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  apply, canName, previewSeat, redact, type Visibility,
} from '../apps/api/src/modules/capacity/availability';
import type { CapacityDay, CapacityRow } from '../apps/api/src/modules/capacity/capacity.module';

let passed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

// ── a board to test against ──────────────────────────────────────────────────
//
// Monday 2026-09-21 through Sunday 2026-09-27, so a weekend is in the window and the weekday
// arithmetic has to step over it.
const MON = '2026-09-21', TUE = '2026-09-22', WED = '2026-09-23', THU = '2026-09-24', FRI = '2026-09-25';
const SAT = '2026-09-26', SUN = '2026-09-27';

type TaskSpec = {
  id: string; projectId?: string; project?: string; pid?: string | null; team?: boolean;
};

function task(spec: TaskSpec): CapacityRow['openTasks'][number] {
  return {
    id: spec.id,
    title: `${spec.id} work`,
    projectId: spec.projectId,
    project: spec.project,
    projectPid: spec.pid ?? null,
    isTeamWork: !!spec.team,
    ownDeadline: false,
    scheduled: true,
    priority: 'MEDIUM',
    completionPercentage: 0,
    estimatedHours: 8,
    loggedHours: 0,
    overEstimate: false,
    remainingHours: 8,
    overdue: false,
  };
}

/**
 * One day. `cap` is what CapacityService already worked out from the work-week, the holidays and
 * the person's leave — 8 for a whole day, 4 for a half day of leave, 0 for a weekend, a holiday
 * or a full day off. Nothing in availability.ts re-derives it; these tests hand it the answer.
 */
function day(date: string, cap: number, hours: Record<string, number> = {}, state: CapacityDay['state'] = 'FREE', note?: string): CapacityDay {
  const tasks = Object.entries(hours).map(([taskId, h]) => ({ taskId, hours: h }));
  const load = tasks.reduce((s, t) => s + t.hours, 0);
  return {
    date, state, capacity: cap, load,
    utilization: cap > 0 ? load / cap : 0,
    free: Math.max(0, cap - load),
    ...(cap > 0 ? { tasks } : {}),
    ...(note ? { note } : {}),
  };
}

function row(over: Partial<CapacityRow> = {}): CapacityRow {
  return {
    userId: 'u1', name: 'Ankit Verma', days: [], openTasks: [],
    freeHours: 0, committedHours: 0, overCommittedHours: 0, capacityHours: 0, utilization: 0,
    nextFreeDate: null, freeRunDays: 0, availableNow: false, overdueCount: 0,
    ...over,
  };
}

const ACME = 'p-acme', BELLCO = 'p-bell';
const seeAll: Visibility = { all: true, ids: new Set() };
const seeBellcoOnly: Visibility = { all: false, ids: new Set([BELLCO]) };

// ── 1. A person loaded by ANOTHER client shows no free hours here ────────────
//
// Ankit's week is eight hours a day on Acme. Somebody opens Bellco's Capacity tab. Every one of
// those days has to arrive carrying eight hours of load — as `otherHours`, since Bellco is the
// client in focus — or the tab draws five empty days and the next task lands on him.
{
  const acme = task({ id: 't-acme', projectId: ACME, project: 'Acme Corp', pid: 'SQ_26_27_001' });
  const r = row({
    openTasks: [acme],
    days: [
      day(MON, 8, { 't-acme': 8 }, 'BUSY'), day(TUE, 8, { 't-acme': 8 }, 'BUSY'),
      day(WED, 8, { 't-acme': 8 }, 'BUSY'), day(THU, 8, { 't-acme': 8 }, 'BUSY'),
      day(FRI, 8, { 't-acme': 8 }, 'BUSY'), day(SAT, 0, {}, 'WEEKEND'), day(SUN, 0, {}, 'WEEKEND'),
    ],
  });
  apply([r], BELLCO);
  check('viewed from another client, a full day is 8h of OTHER work, not 8h of room', r.days[0].otherHours, 8);
  check('…and none of it belongs to the client being looked at', r.days[0].focusHours, 0);
  check('the window totals say the same thing', [r.focusHours, r.otherHours], [0, 40]);
  check('the weekend carries nothing either way', [r.days[5].focusHours, r.days[5].otherHours], [0, 0]);

  const p = previewSeat(r, { userId: 'u1', hours: 4, startDate: MON, dueDate: FRI }, { planFrom: MON, windowEnd: SUN, focusProjectId: BELLCO });
  check('a person booked solid on another client has 0h free here', p.freeHours, 0);
  check('…so four more hours are four hours over', p.overHours, 4);
  check('…and that is a warning, not a shrug', p.verdict, 'OVER');
  check('…naming where the hours went', p.otherClients.map(c => [c.label, c.hours]), [['Acme Corp', 40]]);
}

// ── 2. The same week seen from ACME ──────────────────────────────────────────
//
// Nothing about the person changed; only who is asking. Their own client's hours are `focusHours`
// and the tab can pin them, which is the other half of the requirement: the per-client view still
// has to be useful.
{
  const acme = task({ id: 't-acme', projectId: ACME, project: 'Acme Corp', pid: 'SQ_26_27_001' });
  const r = row({ openTasks: [acme], days: [day(MON, 8, { 't-acme': 6 }), day(TUE, 8, { 't-acme': 2 })] });
  apply([r], ACME);
  check('this client\'s own share is what the tab highlights', [r.focusHours, r.otherHours], [8, 0]);
  check('and the day rows agree', [r.days[0].focusHours, r.days[1].focusHours], [6, 2]);
}

// ── 3. Leave, holidays and half days come from the board, never from here ────
//
// A half day of leave is four real working hours. A full day and a holiday are none. The only
// thing availability.ts may do with them is respect them — so an assignment across a week with a
// holiday and a half day in it has to fit into what is genuinely left.
{
  const r = row({
    days: [
      day(MON, 8),                                            // ordinary day
      day(TUE, 0, {}, 'HOLIDAY', 'Gandhi Jayanti'),           // firm holiday
      day(WED, 4, {}, 'FREE', 'CASUAL leave (half day)'),     // half day of leave
      day(THU, 0, {}, 'LEAVE', 'CASUAL leave'),               // full day of leave
      day(FRI, 8),
      day(SAT, 0, {}, 'WEEKEND'), day(SUN, 0, {}, 'WEEKEND'),
    ],
  });
  const p = previewSeat(r, { userId: 'u1', hours: 20, startDate: MON, dueDate: SUN }, { planFrom: MON, windowEnd: SUN });
  check('the week really holds 8 + 4 + 8 hours', p.capacityHours, 20);
  check('all of it free, so 20h exactly fits', [p.freeHours, p.overHours], [20, 0]);
  check('…and the days it lands on are the three workable ones', p.days.map(d => [d.date, d.add]), [[MON, 8], [WED, 4], [FRI, 8]]);
  check('the holiday and the full leave day are not offered at all', p.days.some(d => d.date === TUE || d.date === THU), false);

  const tooMuch = previewSeat(r, { userId: 'u1', hours: 24, startDate: MON, dueDate: SUN }, { planFrom: MON, windowEnd: SUN });
  check('four hours more than the week holds is four hours over', tooMuch.overHours, 4);
  check('…on the last day it could have gone', tooMuch.overDays, [FRI]);
}

// ── 4. A client the viewer may not open is counted, never named ──────────────
{
  const acme = task({ id: 't-acme', projectId: ACME, project: 'Acme Corp', pid: 'SQ_26_27_001' });
  const bell = task({ id: 't-bell', projectId: BELLCO, project: 'Bellco Ltd', pid: 'SQ_26_27_002' });
  const r = row({
    openTasks: [acme, bell],
    days: [day(MON, 8, { 't-acme': 5, 't-bell': 3 }, 'BUSY')],
  });
  check('an oversight lead may name every client', canName(seeAll, ACME), true);
  check('a member may name their own', canName(seeBellcoOnly, BELLCO), true);
  check('…and not somebody else\'s', canName(seeBellcoOnly, ACME), false);

  redact([r], seeBellcoOnly);
  apply([r], BELLCO);
  check('the hidden client\'s hours survive redaction', r.days[0].otherHours, 5);
  check('…flagged as hours this viewer may not place', r.days[0].restrictedHours, 5);
  check('…and its name does not', [r.openTasks[0].project, r.openTasks[0].title, r.openTasks[0].projectPid], ['Other work', 'Other work', null]);
  check(
    'the breakdown rolls the hidden one up under a single anonymous heading, largest first',
    r.byClient!.map(c => [c.label, c.hours, c.restricted]),
    [['Other work', 5, true], ['Bellco Ltd', 3, false]],
  );
}

// ── 5. Editing an existing task does not double-count its own hours ──────────
{
  const mine = task({ id: 't-mine', projectId: ACME, project: 'Acme Corp' });
  const r = row({ openTasks: [mine], days: [day(MON, 8, { 't-mine': 8 }, 'BUSY')] });
  const naive = previewSeat(r, { userId: 'u1', hours: 8, startDate: MON, dueDate: MON }, { planFrom: MON, windowEnd: MON });
  check('re-saving the same 8h WITHOUT excluding the task reads as an overload', naive.overHours, 8);
  const honest = previewSeat(r, { userId: 'u1', hours: 8, startDate: MON, dueDate: MON }, { planFrom: MON, windowEnd: MON, excludeTaskId: 't-mine' });
  check('excluding it puts the day back where it was', [honest.committedHours, honest.freeHours, honest.overHours], [0, 8, 0]);
  check('…and the verdict is that it fits, just', honest.verdict, 'TIGHT');
}

// ── 6. The daily ceiling and the deadline both bind ──────────────────────────
{
  const r = row({ days: [day(MON, 8), day(TUE, 8), day(WED, 8), day(THU, 8), day(FRI, 8)] });
  const capped = previewSeat(r, { userId: 'u1', hours: 8, startDate: MON, dueDate: FRI, hoursPerDay: 2 }, { planFrom: MON, windowEnd: FRI });
  check('two hours a day spreads eight hours over four days', capped.days.filter(d => d.add > 0).map(d => [d.date, d.add]), [[MON, 2], [TUE, 2], [WED, 2], [THU, 2]]);
  check('…and nothing goes over', capped.overHours, 0);

  const squeezed = previewSeat(r, { userId: 'u1', hours: 20, startDate: MON, dueDate: TUE }, { planFrom: MON, windowEnd: FRI });
  check('a two-day deadline for twenty hours is four hours over', squeezed.overHours, 4);
  check('…piled onto the last day it could use', squeezed.overDays, [TUE]);

  const backdated = previewSeat(r, { userId: 'u1', hours: 8, startDate: '2026-09-01', dueDate: FRI }, { planFrom: WED, windowEnd: FRI });
  check('a start before today plans what is LEFT, from today', backdated.from, WED);
}

// ── 7. An overload that is already there is not one this assignment caused ───
//
// The staffing form opens with the client's manager in the PM seat carrying no hours. If a day of
// theirs is already over — as a busy partner's usually is — saying "this puts them 0.7h over"
// about a seat that adds nothing blocks a save that changes nothing, and a warning that fires on
// every form is a warning nobody reads.
{
  const other = task({ id: 't-other', projectId: BELLCO, project: 'Bellco Ltd' });
  const r = row({ openTasks: [other], days: [day(MON, 8, { 't-other': 9 }, 'BUSY'), day(TUE, 8)] });
  const naming = previewSeat(r, { userId: 'u1', hours: 0, startDate: MON, dueDate: TUE }, { planFrom: MON, windowEnd: TUE });
  check('naming somebody without costing them warns about nothing', [naming.overHours, naming.verdict], [0, 'FITS']);
  check('…while still saying they are already over', naming.alreadyOverHours, 1);
  check('…in words', naming.message.includes('already 1h over'), true);

  const adding = previewSeat(r, { userId: 'u1', hours: 10, startDate: MON, dueDate: TUE }, { planFrom: MON, windowEnd: TUE });
  check('hours that really do not fit are still reported', adding.verdict, 'OVER');
  check('…counting only what THIS assignment adds beyond the day', adding.overHours, 2);
}

// ── 8. Nowhere to put it ─────────────────────────────────────────────────────
{
  const r = row({ days: [day(SAT, 0, {}, 'WEEKEND'), day(SUN, 0, {}, 'WEEKEND')] });
  const p = previewSeat(r, { userId: 'u1', hours: 4, startDate: SAT, dueDate: SUN }, { planFrom: SAT, windowEnd: SUN });
  check('a weekend-only span has no working days', p.verdict, 'NO_ROOM');
  check('…and says so in words', p.message.includes('no working days'), true);
}

// ── 9. Team-space work is load too ───────────────────────────────────────────
{
  const team = task({ id: 't-team', projectId: 'team-1', project: 'Marketing', team: true });
  const r = row({ openTasks: [team], days: [day(MON, 8, { 't-team': 6 }, 'BUSY')] });
  redact([r], seeBellcoOnly);
  apply([r], BELLCO);
  check('internal work is never anonymised — it names no client', r.openTasks[0].project, 'Marketing');
  check('…and it still fills the day', r.days[0].otherHours, 6);
}

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ availability: ${passed}/${passed} passed`);
