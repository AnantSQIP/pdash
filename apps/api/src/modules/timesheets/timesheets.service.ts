import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EVENTS } from '../../common/events/canonical-events';
import { getActorId } from '../../common/context/request-context';
import { CreateTimesheetDto, UpdateTimesheetDto } from './dto';

// A person cannot log more than a full day against any single calendar day.
const MAX_HOURS_PER_DAY = 24;

const USER_SELECT = { id: true, firstName: true, lastName: true };
const TASK_SELECT = { id: true, title: true };
const ISSUE_SELECT = { id: true, title: true };
const PAGE_CAP = 500;

const INCLUDE = {
  user: { select: USER_SELECT },
  task: { select: TASK_SELECT },
  issue: { select: ISSUE_SELECT },
} as const;

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
    private readonly access: ProjectAccessService,
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
    // A project's full time ledger (every member's hours/billable/notes) is only for
    // people ON the project (or a delivery lead) — not any timesheet.view holder.
    await this.access.assertProjectAccess(await this.actor(), projectId);
    const [projectTasks, issues] = await Promise.all([
      this.prisma.projectTask.findMany({ where: { projectId }, select: { taskId: true } }),
      this.prisma.issue.findMany({ where: { projectId, deletedAt: null }, select: { id: true } }),
    ]);
    const taskIds = projectTasks.map((pt) => pt.taskId);
    const issueIds = issues.map((i) => i.id);
    if (!taskIds.length && !issueIds.length) return [];

    // A project's time = task entries + technical-issue (non-billable) entries.
    return this.prisma.timesheet.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(taskIds.length ? [{ taskId: { in: taskIds } }] : []),
          ...(issueIds.length ? [{ issueId: { in: issueIds } }] : []),
        ],
      },
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
    // Time is logged for work already done — a future date is never valid (it also feeds
    // capacity/performance, which a future entry would distort). Compare on the calendar
    // day so an entry dated "today" is always allowed regardless of the time of day.
    const entryDay = new Date(String(dto.date).slice(0, 10));
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (isNaN(entryDay.getTime())) throw new BadRequestException('A valid date is required.');
    if (entryDay > today) throw new BadRequestException('You cannot log time for a future date.');
    const task = await this.prisma.task.findFirst({
      where: { id: dto.taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found`);
    // You can only log time on a task in a project you are staffed on (or as a lead).
    await this.access.assertTaskAccess(actorId, dto.taskId);

    // Reject an identical re-submission (same task, day and hours) — a double-billing vector.
    const dupe = await this.prisma.timesheet.findFirst({
      where: { userId: actorId, taskId: dto.taskId, date: new Date(dto.date), hoursLogged: dto.hoursLogged, deletedAt: null },
      select: { id: true },
    });
    if (dupe) throw new BadRequestException('An identical entry already exists for that task, day and duration.');

    // No one can log more than a full day against a single calendar day (across all tasks).
    const dayAgg = await this.prisma.timesheet.aggregate({
      where: { userId: actorId, date: new Date(dto.date), deletedAt: null },
      _sum: { hoursLogged: true },
    });
    if ((dayAgg._sum.hoursLogged ?? 0) + dto.hoursLogged > MAX_HOURS_PER_DAY) {
      const left = Math.max(0, MAX_HOURS_PER_DAY - (dayAgg._sum.hoursLogged ?? 0));
      throw new BadRequestException(`That would exceed ${MAX_HOURS_PER_DAY}h logged for the day — ${left}h remaining.`);
    }

    // Each person decides whether their own logged time is billable — there is no
    // project-level override or admin authority. Defaults to billable when not specified.
    const billable = dto.billable ?? true;
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

    // An issue-raised entry is non-billable by rule — it can never be flipped to billable.
    const billable = entry.issueId ? false : dto.billable;

    // Re-enforce the 24h/day cap if the hours are being raised.
    if (dto.hoursLogged !== undefined && dto.hoursLogged !== entry.hoursLogged) {
      const dayAgg = await this.prisma.timesheet.aggregate({
        where: { userId: entry.userId, date: entry.date, deletedAt: null, id: { not: id } },
        _sum: { hoursLogged: true },
      });
      if ((dayAgg._sum.hoursLogged ?? 0) + dto.hoursLogged > MAX_HOURS_PER_DAY) {
        const left = Math.max(0, MAX_HOURS_PER_DAY - (dayAgg._sum.hoursLogged ?? 0));
        throw new BadRequestException(`That would exceed ${MAX_HOURS_PER_DAY}h logged for the day — ${left}h remaining.`);
      }
    }

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: {
        hoursLogged: dto.hoursLogged,
        billable,
        notes: dto.notes,
      },
      include: INCLUDE,
    });
    if (dto.hoursLogged !== undefined && entry.taskId) await this.recomputeTaskActualHours(entry.taskId);
    return updated;
  }

  async softDelete(id: string) {
    const entry = await this.prisma.timesheet.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException(`Timesheet ${id} not found`);
    await this.assertOwnerOrPrivileged(entry.userId);
    const deleted = await this.prisma.timesheet.update({ where: { id }, data: { deletedAt: new Date() } });
    if (entry.taskId) await this.recomputeTaskActualHours(entry.taskId);
    return deleted;
  }
}
