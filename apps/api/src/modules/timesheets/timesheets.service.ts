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
// The project a task belongs to — its code is the PID shown on the timesheet.
const PROJECT_SELECT = { id: true, code: true, projectType: true };
const PAGE_CAP = 500;

const INCLUDE = {
  user: { select: USER_SELECT },
  task: { select: TASK_SELECT },
  issue: { select: ISSUE_SELECT },
  project: { select: PROJECT_SELECT },
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

  /** The project (id + type) a task belongs to — the task is the source of truth for the
   *  project, so logging by task keeps task-level progress AND records the PID/type. */
  private async projectOfTask(taskId: string): Promise<{ projectId: string | null; projectType: string | null }> {
    const pt = await this.prisma.projectTask.findFirst({
      where: { taskId, project: { deletedAt: null } },
      select: { project: { select: { id: true, projectType: true } } },
    });
    return { projectId: pt?.project.id ?? null, projectType: pt?.project.projectType ?? null };
  }

  /** No one can log more than a full day against a single calendar day (across all entries). */
  private async assertDayCap(userId: string, date: Date, addingHours: number, excludeId?: string): Promise<void> {
    const dayAgg = await this.prisma.timesheet.aggregate({
      where: { userId, date, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      _sum: { hoursLogged: true },
    });
    if ((dayAgg._sum.hoursLogged ?? 0) + addingHours > MAX_HOURS_PER_DAY) {
      const left = Math.max(0, MAX_HOURS_PER_DAY - (dayAgg._sum.hoursLogged ?? 0));
      throw new BadRequestException(`That would exceed ${MAX_HOURS_PER_DAY}h logged for the day — ${left}h remaining.`);
    }
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
    // Each person decides whether their own logged time is billable — there is no
    // project-level override or admin authority. Defaults to billable when not specified.
    const billable = dto.billable ?? true;

    // ── Buffer entry: log hours now, assign the PID (task) later (within a week). No task yet
    //    means no project/type; the 24h/day cap still applies. ──
    if (!dto.taskId) {
      await this.assertDayCap(actorId, new Date(dto.date), dto.hoursLogged);
      const entry = await this.prisma.timesheet.create({
        data: {
          userId: actorId, date: new Date(dto.date), hoursLogged: dto.hoursLogged, billable, notes: dto.notes,
        },
        include: INCLUDE,
      });
      await this.events.emit({
        action: EVENTS.TIME_LOGGED, entityType: 'TIMESHEET', entityId: entry.id, actorId,
        metadata: { unassigned: true, hours: dto.hoursLogged, billable: entry.billable },
      });
      return entry;
    }

    // ── Task entry: the task determines the project (keeps task-level progress) and records
    //    the PID (projectId) + project type snapshot. ──
    const task = await this.prisma.task.findFirst({
      where: { id: dto.taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found`);
    // You can only log time on a task in a project you are staffed on (or as a lead).
    await this.access.assertTaskAccess(actorId, dto.taskId);
    const { projectId, projectType } = await this.projectOfTask(dto.taskId);

    // Reject an identical re-submission (same task, day and hours) — a double-billing vector.
    const dupe = await this.prisma.timesheet.findFirst({
      where: { userId: actorId, taskId: dto.taskId, date: new Date(dto.date), hoursLogged: dto.hoursLogged, deletedAt: null },
      select: { id: true },
    });
    if (dupe) throw new BadRequestException('An identical entry already exists for that task, day and duration.');
    await this.assertDayCap(actorId, new Date(dto.date), dto.hoursLogged);

    const entry = await this.prisma.timesheet.create({
      data: {
        userId: actorId,
        taskId: dto.taskId,
        projectId,
        projectType,
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
      metadata: { taskId: dto.taskId, projectId, hours: dto.hoursLogged, billable: entry.billable },
    });
    await this.recomputeTaskActualHours(dto.taskId);
    return entry;
  }

  /** Assign a PID (task) to a buffer entry that was logged without one. The task fixes the
   *  project + type; task-level progress is recomputed. Owner-or-Super-Admin only. */
  async assign(id: string, taskId: string) {
    const entry = await this.prisma.timesheet.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException(`Timesheet ${id} not found`);
    await this.assertOwnerOrPrivileged(entry.userId);
    // Only a buffer entry (no task AND no issue) can be assigned — an issue-logged entry must
    // never gain a taskId too (breaks the "task XOR issue" invariant + double-counts hours).
    if (entry.taskId || entry.issueId) throw new BadRequestException('This entry already has a project/task assigned.');
    const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found.');
    // The entry's OWNER must be staffed on the task's project.
    await this.access.assertTaskAccess(entry.userId, taskId);
    const { projectId, projectType } = await this.projectOfTask(taskId);
    const updated = await this.prisma.timesheet.update({
      where: { id }, data: { taskId, projectId, projectType }, include: INCLUDE,
    });
    await this.recomputeTaskActualHours(taskId);
    return updated;
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
