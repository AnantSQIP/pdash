import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from '../permissions/permission.service';
import { EVENTS } from '../../common/events/canonical-events';
import { getActorId } from '../../common/context/request-context';
import { CreateTimesheetDto, UpdateTimesheetDto } from './dto';

const USER_SELECT = { id: true, firstName: true, lastName: true };
const TASK_SELECT = { id: true, title: true };
const PAGE_CAP = 500;

const INCLUDE = { user: { select: USER_SELECT }, task: { select: TASK_SELECT } } as const;

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
  ) {}

  private async actor() {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    return actorId;
  }

  /** Only the owner (or a Super Admin) may read/mutate a given user's entries. */
  private async assertOwnerOrPrivileged(ownerId: string) {
    const actorId = await this.actor();
    if (actorId === ownerId) return;
    const perms = await this.permissions.getEffectivePermissions(actorId);
    if (!perms.isSuperAdmin) throw new ForbiddenException('You can only manage your own timesheets.');
  }

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
      take: PAGE_CAP,
    });
  }

  async listForUser(requestedUserId?: string) {
    const actorId = await this.actor();
    const userId = requestedUserId ?? actorId;
    await this.assertOwnerOrPrivileged(userId); // ?userId is scoped to self unless Super Admin
    return this.prisma.timesheet.findMany({
      where: { userId, deletedAt: null },
      include: INCLUDE,
      orderBy: { date: 'desc' },
      take: PAGE_CAP,
    });
  }

  async create(dto: CreateTimesheetDto) {
    // SECURITY: the owner is the authenticated actor — never the client-supplied
    // dto.userId (which is ignored). Prevents logging/inflating others' hours.
    const actorId = await this.actor();
    const task = await this.prisma.task.findFirst({
      where: { id: dto.taskId, deletedAt: null },
      select: { id: true, projectTasks: { select: { project: { select: { billable: true } } }, take: 1 } },
    });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found`);
    // If an admin has decided billability at the PROJECT level, every timesheet on it
    // inherits that decision — the logger's own choice is ignored. Only when the project
    // is undecided (null) does the logged value (default billable) apply.
    const projectBillable = task.projectTasks[0]?.project?.billable;
    const billable = projectBillable != null ? projectBillable : (dto.billable ?? true);
    const entry = await this.prisma.timesheet.create({
      data: {
        userId: actorId,
        taskId: dto.taskId,
        date: new Date(dto.date),
        hoursLogged: dto.hoursLogged,
        billable,
        notes: dto.notes,
      },
      include: INCLUDE,
    });
    await this.events.emit({
      action: EVENTS.TIME_LOGGED,
      entityType: 'TIMESHEET',
      entityId: entry.id,
      actorId,
      metadata: { taskId: dto.taskId, hours: dto.hoursLogged, billable: entry.billable },
    });
    await this.recomputeTaskActualHours(dto.taskId);
    return entry;
  }

  async update(id: string, dto: UpdateTimesheetDto) {
    const entry = await this.prisma.timesheet.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException(`Timesheet ${id} not found`);
    await this.assertOwnerOrPrivileged(entry.userId);

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
    await this.assertOwnerOrPrivileged(entry.userId);
    const deleted = await this.prisma.timesheet.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.recomputeTaskActualHours(entry.taskId);
    return deleted;
  }
}
