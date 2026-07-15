import {
  BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { NotificationsService } from '../notifications/notifications.module';
import { startOfUtcDay } from '../../common/dates';

// ── date helpers (UTC day boundaries, consistent with attendance/performance) ──
function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }
function isWeekend(d: Date): boolean { const wd = d.getUTCDay(); return wd === 0 || wd === 6; }
function r1(n: number): number { return Math.round((n ?? 0) * 10) / 10; }

/** A 48h week over 5 weekdays — the same basis the Performance module uses. */
const DAILY_CAPACITY_HOURS = 48 / 5; // 9.6h
/** Assumed effort for a task with no estimate, so unestimated work still consumes time. */
const DEFAULT_TASK_HOURS = 6;
/** A day is "free" below this share of capacity — i.e. there's room for real work. */
const FREE_THRESHOLD = 0.25;
const LIGHT_THRESHOLD = 0.75;
const MIN_DAYS = 5;
const MAX_DAYS = 60;
const DEFAULT_DAYS = 14;

/**
 * Coerce the `days` query parameter to a sane horizon. `parseInt('abc')` is NaN, and an
 * un-guarded NaN flows into addDays() → an Invalid Date → the whole board silently breaks;
 * a caller could also ask for 100000 days and force a huge computation. Clamp to a range.
 */
export function parseHorizon(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, n));
}

export type DayState = 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'FREE' | 'LIGHT' | 'BUSY' | 'OVERLOADED';

export interface CapacityDay {
  date: string;
  state: DayState;
  /** Committed hours from open tasks that overlap this day. */
  load: number;
  capacity: number;
  /** load / capacity, 0–2+ (clamped for display by the client). */
  utilization: number;
  /** Free hours left on this day (0 on non-working days). */
  free: number;
  note?: string;
}

export interface CapacityRow {
  userId: string;
  name: string;
  designation?: string;
  department?: string;
  profilePhoto?: string | null;
  days: CapacityDay[];
  /** Open tasks driving the load — what they're actually busy with. */
  openTasks: {
    id: string; title: string; projectId?: string; project?: string;
    dueDate?: string | null; priority: string; completionPercentage: number;
    remainingHours: number; overdue: boolean;
  }[];
  /** Free capacity (hours) across the whole window. */
  freeHours: number;
  /** Committed hours across the window. */
  committedHours: number;
  /** Total working capacity across the window (excludes weekends/holidays/leave). */
  capacityHours: number;
  utilization: number;
  /** First working day with real room for new work — the answer to "when is X free?". */
  nextFreeDate: string | null;
  /** Consecutive free working days starting at nextFreeDate. */
  freeRunDays: number;
  /**
   * Free on the NEXT WORKING day — i.e. can take work right now. Keyed on the first
   * workable day rather than literally "today", so the board still answers "who is
   * available?" when it's viewed on a weekend or a holiday.
   */
  availableNow: boolean;
  overdueCount: number;
}

@Injectable()
export class CapacityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Availability of one project's active members (drives the per-project capacity view). */
  async forProject(projectId: string, days = DEFAULT_DAYS) {
    const organizationId = await this.actor.requireOrgId();
    // A project has no organizationId column — its org is reached through its members, the
    // same way ProjectsService.list scopes. Requiring an in-org member makes an id from
    // another tenant a 404, not a leak.
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        members: { some: { user: { organizationId } } },
      },
      select: {
        id: true, title: true,
        members: { where: { isActive: true }, select: { userId: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const userIds = project.members.map((m: { userId: string }) => m.userId);
    const board = await this.team(organizationId, days, userIds);
    return { project: { id: project.id, title: project.title }, ...board };
  }

  /**
   * Team availability across ALL projects: for each person, how much of each working
   * day is already committed, and therefore when they are free to take more work.
   *
   * Load model — an OPEN task occupies its assignee from its start (or today, if it has
   * already begun) through its INTERNAL deadline, consuming its remaining effort spread
   * evenly across the working days in that span:
   *     remaining = (estimatedHours ?? DEFAULT) × (1 − completion%)
   * Closed tasks consume nothing. An overdue task's remaining effort lands on today —
   * it still has to be done, and it is blocking the person now.
   *
   * Non-working days are excluded properly: weekends, company holidays, and each
   * person's APPROVED leave (so someone on leave never looks "available").
   *
   * `organizationId` is the CALLER'S org, resolved from the session by the controller —
   * it is never accepted from the client. `onlyUserIds`, when given, restricts the board
   * to those people (used by the per-project view).
   */
  async team(
    organizationId: string,
    days = DEFAULT_DAYS,
    onlyUserIds?: string[],
  ): Promise<{ from: string; to: string; capacityPerDay: number; rows: CapacityRow[] }> {
    const today = startOfUtcDay(new Date());
    const horizon = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Number.isFinite(days) ? days : DEFAULT_DAYS));
    const to = addDays(today, horizon);
    const userFilter = onlyUserIds ? { id: { in: onlyUserIds.length ? onlyUserIds : ['__none__'] } } : {};

    const [users, holidays, leaves, tasks] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId, deletedAt: null, status: 'ACTIVE', ...userFilter },
        select: {
          id: true, firstName: true, lastName: true, designation: true, profilePhoto: true,
          departmentMemberships: { select: { department: { select: { name: true } } }, take: 1 },
        },
        orderBy: [{ firstName: 'asc' }],
      }),
      this.prisma.holiday.findMany({
        where: { organizationId, date: { gte: today, lt: to } },
        select: { date: true, name: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', startDate: { lt: to }, endDate: { gte: today }, user: { organizationId } },
        select: { userId: true, startDate: true, endDate: true, leaveType: true },
      }),
      // Every OPEN task assigned to anyone in scope — capacity is cross-project by design.
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          assignees: { some: onlyUserIds ? { userId: { in: onlyUserIds } } : { user: { organizationId } } },
          OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
        },
        select: {
          id: true, title: true, priority: true, startDate: true, dueDate: true,
          estimatedHours: true, completionPercentage: true,
          assignees: { select: { userId: true } },
          projectTasks: {
            select: { project: { select: { id: true, title: true, deletedAt: true } } },
            take: 1,
          },
        },
      }),
    ]);

    const holidayByDay = new Map(holidays.map(h => [dayKey(h.date), h.name]));
    const leaveByUserDay = new Map<string, string>();
    for (const lv of leaves) {
      // Clamp the iteration to the visible window BEFORE looping. A leave whose endDate is
      // years out (bad data) would otherwise spin for millions of iterations; the query only
      // guarantees the range OVERLAPS the window, not that it fits inside it.
      const from = startOfUtcDay(lv.startDate) < today ? today : startOfUtcDay(lv.startDate);
      const until = startOfUtcDay(lv.endDate) >= to ? addDays(to, -1) : startOfUtcDay(lv.endDate);
      for (let d = new Date(from); d <= until; d = addDays(d, 1)) {
        leaveByUserDay.set(`${lv.userId}|${dayKey(d)}`, lv.leaveType);
      }
    }

    // The calendar window (every day; state decides whether it is workable).
    const window: Date[] = [];
    for (let d = new Date(today); d < to; d = addDays(d, 1)) window.push(new Date(d));

    /** Working days for a user (excludes weekends, holidays, their approved leave). Memoised —
     *  this is asked once per task, and recomputing it per task is O(tasks × window). */
    const workingDaysCache = new Map<string, Date[]>();
    const workingDaysFor = (userId: string): Date[] => {
      const hit = workingDaysCache.get(userId);
      if (hit) return hit;
      const wd = window.filter(d => !isWeekend(d) && !holidayByDay.has(dayKey(d)) && !leaveByUserDay.has(`${userId}|${dayKey(d)}`));
      workingDaysCache.set(userId, wd);
      return wd;
    };

    // Per-user, per-day committed load.
    const loadByUserDay = new Map<string, number>();
    const openByUser = new Map<string, CapacityRow['openTasks']>();

    for (const task of tasks) {
      const project = task.projectTasks[0]?.project;
      if (project?.deletedAt) continue; // archived project — not real work any more
      const estimate = task.estimatedHours ?? DEFAULT_TASK_HOURS;
      const remaining = Math.max(0, estimate * (1 - (task.completionPercentage ?? 0) / 100));
      const overdue = !!task.dueDate && startOfUtcDay(task.dueDate) < today;

      for (const { userId } of task.assignees) {
        const list = openByUser.get(userId) ?? [];
        list.push({
          id: task.id,
          title: task.title,
          projectId: project?.id,
          project: project?.title,
          dueDate: task.dueDate ? dayKey(task.dueDate) : null,
          priority: task.priority,
          completionPercentage: task.completionPercentage ?? 0,
          remainingHours: r1(remaining),
          overdue,
        });
        openByUser.set(userId, list);

        if (remaining <= 0) continue;
        const workable = workingDaysFor(userId);
        if (!workable.length) continue;

        // A task that only STARTS after this window contributes nothing to it — its work is
        // in the future. (Previously it fell through to the day-1 fallback below and dumped
        // its whole load onto today, making people look busy for work that hasn't begun.)
        if (task.startDate && startOfUtcDay(task.startDate) >= to) continue;

        // The span this task occupies: from its start (never before today) to its internal
        // deadline. No deadline → spread over the window ahead. Overdue, or a deadline that
        // has already passed within the window → it lands on the first workable day: it is
        // blocking them right now.
        const startsAt = task.startDate && startOfUtcDay(task.startDate) > today ? startOfUtcDay(task.startDate) : today;
        const endsAt = task.dueDate ? startOfUtcDay(task.dueDate) : addDays(today, horizon - 1);
        let span = workable.filter(d => d >= startsAt && d <= endsAt);
        if (!span.length) span = [workable[0]]; // overdue / same-day: put it on the first workable day

        const perDay = remaining / span.length;
        for (const d of span) {
          const k = `${userId}|${dayKey(d)}`;
          loadByUserDay.set(k, (loadByUserDay.get(k) ?? 0) + perDay);
        }
      }
    }

    const rows: CapacityRow[] = users.map(u => {
      const days: CapacityDay[] = window.map(d => {
        const k = dayKey(d);
        const leave = leaveByUserDay.get(`${u.id}|${k}`);
        const holiday = holidayByDay.get(k);
        if (isWeekend(d)) return { date: k, state: 'WEEKEND', load: 0, capacity: 0, utilization: 0, free: 0 };
        if (holiday) return { date: k, state: 'HOLIDAY', load: 0, capacity: 0, utilization: 0, free: 0, note: holiday };
        if (leave) return { date: k, state: 'LEAVE', load: 0, capacity: 0, utilization: 0, free: 0, note: `${leave} leave` };

        const load = loadByUserDay.get(`${u.id}|${k}`) ?? 0;
        const utilization = load / DAILY_CAPACITY_HOURS;
        const state: DayState =
          utilization > 1 ? 'OVERLOADED'
            : utilization >= LIGHT_THRESHOLD ? 'BUSY'
              : utilization > FREE_THRESHOLD ? 'LIGHT'
                : 'FREE';
        return {
          date: k, state, load: r1(load), capacity: DAILY_CAPACITY_HOURS,
          utilization: Math.round(utilization * 100) / 100,
          free: r1(Math.max(0, DAILY_CAPACITY_HOURS - load)),
        };
      });

      const workDays = days.filter(d => d.capacity > 0);
      const capacityHours = workDays.length * DAILY_CAPACITY_HOURS;
      const committedHours = workDays.reduce((s, d) => s + d.load, 0);
      const freeHours = workDays.reduce((s, d) => s + d.free, 0);

      // "When is this person free?" — the first workable day with real room, and how
      // many consecutive free days follow (a 2-day gap is a genuine assignment window).
      const firstFreeIdx = days.findIndex(d => d.capacity > 0 && d.utilization <= FREE_THRESHOLD);
      let freeRunDays = 0;
      if (firstFreeIdx >= 0) {
        for (let i = firstFreeIdx; i < days.length; i++) {
          const d = days[i];
          if (d.capacity === 0) continue;                 // weekend/holiday/leave doesn't break the run
          if (d.utilization > FREE_THRESHOLD) break;
          freeRunDays++;
        }
      }
      const openTasks = (openByUser.get(u.id) ?? []).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
      // "Available now" = free on the next WORKABLE day (today on a weekday; Monday if
      // the board is opened on a weekend) — otherwise the answer is uselessly "nobody".
      const firstWorkIdx = days.findIndex(d => d.capacity > 0);
      const availableNow = firstWorkIdx >= 0 && days[firstWorkIdx].utilization <= FREE_THRESHOLD;

      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
        designation: u.designation ?? undefined,
        department: u.departmentMemberships[0]?.department?.name ?? undefined,
        profilePhoto: u.profilePhoto,
        days,
        openTasks,
        freeHours: r1(freeHours),
        committedHours: r1(committedHours),
        capacityHours: r1(capacityHours),
        utilization: capacityHours > 0 ? Math.round((committedHours / capacityHours) * 100) : 0,
        nextFreeDate: firstFreeIdx >= 0 ? days[firstFreeIdx].date : null,
        freeRunDays,
        availableNow,
        overdueCount: openTasks.filter(t => t.overdue).length,
      };
    });

    // Most available first — this board exists to answer "who can take more work?".
    rows.sort((a, b) => b.freeHours - a.freeHours);

    return { from: dayKey(today), to: dayKey(addDays(to, -1)), capacityPerDay: DAILY_CAPACITY_HOURS, rows };
  }

  // ── Emergency-leave coverage ─────────────────────────────────────────────────
  // Priorities that make an absence worth flagging, and how much notice counts as
  // "short" (an emergency). Capacity already compresses an on-leave person's work
  // into fewer days; coverage surfaces WHO that hurts so it can be reassigned.
  private static readonly RISK_PRIORITIES = ['HIGH', 'CRITICAL'];
  private static readonly EMERGENCY_NOTICE_DAYS = 3;

  /** Short notice = booked ≤ N days before it starts, or already in progress. */
  private isShortNotice(createdAt: Date, startDate: Date, today: Date): boolean {
    const start = startOfUtcDay(startDate);
    if (start <= today) return true; // already started — the ultimate short notice
    const noticeDays = Math.floor((start.getTime() - startOfUtcDay(createdAt).getTime()) / 86_400_000);
    return noticeDays <= CapacityService.EMERGENCY_NOTICE_DAYS;
  }

  /** Open tasks on HIGH/CRITICAL projects, due on/before `windowEnd`, for the given users. */
  private async atRiskTasks(userIds: string[], windowEnd: Date) {
    if (!userIds.length) return [];
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        dueDate: { not: null, lt: windowEnd },
        assignees: { some: { userId: { in: userIds } } },
        OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
        projectTasks: { some: { project: { deletedAt: null, priority: { in: CapacityService.RISK_PRIORITIES } } } },
      },
      select: {
        id: true, title: true, priority: true, dueDate: true,
        estimatedHours: true, completionPercentage: true,
        assignees: { select: { userId: true } },
        projectTasks: {
          where: { project: { deletedAt: null, priority: { in: CapacityService.RISK_PRIORITIES } } },
          select: { project: { select: { id: true, title: true, priority: true } } },
          take: 1,
        },
      },
    });
    const today = startOfUtcDay(new Date());
    return tasks.map(t => {
      const project = t.projectTasks[0]?.project;
      const estimate = t.estimatedHours ?? DEFAULT_TASK_HOURS;
      const remaining = Math.max(0, estimate * (1 - (t.completionPercentage ?? 0) / 100));
      return {
        id: t.id, title: t.title, priority: t.priority,
        dueDate: t.dueDate as Date,
        projectId: project?.id, project: project?.title, projectPriority: project?.priority,
        remainingHours: r1(remaining),
        overdue: !!t.dueDate && startOfUtcDay(t.dueDate) < today,
        userIds: t.assignees.map(a => a.userId),
      };
    });
  }

  /** Users who can act on a coverage risk: capacity.view holders + the affected projects' managers. */
  private async coverageReviewers(organizationId: string, projectIds: string[]): Promise<string[]> {
    const [viewers, managers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId, deletedAt: null, status: 'ACTIVE',
          userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'capacity.view' } } } } } },
        },
        select: { id: true },
      }),
      projectIds.length
        ? this.prisma.projectMember.findMany({
            where: { projectId: { in: projectIds }, projectRole: 'MANAGER', isActive: true },
            select: { userId: true },
          })
        : Promise.resolve([]),
    ]);
    return [...new Set([...viewers.map(v => v.id), ...managers.map(m => m.userId)])];
  }

  private emptyCoverage(today: Date, to: Date) {
    return { from: dayKey(today), to: dayKey(addDays(to, -1)), risks: [] as unknown[], suggestions: [] as unknown[] };
  }

  /**
   * The whole-org coverage board: everyone on short-notice approved leave who holds
   * open HIGH/CRITICAL tasks due while they're out, plus a pool of free teammates to
   * reassign the work to. Drives the "Coverage at risk" panel.
   */
  async coverageRisks(organizationId: string, days = DEFAULT_DAYS) {
    const today = startOfUtcDay(new Date());
    const horizon = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Number.isFinite(days) ? days : DEFAULT_DAYS));
    const to = addDays(today, horizon);

    const leaves = await this.prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lt: to }, endDate: { gte: today }, user: { organizationId } },
      select: {
        id: true, userId: true, leaveType: true, startDate: true, endDate: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      },
    });
    const emergency = leaves.filter(lv => this.isShortNotice(lv.createdAt, lv.startDate, today));
    if (!emergency.length) return this.emptyCoverage(today, to);

    const tasks = await this.atRiskTasks([...new Set(emergency.map(l => l.userId))], to);
    if (!tasks.length) return this.emptyCoverage(today, to);

    const risks = emergency.map(lv => {
      const end = startOfUtcDay(lv.endDate);
      const mine = tasks
        .filter(t => t.userIds.includes(lv.userId) && startOfUtcDay(t.dueDate) <= end)
        .map(({ userIds: _uids, ...rest }) => ({ ...rest, dueDate: dayKey(rest.dueDate) }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const u = lv.user;
      return {
        leaveId: lv.id,
        userId: lv.userId,
        name: `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim(),
        profilePhoto: u?.profilePhoto ?? null,
        leaveType: lv.leaveType,
        startDate: dayKey(lv.startDate),
        endDate: dayKey(lv.endDate),
        noticeDays: Math.max(0, Math.floor((startOfUtcDay(lv.startDate).getTime() - startOfUtcDay(lv.createdAt).getTime()) / 86_400_000)),
        tasks: mine,
      };
    }).filter(r => r.tasks.length > 0);

    if (!risks.length) return this.emptyCoverage(today, to);

    // A pool of free teammates to reassign to — most free first, and never the people
    // who are themselves on leave in this window.
    const onLeave = new Set(risks.map(r => r.userId));
    const board = await this.team(organizationId, horizon);
    const suggestions = board.rows
      .filter(row => !onLeave.has(row.userId))
      .sort((a, b) => (b.availableNow ? 1 : 0) - (a.availableNow ? 1 : 0) || b.freeHours - a.freeHours)
      .slice(0, 8)
      .map(row => ({
        userId: row.userId, name: row.name, profilePhoto: row.profilePhoto,
        freeHours: row.freeHours, availableNow: row.availableNow, nextFreeDate: row.nextFreeDate,
      }));

    return { from: dayKey(today), to: dayKey(addDays(to, -1)), risks, suggestions };
  }

  /**
   * Fire a one-off "coverage at risk" alert when a SHORT-NOTICE leave is approved and
   * the person holds HIGH/CRITICAL work due while they're out. Called from LeaveService
   * on approval; best-effort (never blocks the approval).
   */
  async notifyIfCoverageAtRisk(organizationId: string | null, userId: string, leave: { startDate: Date; endDate: Date; createdAt: Date; leaveType: string }, name: string) {
    if (!organizationId) return;
    const today = startOfUtcDay(new Date());
    if (!this.isShortNotice(leave.createdAt, leave.startDate, today)) return;
    const end = startOfUtcDay(leave.endDate);
    const tasks = (await this.atRiskTasks([userId], addDays(end, 1)))
      .filter(t => t.userIds.includes(userId) && startOfUtcDay(t.dueDate) <= end);
    if (!tasks.length) return;
    const projectIds = [...new Set(tasks.map(t => t.projectId).filter((x): x is string => !!x))];
    const reviewers = (await this.coverageReviewers(organizationId, projectIds)).filter(id => id !== userId);
    if (!reviewers.length) return;
    await this.notifications.notify(reviewers, {
      type: 'coverage.at_risk',
      title: 'Coverage at risk',
      message: `${name} is on ${leave.leaveType} leave with ${tasks.length} critical task${tasks.length === 1 ? '' : 's'} due while they're out — reassign or extend on the Capacity board.`,
    });
  }
}

@Controller('capacity')
class CapacityController {
  constructor(
    private readonly capacity: CapacityService,
    private readonly actor: ActorContextService,
  ) {}

  /**
   * Whole-org availability. The org is taken from the SESSION, not the query — accepting a
   * client-supplied organizationId here was a cross-tenant read (IDOR).
   */
  @Get('team')
  @RequirePermission('capacity.view')
  async team(@Query('days') days?: string) {
    const organizationId = await this.actor.requireOrgId();
    return this.capacity.team(organizationId, parseHorizon(days));
  }

  /**
   * Emergency-leave coverage board: who is on short-notice leave while holding
   * open HIGH/CRITICAL work due in their absence, plus free teammates to reassign to.
   */
  @Get('coverage-risks')
  @RequirePermission('capacity.view')
  async coverageRisks(@Query('days') days?: string) {
    const organizationId = await this.actor.requireOrgId();
    return this.capacity.coverageRisks(organizationId, parseHorizon(days));
  }

  /** Availability of one project's members — the capacity view opened from a project. */
  @Get('project/:projectId')
  @RequirePermission('capacity.view')
  forProject(@Param('projectId') projectId: string, @Query('days') days?: string) {
    if (!projectId?.trim()) throw new BadRequestException('projectId is required');
    return this.capacity.forProject(projectId, parseHorizon(days));
  }
}

@Module({
  controllers: [CapacityController],
  providers: [CapacityService],
  exports: [CapacityService],
})
export class CapacityModule {}
