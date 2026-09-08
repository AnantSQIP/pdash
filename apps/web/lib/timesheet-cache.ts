import type { QueryClient } from '@tanstack/react-query';
import { TASK_INVALIDATES } from './task-cache';

/**
 * "A timesheet row changed — what else on screen is now wrong?"
 *
 * The ledger is read from more places than the Timesheets page: My Tasks shows each task's
 * logged hours (Task.actualHours IS the ledger sum), the Team Capacity board subtracts logged
 * hours from a person's remaining effort, the Home cards and Performance count hours, and the
 * retrospective capacity view infers "present" from a logged day. Each mutation site used to
 * invalidate only the caches it happened to be looking at — logging from the Timesheets page
 * left My Tasks and the board stale until their staleTime expired.
 *
 * Prefixes only: React Query matches by array prefix.
 */
export const TIMESHEET_INVALIDATES = [
  'timesheets-mine',      // /timesheets — my entries
  'ts-calendar',          // the fill calendar (hours per day)
  'timesheets',           // per-project Timesheets tab
  'ts-backdates-mine',    // backfill approvals (an entry in a locked window)
  'ts-backdates-pending',
  'running-timer',        // the My Tasks clock
  'closing-summary',      // the close dialog's "already logged" hint
  'capacity-history',     // the past-30-days board infers presence from logged days
  'coverage-risks',       // remaining hours on at-risk tasks
  'perf-me',              // performance: hours logged
  ...TASK_INVALIDATES,    // tasks-me, task lists, project progress, capacity, analytics, activity
] as const;

/** Invalidate every cache that renders the ledger. Call after ANY timesheet create/update/delete/assign. */
export function invalidateTimesheetCaches(qc: QueryClient) {
  for (const key of new Set<string>(TIMESHEET_INVALIDATES)) qc.invalidateQueries({ queryKey: [key] });
}
