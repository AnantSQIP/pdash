import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { TaskTimeService } from '../tasks/task-time.service';
import { getActorId } from '../../common/context/request-context';
import {
  PROJECT_PURGE_ORDER, TASK_PURGE_ORDER,
  type ProjectPurgeModel, type TaskPurgeModel,
} from './purge-order';

/** How many rows each table gave up, for the audit record. Empty tables are left out. */
export type PurgeCounts = Record<string, number>;

type Tx = Prisma.TransactionClient;

/**
 * Prisma's default interactive-transaction budget is 5 seconds, which is fine for an ordinary
 * edit and not for this: a long-running matter carries hundreds of timesheet rows and thousands
 * of activity rows, and the transaction covers ALL of them plus the tombstone. Timing out
 * half way is safe (everything rolls back) but leaves the owner with a project he cannot get
 * rid of — precisely the dead end this feature exists to remove. The purge is rare, deliberate
 * and already behind a passcode, so a generous window costs nothing.
 */
const PURGE_TX = { maxWait: 15_000, timeout: 120_000 };

/**
 * PERMANENT deletion of a project or a task — the operation that replaces the owner opening
 * the database by hand.
 *
 * Everything about this is built around one fact: there is no undo and nothing in the app to
 * restore from. So:
 *
 *   1. IT REFUSES TO RUN ON LIVE WORK. A project or task must already be soft-deleted
 *      (`deletedAt` set) before it can be destroyed. This is a server rule, not a UI one, for
 *      the obvious reason — a confirmation dialog is bypassed by anyone who can call the API,
 *      and a mis-click on a live matter must not be able to destroy it whatever the caller is.
 *      Delete-then-purge also gives the natural cooling-off period: the thing sits in Admin →
 *      Data, visible and restorable, until somebody deliberately comes back for it.
 *   2. IT REQUIRES THE TITLE TYPED BACK. Also server-side, for the same reason. Typing
 *      "Reverse Engineering - Malikie" is the difference between destroying the project you
 *      meant and the one above it in the list.
 *   3. IT IS ONE TRANSACTION. A half-purged project is worse than either outcome: rows that
 *      reference nothing, screens that half-render, and no way to tell what is missing.
 *   4. IT LEAVES A RECORD THAT OUTLIVES IT. AuditLog.entityId is a plain String with no foreign
 *      key, so the row survives its subject. It carries the title, the PID, and a count of every
 *      child type destroyed — enough to answer "what was destroyed, by whom, when" next year,
 *      when the thing itself is gone and the only evidence is that row.
 */
@Injectable()
export class PurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly time: TaskTimeService,
  ) {}

  // ── Soft-deleted inventory (the Admin → Data screen) ───────────────────────

  /**
   * Everything currently in the bin. Projects and tasks with `deletedAt` set — the only things
   * a permanent delete can be pointed at, so this list IS the screen.
   */
  async listDeleted() {
    const [projects, tasks] = await Promise.all([
      this.prisma.project.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true, title: true, code: true, projectPhase: true, deletedAt: true,
          projectType: true, technologyDomain: true,
          _count: { select: { projectTasks: true, members: true, timesheets: true } },
        },
      }),
      this.prisma.task.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 500,
        select: {
          id: true, title: true, priority: true, dueDate: true, deletedAt: true,
          projectTasks: { select: { project: { select: { id: true, title: true, code: true } } }, take: 1 },
          _count: { select: { subtasks: true, timesheets: true, assignees: true } },
        },
      }),
    ]);
    return {
      projects: projects.map(p => ({
        id: p.id, title: p.title, code: p.code, projectPhase: p.projectPhase, deletedAt: p.deletedAt,
        projectType: p.projectType, technologyDomain: p.technologyDomain,
        taskCount: p._count.projectTasks, memberCount: p._count.members, timesheetCount: p._count.timesheets,
      })),
      tasks: tasks.map(t => ({
        id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate, deletedAt: t.deletedAt,
        project: t.projectTasks[0]?.project ?? null,
        subtaskCount: t._count.subtasks, timesheetCount: t._count.timesheets, assigneeCount: t._count.assignees,
      })),
    };
  }

  // ── Restore ───────────────────────────────────────────────────────────────

  /**
   * Undo a soft delete. There was no way to do this from inside the app at all — a project
   * deleted by accident could only be brought back with a hand-written UPDATE against the
   * production database, which is exactly the manual surgery this module exists to end.
   *
   * Restoring a project also restores the tasks that went down WITH it (softDelete archives
   * them), matched on the deletion timestamp so a task deleted separately, earlier, stays
   * deleted — bringing back a project should not silently resurrect work somebody removed on
   * purpose weeks before.
   */
  async restoreProject(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id }, select: { id: true, title: true, code: true, deletedAt: true },
    });
    if (!project) throw new NotFoundException('Project not found.');
    if (!project.deletedAt) throw new BadRequestException('That project is not deleted.');
    const deletedAt = project.deletedAt;

    const restored = await this.prisma.$transaction(async tx => {
      // Back to ACTIVE rather than to whatever phase it held: softDelete OVERWROTE the phase
      // with ARCHIVED, so the original is genuinely unrecoverable. ACTIVE is the honest default
      // — the project is back on the books and whoever runs it can set the phase again.
      const p = await tx.project.update({
        where: { id },
        data: { deletedAt: null, projectPhase: 'ACTIVE' },
      });
      await tx.issue.updateMany({ where: { projectId: id, deletedAt }, data: { deletedAt: null } });
      const links = await tx.projectTask.findMany({ where: { projectId: id }, select: { taskId: true } });
      const taskIds = links.map(l => l.taskId);
      let tasks = 0;
      if (taskIds.length) {
        // Same-instant match: these are the tasks the project's own delete archived.
        tasks = (await tx.task.updateMany({ where: { id: { in: taskIds }, deletedAt }, data: { deletedAt: null } })).count;
      }
      return { project: p, tasks };
    });
    await this.events.emit({
      action: 'project.restored', entityType: 'PROJECT', entityId: id,
      metadata: { title: project.title, code: project.code, tasksRestored: restored.tasks },
    });
    return { id, title: project.title, tasksRestored: restored.tasks };
  }

  async restoreTask(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true, deletedAt: true, projectTasks: { select: { project: { select: { id: true, deletedAt: true } } } } },
    });
    if (!task) throw new NotFoundException('Task not found.');
    if (!task.deletedAt) throw new BadRequestException('That task is not deleted.');
    // A task restored into a still-deleted project would vanish again on every screen (every
    // list filters the project out), so it would look like the restore silently failed.
    const livingProject = task.projectTasks.some(l => !l.project.deletedAt);
    if (task.projectTasks.length && !livingProject) {
      throw new BadRequestException('Restore the project first — this task\'s project is deleted, so the task would stay hidden.');
    }
    await this.prisma.task.update({ where: { id }, data: { deletedAt: null } });
    await this.events.emit({
      action: 'task.restored', entityType: 'TASK', entityId: id, metadata: { title: task.title },
    });
    return { id, title: task.title };
  }

  // ── Permanent delete ──────────────────────────────────────────────────────

  /**
   * Destroy a task and everything hanging off it. The task must already be soft-deleted, and
   * `confirmTitle` must match its title exactly.
   */
  async purgeTask(id: string, confirmTitle: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true, title: true, deletedAt: true, dueDate: true, estimatedHours: true, actualHours: true,
        createdBy: true, createdAt: true,
        projectTasks: { select: { projectId: true, project: { select: { title: true, code: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    this.assertPurgeable('task', task.title, task.deletedAt, confirmTitle);

    // Take the task's hours back out of the learned averages BEFORE the rows go. Nothing after
    // this point could ever find them again, and a stranded sample keeps shaping what every
    // future task of that name is expected to take, with no row left anywhere to explain why.
    // withdraw() clears the seats' standardKey, so calling it on an already-withdrawn task (the
    // ordinary case — softDelete withdrew it) is a no-op rather than a double subtraction.
    await this.time.withdraw(id);

    const counts = await this.prisma.$transaction(async tx => {
      const c = await this.deleteTaskRows(tx, [id]);
      await this.writeTombstone(tx, 'TASK', id, {
        title: task.title,
        project: task.projectTasks[0]?.project ?? null,
        projectId: task.projectTasks[0]?.projectId ?? null,
        dueDate: task.dueDate, estimatedHours: task.estimatedHours, actualHours: task.actualHours,
        createdBy: task.createdBy, createdAt: task.createdAt, softDeletedAt: task.deletedAt,
      }, c);
      return c;
    }, PURGE_TX);
    return { id, title: task.title, deleted: counts };
  }

  /**
   * Destroy a project, its exclusive tasks, and everything hanging off either.
   *
   * A task shared with ANOTHER live project is not destroyed — only its link to this one. The
   * many-to-many exists precisely so a piece of work can serve two matters; taking one matter
   * off the books must not delete work the other is still doing. This mirrors what
   * ProjectsService.softDelete already decides when it archives children.
   */
  async purgeProject(id: string, confirmTitle: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        id: true, title: true, code: true, roundSeq: true, office: true, projectPhase: true,
        projectType: true, technologyDomain: true, clientId: true, deletedAt: true,
        startDate: true, dueDate: true, completedAt: true, closedAt: true,
        createdBy: true, createdAt: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found.');
    this.assertPurgeable('project', project.title, project.deletedAt, confirmTitle);

    // Which tasks die with the project, and which are only unlinked.
    const links = await this.prisma.projectTask.findMany({ where: { projectId: id }, select: { taskId: true } });
    const taskIds = [...new Set(links.map(l => l.taskId))];
    const shared = taskIds.length
      ? (await this.prisma.projectTask.findMany({
          where: { taskId: { in: taskIds }, projectId: { not: id }, project: { deletedAt: null } },
          select: { taskId: true },
        })).map(l => l.taskId)
      : [];
    const keep = new Set(shared);
    const doomed = taskIds.filter(t => !keep.has(t));

    // Outside the transaction, for the same reason as purgeTask: withdraw() opens one of its
    // own. A project's tasks were archived by the project's soft delete, which does NOT
    // withdraw, so for these this is usually the first and only chance to do it.
    for (const taskId of doomed) await this.time.withdraw(taskId);

    const counts = await this.prisma.$transaction(async tx => {
      // Every doomed task in ONE pass per table rather than a full pass per task. A project with
      // forty tasks is otherwise ~900 round trips inside a transaction, which is how a purge
      // starts timing out on the matters big enough that somebody wants them gone.
      const c: PurgeCounts = doomed.length ? await this.deleteTaskRows(tx, doomed) : {};
      this.mergeCounts(c, await this.deleteProjectRows(tx, id));
      await this.writeTombstone(tx, 'PROJECT', id, {
        title: project.title, code: project.code, roundSeq: project.roundSeq, office: project.office,
        projectPhase: project.projectPhase, projectType: project.projectType,
        technologyDomain: project.technologyDomain, clientId: project.clientId,
        startDate: project.startDate, dueDate: project.dueDate,
        completedAt: project.completedAt, closedAt: project.closedAt,
        createdBy: project.createdBy, createdAt: project.createdAt, softDeletedAt: project.deletedAt,
        tasksDestroyed: doomed.length, tasksUnlinkedButKept: keep.size,
      }, c);
      return c;
    }, PURGE_TX);
    return { id, title: project.title, code: project.code, deleted: counts, tasksKept: keep.size };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * The two gates, together, because they answer the same question: is it safe to run this at
   * all? Kept on the server rather than in the dialog — see the class comment.
   */
  private assertPurgeable(kind: 'project' | 'task', title: string, deletedAt: Date | null, confirmTitle: string) {
    if (!deletedAt) {
      throw new BadRequestException(
        `This ${kind} is still live. Delete it first — it then sits in Admin → Data, where it can be restored or permanently destroyed.`,
      );
    }
    if ((confirmTitle ?? '').trim() !== title.trim()) {
      throw new BadRequestException(`Type the ${kind}'s title exactly to confirm. This cannot be undone.`);
    }
  }

  /**
   * Every row belonging to one task, destroyed child-first in TASK_PURGE_ORDER.
   *
   * WHY THE POLYMORPHIC TABLES MATCH ON entityId ALONE
   *
   * Comments, approvals, activity and the rest carry an `entityType` string written by whoever
   * created the row — and the app is genuinely inconsistent about it: the task detail panel
   * posts comments as `'task'` while everything else writes `'TASK'`. Filtering on the type as
   * well would therefore silently leave every task comment behind, which is the exact failure
   * this whole routine exists to avoid. `entityId` is a cuid and unique across the database on
   * its own, so matching it alone is both correct and immune to the casing.
   */
  private async deleteTaskRows(tx: Tx, ids: string[]): Promise<PurgeCounts> {
    const taskId = { in: ids };
    const entityId = { in: ids };
    const del: Record<TaskPurgeModel, () => Promise<{ count: number }>> = {
      subtaskAssignee:   () => tx.subtaskAssignee.deleteMany({ where: { subtask: { taskId } } }),
      subtask:           () => tx.subtask.deleteMany({ where: { taskId } }),
      checklist:         () => tx.checklist.deleteMany({ where: { taskId } }),
      taskDependency:    () => tx.taskDependency.deleteMany({ where: { OR: [{ predecessorTaskId: taskId }, { successorTaskId: taskId }] } }),
      taskAssignee:      () => tx.taskAssignee.deleteMany({ where: { taskId } }),
      taskCoverage:      () => tx.taskCoverage.deleteMany({ where: { taskId } }),
      taskDocument:      () => tx.taskDocument.deleteMany({ where: { taskId } }),
      taskWorkSession:   () => tx.taskWorkSession.deleteMany({ where: { taskId } }),
      timesheet:         () => tx.timesheet.deleteMany({ where: { taskId } }),
      teamTask:          () => tx.teamTask.deleteMany({ where: { taskId } }),
      projectTask:       () => tx.projectTask.deleteMany({ where: { taskId } }),
      approvalAction:    () => tx.approvalAction.deleteMany({ where: { approval: { entityId } } }),
      approval:          () => tx.approval.deleteMany({ where: { entityId } }),
      commentAttachment: () => tx.commentAttachment.deleteMany({ where: { comment: { entityId } } }),
      comment:           () => tx.comment.deleteMany({ where: { entityId } }),
      customFieldValue:  () => tx.customFieldValue.deleteMany({ where: { entityId } }),
      searchIndex:       () => tx.searchIndex.deleteMany({ where: { entityId } }),
      analyticsEvent:    () => tx.analyticsEvent.deleteMany({ where: { entityId } }),
      activity:          () => tx.activity.deleteMany({ where: { entityId } }),
      deadlineChange:    () => tx.deadlineChange.deleteMany({ where: { entityId } }),
      // Clicking a notification for a destroyed task would land on a 404. The link is the only
      // thing tying the two together, so it is what we match on.
      notification:      () => tx.notification.deleteMany({ where: { OR: ids.map(id => ({ link: { contains: id } })) } }),
      task:              () => tx.task.deleteMany({ where: { id: { in: ids } } }),
    };
    return this.runOrdered(TASK_PURGE_ORDER, del);
  }

  /** Every row belonging to one project, child-first in PROJECT_PURGE_ORDER. */
  private async deleteProjectRows(tx: Tx, id: string): Promise<PurgeCounts> {
    const del: Record<ProjectPurgeModel, () => Promise<{ count: number }>> = {
      // Timesheets point at the project with onDelete: SetNull, so without an explicit delete
      // they would SURVIVE with a null projectId — indistinguishable from an entry still inside
      // the "assign a PID later" buffer, and chased forever for a PID that cannot exist.
      timesheet:         () => tx.timesheet.deleteMany({ where: { OR: [{ projectId: id }, { issue: { projectId: id } }] } }),
      issue:             () => tx.issue.deleteMany({ where: { projectId: id } }),
      projectTask:       () => tx.projectTask.deleteMany({ where: { projectId: id } }),
      taskList:          () => tx.taskList.deleteMany({ where: { projectId: id } }),
      projectDocument:   () => tx.projectDocument.deleteMany({ where: { projectId: id } }),
      projectMember:     () => tx.projectMember.deleteMany({ where: { projectId: id } }),
      projectDepartment: () => tx.projectDepartment.deleteMany({ where: { projectId: id } }),
      projectTeam:       () => tx.projectTeam.deleteMany({ where: { projectId: id } }),
      projectPatent:     () => tx.projectPatent.deleteMany({ where: { projectId: id } }),
      pidRequest:        () => tx.pidRequest.deleteMany({ where: { projectId: id } }),
      approvalAction:    () => tx.approvalAction.deleteMany({ where: { approval: { entityId: id } } }),
      approval:          () => tx.approval.deleteMany({ where: { entityId: id } }),
      commentAttachment: () => tx.commentAttachment.deleteMany({ where: { comment: { entityId: id } } }),
      comment:           () => tx.comment.deleteMany({ where: { entityId: id } }),
      customFieldValue:  () => tx.customFieldValue.deleteMany({ where: { entityId: id } }),
      searchIndex:       () => tx.searchIndex.deleteMany({ where: { entityId: id } }),
      analyticsEvent:    () => tx.analyticsEvent.deleteMany({ where: { entityId: id } }),
      activity:          () => tx.activity.deleteMany({ where: { entityId: id } }),
      // Both the project's own shifts AND the shifts of its tasks, which roll up to it.
      deadlineChange:    () => tx.deadlineChange.deleteMany({ where: { OR: [{ entityId: id }, { projectId: id }] } }),
      notification:      () => tx.notification.deleteMany({ where: { link: { contains: id } } }),
      project:           () => tx.project.deleteMany({ where: { id } }),
    };
    const counts = await this.runOrdered(PROJECT_PURGE_ORDER, del);

    // ── Two things that are CHANGED rather than destroyed ────────────────────
    // The PID ledger is the authority on which serials have ever existed, and its whole purpose
    // is that a serial is never silently reused. Deleting the reservation would free the number
    // for reissue and erase the history of what it was for; DISCONTINUED is the status the model
    // already defines for a retired serial that leaves a permanent gap.
    const pid = await tx.pidReservation.updateMany({
      where: { projectId: id, status: { in: ['RESERVED', 'ATTACHED'] } },
      data: { status: 'DISCONTINUED', resolvedAt: new Date() },
    });
    if (pid.count) counts.pidReservationsDiscontinued = pid.count;
    // A meeting that happened is an organisation-level fact with its own attendees; it is tagged
    // to a project, not owned by one. Untag it rather than delete somebody's calendar history.
    const events = await tx.calendarEvent.updateMany({ where: { projectId: id }, data: { projectId: null } });
    if (events.count) counts.calendarEventsUntagged = events.count;

    return counts;
  }

  /**
   * Run the delete functions in the declared order and tally what each gave up.
   *
   * The `Record<Model, …>` typing above is the point: the order list and the delete functions
   * cannot drift apart, because a model named in the order with no function (or the reverse)
   * fails to compile rather than failing at 2am against a production database.
   */
  private async runOrdered<M extends string>(
    order: readonly M[],
    del: Record<M, () => Promise<{ count: number }>>,
  ): Promise<PurgeCounts> {
    const counts: PurgeCounts = {};
    for (const model of order) {
      const { count } = await del[model]();
      if (count) counts[model] = (counts[model] ?? 0) + count;
    }
    return counts;
  }

  private mergeCounts(into: PurgeCounts, from: PurgeCounts) {
    for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
  }

  /**
   * The record that outlives the row.
   *
   * Written LAST, inside the same transaction, and to the audit sink ONLY. Last, because the
   * purge deletes the entity's activity and analytics rows and anything written before that
   * would be swept away with them. Audit-only for the same reason — emitting to all three sinks
   * would recreate an Activity and an AnalyticsEvent pointing at an id that no longer resolves.
   * AuditLog is the one of the three with no foreign key to its subject, which is exactly why it
   * is the right place for a tombstone.
   */
  private async writeTombstone(tx: Tx, entityType: 'PROJECT' | 'TASK', entityId: string, snapshot: unknown, counts: PurgeCounts) {
    // emit() silently skips an event it cannot attribute, which here would mean a destruction
    // with no record of who ordered it. The guards make this unreachable; it is asserted anyway
    // because the failure would be invisible, and invisible is the one thing a tombstone can't be.
    if (!getActorId()) throw new ForbiddenException('You must be signed in to permanently delete anything.');
    const rowsDestroyed = Object.entries(counts)
      .filter(([k]) => !k.endsWith('Discontinued') && !k.endsWith('Untagged'))
      .reduce((n, [, v]) => n + v, 0);
    await this.events.emit({
      action: entityType === 'PROJECT' ? 'project.purged' : 'task.purged',
      entityType, entityId,
      sinks: ['audit'],
      oldValue: snapshot,
      metadata: { permanent: true, purgedAt: new Date().toISOString(), rowsDestroyed, childRows: counts },
      tx,
    });
  }
}
