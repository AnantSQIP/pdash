/**
 * The order a project's tasks are read in — apps/web/lib/tasks.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/task-order.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * The review asked one question of this list: two tasks at the same priority, which is higher?
 * The answer was the nearer deadline. That single rule is what most of these check, because it
 * is the one a person will notice being wrong — they will look at two MEDIUM tasks, see the
 * later one on top, and stop trusting the order for everything else on the page.
 *
 * A comparator also has to be TOTAL. Two rows that compare equal are free to swap on every
 * render, and a list that reshuffles while you read it is worse than a list in the wrong order.
 */
process.env.TZ = 'Asia/Kolkata';

import { byPriorityThenDeadline, orderedByDeadline, nextUpFirst } from '../apps/web/lib/tasks';
import type { ApiTask } from '../apps/web/lib/api';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

const task = (title: string, priority: string | null, dueDate: string | null, closed = false): ApiTask =>
  ({ id: title, title, priority, dueDate, currentStatus: closed ? { type: 'CLOSED' } : { type: 'OPEN' } } as unknown as ApiTask);

const order = (ts: ApiTask[]) => [...ts].sort(byPriorityThenDeadline).map(t => t.title);

// ── the rule the review actually asked for ───────────────────────────────────
check('same priority: the nearer deadline comes first',
  order([task('later', 'MEDIUM', '2026-10-20'), task('sooner', 'MEDIUM', '2026-09-15')]),
  ['sooner', 'later']);
check('and it holds whichever way round they arrive',
  order([task('sooner', 'MEDIUM', '2026-09-15'), task('later', 'MEDIUM', '2026-10-20')]),
  ['sooner', 'later']);
check('one day apart is still a decision',
  order([task('tue', 'HIGH', '2026-09-15'), task('mon', 'HIGH', '2026-09-14')]),
  ['mon', 'tue']);

// ── priority still outranks the deadline ─────────────────────────────────────
check('a higher priority beats a nearer deadline — the tie-break is only for TIES',
  order([task('medium-today', 'MEDIUM', '2026-09-11'), task('critical-next-month', 'CRITICAL', '2026-10-30')]),
  ['critical-next-month', 'medium-today']);
check('the full priority ladder, highest first',
  order([task('low', 'LOW', null), task('medium', 'MEDIUM', null), task('critical', 'CRITICAL', null), task('high', 'HIGH', null)]),
  ['critical', 'high', 'medium', 'low']);

// ── a missing deadline is not a deadline of today ────────────────────────────
check('no deadline sorts after every dated task of the same priority',
  order([task('undated', 'MEDIUM', null), task('dated', 'MEDIUM', '2026-12-31')]),
  ['dated', 'undated']);
check('two undated tasks fall back to the title, so the order is stable',
  order([task('beta', 'MEDIUM', null), task('alpha', 'MEDIUM', null)]),
  ['alpha', 'beta']);

// ── a missing priority is not the top of the list ────────────────────────────
check('a task with no priority is treated as MEDIUM, not as most urgent',
  order([task('none', null, '2026-09-12'), task('high', 'HIGH', '2026-12-31')]),
  ['high', 'none']);
check('an unrecognised priority also lands at MEDIUM rather than first',
  order([task('bogus', 'URGENT-ISH', '2026-12-31'), task('high', 'HIGH', '2026-12-31')]),
  ['high', 'bogus']);

// ── closed work is not the plan ──────────────────────────────────────────────
check('closed tasks sink below open ones whatever their priority',
  order([task('done-critical', 'CRITICAL', '2026-09-01', true), task('open-low', 'LOW', '2026-12-31')]),
  ['open-low', 'done-critical']);
check('and closed tasks keep the same rule among themselves',
  order([task('done-later', 'MEDIUM', '2026-10-20', true), task('done-sooner', 'MEDIUM', '2026-09-15', true)]),
  ['done-sooner', 'done-later']);

// ── the comparator must be total: equal-looking rows still get an order ──────
check('two tasks alike in every field are ordered by title, never left equal',
  byPriorityThenDeadline(task('b', 'MEDIUM', '2026-09-15'), task('a', 'MEDIUM', '2026-09-15')) > 0,
  true);
check('a task never sorts before itself',
  byPriorityThenDeadline(task('a', 'MEDIUM', '2026-09-15'), task('a', 'MEDIUM', '2026-09-15')),
  0);
check('sorting an already-sorted list changes nothing',
  order(order([task('c', 'LOW', null), task('a', 'HIGH', '2026-09-15'), task('b', 'HIGH', '2026-09-20')])
    .map(t => [task('a', 'HIGH', '2026-09-15'), task('b', 'HIGH', '2026-09-20'), task('c', 'LOW', null)].find(x => x.title === t)!)),
  ['a', 'b', 'c']);

// ── the same date written two ways is the same date ──────────────────────────
check('a date with a time and the same date at midnight do not reorder by accident',
  order([task('zulu', 'MEDIUM', '2026-09-15T00:00:00.000Z'), task('alpha', 'MEDIUM', '2026-09-15T00:00:00.000Z')]),
  ['alpha', 'zulu']);

// ── the personal list keeps its OWN rule, which is different on purpose ──────
// nextUpFirst floats overdue work up; byPriorityThenDeadline deliberately does not, because a
// project plan that reorders itself every time a date slips has stopped being a plan.
const overdue = task('overdue-low', 'LOW', '2020-01-01');
const future = task('future-critical', 'CRITICAL', '2030-01-01');
check('"what do I do next" still puts overdue work first',
  [overdue, future].sort(nextUpFirst).map(t => t.title), ['overdue-low', 'future-critical']);
check('the project list does NOT — priority still leads there',
  order([overdue, future]), ['future-critical', 'overdue-low']);

// ── the cue the list shows to explain itself ─────────────────────────────────
check('a row explains itself when only the deadline separated it from the row above',
  orderedByDeadline(task('later', 'MEDIUM', '2026-10-20'), task('sooner', 'MEDIUM', '2026-09-15')), true);
check('it stays quiet when the priority is what separated them',
  orderedByDeadline(task('medium', 'MEDIUM', '2026-09-15'), task('high', 'HIGH', '2026-10-20')), false);
check('it stays quiet on the first row, which has nothing above it',
  orderedByDeadline(task('first', 'MEDIUM', '2026-09-15'), undefined), false);
check('it stays quiet when either task has no deadline to compare',
  orderedByDeadline(task('undated', 'MEDIUM', null), task('dated', 'MEDIUM', '2026-09-15')), false);
check('it stays quiet across the open/closed boundary',
  orderedByDeadline(task('closed', 'MEDIUM', '2026-10-20', true), task('open', 'MEDIUM', '2026-09-15')), false);

// ── a real project list, the shape this was written for ─────────────────────
check('a mixed list reads exactly as the rule describes',
  order([
    task('draft claims',      'MEDIUM',   '2026-09-30'),
    task('prior-art sweep',   'MEDIUM',   '2026-09-18'),
    task('client call notes', 'LOW',      '2026-09-12'),
    task('office action',     'CRITICAL', '2026-10-05'),
    task('filing check',      'HIGH',     '2026-09-25'),
    task('archive old files', 'LOW',      null),
    task('kickoff deck',      'MEDIUM',   '2026-09-18', true),
  ]),
  ['office action', 'filing check', 'prior-art sweep', 'draft claims', 'client call notes', 'archive old files', 'kickoff deck']);

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed, ${failures.length} failed\n`);
failures.forEach(f => console.error('  ✗ ' + f + '\n'));
process.exit(failures.length ? 1 : 0);
