import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EVENTS } from '../../common/events/canonical-events';
import { getActorId } from '../../common/context/request-context';
import { startOfIstDay } from '../../common/dates';
import { NotificationsService } from '../notifications/notifications.module';
import { CreateTimesheetDto, UpdateTimesheetDto } from './dto';

// A person cannot log more than a full day against any single calendar day.
const MAX_HOURS_PER_DAY = 24;

// Backdating windows (whole days, measured in IST calendar days).
//  • within the last ~1 month  → anyone may fill freely
//  • 1–3 months old            → needs an APPROVED TimesheetBackdateRequest covering the date
//  • older than 3 months       → blocked (Super Admin bypasses everything)
const SELF_FILL_DAYS = 31;
const APPROVAL_MAX_DAYS = 92;
const SUPER_ADMIN_ROLE = 'Super Admin';
const MAX_REASON = 500;

/** UTC-midnight ISO day key (YYYY-MM-DD). Timesheet dates are stored at UTC midnight. */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
/** Parse a YYYY-MM-DD (or ISO) string to a UTC-midnight Date. */
function parseDay(s: string): Date { return new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`); }

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
    private readonly notifications: NotificationsService,
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

  /** How many whole IST days old the given entry date is (0 = today, negative = future). */
  private ageInDays(entryDay: Date): number {
    const todayStart = startOfIstDay(new Date());
    return Math.floor((todayStart.getTime() - parseDay(dayKey(entryDay)).getTime()) / 86_400_000);
  }

  /** Enforce the backdating windows when logging/editing time for `entryDay` on `ownerId`'s sheet.
   *  Within ~1 month: free. 1–3 months: needs an APPROVED backdate request covering the day.
   *  Older than 3 months: blocked. A Super Admin bypasses all of it. */
  private async assertBackfillAllowed(ownerId: string, entryDay: Date): Promise<void> {
    const age = this.ageInDays(entryDay);
    if (age <= SELF_FILL_DAYS) return; // within the self-serve window (or today/future — handled elsewhere)

    const actorId = await this.actor();
    const perms = await this.permissions.getEffectivePermissions(actorId);
    if (perms.isSuperAdmin) return;

    if (age > APPROVAL_MAX_DAYS) {
      throw new BadRequestException(
        `${dayKey(entryDay)} is more than 3 months old — timesheets can no longer be filled for it. Please contact a Super Admin.`,
      );
    }
    const day = parseDay(dayKey(entryDay));
    const covering = await this.prisma.timesheetBackdateRequest.findFirst({
      where: { userId: ownerId, status: 'APPROVED', fromDate: { lte: day }, toDate: { gte: day } },
      select: { id: true },
    });
    if (!covering) {
      throw new ForbiddenException(
        `Filling time for ${dayKey(entryDay)} needs Super Admin approval — it is over a month old. Request approval from the Timesheets page first.`,
      );
    }
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
    // Backdating windows: free within ~1 month, Super-Admin-approved 1–3 months, blocked beyond.
    await this.assertBackfillAllowed(actorId, entryDay);
    // Each person decides whether their own logged time is billable — there is no
    // project-level override or admin authority. Defaults to billable when not specified.
    const billable = dto.billable ?? true;

    // ── "Other" entry: miscellaneous NON-PROJECT time (admin, internal meetings, training).
    //    Always non-billable, never tied to a project/task, and never a PID buffer to assign —
    //    it stands on its own. The 24h/day cap still applies. ──
    if (dto.category === 'OTHER') {
      const title = dto.title?.trim();
      if (!title) throw new BadRequestException('A title is required for "Other" time.');
      await this.assertDayCap(actorId, entryDay, dto.hoursLogged);
      const entry = await this.prisma.timesheet.create({
        data: {
          userId: actorId, date: entryDay, hoursLogged: dto.hoursLogged,
          billable: false, category: 'OTHER', title, notes: dto.notes,
        },
        include: INCLUDE,
      });
      await this.events.emit({
        action: EVENTS.TIME_LOGGED, entityType: 'TIMESHEET', entityId: entry.id, actorId,
        metadata: { category: 'OTHER', title, hours: dto.hoursLogged, billable: false },
      });
      return entry;
    }

    // ── Buffer entry: log hours now, assign the PID (task) later (within a week). No task yet
    //    means no project/type; the 24h/day cap still applies. `entryDay` is normalised to the
    //    calendar-day boundary so the cap can't be side-stepped with a time component. ──
    if (!dto.taskId) {
      await this.assertDayCap(actorId, entryDay, dto.hoursLogged);
      const entry = await this.prisma.timesheet.create({
        data: {
          userId: actorId, date: entryDay, hoursLogged: dto.hoursLogged, billable, notes: dto.notes,
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
    // You can only log time on a task you are ASSIGNED to — project membership grants view,
    // not the right to book hours against work you aren't staffed on.
    await this.access.assertTaskAssignee(actorId, dto.taskId);
    const { projectId, projectType } = await this.projectOfTask(dto.taskId);
    // No time may be booked to a completed/closed client matter (was UI-only before).
    if (projectId) await this.access.assertProjectWritable(projectId);

    // Reject an identical re-submission (same task, day and hours) — a double-billing vector.
    const dupe = await this.prisma.timesheet.findFirst({
      where: { userId: actorId, taskId: dto.taskId, date: entryDay, hoursLogged: dto.hoursLogged, deletedAt: null },
      select: { id: true },
    });
    if (dupe) throw new BadRequestException('An identical entry already exists for that task, day and duration.');
    await this.assertDayCap(actorId, entryDay, dto.hoursLogged);

    const entry = await this.prisma.timesheet.create({
      data: {
        userId: actorId,
        taskId: dto.taskId,
        projectId,
        projectType,
        date: entryDay,
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
    // "Other" (non-project) time is terminal, not a buffer — it can't be attached to a PID.
    if (entry.category === 'OTHER') throw new BadRequestException('“Other” time is non-project and cannot be assigned to a PID.');
    const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found.');
    // The entry's OWNER must be ASSIGNED to the task (same rule as logging directly against it).
    await this.access.assertTaskAssignee(entry.userId, taskId);
    const { projectId, projectType } = await this.projectOfTask(taskId);
    if (projectId) await this.access.assertProjectWritable(projectId);
    // Don't let buffer→assign duplicate an existing identical task entry (double-billing).
    const dupe = await this.prisma.timesheet.findFirst({
      where: { userId: entry.userId, taskId, date: entry.date, hoursLogged: entry.hoursLogged, deletedAt: null, id: { not: id } },
      select: { id: true },
    });
    if (dupe) throw new BadRequestException('An identical entry already exists for that task, day and duration.');
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
    // Same backdating rule as create(): editing an entry more than a month old needs approval
    // (or Super Admin) — otherwise old, locked periods stay quietly mutable.
    await this.assertBackfillAllowed(entry.userId, entry.date);
    // No editing logged time against a completed/closed client matter (create() already
    // enforces this on new entries; edits/deletes must match, or hours stay mutable after close).
    if (entry.projectId) await this.access.assertProjectWritable(entry.projectId);

    // An issue-raised entry AND "Other" (non-project) time are non-billable by rule — neither
    // can ever be flipped to billable.
    const billable = (entry.issueId || entry.category === 'OTHER') ? false : dto.billable;

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
    // A closed matter's ledger is frozen — deleting an entry would silently change its billed total.
    if (entry.projectId) await this.access.assertProjectWritable(entry.projectId);
    const deleted = await this.prisma.timesheet.update({ where: { id }, data: { deletedAt: new Date() } });
    if (entry.taskId) await this.recomputeTaskActualHours(entry.taskId);
    return deleted;
  }

  // ── Fill calendar + reminders ────────────────────────────────────────────────
  // A working day (Mon–Fri) targets 8h; an approved HALF_DAY targets 4h; leave/holiday/weekend
  // are not required (target 0). Fill is GRADED against the target:
  //   COMPLETE (≥ target) · PARTIAL (≥ 4h on a full day / ≥ half the target) · LOW (< 4h).

  private static readonly FULL_DAY = 8;
  private static readonly HALF_DAY_HOURS = 4;

  /** Grade a day's logged hours against its target: COMPLETE / PARTIAL / LOW. */
  private static gradeFill(logged: number, target: number): 'COMPLETE' | 'PARTIAL' | 'LOW' {
    if (logged >= target) return 'COMPLETE';
    // On a full 8h day the amber band is 4–8h; below 4h is red. A 4h half-day splits at 2h.
    const partialFloor = target >= TimesheetsService.FULL_DAY ? TimesheetsService.HALF_DAY_HOURS : target / 2;
    return logged >= partialFloor ? 'PARTIAL' : 'LOW';
  }

  /** The signed-in user's own fill calendar for a month. */
  async myCalendar(year: number, month: number) {
    return this.calendar(await this.actor(), year, month);
  }

  /** Per-day fill status for a user's month — powers the color-coded timesheet calendar. */
  async calendar(userId: string, year: number, month: number) {
    if (!Number.isInteger(year) || year < 1970 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('A valid year and month are required.');
    }
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    const daysInMonth = last.getUTCDate();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    const orgId = user?.organizationId;

    const [att, leaves, holidays, sheets] = await Promise.all([
      this.prisma.attendance.findMany({ where: { userId, date: { gte: first, lte: last } }, select: { date: true, status: true } }),
      this.prisma.leaveRequest.findMany({ where: { userId, status: 'APPROVED', startDate: { lte: last }, endDate: { gte: first } }, select: { startDate: true, endDate: true } }),
      orgId ? this.prisma.holiday.findMany({ where: { organizationId: orgId, date: { gte: first, lte: last } }, select: { date: true } }) : Promise.resolve([]),
      this.prisma.timesheet.findMany({ where: { userId, deletedAt: null, date: { gte: first, lte: last } }, select: { date: true, hoursLogged: true } }),
    ]);
    const dk = (d: Date) => d.toISOString().slice(0, 10);
    const attByDay = new Map(att.map(a => [dk(a.date), a.status]));
    const holidaySet = new Set(holidays.map(h => dk(h.date)));
    const onLeave = (k: string) => leaves.some(l => dk(l.startDate) <= k && k <= dk(l.endDate));
    const loggedByDay = new Map<string, number>();
    for (const s of sheets) { const k = dk(s.date); loggedByDay.set(k, (loggedByDay.get(k) ?? 0) + s.hoursLogged); }
    const todayKey = startOfIstDay(new Date()).toISOString().slice(0, 10);

    const days = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, i));
      const k = dk(d);
      const wd = d.getUTCDay();
      const logged = Math.round((loggedByDay.get(k) ?? 0) * 10) / 10;
      const attStatus = attByDay.get(k);
      let target = TimesheetsService.FULL_DAY;
      let status: string;
      if (wd === 0 || wd === 6) { target = 0; status = 'WEEKEND'; }
      else if (holidaySet.has(k)) { target = 0; status = 'HOLIDAY'; }
      else if (attStatus === 'ON_LEAVE' || onLeave(k)) { target = 0; status = 'LEAVE'; }
      else if (k > todayKey) { target = attStatus === 'HALF_DAY' ? TimesheetsService.HALF_DAY_HOURS : TimesheetsService.FULL_DAY; status = 'FUTURE'; }
      else {
        target = attStatus === 'HALF_DAY' ? TimesheetsService.HALF_DAY_HOURS : TimesheetsService.FULL_DAY;
        status = TimesheetsService.gradeFill(logged, target);
      }
      days.push({ date: k, target, logged, status });
    }
    return { year, month, days };
  }

  /** Required days left incomplete within the last `windowDays` (default 14) for a user. */
  async incompleteRecentDays(userId: string, windowDays = 14): Promise<string[]> {
    const todayStart = startOfIstDay(new Date());
    const from = new Date(todayStart.getTime() - windowDays * 86_400_000);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    const orgId = user?.organizationId;
    const [att, leaves, holidays, sheets] = await Promise.all([
      this.prisma.attendance.findMany({ where: { userId, date: { gte: from, lt: todayStart } }, select: { date: true, status: true } }),
      this.prisma.leaveRequest.findMany({ where: { userId, status: 'APPROVED', startDate: { lt: todayStart }, endDate: { gte: from } }, select: { startDate: true, endDate: true } }),
      orgId ? this.prisma.holiday.findMany({ where: { organizationId: orgId, date: { gte: from, lt: todayStart } }, select: { date: true } }) : Promise.resolve([]),
      this.prisma.timesheet.findMany({ where: { userId, deletedAt: null, date: { gte: from, lt: todayStart } }, select: { date: true, hoursLogged: true } }),
    ]);
    const dk = (d: Date) => d.toISOString().slice(0, 10);
    const attByDay = new Map(att.map(a => [dk(a.date), a.status]));
    const holidaySet = new Set(holidays.map(h => dk(h.date)));
    const onLeave = (k: string) => leaves.some(l => dk(l.startDate) <= k && k <= dk(l.endDate));
    const loggedByDay = new Map<string, number>();
    for (const s of sheets) { const k = dk(s.date); loggedByDay.set(k, (loggedByDay.get(k) ?? 0) + s.hoursLogged); }

    const missing: string[] = [];
    for (let d = new Date(from); d < todayStart; d = new Date(d.getTime() + 86_400_000)) {
      const k = dk(d); const wd = d.getUTCDay();
      if (wd === 0 || wd === 6 || holidaySet.has(k)) continue;
      const attStatus = attByDay.get(k);
      if (attStatus === 'ON_LEAVE' || onLeave(k)) continue;
      const target = attStatus === 'HALF_DAY' ? TimesheetsService.HALF_DAY_HOURS : TimesheetsService.FULL_DAY;
      if ((loggedByDay.get(k) ?? 0) < target) missing.push(k);
    }
    return missing;
  }

  // ── Backdate (backfill) approval ─────────────────────────────────────────────
  // Filling a day 1–3 months old needs Super-Admin sign-off. An employee requests a date range
  // + reason; a Super Admin approves/rejects; an APPROVED request unlocks logging for those days.

  private readonly userSelect = { id: true, firstName: true, lastName: true } as const;

  /** Active Super Admins (optionally scoped to an org) — the approvers for backdate requests. */
  private async superAdminIds(organizationId?: string | null): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        deletedAt: null, status: 'ACTIVE',
        ...(organizationId ? { organizationId } : {}),
        userRoles: { some: { role: { name: SUPER_ADMIN_ROLE } } },
      },
      select: { id: true },
    });
    return admins.map(a => a.id);
  }

  private async assertSuperAdmin(): Promise<string> {
    const actorId = await this.actor();
    const perms = await this.permissions.getEffectivePermissions(actorId);
    if (!perms.isSuperAdmin) throw new ForbiddenException('Only a Super Admin can review backdate requests.');
    return actorId;
  }

  /** An employee asks to fill time for a past range (1–3 months old) that needs approval. */
  async requestBackdate(dto: { fromDate: string; toDate: string; reason: string }) {
    const actorId = await this.actor();
    const reason = dto?.reason?.trim();
    if (!reason) throw new BadRequestException('Please say why you need to backfill these days.');
    if (reason.length > MAX_REASON) throw new BadRequestException('Reason is too long.');
    const from = parseDay(dto.fromDate), to = parseDay(dto.toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new BadRequestException('A valid date range is required.');
    if (from > to) throw new BadRequestException('The start date must be on or before the end date.');

    const toAge = this.ageInDays(to), fromAge = this.ageInDays(from);
    if (toAge < 0) throw new BadRequestException('You cannot request approval for a future date.');
    if (fromAge > APPROVAL_MAX_DAYS) {
      throw new BadRequestException('You can only backfill up to 3 months — those dates are too old, even with approval.');
    }
    if (toAge <= SELF_FILL_DAYS) {
      throw new BadRequestException('Those dates are within the last month — you can fill them directly, no approval needed.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true, firstName: true, lastName: true } });
    const organizationId = user?.organizationId ?? null;
    const req = await this.prisma.timesheetBackdateRequest.create({
      data: { userId: actorId, organizationId, fromDate: from, toDate: to, reason, status: 'PENDING' },
      include: { user: { select: this.userSelect } },
    });
    const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'An employee';
    await this.notifications.notify(await this.superAdminIds(organizationId), {
      type: 'timesheet.backdate_requested', title: 'Timesheet backfill to review',
      message: `${name} asks to fill time for ${dayKey(from)} – ${dayKey(to)}: ${reason}`,
      link: '/timesheets',
    });
    return req;
  }

  /** The signed-in user's own backdate requests (newest first). */
  async myBackdateRequests() {
    const actorId = await this.actor();
    return this.prisma.timesheetBackdateRequest.findMany({
      where: { userId: actorId }, orderBy: { createdAt: 'desc' }, take: 60,
    });
  }

  /** Pending backdate queue for a Super Admin's org. */
  async pendingBackdateRequests() {
    const actorId = await this.assertSuperAdmin();
    const me = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
    return this.prisma.timesheetBackdateRequest.findMany({
      where: { status: 'PENDING', ...(me?.organizationId ? { organizationId: me.organizationId } : {}) },
      orderBy: { createdAt: 'asc' }, include: { user: { select: this.userSelect } },
    });
  }

  async approveBackdate(id: string, note?: string) {
    const actorId = await this.assertSuperAdmin();
    const req = await this.prisma.timesheetBackdateRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Backdate request not found.');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending request can be approved.');
    const updated = await this.prisma.timesheetBackdateRequest.update({
      where: { id }, data: { status: 'APPROVED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note?.trim() || null },
    });
    await this.notifications.notify(req.userId, {
      type: 'timesheet.backdate_approved', title: 'Backfill approved',
      message: `You can now fill time for ${dayKey(req.fromDate)} – ${dayKey(req.toDate)}.`,
      link: '/timesheets',
    });
    return updated;
  }

  async rejectBackdate(id: string, note?: string) {
    const actorId = await this.assertSuperAdmin();
    const req = await this.prisma.timesheetBackdateRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Backdate request not found.');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending request can be rejected.');
    const updated = await this.prisma.timesheetBackdateRequest.update({
      where: { id }, data: { status: 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note?.trim() || null },
    });
    await this.notifications.notify(req.userId, {
      type: 'timesheet.backdate_rejected', title: 'Backfill not approved',
      message: `Your request to fill ${dayKey(req.fromDate)} – ${dayKey(req.toDate)} was declined${note?.trim() ? `: ${note.trim()}` : '.'}`,
      link: '/timesheets',
    });
    return updated;
  }

  /** The requester withdraws their own still-pending request. */
  async cancelBackdate(id: string) {
    const actorId = await this.actor();
    const req = await this.prisma.timesheetBackdateRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Backdate request not found.');
    if (req.userId !== actorId) throw new ForbiddenException('You can only cancel your own requests.');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending request can be cancelled.');
    return this.prisma.timesheetBackdateRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}
