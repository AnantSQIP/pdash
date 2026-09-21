import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { TaskTimeService } from '../tasks/task-time.service';
import { getActorId } from '../../common/context/request-context';
import { documentStorage } from '../documents/document-storage';
import { CidService } from '../../common/cid/cid.service';
import { isRetiredCid } from '../../common/cid/cid';
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
 *      key, so the row survives its subject. It carries the title, the CID, and a count of every
 *      child type destroyed — enough to answer "what was destroyed, by whom, when" next year,
 *      when the thing itself is gone and the only evidence is that row. A purged client also
 *      stays visible in the CID ledger: its PURGED event (cid_event, no foreign key either) keeps
 *      its title, hours and task-group count, and its CID stays taken forever.
 */
@Injectable()
export class PurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly time: TaskTimeService,
    private readonly cid: CidService,
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
      where: { id }, select: { id: true, title: true, code: true, roundSeq: true, deletedAt: true },
    });
    if (!project) throw new NotFoundException('Project not found.');
    if (!project.deletedAt) throw new BadRequestException('That project is not deleted.');
    const deletedAt = project.deletedAt;
    const organizationId = await this.cid.ledgerOrg(this.prisma, id);

    // The phase it held before the delete. softDelete overwrites the phase with ARCHIVED, but the
    // CID ledger's DELETED event recorded what it was, so a completed client comes back completed
    // and an on-hold one on hold. Anything else (or a delete from before the ledger) → ACTIVE.
    const deletedEvent = await this.prisma.cidEvent.findFirst({
      where: { projectId: id, type: 'DELETED' }, orderBy: { createdAt: 'desc' }, select: { metadata: true },
    });
    const recorded = (deletedEvent?.metadata as Record<string, unknown> | null)?.phaseBefore;
    const phase = typeof recorded === 'string' && ['ACTIVE', 'ON_HOLD', 'COMPLETED'].includes(recorded) ? recorded : 'ACTIVE';

    const restored = await this.prisma.$transaction(async tx => {
      // ITS CID. A deleted client's number stays reserved to it, so normally it simply comes back
      // with the number it had. A number that was retired meanwhile — merged away, reassigned off,
      // or never issued (a client deleted before CIDs were automatic) — is NEVER revived: the client
      // is given the next CID instead, and the ledger says which it had.
      const reg = project.code ? await this.cid.registryRow(tx, organizationId, project.code) : null;
      let code = project.code;
      let roundSeq = project.roundSeq;
      let reissuedFrom: string | null | undefined;
      if (!code || (reg && isRetiredCid(reg.status))) {
        const minted = await this.cid.mintInTx(tx, { organizationId, projectId: id });
        reissuedFrom = code;
        code = minted.cid;
        roundSeq = 1;
        await this.cid.recordInTx(tx, {
          organizationId, cid: code, projectId: id, clientTitle: project.title, type: 'MINTED',
          fromCid: reissuedFrom ?? null, toCid: code,
          metadata: {
            reason: reissuedFrom ? 'restored client’s CID had been retired' : 'restored client had no CID',
            previousCid: reissuedFrom ?? null, previousStatus: reg?.status ?? null,
            fyLabel: minted.fyLabel, serial: minted.serial,
          },
        });
      } else {
        // Rounds still live under the number may have been renumbered while this one was in the
        // bin; it rejoins at the end rather than sharing a round number.
        const live = await tx.project.findMany({ where: { code, deletedAt: null }, select: { roundSeq: true } });
        if (live.some(r => r.roundSeq === roundSeq)) roundSeq = Math.max(...live.map(r => r.roundSeq)) + 1;
      }

      const p = await tx.project.update({
        where: { id },
        data: { deletedAt: null, projectPhase: phase, code, roundSeq },
      });
      await tx.issue.updateMany({ where: { projectId: id, deletedAt }, data: { deletedAt: null } });
      const links = await tx.projectTask.findMany({ where: { projectId: id }, select: { taskId: true } });
      const taskIds = links.map(l => l.taskId);
      let tasks = 0;
      if (taskIds.length) {
        // Same-instant match: these are the tasks the project's own delete archived.
        tasks = (await tx.task.updateMany({ where: { id: { in: taskIds }, deletedAt }, data: { deletedAt: null } })).count;
      }
      await this.cid.syncRegistryInTx(tx, organizationId, code!);
      await this.cid.recordInTx(tx, {
        organizationId, cid: code!, projectId: id, clientTitle: p.title, type: 'RESTORED',
        ...(reissuedFrom !== undefined ? { fromCid: reissuedFrom ?? null } : {}), toCid: code!,
        metadata: { phaseRestored: phase, tasksRestored: tasks, deletedAt: deletedAt.toISOString(), cidReissued: reissuedFrom !== undefined },
      });
      return { project: p, tasks, cid: code!, reissuedFrom };
    });
    await this.events.emit({
      action: 'project.restored', entityType: 'PROJECT', entityId: id,
      metadata: {
        title: project.title, cid: restored.cid, phase, tasksRestored: restored.tasks,
        ...(restored.reissuedFrom !== undefined ? { cidReissuedFrom: restored.reissuedFrom } : {}),
      },
    });
    return {
      id, title: project.title, tasksRestored: restored.tasks, cid: restored.cid, phase,
      cidReissued: restored.reissuedFrom !== undefined,
    };
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

    const files = await this.doomedDocuments(null, [id], new Set<string>());

    const counts = await this.prisma.$transaction(async tx => {
      await this.assertStillDeleted(tx, 'task', id, 'task');
      const c = await this.deleteTaskRows(tx, [id]);
      this.mergeCounts(c, await this.destroyDocuments(tx, files));
      await this.writeTombstone(tx, 'TASK', id, {
        title: task.title,
        project: task.projectTasks[0]?.project ?? null,
        projectId: task.projectTasks[0]?.projectId ?? null,
        dueDate: task.dueDate, estimatedHours: task.estimatedHours, actualHours: task.actualHours,
        createdBy: task.createdBy, createdAt: task.createdAt, softDeletedAt: task.deletedAt,
      }, c);
      return c;
    }, PURGE_TX);
    await this.freeBytes(files);
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

    // Resolved before the transaction: it is several reads, and it must see the links as they
    // stand BEFORE the purge removes them.
    const files = await this.doomedDocuments(id, taskIds, keep);

    // What the CID ledger keeps of the client after its rows are gone: enough for the ledger to
    // go on showing it — name, hours, task groups, who ran it — when nothing else in the system can.
    const organizationId = await this.cid.ledgerOrg(this.prisma, id);
    const snapshot = await this.ledgerSnapshot(id, project.deletedAt);

    const counts = await this.prisma.$transaction(async tx => {
      await this.assertStillDeleted(tx, 'project', id, 'project');
      // Every doomed task in ONE pass per table rather than a full pass per task. A project with
      // forty tasks is otherwise ~900 round trips inside a transaction, which is how a purge
      // starts timing out on the matters big enough that somebody wants them gone.
      const c: PurgeCounts = doomed.length ? await this.deleteTaskRows(tx, doomed) : {};
      this.mergeCounts(c, await this.deleteProjectRows(tx, id));
      this.mergeCounts(c, await this.destroyDocuments(tx, files));
      await this.writeTombstone(tx, 'PROJECT', id, {
        title: project.title, code: project.code, roundSeq: project.roundSeq, office: project.office,
        projectPhase: project.projectPhase, projectType: project.projectType,
        technologyDomain: project.technologyDomain, clientId: project.clientId,
        startDate: project.startDate, dueDate: project.dueDate,
        completedAt: project.completedAt, closedAt: project.closedAt,
        createdBy: project.createdBy, createdAt: project.createdAt, softDeletedAt: project.deletedAt,
        tasksDestroyed: doomed.length, tasksUnlinkedButKept: keep.size,
      }, c);
      // The number stays taken forever: the registry reads PURGED once nothing carries it (another
      // round, live or in the bin, keeps it ATTACHED or DELETED), and the ledger keeps the client.
      const cidStatus = project.code ? await this.cid.syncRegistryInTx(tx, organizationId, project.code) : null;
      if (project.code) {
        await this.cid.recordInTx(tx, {
          organizationId, cid: project.code, projectId: id, clientTitle: project.title, type: 'PURGED',
          metadata: {
            ...snapshot, roundSeq: project.roundSeq, office: project.office, projectType: project.projectType,
            technologyDomain: project.technologyDomain, startDate: project.startDate, dueDate: project.dueDate,
            completedAt: project.completedAt, createdAt: project.createdAt, softDeletedAt: project.deletedAt,
            tasksDestroyed: doomed.length, cidStatusAfter: cidStatus,
          },
        });
      }
      return c;
    }, PURGE_TX);
    await this.freeBytes(files);
    return { id, title: project.title, code: project.code, deleted: counts, tasksKept: keep.size };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** What the CID ledger keeps of a client once its rows are destroyed. Read before the purge. */
  private async ledgerSnapshot(projectId: string, deletedAt: Date | null) {
    const [logged, tasks, groups, p] = await Promise.all([
      this.prisma.timesheet.aggregate({ where: { projectId, deletedAt: null }, _sum: { hoursLogged: true } }),
      this.prisma.projectTask.findMany({
        where: { projectId }, select: { task: { select: { estimatedHours: true, deletedAt: true } } },
      }),
      this.prisma.taskList.count({ where: { projectId, deletedAt: null } }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          createdBy: true,
          clientGroup: { select: { name: true } },
          members: { where: { projectRole: 'MANAGER' }, select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);
    const round1 = (n: number) => Math.round(n * 10) / 10;
    // Tasks archived WITH the client (same instant) still count toward what it was allotted.
    const allotted = tasks
      .filter(t => !t.task.deletedAt || (deletedAt && t.task.deletedAt.getTime() === deletedAt.getTime()))
      .reduce((n, t) => n + (t.task.estimatedHours ?? 0), 0);
    const creator = p?.createdBy
      ? await this.prisma.user.findUnique({ where: { id: p.createdBy }, select: { firstName: true, lastName: true } })
      : null;
    return {
      loggedHours: round1(logged._sum.hoursLogged ?? 0),
      allottedHours: round1(allotted),
      taskGroupCount: groups,
      clientGroup: p?.clientGroup?.name ?? null,
      managers: (p?.members ?? []).map(m => `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim()),
      createdByName: creator ? `${creator.firstName} ${creator.lastName}`.trim() : null,
    };
  }

  /**
   * The two gates, together, because they answer the same question: is it safe to run this at
   * all? Kept on the server rather than in the dialog — see the class comment.
   */
  /**
   * Take the row's own lock and re-read whether it is still deleted, INSIDE the purge transaction.
   *
   * The check at the top of a purge reads a snapshot. Between that read and the destructive
   * transaction there are two more standalone queries and a withdraw() per task, each its own
   * transaction — and on a big matter, which is exactly the kind somebody wants gone, that window
   * is wide. A Restore landing in it was honoured, reported success, and the purge then destroyed
   * the project anyway. Restore and Delete Permanently sit in the same row of the same table on
   * Admin → Data, so the two clicks that collide are inches apart.
   *
   * `FOR UPDATE` rather than a plain re-read: under READ COMMITTED a restore that commits after
   * this statement would still be invisible here and clobbered a moment later. The lock makes the
   * two operations take turns — whichever arrives second sees what the first did.
   */
  /**
   * The files that die with this matter, and the ones that only lose a link.
   *
   * The purge removes `projectDocument` and `taskDocument` — the LINK rows — and used to stop
   * there, so every uploaded file survived: the Document row, its blob and the bytes on the
   * docdata volume, all still readable by whoever uploaded them, while the audit tombstone
   * reported the matter destroyed. For a patent firm the file IS the confidential artefact, and
   * its filename can itself be a real patent number, so "the matter was destroyed" has to include
   * it.
   *
   * A document is doomed only when NOTHING else holds it up. The same file can be attached to a
   * second live project, to a task this purge is keeping, to a channel message, to a comment on
   * something else, to a leave request, to an expense claim, to a published policy, or to a
   * patent — and any one of those is a reason it must survive with only its link gone. This asks
   * that question directly rather than assuming the matter was its only home.
   */
  private async doomedDocuments(projectId: string | null, taskIds: string[], keptTaskIds: Set<string>) {
    const linked = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(projectId ? [{ projectDocuments: { some: { projectId } } }] : []),
          ...(taskIds.length ? [{ taskDocuments: { some: { taskId: { in: taskIds } } } }] : []),
        ],
      },
      select: {
        id: true, storagePath: true,
        projectDocuments: { select: { projectId: true } },
        taskDocuments: { select: { taskId: true } },
        messageAttachments: { select: { id: true }, take: 1 },
        commentAttachments: { select: { id: true }, take: 1 },
        leaveRequests: { select: { id: true }, take: 1 },
        expenses: { select: { id: true }, take: 1 },
        policies: { select: { id: true }, take: 1 },
      },
    });
    if (!linked.length) return [];
    const doomedTasks = new Set(taskIds.filter(t => !keptTaskIds.has(t)));
    const patentHeld = new Set((await this.prisma.patent.findMany({
      where: { documentId: { in: linked.map(d => d.id) } }, select: { documentId: true },
    })).map(p => p.documentId).filter((x): x is string => !!x));

    return linked.filter(d => {
      if (patentHeld.has(d.id)) return false;            // the confidential portal owns these
      if (d.messageAttachments.length || d.commentAttachments.length) return false;
      if (d.leaveRequests.length || d.expenses.length || d.policies.length) return false;
      const elsewhere = d.projectDocuments.some(pd => pd.projectId !== projectId);
      const onKeptTask = d.taskDocuments.some(td => !doomedTasks.has(td.taskId));
      return !elsewhere && !onKeptTask;
    });
  }

  /**
   * Remove the doomed documents' rows inside the purge transaction. The BYTES are freed after it
   * commits, by the caller — deleting a file from disk or S3 cannot be rolled back, so doing it
   * inside would leave the bytes gone and the rows intact if anything later in the transaction
   * threw. Rows first, bytes second, is the only order that fails safely.
   */
  private async destroyDocuments(tx: Prisma.TransactionClient, files: { id: string }[]): Promise<PurgeCounts> {
    if (!files.length) return {};
    const ids = files.map(f => f.id);
    const blob = await tx.documentBlob.deleteMany({ where: { documentId: { in: ids } } });
    const doc = await tx.document.deleteMany({ where: { id: { in: ids } } });
    const out: PurgeCounts = {};
    if (blob.count) out.documentBlob = blob.count;
    if (doc.count) out.document = doc.count;
    return out;
  }

  /** Free the stored bytes. Failures are swallowed per file: a missing object must not strip a
   *  completed purge of its tombstone, and the rows are already gone either way. */
  private async freeBytes(files: { storagePath: string | null }[]) {
    for (const f of files) {
      if (!f.storagePath) continue;
      try { await documentStorage.delete(f.storagePath); } catch { /* already gone */ }
    }
  }

  private async assertStillDeleted(
    tx: Prisma.TransactionClient, table: 'project' | 'task', id: string, kind: 'project' | 'task',
  ) {
    const rows = table === 'project'
      ? await tx.$queryRaw<{ deletedAt: Date | null }[]>`SELECT "deletedAt" FROM "project" WHERE id = ${id} FOR UPDATE`
      : await tx.$queryRaw<{ deletedAt: Date | null }[]>`SELECT "deletedAt" FROM "task" WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException(`${kind === 'project' ? 'Project' : 'Task'} not found.`);
    if (!rows[0].deletedAt) {
      throw new BadRequestException(
        `This ${kind} was restored while the deletion was running, so nothing was destroyed. `
        + 'Delete it again if you still want it gone.',
      );
    }
  }

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
      // the "assign a client later" buffer, and chased forever for a client that cannot exist.
      timesheet:         () => tx.timesheet.deleteMany({ where: { OR: [{ projectId: id }, { issue: { projectId: id } }] } }),
      issue:             () => tx.issue.deleteMany({ where: { projectId: id } }),
      projectTask:       () => tx.projectTask.deleteMany({ where: { projectId: id } }),
      taskList:          () => tx.taskList.deleteMany({ where: { projectId: id } }),
      projectDocument:   () => tx.projectDocument.deleteMany({ where: { projectId: id } }),
      projectMember:     () => tx.projectMember.deleteMany({ where: { projectId: id } }),
      projectDepartment: () => tx.projectDepartment.deleteMany({ where: { projectId: id } }),
      projectTeam:       () => tx.projectTeam.deleteMany({ where: { projectId: id } }),
      projectPatent:     () => tx.projectPatent.deleteMany({ where: { projectId: id } }),
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

    // ── Things that are CHANGED rather than destroyed ─────────────────────────
    // The CID registry row is not touched here: purgeProject re-reads it after this (PURGED once
    // nothing carries the number) and the ledger's PURGED event keeps the client. Deleting the
    // registry row would free the number for reissue, which is the one thing it must never do.
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
