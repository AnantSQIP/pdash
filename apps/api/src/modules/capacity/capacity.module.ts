import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

// ── date helpers (UTC day boundaries, consistent with attendance/performance) ──
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
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
  constructor(private readonly prisma: PrismaService) {}

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
   */
  async team(organizationId: string, days = 14): Promise<{ from: string; to: string; capacityPerDay: number; rows: CapacityRow[] }> {
    const today = startOfUtcDay(new Date());
    const horizon = Math.max(5, Math.min(60, days));
    const to = addDays(today, horizon);

    const [users, holidays, leaves, tasks] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId, deletedAt: null, status: 'ACTIVE' },
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
      // Every OPEN task assigned to anyone in the org — capacity is cross-project by design.
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          assignees: { some: { user: { organizationId } } },
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
      for (let d = startOfUtcDay(lv.startDate); d <= startOfUtcDay(lv.endDate); d = addDays(d, 1)) {
        if (d < today || d >= to) continue;
        leaveByUserDay.set(`${lv.userId}|${dayKey(d)}`, lv.leaveType);
      }
    }

    // The calendar window (every day; state decides whether it is workable).
    const window: Date[] = [];
    for (let d = new Date(today); d < to; d = addDays(d, 1)) window.push(new Date(d));

    /** Working days for a given user (excludes weekends, holidays, their approved leave). */
    const workingDaysFor = (userId: string) =>
      window.filter(d => !isWeekend(d) && !holidayByDay.has(dayKey(d)) && !leaveByUserDay.has(`${userId}|${dayKey(d)}`));

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

        // The span this task occupies: from its start (never before today) to its
        // internal deadline. No deadline → treat as "spread over the window ahead".
        // Overdue → it lands on the first workable day: it is blocking them right now.
        const startsAt = task.startDate && startOfUtcDay(task.startDate) > today ? startOfUtcDay(task.startDate) : today;
        const endsAt = task.dueDate ? startOfUtcDay(task.dueDate) : addDays(today, horizon - 1);
        let span = workable.filter(d => d >= startsAt && d <= endsAt);
        if (!span.length) span = overdue ? [workable[0]] : workable.slice(0, 1);

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
}

@Controller('capacity')
class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  @Get('team')
  @RequirePermission('capacity.view')
  team(@Query('organizationId') organizationId: string, @Query('days') days?: string) {
    return this.capacity.team(organizationId, days ? parseInt(days, 10) : 14);
  }
}

@Module({
  controllers: [CapacityController],
  providers: [CapacityService],
  exports: [CapacityService],
})
export class CapacityModule {}
