import { Prisma } from '@prisma/client';
import type { WorkspaceFlow } from './decorators/require-flow.decorator';

/**
 * KEEPING THE TWO FLOWS' WORK APART (docs/WORKSPACE_FLOWS.md).
 *
 * One organisation, one `project` table, two flows — and the owner's rule: "I don't want the
 * clients and projects data to collide, keep those data separate." So a project/client row carries
 * the flow it was made in (`project.workspaceFlow`) and every flow-scoped read filters on it. In
 * CLIENTS the firm sees the clients it has always seen; switch to PROJECTS and the Projects module
 * is empty, ready to be built in; switch back and the client work is there, untouched. Switching
 * HIDES a flow's work — it never converts it.
 *
 * WHAT HANGS OFF A PROJECT, AND THEREFORE FOLLOWS IT
 *
 *   task          through `project_task` (a task may also be a TEAM task, or both)
 *   task list     through `task_list.projectId` (a list with a `teamId` is a team space's)
 *   timesheet     through `timesheet.projectId` and/or `timesheet.taskId`
 *   staffing      through `task_assignee.taskId` → the task's project
 *   work session  through `task_work_session.taskId` → the task's project
 *   the registry  through `pid_reservation.projectId` / `cid_event.projectId`
 *
 * None of them carries its own copy of the flow: the project row is the ONE writer of that fact,
 * so a row can never disagree with the project it belongs to. These helpers are how that
 * following is written down — explicitly, at every read — rather than assumed.
 *
 * WHAT IS SHARED AND MUST STAY SHARED
 *
 *   people, roles and permissions, attendance, leave, holidays, expenses, teams and team spaces
 *   (a team task has no project, so it is every flow's), channels, announcements, policies,
 *   appraisals, feedback. None of it is filtered here.
 *
 * THE SHAPE OF THE RULE. A row is EXCLUDED when the work it belongs to is the OTHER flow's; a row
 * attached to no project at all (a team task, a day of leave logged against nothing) belongs to
 * neither flow and is shown in both. Written as "none of its projects is the other flow's", which
 * is true for a row with no project — that is the shared case, spelled out rather than special-cased.
 *
 * INVISIBLE TO USERS. Nobody outside Settings → Workspace flow knows the flows exist. These
 * filters shape what a screen is given; they never add a word to it. `workspaceFlow` is not in any
 * response a screen reads, there is no badge, column, filter or export heading for it, and an
 * empty Projects module says "No projects yet", not "nothing in this flow".
 */

export const otherFlow = (flow: WorkspaceFlow): WorkspaceFlow => (flow === 'CLIENTS' ? 'PROJECTS' : 'CLIENTS');

/** Projects/clients of this flow. `where: { ...projectInFlow(flow), deletedAt: null }` */
export function projectInFlow(flow: WorkspaceFlow): { workspaceFlow: WorkspaceFlow } {
  return { workspaceFlow: flow };
}

/**
 * Tasks of this flow: every task except one filed in the OTHER flow's work. A task with no project
 * — a team space's task, or one that lost its project — is shared, and this admits it.
 */
export function taskInFlow(flow: WorkspaceFlow): Prisma.TaskWhereInput {
  return { projectTasks: { none: { project: { workspaceFlow: otherFlow(flow) } } } };
}

/** Task lists of this flow; a team space's list (no projectId) is shared. */
export function taskListInFlow(flow: WorkspaceFlow): Prisma.TaskListWhereInput {
  return { OR: [{ projectId: null }, { project: { workspaceFlow: flow } }] };
}

/**
 * Time entries of this flow: the project it was logged against is this flow's (or there is none),
 * and so is the task. Both are checked — a timesheet can name a task without naming its project.
 */
export function timesheetInFlow(flow: WorkspaceFlow): Prisma.TimesheetWhereInput {
  return {
    AND: [
      { OR: [{ projectId: null }, { project: { workspaceFlow: flow } }] },
      { OR: [{ taskId: null }, { task: taskInFlow(flow) }] },
    ],
  };
}

/** Staffing rows (seats on a task) of this flow. */
export function taskAssigneeInFlow(flow: WorkspaceFlow): Prisma.TaskAssigneeWhereInput {
  return { task: taskInFlow(flow) };
}

/** Clocks of this flow. */
export function workSessionInFlow(flow: WorkspaceFlow): Prisma.TaskWorkSessionWhereInput {
  return { task: taskInFlow(flow) };
}

// ── The same rules in SQL, for the reads that are raw ────────────────────────────────────────────

/** `p."workspaceFlow" = 'CLIENTS'` for a project aliased `alias`. */
export function projectFlowSql(flow: WorkspaceFlow, alias = 'p'): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`"${alias}"."workspaceFlow"`)} = ${flow}`;
}

/**
 * `t."id"` is not filed in the other flow's work — the SQL of taskInFlow(), for a task aliased
 * `alias`. True for a team task and for a task with no project, exactly as the Prisma form is.
 */
export function taskFlowSql(flow: WorkspaceFlow, alias = 't'): Prisma.Sql {
  const id = Prisma.raw(`"${alias}"."id"`);
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "project_task" pt_f JOIN "project" p_f ON p_f."id" = pt_f."projectId"
     WHERE pt_f."taskId" = ${id} AND p_f."workspaceFlow" = ${otherFlow(flow)})`;
}

/** The SQL of timesheetInFlow(), for a timesheet aliased `alias`. */
export function timesheetFlowSql(flow: WorkspaceFlow, alias = 'ts'): Prisma.Sql {
  const projectId = Prisma.raw(`"${alias}"."projectId"`);
  const taskId = Prisma.raw(`"${alias}"."taskId"`);
  return Prisma.sql`(
    (${projectId} IS NULL
      OR EXISTS (SELECT 1 FROM "project" p_f WHERE p_f."id" = ${projectId} AND p_f."workspaceFlow" = ${flow}))
    AND (${taskId} IS NULL
      OR NOT EXISTS (SELECT 1 FROM "project_task" pt_f JOIN "project" p_f2 ON p_f2."id" = pt_f."projectId"
                      WHERE pt_f."taskId" = ${taskId} AND p_f2."workspaceFlow" = ${otherFlow(flow)})))`;
}
