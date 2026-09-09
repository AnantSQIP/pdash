import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateSubtaskDto, CreateTaskDto, SetAssigneesDto, SetStaffingDto, SetStatusDto, UpdateSubtaskDto, UpdateTaskDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { startOfUtcDay, resolveDate } from '../../common/dates';
import { TaskTimeService } from './task-time.service';


@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly deadlines: DeadlineVisibilityService,
    private readonly access: ProjectAccessService,
    private readonly time: TaskTimeService,
  ) {}

  /**
   * Bring a task's assignee rows to `wanted`, KEEPING the rows that survive.
   *
   * This used to be `deleteMany` + `createMany`, which was wrong in a way that only showed up
   * later. A TaskAssignee row is not just a link — it also carries the hours that person
   * confirmed for their part and the standard those hours fed (confirmedHours, standardKey,
   * standardMinutes). Deleting every row to add one reviewer therefore:
   *
   *   · stranded the contribution. The sample stayed in task_standard with nothing left in the
   *     database able to withdraw it, and closing the task again posted a SECOND completion —
   *     one task counted twice, and the learned average was permanently wrong.
   *   · silently erased everyone's confirmed hours. The task's actualHours is recomputed as
   *     the sum across assignees, so the next person to record their part reset the task's
   *     total to their own figure alone.
   *
   * So: rows that are still wanted are UPDATED in place, rows that are genuinely going away
   * have their standard contribution withdrawn first, and only new seats are created.
   */
  private async reconcileAssignees(
    taskId: string,
    title: string,
    wanted: {
      userId: string; role?: string | null; estimatedHours?: number | null; dueDate?: Date | null;
      startDate?: Date | null; hoursPerDay?: number | null;
    }[],
    tx?: Prisma.TransactionClient,
  ) {
    // Read through the caller's transaction when there is one, so the plan is built from the
    // same snapshot it is applied to.
    const existing = await (tx ?? this.prisma).taskAssignee.findMany({
      where: { taskId },
      select: { id: true, userId: true, role: true, confirmedHours: true, standardKey: true, standardMinutes: true },
    });

    // A seat's identity is (person, role) — the table's own unique key. But `role` is nullable:
    // a plain assignee predating role-based staffing has NULL, and the timing code reads NULL as
    // ANALYST. So two notions of sameness are needed, and conflating them is what made the first
    // version of this drop a legacy assignee's hours the moment somebody gave them a job title.
    const seat = (userId: string, role?: string | null) => `${userId}|${role ?? ''}`;
    const effectiveRole = (role?: string | null) => (role ?? 'ANALYST').toUpperCase();

    const unclaimed = new Map(existing.map(e => [e.id, e]));
    const plan: {
      w: typeof wanted[number];
      row?: typeof existing[number];
      /** The seat is the same person doing the same job — keep every figure it carries. */
      keepsStandard: boolean;
    }[] = [];

    // Pass 1 — exact (person, role) matches. Nothing about these seats has changed.
    for (const w of wanted) {
      const row = [...unclaimed.values()].find(e => seat(e.userId, e.role) === seat(w.userId, w.role));
      if (row) {
        unclaimed.delete(row.id);
        plan.push({ w, row, keepsStandard: true });
      }
    }
    // Pass 2 — the same person, reclassified. Adopt their remaining row rather than deleting it
    // and creating a fresh one: it is the same human doing the same work, and their confirmed
    // hours belong to them, not to the label that was on the seat. Prefer a row whose EFFECTIVE
    // role already matches (NULL → ANALYST is a relabelling, not a change of job), because that
    // seat can keep its learned contribution exactly where it is.
    for (const w of wanted) {
      if (plan.some(pl => pl.w === w)) continue;
      const mine = [...unclaimed.values()].filter(e => e.userId === w.userId);
      const row = mine.find(e => effectiveRole(e.role) === effectiveRole(w.role)) ?? mine[0];
      if (row) {
        unclaimed.delete(row.id);
        plan.push({ w, row, keepsStandard: effectiveRole(row.role) === effectiveRole(w.role) });
      } else {
        plan.push({ w, keepsStandard: false });
      }
    }

    // Whatever is still unclaimed is a seat that genuinely went away.
    const removed = [...unclaimed.values()];
    // A seat whose job changed keeps its hours but must move its sample: the contribution was
    // learned as one role's work and is no longer that role's work.
    const reclassified = plan.filter(pl => pl.row && !pl.keepsStandard).map(pl => pl.row!);
    const needsOrg = removed.length > 0 || reclassified.length > 0;
    const organizationId = needsOrg ? await this.orgOfActor() : null;

    // Runs inside the caller's transaction when one is given, so the task fields written
    // alongside the seats (assignedById, the summed estimate) land or fail with them.
    const run = async (tx: Prisma.TransactionClient) => {
      // Withdraw before deleting: once the row is gone there is nothing left that could ever
      // take its hours back out of the learned average.
      if (removed.length) {
        if (organizationId) await this.time.releaseAssignments(tx, organizationId, title.trim(), removed);
        await tx.taskAssignee.deleteMany({ where: { id: { in: removed.map(r => r.id) } } });
      }
      if (reclassified.length && organizationId) {
        await this.time.releaseAssignments(tx, organizationId, title.trim(), reclassified);
      }

      // Deletes first, then updates: adopting a row into a (person, role) pair that a
      // just-removed row still occupied would otherwise trip the unique key.
      for (const { w, row, keepsStandard } of plan) {
        const data: Record<string, unknown> = {
          ...(w.estimatedHours !== undefined ? { estimatedHours: w.estimatedHours ?? 0 } : {}),
          ...(w.dueDate !== undefined ? { dueDate: w.dueDate ?? null } : {}),
          // `undefined` means the caller did not mention the field and the stored value stands;
          // an explicit null clears it. Distinguishing the two matters here — a caller that only
          // edits hours must not silently unschedule the seat.
          ...(w.startDate !== undefined ? { startDate: w.startDate ?? null } : {}),
          ...(w.hoursPerDay !== undefined ? { hoursPerDay: w.hoursPerDay ?? null } : {}),
        };
        if (!row) {
          await tx.taskAssignee.create({ data: { taskId, userId: w.userId, role: w.role ?? null, ...data } });
          continue;
        }
        if (row.role !== (w.role ?? null)) data.role = w.role ?? null;
        if (!keepsStandard) {
          // The hours they confirmed stay with them — they did that work. Only the link to the
          // standard is cleared, so their next entry is counted afresh under the new role.
          data.standardKey = null;
          data.standardMinutes = null;
        }
        if (Object.keys(data).length) await tx.taskAssignee.update({ where: { id: row.id }, data });
      }
    };
    if (tx) await run(tx); else await this.prisma.$transaction(run);
  }

  /** The signed-in actor's organisation, or null when it cannot be resolved. */
  private async orgOfActor(): Promise<string | null> {
    const actorId = getActorId();
    if (!actorId) return null;
    const u = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  /** A task's deadline can't fall before its start. */
  private assertTaskDateOrder(start?: Date | null, due?: Date | null) {
    if (start && due && due < start) throw new BadRequestException('The due date cannot be before the start date.');
  }

  /**
   * Everyone assigned must be a member of one of the task's project(s). "Assign = staff":
   * if the actor may staff the project (a delivery lead / oversight), a not-yet-member
   * assignee is AUTO-ADDED as a MEMBER (reactivated if previously removed), so assigning
   * work just works. Anyone else gets a clear message to have a manager add the person.
   * Only real, ACTIVE, same-org users are added (also fixes assigning a deactivated user).
   */
  private async ensureAssigneesAreMembers(projectIds: string[], assigneeIds: string[]) {
    if (!assigneeIds.length || !projectIds.length) return;
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId: { in: projectIds }, userId: { in: assigneeIds } },
      select: { id: true, userId: true, isActive: true },
    });
    const active = new Set(rows.filter(r => r.isActive).map(r => r.userId));
    const outsiders = [...new Set(assigneeIds.filter(id => !active.has(id)))];
    if (!outsiders.length) return;

    const actorId = getActorId();
    if (!actorId || !(await this.access.hasOversight(actorId))) {
      throw new BadRequestException('You can only assign people who are members of the project. Ask a manager to add them first.');
    }

    // Add the outsiders to the primary project — validate they are active, same-org users.
    const primary = projectIds[0];
    const anchor = await this.prisma.projectMember.findFirst({
      where: { projectId: primary }, select: { user: { select: { organizationId: true } } },
    });
    const orgId = anchor?.user?.organizationId;
    const valid = new Set((await this.prisma.user.findMany({
      where: { id: { in: outsiders }, deletedAt: null, status: 'ACTIVE', ...(orgId ? { organizationId: orgId } : {}) },
      select: { id: true },
    })).map(u => u.id));
    if (outsiders.some(id => !valid.has(id))) {
      throw new BadRequestException('One or more selected people are not active members of this organization.');
    }
    for (const uid of outsiders) {
      const existing = rows.find(r => r.userId === uid);
      if (existing) await this.prisma.projectMember.update({ where: { id: existing.id }, data: { isActive: true } });
      else await this.prisma.projectMember.create({ data: { projectId: primary, userId: uid, projectRole: 'MEMBER' } });
    }

    // GOVERNANCE: auto-adding someone to a matter via assignment grants them FULL project
    // access (potentially a confidential client matter). That must be auditable and visible —
    // record a membership event and tell the person they were added — so a silent enrolment
    // can't happen. Previously the add left no trace and no notice.
    const project = await this.prisma.project.findUnique({ where: { id: primary }, select: { title: true } });
    await this.events.emit({
      action: EVENTS.PROJECT_MEMBER_ADDED,
      entityType: 'PROJECT',
      entityId: primary,
      metadata: { addedUserIds: outsiders, via: 'task-assignment', projectTitle: project?.title },
    });
    await this.notifications.notify(outsiders, {
      type: 'project.member_added',
      title: 'Added to a project',
      message: `You were added to "${project?.title ?? 'a project'}" because you were assigned work on it.`,
      link: `/projects/${primary}`,
    });
  }

  /** Resolve the project(s) a task belongs to (for assignee-membership checks). */
  private async projectIdsForTask(taskId: string): Promise<string[]> {
    const links = await this.prisma.projectTask.findMany({ where: { taskId }, select: { projectId: true } });
    return links.map(l => l.projectId);
  }

  /**
   * Create a task and link it to a project via ProjectTask.
   * Task has no projectId — ProjectTask is the join record that also
   * stores the task's position (taskList) within that project.
   */
  async create(dto: CreateTaskDto) {
    await this.access.assertProjectAccess(getActorId(), dto.projectId);
    await this.access.assertProjectWritable(dto.projectId); // no new tasks on completed/closed projects
    const taskList = await this.prisma.taskList.findFirst({
      where: { id: dto.taskListId, projectId: dto.projectId, deletedAt: null },
    });
    if (!taskList) {
      throw new BadRequestException(`TaskList ${dto.taskListId} not found in project ${dto.projectId}`);
    }

    // Resolve the task's home workflow up front. Previously left null, which made the
    // cross-workflow guard in setStatus() dead and forced clients to fall back to the
    // 'default' alias. Derive it from the chosen status, else the GLOBAL workflow.
    let workflowId: string | undefined;
    if (dto.currentWorkflowStatusId) {
      const st = await this.prisma.workflowStatus.findUnique({
        where: { id: dto.currentWorkflowStatusId },
        select: { workflowId: true },
      });
      workflowId = st?.workflowId;
    }
    if (!workflowId) {
      const wf = await this.prisma.workflow.findFirst({
        where: { type: 'GLOBAL' },
        orderBy: { name: 'asc' },
        select: { id: true },
      });
      workflowId = wf?.id;
    }

    // A task has a single deadline (dueDate). Client-facing deadlines live only on the
    // project now — tasks no longer carry one.
    const internalDue = dto.dueDate ? new Date(dto.dueDate) : undefined;
    this.assertTaskDateOrder(dto.startDate ? new Date(dto.startDate) : undefined, internalDue);
    // Assign = staff: a lead assigning a not-yet-member auto-adds them to the project.
    await this.ensureAssigneesAreMembers([dto.projectId], dto.assigneeIds ?? []);

    // Only when a status is explicitly named — the common path adds no query.
    const createdClosed = dto.currentWorkflowStatusId
      ? (await this.prisma.workflowStatus.findUnique({
          where: { id: dto.currentWorkflowStatusId }, select: { type: true },
        }))?.type === 'CLOSED'
      : false;

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: internalDue,
          estimatedHours: dto.estimatedHours,
          createdBy: getActorId() ?? dto.createdBy ?? 'system',
          // Creating a task WITH assignees means the creator delegated it — record them as
          // the assigner (distinct from the assignees who will do the work).
          assignedById: dto.assigneeIds?.length ? (getActorId() ?? dto.createdBy ?? null) : null,
          workflowId,
          currentWorkflowStatusId: dto.currentWorkflowStatusId,
          // Almost always an opening status, but a client may name any status in the workflow.
          // A task created directly in a closed state is complete on arrival, and performance
          // should see that rather than a null it would later have to guess about.
          ...(createdClosed ? { completedAt: new Date() } : {}),
          assignees: dto.assigneeIds?.length
            ? { create: dto.assigneeIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: this.taskInclude(),
      });

      // L19: compute the sequence INSIDE the transaction (was read from a count()
      // outside it, so concurrent creates got the same sequence).
      const sequence = await tx.projectTask.count({ where: { taskListId: dto.taskListId } });
      await tx.projectTask.create({
        data: {
          projectId: dto.projectId,
          taskId: created.id,
          taskListId: dto.taskListId,
          sequence,
        },
      });

      return created;
    });

    await this.events.emit({
      action: EVENTS.TASK_CREATED,
      entityType: 'TASK',
      entityId: task.id,
      metadata: { projectId: dto.projectId, title: task.title },
    });
    await this.notifications.notify(dto.assigneeIds ?? [], {
      type: 'task.assigned',
      title: 'New task assigned',
      message: `You were assigned to "${task.title}".`,
    });
    await this.recomputeProjectProgress(dto.projectId); // new task dilutes/updates progress
    return task;
  }

  async list(projectId: string, opts: { taskListId?: string } = {}) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        projectTasks: {
          some: {
            projectId,
            taskListId: opts.taskListId,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      include: this.taskInclude(),
    });
    return tasks;
  }

  async listForUser(userId: string) {
    // A person may list their OWN assigned tasks; only a delivery lead may view someone
    // else's workload (prevents enumerating any colleague's tasks by passing their id).
    const actorId = getActorId();
    if (actorId && userId !== actorId && !(await this.access.hasOversight(actorId))) {
      throw new ForbiddenException('You can only view your own tasks.');
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        assignees: { some: { userId } },
        // Only tasks in a project the user is STILL an active member of. A leftover
        // TaskAssignee row after someone is removed from a project used to surface that
        // project on their Home — where the chip then 403s on click. Gate it at the source.
        projectTasks: { some: { project: { members: { some: { userId, isActive: true } } } } },
      },
      orderBy: { dueDate: 'asc' },
      include: {
        ...this.taskInclude(),
        // Override projectTasks from taskInclude() to also bring the project name — and the
        // PID, round, type and phase, so a My Tasks row can label its project and log time
        // against it without a second fetch.
        projectTasks: {
          select: {
            projectId: true,
            taskListId: true,
            sequence: true,
            project: { select: { id: true, title: true, code: true, roundSeq: true, projectType: true, projectPhase: true } },
          },
        },
      },
    });
    return tasks;
  }

  /** Unredacted read for internal callers (progress rollups, guards). */
  private async getRaw(id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: this.taskIncludeFull(),
    });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async get(id: string) {
    await this.access.assertTaskAccess(getActorId(), id);
    return this.getRaw(id);
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.access.assertTaskAccess(getActorId(), id);
    await this.access.assertTaskWritable(id); // no edits on a completed/closed matter's tasks
    const before = await this.getRaw(id);

    const internalDue = resolveDate(dto.dueDate, before.dueDate);
    // Validate the effective (post-update) order — a partial edit can't leave due < start.
    const effectiveStart = dto.startDate === undefined ? before.startDate : resolveDate(dto.startDate, null);
    this.assertTaskDateOrder(effectiveStart, internalDue);

    // Re-arm the overdue alert when the task can no longer be late for the reason it was
    // flagged — the internal deadline moved into the future, or was removed altogether — so
    // a future slip is reported again while the same slip never alerts twice.
    const rearm = !!before.overdueNotifiedAt && (!internalDue || internalDue >= startOfUtcDay(new Date()));

    // The task edit and the project progress it moves are one transaction: a progress bar that
    // reads from a task the update never committed (or the reverse) is a lie on two screens.
    const updated = await this.prisma.$transaction(async tx => {
      const u = await tx.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        completionPercentage: dto.completionPercentage,
        // `undefined` leaves the column alone; `null` CLEARS it. Collapsing the two would
        // make a date impossible to remove once set (the update silently no-ops).
        ...(dto.startDate === undefined ? {} : { startDate: resolveDate(dto.startDate, null) }),
        ...(dto.dueDate === undefined ? {} : { dueDate: internalDue }),
        estimatedHours: dto.estimatedHours,
        ...(rearm ? { overdueNotifiedAt: null } : {}),
      },
      include: this.taskInclude(),
      });
      if (dto.completionPercentage !== undefined) await this.recomputeForTask(id, tx);
      return u;
    });
    // M17: task edits now appear in the audit/activity/analytics feed.
    await this.events.emit({
      action: EVENTS.TASK_UPDATED,
      entityType: 'TASK',
      entityId: id,
      metadata: { projectId: (before.projectTasks ?? [])[0]?.projectId, title: updated.title },
    });
    return updated;
  }

  /**
   * Transition a task to a new WorkflowStatus.
   * If the target status has type CLOSED, all subtasks are also closed.
   */
  async setStatus(id: string, dto: SetStatusDto) {
    await this.access.assertTaskAccess(getActorId(), id);
    await this.access.assertTaskWritable(id); // no card moves on a completed/closed matter
    const task = await this.getRaw(id);

    const status = await this.prisma.workflowStatus.findUnique({
      where: { id: dto.statusId },
    });
    if (!status) throw new NotFoundException(`WorkflowStatus ${dto.statusId} not found`);
    // The workflow this task follows. Legacy/seed tasks created before workflowId was
    // backfilled carry null — adopt the target status's workflow rather than leaving the task
    // workflow-less. A null workflowId used to DISABLE both guards below, letting a card jump
    // to any status of any workflow with no membership or edge enforcement.
    const effectiveWorkflowId = task.workflowId ?? status.workflowId ?? null;

    // The target status must belong to the task's workflow.
    if (effectiveWorkflowId && status.workflowId && status.workflowId !== effectiveWorkflowId) {
      throw new BadRequestException(`Status ${dto.statusId} does not belong to this task's workflow`);
    }

    // If the workflow defines an explicit transition graph, honour it — a status change must
    // follow a defined edge (a null `fromStatusId` = "from any state"). Workflows with NO
    // transitions configured allow any move (backward-compatible with the current data), so
    // this only tightens things once an admin actually models the workflow.
    const currentStatusId = (task as any).currentWorkflowStatusId ?? null;
    if (effectiveWorkflowId && currentStatusId && currentStatusId !== status.id) {
      const transitions = await this.prisma.workflowTransition.findMany({
        where: { workflowId: effectiveWorkflowId }, select: { fromStatusId: true, toStatusId: true },
      });
      if (transitions.length &&
          !transitions.some(t => (t.fromStatusId === currentStatusId || t.fromStatusId === null) && t.toStatusId === status.id)) {
        throw new BadRequestException('That status change is not allowed by this workflow.');
      }
    }

    // Key the reset on the PRIOR status, not the percentage value: only reopening a
    // CLOSED task drops it to 0%. Previously any move to a non-CLOSED status wiped a
    // 100%-but-open task to 0% (e.g. Open@100% → In Progress lost the 100%).
    const wasClosed = (task as any).currentStatus?.type === 'CLOSED';
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.task.update({
        where: { id },
        data: {
          currentWorkflowStatusId: status.id,
          // Backfill the workflow on a legacy null-workflow task, so its subsequent moves are
          // edge-enforced instead of unguarded.
          ...(task.workflowId ? {} : effectiveWorkflowId ? { workflowId: effectiveWorkflowId } : {}),
          completionPercentage: status.type === 'CLOSED'
            ? 100
            : (wasClosed ? 0 : task.completionPercentage),
          // WHEN the work finished, recorded rather than inferred from updatedAt. Performance
          // reads this: taking updatedAt meant a task closed in January but edited in March
          // counted as completed in March, and an on-time delivery went retroactively late the
          // moment anybody edited it. Set on the way in, cleared on reopen, and left alone when
          // moving between two closed statuses — the work finished when it finished.
          ...(status.type === 'CLOSED'
            ? (wasClosed ? {} : { completedAt: new Date() })
            : (wasClosed ? { completedAt: null } : {})),
        },
        include: this.taskInclude(),
      });

      if (status.type === 'CLOSED') {
        // A closed task carries no open work — close its still-open subtasks.
        await tx.subtask.updateMany({
          where: { taskId: id, deletedAt: null, status: { not: 'CLOSED' } },
          data: { status: 'CLOSED' },
        });
      }
      // NOTE: reopening a task does NOT blind-reopen its subtasks. The old cascade reopened
      // ALL subtasks, destroying the state of ones a person had genuinely completed before the
      // task was closed. Completed subtask work stays completed; a specific subtask can be
      // reopened individually. (The subtask bar reading 100% under a reopened task is honest —
      // the work really was done — not an inconsistency.)

      await this.recomputeForTask(id, tx); // status change → progress bar re-syncs, atomically
      return u;
    });

    // Closing a task settles the person's clock, the learned estimate and today's timesheet.
    // Doing it HERE rather than only behind the Finish button is the point: a task ticked
    // complete in a project list, moved on the board, or closed from the detail panel all go
    // through setStatus, and every one of them used to leave the clock running and the hours
    // unfiled. Tolerant by design — a manager closing somebody else's task settles nothing and
    // must not be refused for it.
    let settle: Awaited<ReturnType<TaskTimeService['settleClose']>> | null = null;
    if (status.type === 'CLOSED') {
      try { settle = await this.time.settleClose(id); }
      catch (e) { console.warn(`[tasks] settling the clock on close failed for ${id}: ${String(e)}`); }
    }

    const projectId = (task as any).projectTasks?.[0]?.projectId;
    await this.events.emit({
      action: EVENTS.TASK_STATUS_CHANGED,
      entityType: 'TASK',
      entityId: id,
      oldValue: { status: (task as any).currentStatus?.name ?? null, type: (task as any).currentStatus?.type ?? null },
      newValue: { status: status.name, type: status.type },
      metadata: { projectId, title: task.title },
    });
    // The lifecycle act itself, recorded beside the generic status change so "who finished this,
    // and when" is one row rather than a status-id lookup against a workflow that may since have
    // been edited. Keyed on the SAME `wasClosed` flag the completedAt write above uses, so the
    // event and the timestamp cannot disagree — and a move between two closed statuses is
    // correctly neither a finish nor a reopen.
    if (status.type === 'CLOSED' && !wasClosed) {
      await this.events.emit({
        action: EVENTS.TASK_FINISHED,
        entityType: 'TASK',
        entityId: id,
        metadata: { projectId, title: task.title, status: status.name },
      });
    } else if (wasClosed && status.type !== 'CLOSED') {
      await this.events.emit({
        action: EVENTS.TASK_REOPENED,
        entityType: 'TASK',
        entityId: id,
        metadata: { projectId, title: task.title, status: status.name },
      });
    }
    // `settle` rides along so the screen can say what was filed without a second round trip.
    return Object.assign(updated as object, { settle }) as typeof updated & { settle: typeof settle };
  }

  /**
   * Finish a task: one click, no dialog, nothing to type.
   *
   * It resolves the workflow's completed status and goes through the ordinary status change, so
   * finishing does everything closing has always done — subtasks close, progress re-syncs, the
   * event is written — and, through that path, settles the clock, the learned estimate and
   * today's timesheet too.
   */
  async finish(id: string, closedStatusId?: string) {
    await this.access.assertTaskWritable(id);
    const current = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      select: { completedAt: true, currentStatus: { select: { type: true } } },
    });
    if (!current) throw new NotFoundException(`Task ${id} not found`);
    // Already finished — a double click, or somebody else closed it while this person's clock
    // was still running. Do NOT close it a second time: that would move completedAt, write a
    // second event and make a task look finished today that was finished last week. But DO
    // settle, or their hours are stranded on a task nobody will ever close again.
    if (current.completedAt || current.currentStatus?.type === 'CLOSED') {
      const settle = await this.time.settleClose(id).catch(() => null);
      const task = await this.get(id);
      return Object.assign(task as object, { settle, alreadyComplete: true });
    }
    const statusId = closedStatusId ?? await this.time.closedStatusFor(id);
    if (!statusId) {
      throw new BadRequestException('This task has no completed status in its workflow, so it cannot be finished. Add one to the workflow first.');
    }
    return this.setStatus(id, { statusId });
  }

  async setAssignees(id: string, dto: SetAssigneesDto) {
    await this.access.assertTaskAccess(getActorId(), id);
    await this.access.assertTaskWritable(id); // no reassigning (or auto-adding members) on a closed matter
    const before = await this.getRaw(id);
    // Assign = staff: a lead assigning a not-yet-member auto-adds them to the project.
    await this.ensureAssigneesAreMembers(await this.projectIdsForTask(id), dto.assigneeIds);
    const prev = new Set((before.assignees ?? []).map((a: any) => a.userId));
    // Whoever changes the assignees is the "assigned by" — the person delegating the work.
    // Clear it when the task is left unassigned.
    const assignedById = dto.assigneeIds.length ? (getActorId() ?? null) : null;
    await this.prisma.$transaction(async tx => {
      await this.reconcileAssignees(id, before.title, dto.assigneeIds.map(userId => ({ userId, role: null })), tx);
      await tx.task.update({ where: { id }, data: { assignedById } });
    });
    // Notify the NEWLY-added assignees only.
    const added = dto.assigneeIds.filter(uid => !prev.has(uid));
    await this.notifications.notify(added, {
      type: 'task.assigned',
      title: 'New task assigned',
      message: `You were assigned to "${before.title}".`,
    });
    await this.events.emit({
      action: EVENTS.TASK_ASSIGNED,
      entityType: 'TASK',
      entityId: id,
      metadata: { projectId: (before as any).projectTasks?.[0]?.projectId, title: before.title, added },
    });
    return this.get(id);
  }

  /**
   * Role-based staffing: replace a task's people with { userId, role (PM|REVIEWER|ANALYST),
   * estimatedHours } entries. At most one PM; per-person hours are OPTIONAL (default 0 — a
   * reviewer may be added with no estimate, or add a small estimate later); the task's total
   * estimatedHours becomes the SUM. Auto-adds not-yet-members (like setAssignees).
   */
  async setStaffing(id: string, dto: SetStaffingDto) {
    await this.access.assertTaskAccess(getActorId(), id);
    await this.access.assertTaskWritable(id);
    const before = await this.getRaw(id);

    const entries = dto.assignees ?? [];
    // A person may hold MULTIPLE roles on one task, but only once PER ROLE (the unique key is
    // taskId+userId+role). Dedupe by that pair; hours are optional (0 allowed).
    const seen = new Set<string>();
    for (const e of entries) {
      const key = `${e.userId}|${e.role}`;
      if (seen.has(key)) throw new BadRequestException('The same person is added twice in the same role.');
      seen.add(key);
      if (e.estimatedHours != null && e.estimatedHours < 0) throw new BadRequestException('Estimated hours cannot be negative.');
      // A plan that starts after it is due is not a plan. Caught here rather than left to the
      // board, which would otherwise place the work after the deadline and simply call it late.
      if (e.startDate && e.dueDate && new Date(e.startDate) > new Date(e.dueDate)) {
        throw new BadRequestException('A start date cannot be after the deadline for the same person.');
      }
      if (e.hoursPerDay != null && e.hoursPerDay < 0) throw new BadRequestException('Hours per day cannot be negative.');
    }
    if (entries.filter(e => e.role === 'PM').length > 1) {
      throw new BadRequestException('A task can have only one Project Manager.');
    }

    await this.ensureAssigneesAreMembers(await this.projectIdsForTask(id), [...new Set(entries.map(e => e.userId))]);
    const prev = new Set((before.assignees ?? []).map((a: any) => a.userId));
    const totalHours = entries.reduce((s, e) => s + (e.estimatedHours ?? 0), 0);
    const assignedById = entries.length ? (getActorId() ?? null) : null;

    // Seats and the task's summed estimate land together: the capacity board reads both, and a
    // crash between them left a task whose estimate did not match the hours on its seats.
    await this.prisma.$transaction(async tx => {
      await this.reconcileAssignees(id, before.title, entries.map(e => ({
        userId: e.userId, role: e.role,
        estimatedHours: e.estimatedHours ?? 0,
        dueDate: e.dueDate ? new Date(e.dueDate) : null,
        startDate: e.startDate ? new Date(e.startDate) : null,
        hoursPerDay: e.hoursPerDay != null && e.hoursPerDay > 0 ? e.hoursPerDay : null,
      })), tx);
      // The task's estimate is the sum of the per-person hours (drives the capacity board).
      await tx.task.update({ where: { id }, data: { assignedById, estimatedHours: totalHours } });
    });

    const added = [...new Set(entries.map(e => e.userId))].filter(uid => !prev.has(uid));
    await this.notifications.notify(added, {
      type: 'task.assigned', title: 'New task assigned',
      message: `You were assigned to "${before.title}".`,
    });
    await this.events.emit({
      action: EVENTS.TASK_ASSIGNED, entityType: 'TASK', entityId: id,
      metadata: { projectId: (before as any).projectTasks?.[0]?.projectId, title: before.title, added, staffing: true },
    });
    return this.get(id);
  }

  async softDelete(id: string) {
    await this.access.assertTaskAccess(getActorId(), id);
    await this.access.assertTaskWritable(id); // no deleting a completed/closed matter's tasks
    const task = await this.getRaw(id);
    // Take this task's hours back out of the learned averages BEFORE it leaves the books.
    // Otherwise a deleted task keeps shaping what every future task of its kind is expected
    // to take, with no row on any screen to explain why.
    await this.time.withdraw(id);
    const result = await this.prisma.$transaction(async tx => {
      const r = await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.recomputeForTask(id, tx); // deleted task excluded → progress recomputes, atomically
      return r;
    });
    await this.events.emit({
      action: EVENTS.TASK_DELETED,
      entityType: 'TASK',
      entityId: id,
      metadata: { projectId: (task as any).projectTasks?.[0]?.projectId, title: task.title },
    });
    return result;
  }

  /**
   * Move ONE person's deadline on a task — their seat's own due date — leaving the task's
   * deadline and everyone else's untouched. The capacity board plans each person to their own
   * deadline when they have one, so this is how "give Anant until Friday" is said without giving
   * it to the whole team. `null` clears it; they then fall back to the task's deadline.
   */
  async setAssigneeDeadline(taskId: string, userId: string, dueDate: string | null) {
    await this.access.assertTaskAccess(getActorId(), taskId);
    const task = await this.getRaw(taskId);
    const seats = await this.prisma.taskAssignee.findMany({ where: { taskId, userId }, select: { id: true, dueDate: true } });
    if (!seats.length) throw new NotFoundException('That person is not assigned to this task.');
    const due = dueDate ? new Date(dueDate) : null;
    if (due && isNaN(due.getTime())) throw new BadRequestException('A valid date is required.');
    // Every seat the person holds on the task (two roles are still one person, one deadline).
    await this.prisma.taskAssignee.updateMany({ where: { taskId, userId }, data: { dueDate: due } });
    await this.events.emit({
      action: EVENTS.TASK_UPDATED,
      entityType: 'TASK',
      entityId: taskId,
      oldValue: { assigneeDeadline: { userId, dueDate: seats[0].dueDate } },
      newValue: { assigneeDeadline: { userId, dueDate: due } },
      metadata: { projectId: (task as any).projectTasks?.[0]?.projectId, title: task.title, assigneeDeadline: true },
    });
    if (userId !== getActorId()) {
      const when = due ? due.toISOString().slice(0, 10) : null;
      await this.notifications.notify([userId], {
        type: 'task.deadline',
        title: when ? 'Your deadline moved' : 'Your own deadline was cleared',
        message: when
          ? `Your deadline on "${task.title}" is now ${when}. Nobody else's moved.`
          : `Your own deadline on "${task.title}" was cleared — the task's deadline applies again.`,
        link: '/tasks',
      });
    }
    return { taskId, userId, dueDate: due };
  }

  /**
   * Recompute a project's completionPercentage from its (non-deleted) tasks.
   * A task counts as 100% when it is in a CLOSED-type workflow status, otherwise
   * its own completionPercentage. Project progress = the average across all tasks
   * (0 when the project has no tasks). This is the single source of truth for the
   * progress bars — called after every task create / status change / edit / delete.
   */
  private async recomputeProjectProgress(projectId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const tasks = await tx.task.findMany({
      where: { deletedAt: null, projectTasks: { some: { projectId } } },
      select: { completionPercentage: true, currentStatus: { select: { type: true } } },
    });
    const effective = tasks.map(t => (t.currentStatus?.type === 'CLOSED' ? 100 : (t.completionPercentage ?? 0)));
    const pct = effective.length ? Math.round(effective.reduce((s, v) => s + v, 0) / effective.length) : 0;
    await tx.project.update({ where: { id: projectId }, data: { completionPercentage: pct } });
  }

  /**
   * Recompute every PARENT project a task rolls up into. A task is M2M with projects via
   * ProjectTask, so a single status change/edit/delete can move several progress bars.
   */
  private async recomputeForTask(taskId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const links = await tx.projectTask.findMany({ where: { taskId }, select: { projectId: true } });
    const projectIds = [...new Set(links.map(l => l.projectId))];
    // Sequential, not Promise.all: an interactive transaction is one connection, and concurrent
    // statements on it interleave in whatever order they arrive.
    for (const id of projectIds) await this.recomputeProjectProgress(id, tx);
  }

  // ── Subtask methods (flat, one level only) ──────────────────

  async createSubtask(taskId: string, dto: CreateSubtaskDto) {
    await this.access.assertTaskAccess(getActorId(), taskId);
    await this.access.assertTaskWritable(taskId); // no new subtasks on a completed/closed matter
    const parent = await this.getRaw(taskId);
    // Don't hang open work off a completed task — reopen it first. Otherwise a CLOSED task
    // silently carries an OPEN subtask (the close cascade only runs at close-time).
    if ((parent as any).currentStatus?.type === 'CLOSED') {
      throw new BadRequestException('This task is complete — reopen it before adding subtasks.');
    }
    await this.ensureAssigneesAreMembers(await this.projectIdsForTask(taskId), dto.assigneeIds ?? []);
    const subtask = await this.prisma.subtask.create({
      data: {
        taskId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignees: dto.assigneeIds?.length
          ? { create: dto.assigneeIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: { assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    await this.events.emit({
      action: EVENTS.SUBTASK_CREATED,
      entityType: 'SUBTASK',
      entityId: subtask.id,
      metadata: { taskId, title: subtask.title },
    });
    return subtask;
  }

  async listSubtasks(taskId: string) {
    await this.access.assertTaskAccess(getActorId(), taskId); // S1: was an unguarded IDOR
    return this.prisma.subtask.findMany({
      where: { taskId, deletedAt: null },
      include: { assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Fetch a subtask, asserting it really belongs to the parent task named in the URL and that
   *  the parent task itself is live (not soft-deleted). */
  private async getSubtaskOfParent(parentTaskId: string, subtaskId: string) {
    const parent = await this.prisma.task.findFirst({ where: { id: parentTaskId, deletedAt: null }, select: { id: true } });
    if (!parent) throw new NotFoundException(`Task ${parentTaskId} not found`);
    const subtask = await this.prisma.subtask.findFirst({ where: { id: subtaskId, deletedAt: null } });
    if (!subtask || subtask.taskId !== parentTaskId) throw new NotFoundException(`Subtask ${subtaskId} not found`);
    await this.access.assertTaskAccess(getActorId(), subtask.taskId);
    return subtask;
  }

  async closeSubtask(parentTaskId: string, subtaskId: string) {
    const subtask = await this.getSubtaskOfParent(parentTaskId, subtaskId);
    await this.access.assertTaskWritable(parentTaskId); // no subtask changes on a completed/closed matter
    const updated = await this.prisma.subtask.update({ where: { id: subtaskId }, data: { status: 'CLOSED' } });
    await this.events.emit({
      action: EVENTS.SUBTASK_CLOSED, entityType: 'SUBTASK', entityId: subtaskId,
      metadata: { taskId: parentTaskId, title: subtask.title },
    });
    return updated;
  }

  /** Reopen a closed subtask (there was previously no way back once closed / after a parent-close cascade). */
  async reopenSubtask(parentTaskId: string, subtaskId: string) {
    const subtask = await this.getSubtaskOfParent(parentTaskId, subtaskId);
    await this.access.assertTaskWritable(parentTaskId);
    const updated = await this.prisma.subtask.update({ where: { id: subtaskId }, data: { status: 'OPEN' } });
    await this.events.emit({
      action: EVENTS.SUBTASK_REOPENED, entityType: 'SUBTASK', entityId: subtaskId,
      metadata: { taskId: parentTaskId, title: subtask.title },
    });
    return updated;
  }

  /** Edit a subtask's title (and optional description / priority / due date). */
  async updateSubtask(parentTaskId: string, subtaskId: string, dto: UpdateSubtaskDto) {
    const subtask = await this.getSubtaskOfParent(parentTaskId, subtaskId);
    await this.access.assertTaskWritable(parentTaskId); // no edits on a completed/closed matter
    const updated = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
      },
      include: { assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    await this.events.emit({
      action: EVENTS.SUBTASK_UPDATED, entityType: 'SUBTASK', entityId: subtaskId,
      metadata: { taskId: parentTaskId, title: updated.title },
    });
    return updated;
  }

  async softDeleteSubtask(parentTaskId: string, subtaskId: string) {
    const subtask = await this.getSubtaskOfParent(parentTaskId, subtaskId);
    await this.access.assertTaskWritable(parentTaskId);
    const deleted = await this.prisma.subtask.update({ where: { id: subtaskId }, data: { deletedAt: new Date() } });
    await this.events.emit({
      action: EVENTS.SUBTASK_DELETED, entityType: 'SUBTASK', entityId: subtaskId,
      metadata: { taskId: parentTaskId, title: subtask.title },
    });
    return deleted;
  }

  private taskInclude() {
    return {
      currentStatus: { select: { id: true, name: true, colorHex: true, type: true } },
      assignedBy: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      assignees: {
        select: { userId: true, role: true, estimatedHours: true, dueDate: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
      },
      subtasks: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
      },
      projectTasks: {
        select: { projectId: true, taskListId: true, sequence: true },
      },
      _count: { select: { subtasks: true, checklists: true } },
    };
  }

  /** Full subtask rows needed for the single-task detail view. */
  private taskIncludeFull() {
    return {
      currentStatus: { select: { id: true, name: true, colorHex: true, type: true } },
      assignedBy: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      assignees: {
        select: { userId: true, role: true, estimatedHours: true, dueDate: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
      },
      subtasks: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' as const },
        include: {
          assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } } },
        },
      },
      projectTasks: {
        select: { projectId: true, taskListId: true, sequence: true },
      },
      _count: { select: { subtasks: true, checklists: true } },
    };
  }
}
