// Canonical task helpers — the single source of truth for task completion and
// assignee normalization. Keep these tiny and dependency-free so every view
// (list, table, board, panel) agrees on the same rules.

import type { ApiTask } from './api';

export const OPEN_TYPE = 'OPEN';
export const CLOSED_TYPE = 'CLOSED';

/** Preset progress values for the inline quick-set controls (list & table). */
export const PROGRESS_STEPS = [0, 25, 50, 75, 100];

/** Preset steps, plus the task's exact current value so it always displays. */
export const progressOptions = (current: number): number[] =>
  PROGRESS_STEPS.includes(current) ? PROGRESS_STEPS : [...PROGRESS_STEPS, current].sort((a, b) => a - b);

/**
 * A task is complete IFF its workflow status is CLOSED. This is the one true
 * rule — do NOT also treat `completionPercentage === 100` as done: a task can
 * legitimately sit at 100% while still Open (and a Closed task is always 100%).
 * Mixing the two definitions is what made the board, list and table disagree.
 */
export function isTaskClosed(task: Pick<ApiTask, 'currentStatus'> | null | undefined): boolean {
  return task?.currentStatus?.type === CLOSED_TYPE;
}

export type AssigneeUser = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  profilePhoto?: string | null;
};

/** Flat list of the user objects a task is assigned to (handles the API shape). */
export function taskAssigneeUsers(task: Pick<ApiTask, 'assignees'> | null | undefined): AssigneeUser[] {
  return (task?.assignees ?? []).map(a => a.user).filter(Boolean) as AssigneeUser[];
}

/** IDs of a task's current assignees, de-duplicated. */
export function taskAssigneeIds(task: Pick<ApiTask, 'assignees'> | null | undefined): string[] {
  const ids = (task?.assignees ?? [])
    .map(a => a.user?.id ?? (a as { userId?: string }).userId)
    .filter(Boolean) as string[];
  return [...new Set(ids)];
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Past its due date, in whole days, ignoring the time of day. */
function pastDue(due?: string | null): boolean {
  if (!due) return false;
  const d = new Date(due);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

/**
 * What to do next, in order.
 *
 * The home card showed whatever order the API happened to return and then took the first
 * six, so somebody's morning could open on a task closed last week while a critical one sat
 * below the fold. This is the order the question actually has:
 *
 *   1. closed work last — it is not what to do next
 *   2. overdue first — a missed date is the most urgent fact about a task, and it outranks
 *      priority: a LOW task three days late needs attention before a MEDIUM due next month
 *   3. then priority
 *   4. then the soonest deadline, so equal-priority work is ordered by what runs out first
 *   5. dateless tasks after dated ones — no deadline is not the same as a deadline today
 */
export function nextUpFirst(a: ApiTask, b: ApiTask): number {
  const closed = (t: ApiTask) => (t.currentStatus?.type === CLOSED_TYPE ? 1 : 0);
  if (closed(a) !== closed(b)) return closed(a) - closed(b);

  const overdue = (t: ApiTask) => (t.currentStatus?.type !== CLOSED_TYPE && pastDue(t.dueDate) ? 0 : 1);
  if (overdue(a) !== overdue(b)) return overdue(a) - overdue(b);

  const rank = (t: ApiTask) => PRIORITY_RANK[t.priority ?? 'MEDIUM'] ?? 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);

  const due = (t: ApiTask) => (t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY);
  if (due(a) !== due(b)) return due(a) - due(b);

  return (a.title ?? '').localeCompare(b.title ?? '');
}

/**
 * A PROJECT's task list, in the order the work should be read.
 *
 * `nextUpFirst` above answers "what do I do next", so it floats overdue work to the top —
 * right for a personal list, wrong for a project, where a plan that reorders itself every
 * time a date slips stops being a plan.
 *
 * The review asked one specific question of this order: when two tasks carry the SAME
 * priority, which is higher? The answer given was the one whose deadline is nearest. That is
 * rule 3 below, and it is the reason this comparator exists rather than the list rendering in
 * whatever order the API returned — which was creation order, so two equal-priority tasks sat
 * in the order somebody happened to type them.
 *
 *   1. open before closed — finished work is not the plan
 *   2. priority, highest first
 *   3. SAME PRIORITY → the nearest deadline is the higher priority
 *   4. a task with no deadline sorts after every dated one — no date is not "due today"
 *   5. title, so the order is total and never shuffles between renders
 */
export function byPriorityThenDeadline(a: ApiTask, b: ApiTask): number {
  const closed = (t: ApiTask) => (isTaskClosed(t) ? 1 : 0);
  if (closed(a) !== closed(b)) return closed(a) - closed(b);

  const rank = (t: ApiTask) => PRIORITY_RANK[t.priority ?? 'MEDIUM'] ?? 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);

  const due = (t: ApiTask) => (t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY);
  if (due(a) !== due(b)) return due(a) - due(b);

  return (a.title ?? '').localeCompare(b.title ?? '');
}

/**
 * True when this task outranks the one above it ONLY because its deadline is nearer — same
 * priority, earlier date.
 *
 * The rule is invisible otherwise: two MEDIUM tasks in a list look arbitrarily ordered, which
 * is exactly the confusion the review raised. The list uses this to explain itself on the one
 * row where the explanation is needed, instead of annotating every row with a rule that
 * usually did not apply.
 */
export function orderedByDeadline(task: ApiTask, previous: ApiTask | undefined): boolean {
  if (!previous) return false;
  if (isTaskClosed(task) !== isTaskClosed(previous)) return false;
  const rank = (t: ApiTask) => PRIORITY_RANK[t.priority ?? 'MEDIUM'] ?? 2;
  if (rank(task) !== rank(previous)) return false;
  return !!previous.dueDate && !!task.dueDate;
}
