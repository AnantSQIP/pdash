import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateSubtaskDto, CreateTaskDto, SetAssigneesDto, SetStatusDto, UpdateTaskDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';

/** Deadlines are date-only values stored at UTC midnight — compare on that boundary. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly deadlines: DeadlineVisibilityService,
  ) {}

  /** Strip the client deadline from a single task unless this actor may see it. */
  private async redact<T extends { clientDueDate?: Date | null; projectTasks?: { projectId: string }[] }>(task: T): Promise<T> {
    return this.deadlines.redactTask(task, await this.deadlines.scope());
  }

  /**
   * Create a task and link it to a project via ProjectTask.
   * Task has no projectId — ProjectTask is the join record that also
   * stores the task's position (taskList + milestone) within that project.
   */
  async create(dto: CreateTaskDto) {
    const taskList = await this.prisma.taskList.findFirst({
      where: { id: dto.taskListId, projectId: dto.projectId, deletedAt: null },
    });
    if (!taskList) {
      throw new BadRequestException(`TaskList ${dto.taskListId} not found in project ${dto.projectId}`);
    }

    // A supplied milestone must belong to the same project (the FK only enforces existence).
    if (dto.milestoneId) {
      const milestone = await this.prisma.milestone.findFirst({
        where: { id: dto.milestoneId, projectId: dto.projectId, deletedAt: null },
      });
      if (!milestone) {
        throw new BadRequestException(`Milestone ${dto.milestoneId} not found in project ${dto.projectId}`);
      }
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

    // Dual deadlines: the internal date is open to all; setting the CLIENT date needs
    // deadline.view.client (or managing this project), and it must not precede it.
    const scope = await this.deadlines.scope();
    const internalDue = dto.dueDate ? new Date(dto.dueDate) : undefined;
    const clientDue = dto.clientDueDate ? new Date(dto.clientDueDate) : undefined;
    if (clientDue) await this.deadlines.assertMaySetClientDue([dto.projectId], scope);
    this.deadlines.assertOrdered(internalDue, clientDue);

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: internalDue,
          clientDueDate: clientDue,
          estimatedHours: dto.estimatedHours,
          createdBy: getActorId() ?? dto.createdBy ?? 'system',
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
          milestoneId: dto.milestoneId,
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
    if (dto.milestoneId) await this.recomputeMilestoneProgress(dto.milestoneId);
    return this.deadlines.redactTask(task, scope);
  }

  async list(projectId: string, opts: { taskListId?: string; milestoneId?: string } = {}) {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        projectTasks: {
          some: {
            projectId,
            taskListId: opts.taskListId,
            milestoneId: opts.milestoneId,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      include: this.taskInclude(),
    });
    return this.deadlines.redactTasks(tasks, await this.deadlines.scope());
  }

  async listForUser(userId: string) {
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
            milestoneId: true,
            sequence: true,
            project: { select: { id: true, title: true } },
          },
        },
      },
    });
    return this.deadlines.redactTasks(tasks, await this.deadlines.scope());
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
    return this.redact(await this.getRaw(id));
  }

  async update(id: string, dto: UpdateTaskDto) {
    const before = await this.getRaw(id);
    const projectIds = (before.projectTasks ?? []).map(pt => pt.projectId);

    // Dual deadlines: only a client-deadline viewer (or this project's manager) may set
    // one, and the internal date must not fall after it. Compare against the incoming
    // value or the stored one, so a partial edit is still validated.
    const scope = await this.deadlines.scope();
    if (dto.clientDueDate !== undefined) await this.deadlines.assertMaySetClientDue(projectIds, scope);
    const internalDue = dto.dueDate ? new Date(dto.dueDate) : before.dueDate;
    const clientDue = dto.clientDueDate ? new Date(dto.clientDueDate) : before.clientDueDate;
    this.deadlines.assertOrdered(internalDue, clientDue);

    // Moving the internal deadline into the future re-arms the overdue alert, so a task
    // that slips again is reported again — while never re-alerting for the same slip.
    const rearm = !!internalDue && internalDue >= startOfUtcDay(new Date()) && !!before.overdueNotifiedAt;

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        completionPercentage: dto.completionPercentage,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        clientDueDate: dto.clientDueDate ? new Date(dto.clientDueDate) : undefined,
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
      metadata: { projectId: projectIds[0], title: updated.title },
    });
    return this.deadlines.redactTask(updated, scope);
  }

  /**
   * Transition a task to a new WorkflowStatus.
   * If the target status has type CLOSED, all subtasks are also closed.
   */
  async setStatus(id: string, dto: SetStatusDto) {
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
    return this.redact(updated);
  }

  async setAssignees(id: string, dto: SetAssigneesDto) {
    const before = await this.getRaw(id);
    const prev = new Set((before.assignees ?? []).map((a: any) => a.userId));
    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({ where: { taskId: id } }),
      this.prisma.taskAssignee.createMany({
        data: dto.assigneeIds.map((userId) => ({ taskId: id, userId })),
        skipDuplicates: true,
      }),
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

  /** Recompute a milestone's completionPercentage from its tasks (same rule as projects). */
  private async recomputeMilestoneProgress(milestoneId: string): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: { deletedAt: null, projectTasks: { some: { milestoneId } } },
      select: { completionPercentage: true, currentStatus: { select: { type: true } } },
    });
    const effective = tasks.map(t => (t.currentStatus?.type === 'CLOSED' ? 100 : (t.completionPercentage ?? 0)));
    const pct = effective.length ? Math.round(effective.reduce((s, v) => s + v, 0) / effective.length) : 0;
    await this.prisma.milestone.update({ where: { id: milestoneId }, data: { completionPercentage: pct } });
  }

  /**
   * Recompute every PARENT a task rolls up into — its project(s) AND its milestone(s).
   * Tasks are M2M with both via ProjectTask (projectId + optional milestoneId), so a
   * single status change/edit/delete can move several progress bars.
   */
  private async recomputeForTask(taskId: string): Promise<void> {
    const links = await this.prisma.projectTask.findMany({ where: { taskId }, select: { projectId: true, milestoneId: true } });
    const projectIds = [...new Set(links.map(l => l.projectId))];
    const milestoneIds = [...new Set(links.map(l => l.milestoneId).filter((m): m is string => !!m))];
    await Promise.all([
      ...projectIds.map(id => this.recomputeProjectProgress(id)),
      ...milestoneIds.map(id => this.recomputeMilestoneProgress(id)),
    ]);
  }

  // ── Subtask methods (flat, one level only) ──────────────────

  async createSubtask(taskId: string, dto: CreateSubtaskDto) {
    await this.getRaw(taskId);
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

  listSubtasks(taskId: string) {
    return this.prisma.subtask.findMany({
      where: { taskId, deletedAt: null },
      include: { assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async closeSubtask(subtaskId: string) {
    const subtask = await this.prisma.subtask.findFirst({ where: { id: subtaskId, deletedAt: null } });
    if (!subtask) throw new NotFoundException(`Subtask ${subtaskId} not found`);
    return this.prisma.subtask.update({ where: { id: subtaskId }, data: { status: 'CLOSED' } });
  }

  /** Reopen a closed subtask (there was previously no way back once closed / after a parent-close cascade). */
  async reopenSubtask(subtaskId: string) {
    const subtask = await this.prisma.subtask.findFirst({ where: { id: subtaskId, deletedAt: null } });
    if (!subtask) throw new NotFoundException(`Subtask ${subtaskId} not found`);
    return this.prisma.subtask.update({ where: { id: subtaskId }, data: { status: 'OPEN' } });
  }

  async softDeleteSubtask(subtaskId: string) {
    const subtask = await this.prisma.subtask.findFirst({ where: { id: subtaskId, deletedAt: null } });
    if (!subtask) throw new NotFoundException(`Subtask ${subtaskId} not found`);
    return this.prisma.subtask.update({ where: { id: subtaskId }, data: { deletedAt: new Date() } });
  }

  private taskInclude() {
    return {
      currentStatus: { select: { id: true, name: true, colorHex: true, type: true } },
      assignees: {
        select: { userId: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
      },
      subtasks: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
      },
      projectTasks: {
        select: { projectId: true, taskListId: true, milestoneId: true, sequence: true },
      },
      _count: { select: { subtasks: true, checklists: true } },
    };
  }

  /** Full subtask rows needed for the single-task detail view. */
  private taskIncludeFull() {
    return {
      currentStatus: { select: { id: true, name: true, colorHex: true, type: true } },
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
        select: { projectId: true, taskListId: true, milestoneId: true, sequence: true },
      },
      _count: { select: { subtasks: true, checklists: true } },
    };
  }
}
