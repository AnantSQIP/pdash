import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubtaskDto, CreateTaskDto, SetAssigneesDto, SetStatusDto, UpdateTaskDto } from './dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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

    const sequence = await this.prisma.projectTask.count({
      where: { taskListId: dto.taskListId },
    });

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          estimatedHours: dto.estimatedHours,
          createdBy: dto.createdBy,
          currentWorkflowStatusId: dto.currentWorkflowStatusId,
          assignees: dto.assigneeIds?.length
            ? { create: dto.assigneeIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: this.taskInclude(),
      });

      await tx.projectTask.create({
        data: {
          projectId: dto.projectId,
          taskId: task.id,
          taskListId: dto.taskListId,
          milestoneId: dto.milestoneId,
          sequence,
        },
      });

      return task;
    });
  }

  list(projectId: string, opts: { taskListId?: string; milestoneId?: string } = {}) {
    return this.prisma.task.findMany({
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
  }

  listForUser(userId: string) {
    return this.prisma.task.findMany({
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
  }

  async get(id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: this.taskIncludeFull(),
    });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.get(id);
    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        completionPercentage: dto.completionPercentage,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        estimatedHours: dto.estimatedHours,
      },
      include: this.taskInclude(),
    });
  }

  /**
   * Transition a task to a new WorkflowStatus.
   * If the target status has type CLOSED, all subtasks are also closed.
   */
  async setStatus(id: string, dto: SetStatusDto) {
    const task = await this.get(id);

    const status = await this.prisma.workflowStatus.findUnique({
      where: { id: dto.statusId },
    });
    if (!status) throw new NotFoundException(`WorkflowStatus ${dto.statusId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          currentWorkflowStatusId: status.id,
          completionPercentage: status.type === 'CLOSED' ? 100 : task.completionPercentage,
        },
        include: this.taskInclude(),
      });

      if (status.type === 'CLOSED') {
        await tx.subtask.updateMany({
          where: { taskId: id, deletedAt: null },
          data: { status: 'CLOSED' },
        });
      }

      return updated;
    });
  }

  async setAssignees(id: string, dto: SetAssigneesDto) {
    await this.get(id);
    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({ where: { taskId: id } }),
      this.prisma.taskAssignee.createMany({
        data: dto.assigneeIds.map((userId) => ({ taskId: id, userId })),
        skipDuplicates: true,
      }),
    ]);
    return this.get(id);
  }

  async softDelete(id: string) {
    await this.get(id);
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ── Subtask methods (flat, one level only) ──────────────────

  async createSubtask(taskId: string, dto: CreateSubtaskDto) {
    await this.get(taskId);
    return this.prisma.subtask.create({
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

  async softDeleteSubtask(subtaskId: string) {
    const subtask = await this.prisma.subtask.findFirst({ where: { id: subtaskId, deletedAt: null } });
    if (!subtask) throw new NotFoundException(`Subtask ${subtaskId} not found`);
    return this.prisma.subtask.update({ where: { id: subtaskId }, data: { deletedAt: new Date() } });
  }

  private taskInclude() {
    return {
      currentStatus: { select: { id: true, name: true, colorHex: true, type: true } },
      assignees: {
        select: { user: { select: { id: true, firstName: true, lastName: true } } },
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
        select: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
      subtasks: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' as const },
        include: {
          assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        },
      },
      projectTasks: {
        select: { projectId: true, taskListId: true, milestoneId: true, sequence: true },
      },
      _count: { select: { subtasks: true, checklists: true } },
    };
  }
}
