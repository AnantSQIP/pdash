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
