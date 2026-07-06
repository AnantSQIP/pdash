import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateTimesheetDto, UpdateTimesheetDto } from './dto';

const USER_SELECT = { id: true, firstName: true, lastName: true };
const TASK_SELECT = { id: true, title: true };

const INCLUDE = { user: { select: USER_SELECT }, task: { select: TASK_SELECT } } as const;

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  /** Keep Task.actualHours in sync = SUM of its non-deleted timesheet hours. */
  private async recomputeTaskActualHours(taskId: string): Promise<void> {
    const agg = await this.prisma.timesheet.aggregate({
      where: { taskId, deletedAt: null },
      _sum: { hoursLogged: true },
    });
    await this.prisma.task.update({ where: { id: taskId }, data: { actualHours: agg._sum.hoursLogged ?? 0 } });
  }

  async listForProject(projectId: string) {
    const projectTasks = await this.prisma.projectTask.findMany({
      where: { projectId },
      select: { taskId: true },
    });
    const taskIds = projectTasks.map((pt) => pt.taskId);
    if (!taskIds.length) return [];

    return this.prisma.timesheet.findMany({
      where: { taskId: { in: taskIds }, deletedAt: null },
      include: INCLUDE,
      orderBy: { date: 'desc' },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.timesheet.findMany({
      where: { userId, deletedAt: null },
      include: INCLUDE,
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreateTimesheetDto) {
    const entry = await this.prisma.timesheet.create({
      data: {
        userId: dto.userId,
        taskId: dto.taskId,
        date: new Date(dto.date),
        hoursLogged: dto.hoursLogged,
        billable: dto.billable ?? true,
        notes: dto.notes,
      },
      include: INCLUDE,
    });
    await this.events.emit({
      action: EVENTS.TIME_LOGGED,
      entityType: 'TIMESHEET',
      entityId: entry.id,
      actorId: dto.userId,
      metadata: { taskId: dto.taskId, hours: dto.hoursLogged, billable: entry.billable },
    });
    await this.recomputeTaskActualHours(dto.taskId);
    return entry;
  }

  async update(id: string, dto: UpdateTimesheetDto) {
    const entry = await this.prisma.timesheet.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException(`Timesheet ${id} not found`);

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: {
        hoursLogged: dto.hoursLogged,
        billable: dto.billable,
        notes: dto.notes,
      },
      include: INCLUDE,
    });
    if (dto.hoursLogged !== undefined) await this.recomputeTaskActualHours(entry.taskId);
    return updated;
  }

  async softDelete(id: string) {
    const entry = await this.prisma.timesheet.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException(`Timesheet ${id} not found`);
    const deleted = await this.prisma.timesheet.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.recomputeTaskActualHours(entry.taskId);
    return deleted;
  }
}
