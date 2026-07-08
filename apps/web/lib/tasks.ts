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
