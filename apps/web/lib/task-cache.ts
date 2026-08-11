import type { QueryClient } from '@tanstack/react-query';

/**
 * Single source of truth for "a task changed, what else is now wrong on screen?"
 *
 * The same task is rendered from SEVERAL independent caches — My Tasks (`tasks-me`),
 * the project's Task List (`task-groups`), the project header's progress (`project`,
 * `projects`, `project-rounds`), the capacity board, and the performance panel. Each
 * mutation site used to invalidate only the cache it happened to be looking at, so a
 * status changed in My Tasks stayed stale in the project view (and vice versa) until
 * its staleTime expired — the task appeared to have two different statuses at once.
 *
 * Progress is recomputed server-side from children on every task mutation, so a task
 * change moves project and round percentages too — those caches must go with it.
 *
 * Mirrors the `homeKeys` / `PUNCH_INVALIDATES` pattern in components/home/keys.ts,
 * which exists for exactly this class of bug.
 *
 * Prefixes only: React Query matches by array prefix, so 'project' also clears
 * ['project', id] without touching ['project-rounds', id] (different first element).
 */
export const TASK_INVALIDATES = [
  'tasks-me',        // My Tasks list + the Home "My Tasks" card
  'task-groups',     // project → Task List tab
  'project-tasks',   // project task fetches
  'tasks',           // per-project task lists
  'project',         // project detail: completion %, hours
  'projects',        // project list cards: progress
  'project-rounds',  // round cards under a PID
  'perf-user-tasks', // performance panel task breakdown
  'capacity',        // capacity board: who is loaded
  'analytics-dashboard', // Home stats (open/overdue counts)
  'activity',        // activity feed entries
] as const;

/**
 * Invalidate every cache that renders task state. Call after ANY task or subtask
 * mutation — create, update, status change, staffing, assignees, delete.
 */
export function invalidateTaskCaches(qc: QueryClient) {
  for (const key of TASK_INVALIDATES) qc.invalidateQueries({ queryKey: [key] });
}
