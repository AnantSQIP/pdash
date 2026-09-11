/**
 * The order in which a project's or a task's rows are destroyed — child before parent, always.
 *
 * WHY THIS IS A LIST AND NOT A SEQUENCE OF CALLS
 *
 * A permanent delete is the one operation in this system with no undo and nothing to restore
 * from. It therefore has to be right on the first attempt, and it has to STAY right as the
 * schema grows. The failure mode is not a crash — a missing table leaves orphan rows behind
 * (a timesheet whose project silently became null lands in the "assign a PID later" buffer and
 * gets chased for a PID it can never have), or the delete throws half way and the transaction
 * rolls back, which at least fails loudly.
 *
 * Naming the order here, separately from the code that runs it, is what lets
 * `tools/purge-order.spec.ts` read `schema.prisma` and prove two things: every model with a
 * foreign key into Task or Project appears in the right list, and every child appears before its
 * parent. Add a table next month and forget it, and that test fails by name rather than the
 * purge quietly leaving rows behind.
 *
 * The names are Prisma client property names, so the service can key its delete functions off
 * them and TypeScript refuses to compile if the two ever disagree.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 *   · AuditLog — the whole point. `AuditLog.entityId` is a plain String with no foreign key
 *     precisely so the record of a destruction outlives the thing destroyed.
 *   · PidReservation — the PID ledger is the authority on which serials have ever existed; a
 *     purged project's serial must never be reused, so the reservation is retired, not removed.
 *   · TaskStandard — holds no row per task, only a learned average. The task's contribution is
 *     withdrawn by name before the purge runs (see PurgeService).
 */

/**
 * A TASK and everything hanging off it.
 *
 * Ordering notes for the non-obvious entries:
 *   · subtaskAssignee before subtask — it hangs off the subtask, not the task.
 *   · timesheet before task — Timesheet.taskId cascades, but the hours have to go explicitly so
 *     they are COUNTED in the audit record. "How much logged time did this destroy" is the first
 *     question anyone asks afterwards.
 *   · the polymorphic tail (approval, comment, customFieldValue, searchIndex, analyticsEvent,
 *     activity, deadlineChange, notification) has no foreign key at all, so nothing in the
 *     database would ever clean it up. It is only removed because it is named here.
 */
export const TASK_PURGE_ORDER = [
  'subtaskAssignee',
  'subtask',
  'checklist',
  'taskDependency',
  'taskAssignee',
  'taskCoverage',
  'taskDocument',
  'taskWorkSession',
  'timesheet',
  'teamTask',
  'projectTask',
  'approvalAction',
  'approval',
  'commentAttachment',
  'comment',
  'customFieldValue',
  'searchIndex',
  'analyticsEvent',
  'activity',
  'deadlineChange',
  'notification',
  'task',
] as const;

/**
 * A PROJECT and everything hanging off it, run AFTER each of its exclusive tasks has been put
 * through TASK_PURGE_ORDER.
 *
 * Ordering notes:
 *   · timesheet first — it points at BOTH the project (SetNull, so it would otherwise survive
 *     as an unattributed entry) and at issues (Cascade). It has to precede both.
 *   · projectTask before taskList — the link carries a taskListId.
 *   · taskList before project. Any task still linked here is one shared with another live
 *     project; the LINK goes, the task stays.
 */
export const PROJECT_PURGE_ORDER = [
  'timesheet',
  'issue',
  'projectTask',
  'taskList',
  'projectDocument',
  'projectMember',
  'projectDepartment',
  'projectTeam',
  'projectPatent',
  'pidRequest',
  'approvalAction',
  'approval',
  'commentAttachment',
  'comment',
  'customFieldValue',
  'searchIndex',
  'analyticsEvent',
  'activity',
  'deadlineChange',
  'notification',
  'project',
] as const;

export type TaskPurgeModel = (typeof TASK_PURGE_ORDER)[number];
export type ProjectPurgeModel = (typeof PROJECT_PURGE_ORDER)[number];
