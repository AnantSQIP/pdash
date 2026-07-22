import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateSubtaskDto, CreateTaskDto, SetAssigneesDto, SetStatusDto, UpdateTaskDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { startOfUtcDay, resolveDate } from '../../common/dates';


@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly deadlines: DeadlineVisibilityService,
    private readonly access: ProjectAccessService,
  ) {}

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
      },
      orderBy: { dueDate: 'asc' },
      include: {
        ...this.taskInclude(),
        // Override projectTasks from taskInclude() to also bring the project name
        projectTasks: {
          select: {
            projectId: true,
            taskListId: true,
            sequence: true,
            project: { select: { id: true, title: true } },
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
    const before = await this.getRaw(id);

    const internalDue = resolveDate(dto.dueDate, before.dueDate);
    // Validate the effective (post-update) order — a partial edit can't leave due < start.
    const effectiveStart = dto.startDate === undefined ? before.startDate : resolveDate(dto.startDate, null);
    this.assertTaskDateOrder(effectiveStart, internalDue);

    // Re-arm the overdue alert when the task can no longer be late for the reason it was
    // flagged — the internal deadline moved into the future, or was removed altogether — so
    // a future slip is reported again while the same slip never alerts twice.
    const rearm = !!before.overdueNotifiedAt && (!internalDue || internalDue >= startOfUtcDay(new Date()));

    const updated = await this.prisma.task.update({
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
    if (dto.completionPercentage !== undefined) await this.recomputeForTask(id);
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
    const task = await this.getRaw(id);

    const status = await this.prisma.workflowStatus.findUnique({
      where: { id: dto.statusId },
    });
    if (!status) throw new NotFoundException(`WorkflowStatus ${dto.statusId} not found`);
    // The target status must belong to the task's own workflow.
    if (task.workflowId && status.workflowId && status.workflowId !== task.workflowId) {
      throw new BadRequestException(`Status ${dto.statusId} does not belong to this task's workflow`);
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
          completionPercentage: status.type === 'CLOSED'
            ? 100
            : (wasClosed ? 0 : task.completionPercentage),
        },
        include: this.taskInclude(),
      });

      if (status.type === 'CLOSED') {
        await tx.subtask.updateMany({
          where: { taskId: id, deletedAt: null },
          data: { status: 'CLOSED' },
        });
      } else if (wasClosed) {
        // D2: reopening a completed task must reopen its subtasks too — otherwise the
        // subtask bar stays 100% while the task reads 0%/Open.
        await tx.subtask.updateMany({
          where: { taskId: id, deletedAt: null },
          data: { status: 'OPEN' },
        });
      }

      return u;
    });

    const projectId = (task as any).projectTasks?.[0]?.projectId;
    await this.events.emit({
      action: EVENTS.TASK_STATUS_CHANGED,
      entityType: 'TASK',
      entityId: id,
      oldValue: { status: (task as any).currentStatus?.name ?? null, type: (task as any).currentStatus?.type ?? null },
      newValue: { status: status.name, type: status.type },
      metadata: { projectId, title: task.title },
    });
    await this.recomputeForTask(id); // status change → progress bar re-syncs
    return updated;
  }

  async setAssignees(id: string, dto: SetAssigneesDto) {
    await this.access.assertTaskAccess(getActorId(), id);
    const before = await this.getRaw(id);
    // Assign = staff: a lead assigning a not-yet-member auto-adds them to the project.
    await this.ensureAssigneesAreMembers(await this.projectIdsForTask(id), dto.assigneeIds);
    const prev = new Set((before.assignees ?? []).map((a: any) => a.userId));
    // Whoever changes the assignees is the "assigned by" — the person delegating the work.
    // Clear it when the task is left unassigned.
    const assignedById = dto.assigneeIds.length ? (getActorId() ?? null) : null;
    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({ where: { taskId: id } }),
      this.prisma.taskAssignee.createMany({
        data: dto.assigneeIds.map((userId) => ({ taskId: id, userId })),
        skipDuplicates: true,
      }),
      this.prisma.task.update({ where: { id }, data: { assignedById } }),
    ]);
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

  async softDelete(id: string) {
    await this.access.assertTaskAccess(getActorId(), id);
    const task = await this.getRaw(id);
    const result = await this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.events.emit({
      action: EVENTS.TASK_DELETED,
      entityType: 'TASK',
      entityId: id,
      metadata: { projectId: (task as any).projectTasks?.[0]?.projectId, title: task.title },
    });
    await this.recomputeForTask(id); // deleted task excluded → progress recomputes
    return result;
  }

  /**
   * Recompute a project's completionPercentage from its (non-deleted) tasks.
   * A task counts as 100% when it is in a CLOSED-type workflow status, otherwise
   * its own completionPercentage. Project progress = the average across all tasks
   * (0 when the project has no tasks). This is the single source of truth for the
   * progress bars — called after every task create / status change / edit / delete.
   */
  private async recomputeProjectProgress(projectId: string): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: { deletedAt: null, projectTasks: { some: { projectId } } },
      select: { completionPercentage: true, currentStatus: { select: { type: true } } },
    });
    const effective = tasks.map(t => (t.currentStatus?.type === 'CLOSED' ? 100 : (t.completionPercentage ?? 0)));
    const pct = effective.length ? Math.round(effective.reduce((s, v) => s + v, 0) / effective.length) : 0;
    await this.prisma.project.update({ where: { id: projectId }, data: { completionPercentage: pct } });
  }

  /**
   * Recompute every PARENT project a task rolls up into. A task is M2M with projects via
   * ProjectTask, so a single status change/edit/delete can move several progress bars.
   */
  private async recomputeForTask(taskId: string): Promise<void> {
    const links = await this.prisma.projectTask.findMany({ where: { taskId }, select: { projectId: true } });
    const projectIds = [...new Set(links.map(l => l.projectId))];
    await Promise.all(projectIds.map(id => this.recomputeProjectProgress(id)));
  }

  // ── Subtask methods (flat, one level only) ──────────────────

  async createSubtask(taskId: string, dto: CreateSubtaskDto) {
    await this.access.assertTaskAccess(getActorId(), taskId);
    await this.getRaw(taskId);
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

  /** Fetch a subtask, asserting it really belongs to the parent task named in the URL. */
  private async getSubtaskOfParent(parentTaskId: string, subtaskId: string) {
    const subtask = await this.prisma.subtask.findFirst({ where: { id: subtaskId, deletedAt: null } });
    if (!subtask || subtask.taskId !== parentTaskId) throw new NotFoundException(`Subtask ${subtaskId} not found`);
    await this.access.assertTaskAccess(getActorId(), subtask.taskId);
    return subtask;
  }

  async closeSubtask(parentTaskId: string, subtaskId: string) {
    await this.getSubtaskOfParent(parentTaskId, subtaskId);
    return this.prisma.subtask.update({ where: { id: subtaskId }, data: { status: 'CLOSED' } });
  }

  /** Reopen a closed subtask (there was previously no way back once closed / after a parent-close cascade). */
  async reopenSubtask(parentTaskId: string, subtaskId: string) {
    await this.getSubtaskOfParent(parentTaskId, subtaskId);
    return this.prisma.subtask.update({ where: { id: subtaskId }, data: { status: 'OPEN' } });
  }

  async softDeleteSubtask(parentTaskId: string, subtaskId: string) {
    await this.getSubtaskOfParent(parentTaskId, subtaskId);
    return this.prisma.subtask.update({ where: { id: subtaskId }, data: { deletedAt: new Date() } });
  }

  private taskInclude() {
    return {
      currentStatus: { select: { id: true, name: true, colorHex: true, type: true } },
      assignedBy: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      assignees: {
        select: { userId: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
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
        select: { userId: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
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
