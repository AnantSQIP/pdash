import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PermissionService } from '../permissions/permission.service';
import { OptionalHolidaysService } from '../optional-holidays/optional-holidays.service';
import { OptionalHolidaysModule } from '../optional-holidays/optional-holidays.module';
import { startOfUtcDay, startOfIstDay } from '../../common/dates';
import { TasksModule } from '../tasks/tasks.module';
import { CapacityTasksController, CapacityTaskOptionsService } from './capacity-tasks';
import { ProjectsModule } from '../projects/projects.module';
import { CapacityClientSetupController, CapacityClientSetupService } from './capacity-client-setup';
import {
  compareScheduled, placeForward, hoursInWindow, daysOutsideWindow, inCoverageWindow,
  type ScheduledSeat, type Placement,
} from './placement';
import {
  AvailabilityService, canName, type ClientShare, type ProposedSeat, type SeatPreview,
} from './availability';

// ── date helpers (UTC day boundaries, consistent with attendance/performance) ──
function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }
function isWeekend(d: Date): boolean { const wd = d.getUTCDay(); return wd === 0 || wd === 6; }
function r1(n: number): number { return Math.round((n ?? 0) * 10) / 10; }

/** A 48h week over 5 weekdays — the same basis the Performance module uses. */
const DAILY_CAPACITY_HOURS = 8; // office hours 9am–6pm IST minus a 1h lunch = 8 working hours/day
/**
 * What a HALF-day leave leaves behind. Leave carries a `dayType` of FULL or HALF and a half day
 * is real work — the person is in for the morning or the afternoon. The board used to read any
 * approved leave as the whole day gone, so four genuine hours vanished from the plan and somebody
 * on a half day looked exactly as unavailable as somebody on a fortnight's holiday.
 */
const HALF_DAY_CAPACITY_HOURS = DAILY_CAPACITY_HOURS / 2;
/** Assumed effort for a task with no estimate, so unestimated work still consumes time. */
const DEFAULT_TASK_HOURS = 6;
/** A day is "free" below this share of capacity — i.e. there's room for real work. */
const FREE_THRESHOLD = 0.25;
const LIGHT_THRESHOLD = 0.75;
const MIN_DAYS = 5;
const MAX_DAYS = 60;
const DEFAULT_DAYS = 14;
/** How far back a day sheet still offers work that was FINISHED — it may still be owed hours. */
const FINISHED_LOOKBACK_DAYS = 14;

/**
 * Coerce the `days` query parameter to a sane horizon. `parseInt('abc')` is NaN, and an
 * un-guarded NaN flows into addDays() → an Invalid Date → the whole board silently breaks;
 * a caller could also ask for 100000 days and force a huge computation. Clamp to a range.
 */
export function parseHorizon(raw: string | undefined, fallback = DEFAULT_DAYS): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, n));
}

/** How far either side of today a caller may anchor the window. */
const MAX_WINDOW_OFFSET_DAYS = 400;

/**
 * Coerce the `from` query parameter — the first day of the window — to a UTC-midnight date, or
 * `undefined` to mean "today", which is what the board did before a start could be named.
 *
 * The planning meeting happens on a Friday and is about the following week, so the window has to
 * be able to begin on a day that is not today. Anything unparseable is ignored rather than
 * rejected: a window is a view, and falling back to today shows the board instead of an error
 * where the board should be. The offset is bounded because the start seeds several day-by-day
 * loops — a caller asking to start in the year 3000 would otherwise be asking the server to walk
 * a million days before it drew anything.
 */
export function parseWindowStart(raw: string | undefined, today: Date): Date | undefined {
  const day = (raw ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // A date that does not exist (2026-02-31) parses to a different day than the one written; taking
  // it would silently start the window three days after the date the client asked for.
  if (parsed.toISOString().slice(0, 10) !== day) return undefined;
  const offset = Math.abs(parsed.getTime() - today.getTime()) / 86_400_000;
  return offset > MAX_WINDOW_OFFSET_DAYS ? undefined : parsed;
}

export type DayState =
  // Forward (projected-load) states:
  | 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'LEAVE_PENDING' | 'FREE' | 'LIGHT' | 'BUSY'
  // Past (actual-attendance) states — used by the history view:
  | 'PRESENT' | 'ABSENT' | 'COMPOFF'
  // Nothing recorded yet (today before punching, or before the person joined). NOT a claim of
  // presence — it used to be reported as PRESENT, which asserted attendance that never happened.
  | 'NOT_MARKED';

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
  /**
   * The same `load`, split by AvailabilityService into the client being looked at and everything
   * else. Present on every board read, absent on the raw projection: a screen that is not about
   * one client has no focus, and then every committed hour is "other".
   *
   * This is what stops a day looking emptier than it is. A person with eight hours on Acme has an
   * `otherHours` of 8 when Bellco's tab is open, so the day is drawn full there too.
   */
  focusHours?: number;
  otherHours?: number;
  /** Of `otherHours`, the part whose client this viewer may not be told the name of. */
  restrictedHours?: number;
  note?: string;
  /**
   * Which open tasks put how many hours on this day — the aggregate `load`, itemised.
   * Only on working days; join `taskId` to the row's openTasks for title/project/priority.
   * Largest first.
   */
  tasks?: { taskId: string; hours: number }[];
}

/**
 * The part of a window that is still ahead — today and the days after it.
 *
 * Every figure a row reports ABOUT A PERSON — hours free, available now, the day they next come
 * free — is an answer to "what can I still give them?", and only the days that have not happened
 * yet can answer it. That used to be the whole window, because the window always began today.
 * Since it can be anchored in the past, elapsed days sat in the totals carrying no load at all —
 * placement never puts work behind `planFrom` — so each one read as eight free hours. On a
 * Wednesday, the board opened on its default Monday-start work week and reported all 26 people
 * available, a person 11.6h overloaded among them with 32 free hours to spare.
 *
 * The days themselves are still returned and still drawn: what happened is worth looking at. It
 * is only the arithmetic about availability that stops counting it.
 *
 * Both are plain ISO day keys, so the comparison is a string comparison — total and cheap.
 */
export function daysStillAhead(days: CapacityDay[], planFromKey: string): CapacityDay[] {
  return days.filter(d => d.date >= planFromKey);
}

/** Everything a row says about how busy somebody is, all of it measured over the days ahead. */
export interface CapacityTotals {
  capacityHours: number;
  committedHours: number;
  freeHours: number;
  /** Hours committed BEYOND capacity, which `freeHours` (floored at 0 per day) cannot show. */
  overCommittedHours: number;
  /** Percent of the remaining capacity already spoken for; 0 when there is no capacity left. */
  utilization: number;
  /** Free on the next workable day — today on a weekday, Monday if the board is open on Sunday. */
  availableNow: boolean;
  /** The first day with real room, and how many workable days the run lasts. */
  nextFreeDate: string | null;
  freeRunDays: number;
}

/**
 * Add up a person's window, counting only the days still to come.
 *
 * Pulled out of the board so the arithmetic can be tested against the days that make it subtle: a
 * window anchored before today, a window entirely in the past, a half day, a weekend. All of it
 * answers "what can this person still take on?", which is why nothing before `planFromKey`
 * counts — see daysStillAhead.
 */
export function summariseAhead(days: CapacityDay[], planFromKey: string): CapacityTotals {
  const ahead = daysStillAhead(days, planFromKey);
  const workDays = ahead.filter(d => d.capacity > 0);
  // Summed, not counted × 8: a half day contributes four hours, and counting days would put
  // the other four back into the totals the day rows had already given up.
  const capacityHours = workDays.reduce((s, d) => s + d.capacity, 0);
  const committedHours = workDays.reduce((s, d) => s + d.load, 0);
  const freeHours = workDays.reduce((s, d) => s + d.free, 0);
  // Hours committed BEYOND capacity on overloaded days. freeHours floors per-day free at
  // 0, so committed+free stops reconciling with capacity exactly when someone is
  // overloaded — this surfaces that overload instead of letting the window-average
  // utilization dilute (and hide) it.
  const overCommittedHours = workDays.reduce((s, d) => s + Math.max(0, d.load - d.capacity), 0);

  // "When is this person free?" — the first workable day with real room, and how many consecutive
  // free days follow (a 2-day gap is a genuine assignment window). A weekend or a holiday inside
  // the run does not break it; a busy day does.
  const firstFreeIdx = ahead.findIndex(d => d.capacity > 0 && d.utilization <= FREE_THRESHOLD);
  let freeRunDays = 0;
  if (firstFreeIdx >= 0) {
    for (let i = firstFreeIdx; i < ahead.length; i++) {
      const d = ahead[i];
      if (d.capacity === 0) continue;
      if (d.utilization > FREE_THRESHOLD) break;
      freeRunDays++;
    }
  }
  const firstWorkIdx = ahead.findIndex(d => d.capacity > 0);
  return {
    capacityHours: r1(capacityHours),
    committedHours: r1(committedHours),
    freeHours: r1(freeHours),
    overCommittedHours: r1(overCommittedHours),
    utilization: capacityHours > 0 ? Math.round((committedHours / capacityHours) * 100) : 0,
    availableNow: firstWorkIdx >= 0 && ahead[firstWorkIdx].utilization <= FREE_THRESHOLD,
    nextFreeDate: firstFreeIdx >= 0 ? ahead[firstFreeIdx].date : null,
    freeRunDays,
  };
}

export interface CapacityRow {
  userId: string;
  name: string;
  designation?: string;
  department?: string;
  /** Office / branch for board grouping (GURGAON | JAIPUR); undefined if unassigned. */
  office?: string;
  profilePhoto?: string | null;
  days: CapacityDay[];
  /** Open tasks driving the load — what they're actually busy with. */
  openTasks: {
    id: string; title: string; projectId?: string; project?: string;
    /**
     * CLIENTS-FLOW: the task group this work belongs to inside its client (the project row). Null
     * for team-space work and for a task whose group was deleted.
     */
    taskGroupId?: string | null; taskGroup?: string | null;
    /** The group's own (team) deadline — "extend the whole task group" starts from it. */
    taskGroupDueDate?: string | null;
    /** The project's CID and which round it is — two rounds of one CID share a code. */
    projectPid?: string | null; projectRound?: number;
    /** Internal team-space work rather than a client matter — no CID, never billable. */
    isTeamWork?: boolean;
    /** The project's own priority and INTERNAL deadline — the board shades urgency from these. */
    projectPriority?: string;
    projectDueDate?: string | null;
    /**
     * THIS PERSON's deadline on the task: their own seat's date when one was set (a deadline
     * extended for them alone), otherwise the task's. The board plans them to this date.
     */
    dueDate?: string | null; priority: string; completionPercentage: number;
    /** The task's own deadline, for the words "task due …" beside a personal one. */
    taskDueDate?: string | null;
    /** True when this person's deadline differs from the task's — it was set for them alone. */
    ownDeadline: boolean;
    /**
     * When THIS PERSON starts: their own seat's start when one was set, otherwise the task's.
     * The board never places their work before it.
     */
    startDate?: string | null;
    /**
     * True when this person named their own start, so their hours are PLACED on the days they
     * meant — rather than spread evenly between today and the deadline, which is a guess the
     * board has to make when nobody has said when the work happens.
     */
    scheduled: boolean;
    /**
     * The day this person's placed work is planned to FINISH — the last day their hours land on.
     * Only on scheduled seats: for spread work the finish IS the deadline by construction, so
     * reporting it would say nothing.
     */
    plannedFinish?: string | null;
    /**
     * Working days by which that plan misses their deadline; 0 when it fits. This is what makes
     * an absence visible instead of silently compressing the work: days lost to leave push the
     * fill later, and if it crosses the deadline the number says by how much.
     */
    overrunDays?: number;
    /** This person's own estimate for the task (their staffing hours, or an even split). */
    estimatedHours: number;
    /** Hours this person has logged against the task in the timesheet ledger. */
    loggedHours: number;
    /** Logged more than estimated and the task is still open — the estimate needs revisiting. */
    overEstimate: boolean;
    /**
     * Set on the STAND-IN's row: whose work this is. Their own seat carries no hours — it exists
     * so they may log time — so `remainingHours` here is the share they have taken on.
     */
    coveringForUserId?: string;
    /** Set on the row of the person being covered: some of this task is somebody else's now,
     *  and `remainingHours` is what they kept rather than what they started with. */
    coveredAway?: boolean;
    /** Who took it. Without a name, "part of this is covered" is a fact nobody can act on. */
    coveredByUserId?: string;
    remainingHours: number; overdue: boolean;
    /**
     * This viewer may not be told which client this is, so it is not named — only counted. Set by
     * AvailabilityService.redact(); see availability.ts for why the hours stay while the name goes.
     */
    restricted?: boolean;
  }[];
  /** Hours in the window on the client being looked at, and on everything else (AvailabilityService). */
  focusHours?: number;
  otherHours?: number;
  restrictedHours?: number;
  /** Where the window's committed hours actually went, largest first; restricted ones rolled up. */
  byClient?: ClientShare[];
  /** Free capacity (hours) across the whole window. */
  freeHours: number;
  /** Committed hours across the window. */
  committedHours: number;
  /** Committed hours BEYOND capacity on overloaded days (0 when never overloaded). */
  overCommittedHours: number;
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
    private readonly optionalHolidays: OptionalHolidaysService,
    private readonly permissions: PermissionService,
  ) {}

  /** Availability of one project's active members (drives the per-project capacity view). */
  async forProject(projectId: string, days = DEFAULT_DAYS, opts?: { from?: Date }) {
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
    const board = await this.team(organizationId, days, userIds, opts);
    return { project: { id: project.id, title: project.title }, ...board };
  }

  /**
   * Team availability across ALL projects: for each person, how much of each working
   * day is already committed, and therefore when they are free to take more work.
   *
   * Load model — two of them, because a deadline and a plan are different facts.
   *
   *   PLACED (the seat names its own startDate). The work goes where the person said: fill
   *   forward from that day, taking up to their daily ceiling (or the whole day, if none was
   *   set) until the hours are used up. Seven hours starting on day 8 land ON day 8 — not
   *   0.7h a day for ten days, which is what the deadline alone could ever have implied.
   *
   *   SPREAD (no startDate). The older model, kept exactly: the task occupies its assignee
   *   from its start — or today, if it has already begun — through its INTERNAL deadline,
   *   spread evenly over the working days in that span. Every task that existed before
   *   scheduling did has no seat start, so nothing about it moves until somebody sets one.
   *
   * In both, remaining = (estimatedHours ?? DEFAULT) × (1 − completion%), floored by the
   * ledger. Closed tasks consume nothing. An overdue task's remaining effort lands on today —
   * it still has to be done, and it is blocking the person now.
   *
   * Non-working days are excluded properly: weekends, company holidays, and each
   * person's APPROVED leave (so someone on leave never looks "available").
   *
   * `organizationId` is the CALLER'S org, resolved from the session by the controller —
   * it is never accepted from the client. `onlyUserIds`, when given, restricts the board
   * to those people (used by the per-project view).
   *
   * WHERE THE WINDOW STARTS. `opts.from` names the first day; omit it and the window begins
   * today, which is the only thing it could ever do before. That default is load-bearing —
   * forProject, myPlan and coverageRisks all call this with a length and nothing else — so the
   * `days`-only call is byte-for-byte the board it always was. Naming a start is what lets a
   * manager plan NEXT week on a Friday instead of being shown Friday-to-Thursday, which drops the
   * one day the Friday meeting exists to fill.
   */
  async team(
    organizationId: string,
    days = DEFAULT_DAYS,
    onlyUserIds?: string[],
    opts?: { from?: Date },
  ): Promise<{ from: string; to: string; capacityPerDay: number; rows: CapacityRow[]; generatedAt: string }> {
    const today = startOfIstDay(new Date()); // "today" = the IST calendar day (org timezone)
    const horizon = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Number.isFinite(days) ? days : DEFAULT_DAYS));
    // The window is a START and a LENGTH. `today` stays what it has always been — the real day,
    // which is what "overdue" is measured against — and no longer doubles as the left edge.
    const windowStart = opts?.from ? startOfUtcDay(opts.from) : today;
    const to = addDays(windowStart, horizon);
    /**
     * The earliest day work may be PLANNED onto. Never before today, however far back the window
     * is anchored: the past is what happened, not what is about to be arranged, and re-projecting
     * remaining effort onto days that have already gone would invent a plan nobody can act on.
     * For every forward window this is the window's own start, so the ordinary board is untouched.
     */
    const planFrom = windowStart > today ? windowStart : today;
    const userFilter = onlyUserIds ? { id: { in: onlyUserIds.length ? onlyUserIds : ['__none__'] } } : {};

    // An APPROVED optional holiday is a non-working day for ONE person. It therefore belongs with
    // that person's leave, not with the firm's holidays — the whole reason optional holidays are
    // not rows in `holiday`.
    const [users, holidays, leaves, tasks, optionalOff, coverages] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId, deletedAt: null, status: 'ACTIVE', ...userFilter },
        select: {
          id: true, firstName: true, lastName: true, designation: true, profilePhoto: true, office: true, joiningDate: true,
          departmentMemberships: { select: { department: { select: { name: true } } }, take: 1 },
        },
        orderBy: [{ firstName: 'asc' }],
      }),
      this.prisma.holiday.findMany({
        where: { organizationId, date: { gte: windowStart, lt: to } },
        select: { date: true, name: true },
      }),
      this.prisma.leaveRequest.findMany({
        // Include PENDING (tentative) leave so it is VISIBLE on the board — it is shown
        // distinctly and does NOT reduce capacity until approved.
        where: { status: { in: ['APPROVED', 'PENDING'] }, startDate: { lt: to }, endDate: { gte: windowStart }, user: { organizationId } },
        select: { userId: true, startDate: true, endDate: true, leaveType: true, status: true, dayType: true },
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
          // Per-person estimated hours (role-based staffing). When present, each person's own
          // hours drive their capacity — NOT an even split of the task total.
          assignees: { select: { userId: true, estimatedHours: true, dueDate: true, startDate: true, hoursPerDay: true } },
          projectTasks: {
            // A CID can hold several projects, so the title alone no longer identifies the work —
            // the code + round do.
            // priority + dueDate (the INTERNAL deadline) so the board can shade by urgency.
            // clientDueDate is deliberately not selected: it is redacted per permission elsewhere.
            // CLIENTS-FLOW: and the task group inside the client, so the board can say which piece
            // of the client's work somebody is on, not only which client.
            select: {
              taskList: { select: { id: true, name: true, deletedAt: true, dueDate: true } },
              project: { select: { id: true, code: true, roundSeq: true, title: true, deletedAt: true, priority: true, dueDate: true } },
            },
            take: 1,
          },
          // Team-space work already counted toward load — this query is by ASSIGNEE, not by
          // project — but it arrived with no label, so an HR or BD person looked booked with
          // blank rows. Naming the space is what makes their week readable.
          teamTasks: {
            select: { team: { select: { id: true, name: true, deletedAt: true } } },
            take: 1,
          },
        },
      }),
      this.optionalHolidays.approvedDayKeys(organizationId, windowStart, to),
      // Live cover: somebody standing in on named days, or for good. A withdrawn record is
      // ignored entirely, which is what makes cancelling a leave restore the original plan.
      this.prisma.taskCoverage.findMany({
        where: {
          revokedAt: null,
          fromUser: { organizationId },
          OR: [{ toDate: null }, { toDate: { gte: windowStart } }],
        },
        select: { taskId: true, fromUserId: true, toUserId: true, fromDate: true, toDate: true, mode: true },
      }),
    ]);

    // What each person has already LOGGED against each open task. The ledger is the second signal
    // of remaining effort beside the task's completion %: a task with 4h logged of an 8h estimate
    // has 4h left even while nobody has moved the percentage, so time filed from My Tasks or the
    // Timesheets module shrinks the person's plotted load the next time the board loads.
    const taskIds = tasks.map(t => t.id);
    const logged = taskIds.length
      ? await this.prisma.timesheet.groupBy({
          by: ['userId', 'taskId'],
          where: { deletedAt: null, taskId: { in: taskIds } },
          _sum: { hoursLogged: true },
        })
      : [];
    const loggedByUserTask = new Map(logged.map(g => [`${g.userId}|${g.taskId}`, g._sum.hoursLogged ?? 0]));

    const holidayByDay = new Map(holidays.map(h => [dayKey(h.date), h.name]));
    // APPROVED leave — reduces capacity. A HALF day only halves it: the person is in for the
    // morning or the afternoon, and those four hours are real working hours.
    const leaveByUserDay = new Map<string, { type: string; half: boolean }>();
    const pendingLeaveByUserDay = new Map<string, string>(); // PENDING — shown, but tentative
    for (const lv of leaves) {
      // Clamp the iteration to the visible window BEFORE looping. A leave whose endDate is
      // years out (bad data) would otherwise spin for millions of iterations; the query only
      // guarantees the range OVERLAPS the window, not that it fits inside it.
      const from = startOfUtcDay(lv.startDate) < windowStart ? windowStart : startOfUtcDay(lv.startDate);
      const until = startOfUtcDay(lv.endDate) >= to ? addDays(to, -1) : startOfUtcDay(lv.endDate);
      const half = lv.dayType === 'HALF';
      for (let d = new Date(from); d <= until; d = addDays(d, 1)) {
        const k = `${lv.userId}|${dayKey(d)}`;
        if (lv.status === 'APPROVED') leaveByUserDay.set(k, { type: lv.leaveType, half });
        else pendingLeaveByUserDay.set(k, lv.leaveType);
      }
    }

    // The calendar window (every day; state decides whether it is workable).
    const window: Date[] = [];
    for (let d = new Date(windowStart); d < to; d = addDays(d, 1)) window.push(new Date(d));

    /**
     * How many hours of a given day this person actually has. THE single answer to that
     * question — the day rows, the totals and the placement all read it, so a half day cannot
     * mean four hours in one place and none in another.
     *
     * Zero on a weekend, a firm holiday, an optional holiday they were granted, or a full day of
     * approved leave. Half on an approved HALF day. A full day otherwise.
     */
    const capacityOn = (userId: string, d: Date): number => {
      const k = dayKey(d);
      if (isWeekend(d) || holidayByDay.has(k) || optionalOff.has(`${userId}|${k}`)) return 0;
      const lv = leaveByUserDay.get(`${userId}|${k}`);
      if (lv) return lv.half ? HALF_DAY_CAPACITY_HOURS : 0;
      return DAILY_CAPACITY_HOURS;
    };

    /** Days a user can actually work — anything with capacity left, half days included.
     *  Memoised: this is asked once per task, and recomputing it is O(tasks × window). */
    const workingDaysCache = new Map<string, Date[]>();
    const workingDaysFor = (userId: string): Date[] => {
      const hit = workingDaysCache.get(userId);
      if (hit) return hit;
      const wd = window.filter(d => capacityOn(userId, d) > 0);
      workingDaysCache.set(userId, wd);
      return wd;
    };

    /**
     * The working days work may actually be PUT on — the same list, minus anything before
     * `planFrom`. For every window that starts today or later this is identical to
     * workingDaysFor, which is why the ordinary board is unchanged; it only differs when somebody
     * anchors the window in the past, where filling days that have already happened would draw a
     * plan for a week nobody can any longer change.
     */
    const plannableDaysCache = new Map<string, Date[]>();
    const plannableDaysFor = (userId: string): Date[] => {
      const hit = plannableDaysCache.get(userId);
      if (hit) return hit;
      const pd = windowStart >= planFrom ? workingDaysFor(userId) : workingDaysFor(userId).filter(d => d >= planFrom);
      plannableDaysCache.set(userId, pd);
      return pd;
    };

    // Per-user, per-day committed load.
    const loadByUserDay = new Map<string, number>();
    // The same load, but keeping WHICH task put how many hours on the day. The aggregate alone
    // could say "6h on Tuesday" and nothing about what — so the board could only paint a day
    // one colour. Keyed by taskId so a person holding two roles on one task is one entry.
    const tasksByUserDay = new Map<string, Map<string, number>>();
    // Keyed by taskId per user: two assignee rows (two roles) are one task for one person.
    const openByUser = new Map<string, Map<string, CapacityRow['openTasks'][number]>>();

    // Work is gathered here and laid onto days AFTER every task has been read, because placed
    // work competes for the same day and the winner cannot be decided one task at a time.
    const scheduled: ScheduledSeat[] = [];
    const unscheduled: {
      userId: string; taskId: string; remaining: number; taskStart: Date | null; personDue: Date | null;
    }[] = [];
    const anyEntryForTask = new Map<string, CapacityRow['openTasks'][number]>();

    for (const task of tasks) {
      const project = task.projectTasks[0]?.project;
      const group = task.projectTasks[0]?.taskList;
      const liveGroup = group && !group.deletedAt ? group : null;
      const team = task.teamTasks[0]?.team;
      if (project?.deletedAt) continue; // archived project — not real work any more
      if (team?.deletedAt) continue;    // deleted team space — likewise
      const done = (task.completionPercentage ?? 0) / 100;
      // Fallback (legacy tasks with no per-person hours): split the task estimate evenly.
      const evenSplit = (task.estimatedHours ?? DEFAULT_TASK_HOURS) / Math.max(1, task.assignees.length);

      // Each person's OWN estimated hours drive their capacity (fall back to the even split when
      // a legacy task never recorded per-person hours). A person holding two roles on one task is
      // ONE entry whose estimate is the sum of both roles — summed first, so their logged hours
      // are subtracted once, not once per role.
      const estimateByUser = new Map<string, number>();
      // A person's OWN deadline on the task (their seat's date), when one was set for them —
      // "give Anant until Friday" moves Anant's plan and nobody else's. Two roles: the later one.
      const ownDueByUser = new Map<string, Date | null>();
      // A person's OWN start on the task — when THEY mean to begin. Two roles: the EARLIER one,
      // because that is when this person first picks the task up. (The deadline takes the later
      // of the two for the mirror-image reason: that is when they finally put it down.)
      const ownStartByUser = new Map<string, Date | null>();
      // Their daily ceiling. A seat with no ceiling means "as much of the day as is free", so one
      // uncapped seat leaves the person uncapped on this task; two capped seats add up.
      const capByUser = new Map<string, number | null>();
      for (const a of task.assignees) {
        estimateByUser.set(a.userId, (estimateByUser.get(a.userId) ?? 0) + (a.estimatedHours != null ? a.estimatedHours : evenSplit));
        const prev = ownDueByUser.get(a.userId) ?? null;
        ownDueByUser.set(a.userId, a.dueDate && (!prev || a.dueDate > prev) ? a.dueDate : prev);
        const prevStart = ownStartByUser.get(a.userId) ?? null;
        ownStartByUser.set(a.userId, a.startDate && (!prevStart || a.startDate < prevStart) ? a.startDate : prevStart);
        const seatCap = a.hoursPerDay != null && a.hoursPerDay > 0 ? a.hoursPerDay : null;
        if (capByUser.has(a.userId)) {
          const prevCap = capByUser.get(a.userId)!;
          capByUser.set(a.userId, prevCap === null || seatCap === null ? null : prevCap + seatCap);
        } else {
          capByUser.set(a.userId, seatCap);
        }
      }

      for (const [userId, personEstimate] of estimateByUser) {
        // Remaining effort has two signals and the board believes whichever says less is left:
        //   by progress → estimate × (1 − completion%)   (someone moved the percentage)
        //   by ledger   → estimate − hours logged          (someone filed time)
        // When the ledger has already passed the estimate the task is simply under-estimated;
        // progress is then the only honest signal, and the entry is flagged so the panel can say so.
        const loggedHrs = loggedByUserTask.get(`${userId}|${task.id}`) ?? 0;
        const byProgress = Math.max(0, personEstimate * (1 - done));
        const byLedger = personEstimate - loggedHrs;
        const remaining = byLedger > 0 ? Math.min(byProgress, byLedger) : byProgress;
        const ownDue = ownDueByUser.get(userId) ?? null;
        const personDue = ownDue ?? task.dueDate;
        const ownStart = ownStartByUser.get(userId) ?? null;
        const personStart = ownStart ?? task.startDate ?? null;
        const overdue = !!personDue && startOfUtcDay(personDue) < today;
        const mine = openByUser.get(userId) ?? new Map<string, CapacityRow['openTasks'][number]>();
        mine.set(task.id, {
          id: task.id,
          title: task.title,
          projectId: project?.id ?? team?.id,
          // Team work has no CID and no round — it is labelled by the space it belongs to, and
          // flagged so the UI can tell a client matter from an internal one.
          project: project?.title ?? team?.name,
          taskGroupId: project ? liveGroup?.id ?? null : null,
          taskGroup: project ? liveGroup?.name ?? null : null,
          taskGroupDueDate: project && liveGroup?.dueDate ? dayKey(liveGroup.dueDate) : null,
          projectPid: project?.code ?? null,
          projectRound: project?.roundSeq,
          isTeamWork: !project && !!team,
          startDate: personStart ? dayKey(personStart) : null,
          dueDate: personDue ? dayKey(personDue) : null,
          taskDueDate: task.dueDate ? dayKey(task.dueDate) : null,
          ownDeadline: !!ownDue && (!task.dueDate || dayKey(ownDue) !== dayKey(task.dueDate)),
          // True when this person's work is PLACED rather than spread — they named their own
          // start, so the board is showing intent rather than a guess.
          scheduled: !!ownStart,
          priority: task.priority,
          projectPriority: project?.priority ?? undefined,
          projectDueDate: project?.dueDate ? dayKey(project.dueDate) : null,
          completionPercentage: task.completionPercentage ?? 0,
          estimatedHours: r1(personEstimate),
          loggedHours: r1(loggedHrs),
          overEstimate: loggedHrs > personEstimate + 0.05,
          remainingHours: r1(remaining),
          overdue,
        });
        openByUser.set(userId, mine);
        // Kept so a stand-in who holds only a zero-hour seat (created purely so they may log
        // time) still gets a row describing the task they are covering.
        if (!anyEntryForTask.has(task.id)) anyEntryForTask.set(task.id, mine.get(task.id)!);

        if (remaining <= 0) continue;
        if (!plannableDaysFor(userId).length) continue;

        if (ownStart) {
          // PLACED. This person said when they start, so the work goes there rather than being
          // smeared to the deadline. A start already past is honoured by planning what is LEFT
          // from the first day still open to planning: work in flight is not work that has not
          // begun, and on a window opened for next week it picks up on the Monday.
          const from = startOfUtcDay(ownStart);
          if (from >= to) continue; // begins after the visible window — nothing to draw here
          scheduled.push({
            userId, taskId: task.id, remaining,
            startAt: from > planFrom ? from : planFrom,
            cap: capByUser.get(userId) ?? null,
            priority: task.priority, due: personDue ?? null,
          });
        } else {
          // UNSCHEDULED. Exactly the behaviour that existed before scheduling did — which is why
          // every task predating this change keeps working unchanged.
          if (task.startDate && startOfUtcDay(task.startDate) >= to) continue;
          unscheduled.push({ userId, taskId: task.id, remaining, taskStart: task.startDate ?? null, personDue: personDue ?? null });
        }
      }
    }

    /** Add hours to one person's day, keeping the per-task breakdown the board paints from. */
    const addLoad = (userId: string, d: Date, taskId: string, hours: number) => {
      const k = `${userId}|${dayKey(d)}`;
      loadByUserDay.set(k, (loadByUserDay.get(k) ?? 0) + hours);
      const byTask = tasksByUserDay.get(k) ?? new Map<string, number>();
      byTask.set(taskId, (byTask.get(taskId) ?? 0) + hours);
      tasksByUserDay.set(k, byTask);
    };

    // ── pass 1: place the scheduled work ────────────────────────────────────
    //
    // The ordering rule and the fill itself live in ./placement.ts, where they are pure and
    // tested (tools/capacity-placement.spec.ts) rather than buried inside a database query.
    scheduled.sort(compareScheduled);

    // What each person's day has already been claimed for BY PLACED WORK. The spread below is a
    // guess about unscheduled effort, not a claim on a day, so it never blocks a placement.
    const placedByDay = new Map<string, number>();
    // When each placed seat is planned to FINISH, and by how many working days that misses its
    // deadline. This is the whole point of placing work: with a plan on the calendar the finish
    // is a known date rather than an assumption, so leave pushing the work later stops being
    // invisible compression and becomes a number somebody can act on.
    const plannedFinish = new Map<string, Date>();
    const overrunDays = new Map<string, number>();

    /**
     * The live cover on this person's part of this task, if somebody is standing in.
     *
     * Indexed rather than scanned. This is asked once per seat, and a linear search inside that
     * loop is seats × covers — invisible at three covers and quadratic at three hundred, which is
     * the kind of thing that is fine until the week it is not.
     */
    const coverIndex = new Map<string, (typeof coverages)[number]>();
    for (const c of coverages) {
      const k = `${c.fromUserId}|${c.taskId}`;
      if (!coverIndex.has(k)) coverIndex.set(k, c); // first live cover wins; overlaps are refused on write
    }
    const coverFor = (userId: string, taskId: string) => coverIndex.get(`${userId}|${taskId}`);

    /** Lay a set of placements onto a person's days and remember what they claimed. */
    const commit = (userId: string, taskId: string, placements: Placement[]) => {
      for (const p of placements) {
        addLoad(userId, p.date, taskId, p.hours);
        const k = `${userId}|${dayKey(p.date)}`;
        placedByDay.set(k, (placedByDay.get(k) ?? 0) + p.hours);
      }
    };

    /** What the stand-in ends up carrying, so their row can say whose work it is. */
    const coveringHours = new Map<string, { hours: number; fromUserId: string }>();
    /** What the person being covered still has left, and who took the rest. */
    const keptHours = new Map<string, { kept: number; by: string }>();

    for (const s of scheduled) {
      const allDays = plannableDaysFor(s.userId).filter(d => d >= s.startAt);
      const place = (remaining: number, days: Date[], userId = s.userId) => placeForward({
        remaining, days, perDayCap: s.cap,
        capacityOn: d => capacityOn(userId, d),
        usedOn: d => placedByDay.get(`${userId}|${dayKey(d)}`) ?? 0,
      });

      let placements = place(s.remaining, allDays);
      const cover = coverFor(s.userId, s.taskId);
      if (cover) {
        // Measure from the plan they WOULD have had, then split it. Deciding an amount first and
        // subtracting it is how the same hours end up on two people at once — nothing would make
        // the two halves add back up to the work there was to do.
        const from = startOfUtcDay(cover.fromDate);
        const until = cover.toDate ? startOfUtcDay(cover.toDate) : null;
        const moved = hoursInWindow(placements, from, until);
        const kept = Math.max(0, s.remaining - moved);

        // What they keep re-plans itself AROUND the gap, so an absence pushes work later instead
        // of quietly compressing it into the days either side.
        placements = kept > 0 ? place(kept, daysOutsideWindow(allDays, from, until)) : [];
        keptHours.set(`${s.userId}|${s.taskId}`, { kept, by: cover.toUserId });

        if (moved > 0) {
          const standIn = cover.toUserId;
          const theirDays = plannableDaysFor(standIn)
            .filter(d => d >= from && (until === null || d <= until));
          commit(standIn, s.taskId, place(moved, theirDays, standIn));
          const key = `${standIn}|${s.taskId}`;
          const prev = coveringHours.get(key);
          coveringHours.set(key, { hours: (prev?.hours ?? 0) + moved, fromUserId: s.userId });
        }
      }

      commit(s.userId, s.taskId, placements);
      if (!placements.length) continue;
      const key = `${s.userId}|${s.taskId}`;
      const finish = placements[placements.length - 1].date;
      plannedFinish.set(key, finish);
      if (s.due) {
        const due = startOfUtcDay(s.due);
        // Counted in WORKING days, not calendar ones: "three days late" has to mean three days
        // somebody could have worked, or a slip over a weekend reads as worse than it is.
        if (finish > due) {
          overrunDays.set(key, workingDaysFor(s.userId).filter(d => d > due && d <= finish).length);
        }
      }
    }

    // ── pass 2: spread the unscheduled work, as before ──────────────────────
    for (const u of unscheduled) {
      const workable = plannableDaysFor(u.userId);
      if (!workable.length) continue;

      // The span this task occupies: from its start (never before the first day still open to
      // planning) to its internal deadline. No deadline → spread over the window ahead. Overdue,
      // or a deadline that has already passed within the window → it lands on the first workable
      // day: it is blocking them right now.
      const startsAt = u.taskStart && startOfUtcDay(u.taskStart) > planFrom ? startOfUtcDay(u.taskStart) : planFrom;
      const endsAt = u.personDue ? startOfUtcDay(u.personDue) : addDays(windowStart, horizon - 1);
      let span = workable.filter(d => d >= startsAt && d <= endsAt);
      if (!span.length) span = [workable[0]]; // overdue / same-day: put it on the first workable day

      // Denominator = working days over the task's TRUE span, INCLUDING any BEYOND the visible
      // window — otherwise a task due far in the future compresses its whole effort into the
      // window and the person reads as fully booked every day.
      let denom = span.length;
      if (endsAt >= to) {
        const cappedEnd = endsAt > addDays(to, 365) ? addDays(to, 365) : endsAt; // guard bad data
        for (let d = new Date(to); d <= cappedEnd; d = addDays(d, 1)) if (!isWeekend(d)) denom++;
      }
      const perDay = u.remaining / Math.max(1, denom);
      const cover = coverFor(u.userId, u.taskId);
      if (!cover) {
        for (const d of span) addLoad(u.userId, d, u.taskId, perDay);
        continue;
      }

      // Spread work is covered the same way placed work is: measure the share that falls in the
      // window, move exactly that, and re-spread what is left over the days that remain. Cover
      // has to work here too — most work in the system is still unscheduled, and an emergency
      // does not wait for somebody to have named a start date.
      const from = startOfUtcDay(cover.fromDate);
      const until = cover.toDate ? startOfUtcDay(cover.toDate) : null;
      const moved = hoursInWindow(span.map(d => ({ date: d, hours: perDay })), from, until);
      const kept = Math.max(0, u.remaining - moved);
      const keptDays = daysOutsideWindow(span, from, until);
      keptHours.set(`${u.userId}|${u.taskId}`, { kept, by: cover.toUserId });
      if (kept > 0 && keptDays.length) {
        const keptPerDay = kept / Math.max(1, denom - (span.length - keptDays.length));
        for (const d of keptDays) addLoad(u.userId, d, u.taskId, keptPerDay);
      }
      if (moved > 0) {
        const standIn = cover.toUserId;
        const theirDays = plannableDaysFor(standIn).filter(d => inCoverageWindow(d, from, until));
        commit(standIn, u.taskId, placeForward({
          remaining: moved, days: theirDays, perDayCap: null,
          capacityOn: d => capacityOn(standIn, d),
          usedOn: d => placedByDay.get(`${standIn}|${dayKey(d)}`) ?? 0,
        }));
        const key = `${standIn}|${u.taskId}`;
        const prev = coveringHours.get(key);
        coveringHours.set(key, { hours: (prev?.hours ?? 0) + moved, fromUserId: u.userId });
      }
    }

    // Hand each placed seat its planned finish. Done after both passes because the entries were
    // built while reading the tasks, before anything had been laid onto a day.
    for (const [userId, mine] of openByUser) {
      for (const [taskId, entry] of mine) {
        const finish = plannedFinish.get(`${userId}|${taskId}`);
        if (!finish) continue;
        entry.plannedFinish = dayKey(finish);
        entry.overrunDays = overrunDays.get(`${userId}|${taskId}`) ?? 0;
      }
    }

    // The stand-in's side of a cover. Their seat carries no hours of its own — it exists so they
    // may log time — so without this their row would show the task with nothing left to do on it
    // while their days visibly filled up with its work.
    for (const [key, cover] of coveringHours) {
      const sep = key.indexOf('|');
      const userId = key.slice(0, sep);
      const taskId = key.slice(sep + 1);
      const mine = openByUser.get(userId) ?? new Map<string, CapacityRow['openTasks'][number]>();
      let entry = mine.get(taskId);
      if (!entry) {
        const template = anyEntryForTask.get(taskId);
        if (!template) continue;
        entry = { ...template, estimatedHours: 0, loggedHours: 0, overEstimate: false };
        mine.set(taskId, entry);
        openByUser.set(userId, mine);
      }
      entry.remainingHours = r1(cover.hours);
      entry.coveringForUserId = cover.fromUserId;
    }
    // And the covered person's side: what they have left is what they kept, not what they started
    // with. Left alone, the person who is away would still read as carrying the whole job.
    for (const [key, k] of keptHours) {
      const sep = key.indexOf('|');
      const entry = openByUser.get(key.slice(0, sep))?.get(key.slice(sep + 1));
      if (entry) {
        entry.remainingHours = r1(k.kept);
        entry.coveredAway = true;
        entry.coveredByUserId = k.by;
      }
    }

    const rows: CapacityRow[] = users.map(u => {
      const days: CapacityDay[] = window.map(d => {
        const k = dayKey(d);
        const leave = leaveByUserDay.get(`${u.id}|${k}`);
        const holiday = holidayByDay.get(k);
        // An optional holiday this person was GRANTED. Reported as a holiday because that is what
        // it is to them, but it is theirs alone — the same date is an ordinary working day for
        // everyone who did not choose it, which is why it is keyed by user.
        const optional = optionalOff.has(`${u.id}|${k}`);
        if (isWeekend(d)) return { date: k, state: 'WEEKEND', load: 0, capacity: 0, utilization: 0, free: 0 };
        if (holiday) return { date: k, state: 'HOLIDAY', load: 0, capacity: 0, utilization: 0, free: 0, note: holiday };
        if (optional) return { date: k, state: 'HOLIDAY', load: 0, capacity: 0, utilization: 0, free: 0, note: 'Optional holiday' };
        // A FULL day of leave empties the day. A HALF day does not — it is a working day with
        // four hours in it, so it falls through and is drawn like any other working day, noted.
        if (leave && !leave.half) return { date: k, state: 'LEAVE', load: 0, capacity: 0, utilization: 0, free: 0, note: `${leave.type} leave` };

        const capacity = capacityOn(u.id, d);
        const load = loadByUserDay.get(`${u.id}|${k}`) ?? 0;
        const utilization = capacity > 0 ? load / capacity : 0;
        const free = r1(Math.max(0, capacity - load));
        // Largest first, so the widest segment is drawn first and the tail of small ones is
        // what gets truncated on a crowded day.
        // Two decimals, not one: a 0.04h task rounded to 0.0 vanished from the day while its hours
        // stayed in `load`, so the segments no longer added up to the cell.
        const dayTasks = [...(tasksByUserDay.get(`${u.id}|${k}`) ?? [])]
          .map(([taskId, hours]) => ({ taskId, hours: Math.round(hours * 100) / 100 }))
          .filter(t => t.hours > 0)
          .sort((a, b) => b.hours - a.hours);
        // A PENDING (unapproved) leave is shown tentatively but does NOT free the day — the
        // capacity still counts until it is approved (the request could be rejected).
        const pending = pendingLeaveByUserDay.get(`${u.id}|${k}`);
        if (pending) {
          return {
            date: k, state: 'LEAVE_PENDING', load: r1(load), capacity,
            utilization: Math.round(utilization * 100) / 100, free, tasks: dayTasks,
            note: `${pending} leave (pending approval)`,
          };
        }
        const state: DayState =
          utilization >= LIGHT_THRESHOLD ? 'BUSY'
            : utilization > FREE_THRESHOLD ? 'LIGHT'
              : 'FREE';
        return {
          date: k, state, load: r1(load), capacity,
          utilization: Math.round(utilization * 100) / 100, free, tasks: dayTasks,
          // A half day is a working day at half strength — said plainly, because a 4h cell
          // beside a row of 8h ones is otherwise unexplained.
          ...(leave?.half ? { note: `${leave.type} leave (half day)` } : {}),
        };
      });

      // Measured from `planFrom` — the same boundary work is placed from, and for any window
      // starting today or later it is the whole window, so the ordinary board is unchanged.
      // See summariseAhead for what counting the elapsed days did to a Monday-start week.
      const totals = summariseAhead(days, dayKey(planFrom));
      const openTasks = [...(openByUser.get(u.id)?.values() ?? [])].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
        designation: u.designation ?? undefined,
        department: u.departmentMemberships[0]?.department?.name ?? undefined,
        office: u.office ?? undefined,
        profilePhoto: u.profilePhoto,
        days,
        openTasks,
        ...totals,
        overdueCount: openTasks.filter(t => t.overdue).length,
      };
    });

    // Most available first — this board exists to answer "who can take more work?".
    rows.sort((a, b) => b.freeHours - a.freeHours);

    // Stamped so the client can say how fresh the board is, and how long since it last changed.
    // `from`/`to` are the window's own ends, inclusive — not "today plus a horizon". A client that
    // asked to start next Monday has to be told the board it got back really does start there.
    return { from: dayKey(windowStart), to: dayKey(addDays(to, -1)), capacityPerDay: DAILY_CAPACITY_HOURS, rows, generatedAt: new Date().toISOString() };
  }

  /**
   * Retrospective view — what ACTUALLY happened over the last `days` (ending today).
   * Projected "load" is meaningless for the past (the work is already done), so each day
   * is the real attendance state: present / on-leave / holiday / weekend / absent, with
   * days someone worked on a non-working day flagged as COMPOFF (comp-off candidates).
   * Drives the "Past 30 days" range option.
   */
  async teamHistory(organizationId: string, days = 30, onlyUserIds?: string[]) {
    const today = startOfIstDay(new Date()); // "today" = the IST calendar day (org timezone)
    const span = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Number.isFinite(days) ? days : 30));
    const from = addDays(today, -(span - 1)); // inclusive window [from, today]
    const toExcl = addDays(today, 1);
    const userFilter = onlyUserIds ? { id: { in: onlyUserIds.length ? onlyUserIds : ['__none__'] } } : {};

    const [users, holidays, leaves, attendance, sheets] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId, deletedAt: null, status: 'ACTIVE', ...userFilter },
        select: {
          id: true, firstName: true, lastName: true, designation: true, profilePhoto: true, office: true, joiningDate: true,
          departmentMemberships: { select: { department: { select: { name: true } } }, take: 1 },
        },
        orderBy: [{ firstName: 'asc' }],
      }),
      this.prisma.holiday.findMany({ where: { organizationId, date: { gte: from, lt: toExcl } }, select: { date: true, name: true } }),
      this.prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', startDate: { lt: toExcl }, endDate: { gte: from }, user: { organizationId } },
        select: { userId: true, startDate: true, endDate: true, leaveType: true },
      }),
      this.prisma.attendance.findMany({
        where: { organizationId, date: { gte: from, lt: toExcl }, ...(onlyUserIds ? { userId: { in: onlyUserIds } } : {}) },
        select: { userId: true, date: true, status: true, checkIn: true, totalHours: true },
      }),
      this.prisma.timesheet.findMany({
        where: { deletedAt: null, date: { gte: from, lt: toExcl }, user: { organizationId }, ...(onlyUserIds ? { userId: { in: onlyUserIds } } : {}) },
        select: { userId: true, date: true, hoursLogged: true },
      }),
    ]);

    const holidayByDay = new Map(holidays.map(h => [dayKey(h.date), h.name]));
    const leaveByUserDay = new Map<string, string>();
    for (const lv of leaves) {
      const lo = startOfUtcDay(lv.startDate) < from ? from : startOfUtcDay(lv.startDate);
      const hi = startOfUtcDay(lv.endDate) >= toExcl ? today : startOfUtcDay(lv.endDate);
      for (let d = new Date(lo); d <= hi; d = addDays(d, 1)) leaveByUserDay.set(`${lv.userId}|${dayKey(d)}`, lv.leaveType);
    }
    const attByUserDay = new Map(attendance.map(a => [`${a.userId}|${dayKey(a.date)}`, a]));
    const hoursByUserDay = new Map<string, number>();
    for (const s of sheets) {
      const k = `${s.userId}|${dayKey(s.date)}`;
      hoursByUserDay.set(k, (hoursByUserDay.get(k) ?? 0) + (s.hoursLogged ?? 0));
    }

    const window: Date[] = [];
    for (let d = new Date(from); d < toExcl; d = addDays(d, 1)) window.push(new Date(d));

    const rows = users.map(u => {
      let present = 0, absent = 0, onLeave = 0, compoff = 0;
      const days: CapacityDay[] = window.map(d => {
        const k = dayKey(d);
        const uk = `${u.id}|${k}`;
        const weekend = isWeekend(d);
        const holiday = holidayByDay.get(k);
        const leave = leaveByUserDay.get(uk);
        const att = attByUserDay.get(uk);
        const loggedHours = hoursByUserDay.get(uk) ?? 0;
        const worked = (!!att && (att.status === 'PRESENT' || att.status === 'HALF_DAY' || !!att.checkIn)) || loggedHours > 0;
        const hours = r1(att?.totalHours ?? loggedHours);

        // Worked on a non-working day → comp-off candidate (takes precedence, it's the signal).
        if ((weekend || holiday) && worked) {
          compoff++;
          return { date: k, state: 'COMPOFF', load: hours, capacity: 0, utilization: 0, free: 0, note: `Worked ${holiday ? holiday : 'the weekend'}${hours ? ` · ${hours}h` : ''} — comp-off candidate` };
        }
        if (weekend) return { date: k, state: 'WEEKEND', load: 0, capacity: 0, utilization: 0, free: 0 };
        if (holiday) return { date: k, state: 'HOLIDAY', load: 0, capacity: 0, utilization: 0, free: 0, note: holiday };
        if (leave || att?.status === 'ON_LEAVE') { onLeave++; return { date: k, state: 'LEAVE', load: 0, capacity: 0, utilization: 0, free: 0, note: `${leave ?? 'leave'}` }; }
        if (worked) { present++; return { date: k, state: 'PRESENT', load: hours, capacity: 0, utilization: 0, free: 0, note: hours ? `${hours}h logged` : 'Present' }; }
        // Today (before anyone punches in) and days BEFORE the person joined are not absences —
        // there's no attendance expectation yet, so don't flag them red or count them.
        if (k === dayKey(today) || (u.joiningDate && d < startOfUtcDay(u.joiningDate))) {
          return { date: k, state: 'NOT_MARKED', load: 0, capacity: 0, utilization: 0, free: 0, note: k === dayKey(today) ? 'Today — not punched in yet' : 'Before joining' };
        }
        absent++;
        return { date: k, state: 'ABSENT', load: 0, capacity: 0, utilization: 0, free: 0 };
      });
      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
        designation: u.designation ?? undefined,
        department: u.departmentMemberships[0]?.department?.name ?? undefined,
        profilePhoto: u.profilePhoto,
        days, present, absent, onLeave, compoff,
      };
    });

    return { from: dayKey(from), to: dayKey(today), mode: 'history' as const, rows };
  }

  /**
   * What this person is planned to be doing on a given day, and the day after — the list a day
   * sheet puts in front of them so nothing has to be hunted for in a dropdown.
   *
   * Built from the SAME placement the capacity board draws, scoped to one person, rather than a
   * second idea of what somebody is working on. Two answers that could disagree about that would
   * eventually disagree, and the one in the timesheet is the one that becomes the invoice.
   *
   * A BACKDATED DAY HAS NO PLAN. The board projects forward from today; it knows nothing about
   * last Tuesday. Rather than invent a plan for a day that has already happened, every open task
   * is offered as OTHER and the sheet says so. Filling in a day you have already worked is
   * remembering, not planning, and pretending otherwise would put a confident heading over a guess.
   */
  async myPlan(organizationId: string, userId: string, dateKey: string) {
    const day = startOfUtcDay(new Date(`${dateKey}T00:00:00.000Z`));
    if (Number.isNaN(day.getTime())) throw new BadRequestException('A valid date is required.');
    const today = startOfIstDay(new Date());
    const next = addDays(day, 1);

    // Enough window to reach the day after the one being filled in, and never less than the
    // board's own minimum.
    const spanDays = Math.ceil((next.getTime() - today.getTime()) / 86_400_000) + 2;
    const board = await this.team(organizationId, Math.max(MIN_DAYS, Math.min(MAX_DAYS, spanDays)), [userId]);
    const row = board.rows[0];

    const plannedOn = (d: Date): Map<string, number> => {
      const found = (row?.days ?? []).find(x => x.date === dayKey(d));
      return new Map((found?.tasks ?? []).map(t => [t.taskId, t.hours]));
    };
    const planToday = day >= today ? plannedOn(day) : new Map<string, number>();
    const planNext = day >= today ? plannedOn(next) : new Map<string, number>();

    // What they have already filed against each task on this exact date — so a sheet reopened
    // after a save shows what is already there instead of inviting it to be typed twice.
    const filed = await this.prisma.timesheet.groupBy({
      by: ['taskId'],
      where: { userId, date: day, deletedAt: null, taskId: { not: null } },
      _sum: { hoursLogged: true },
    });
    const loggedByTask = new Map(filed.map(f => [f.taskId as string, f._sum.hoursLogged ?? 0]));

    const rows = (row?.openTasks ?? []).map(t => {
      const plannedHours = r1(planToday.get(t.id) ?? 0);
      const when: 'TODAY' | 'TOMORROW' | 'OTHER' =
        plannedHours > 0 ? 'TODAY' : (planNext.get(t.id) ?? 0) > 0 ? 'TOMORROW' : 'OTHER';
      return {
        taskId: t.id,
        title: t.title,
        projectId: t.projectId ?? null,
        project: t.project ?? null,
        taskGroup: t.taskGroup ?? null,
        projectPid: t.projectPid ?? null,
        projectRound: t.projectRound,
        priority: t.priority,
        dueDate: t.dueDate ?? null,
        overdue: t.overdue,
        estimatedHours: t.estimatedHours,
        remainingHours: t.remainingHours,
        loggedToday: r1(loggedByTask.get(t.id) ?? 0),
        plannedHours,
        // The board only lists OPEN work, so anything here is open by construction. Carried
        // explicitly so the sheet does not have to infer it.
        closed: false,
        billable: undefined as boolean | undefined,
        finishedOn: null as string | null,
        when,
      };
    });

    // Work FINISHED recently still needs its hours. Finish closes a task the moment it is done and
    // the hours are usually logged afterwards — that evening, or the next morning — so a task
    // that vanished from the sheet on Finish could only be logged by hunting for it elsewhere.
    // Offered at the end, marked as finished, never planned.
    const listed = new Set(rows.map(r => r.taskId));
    const finished = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        assignees: { some: { userId } },
        currentStatus: { type: 'CLOSED' },
        completedAt: { gte: addDays(day, -FINISHED_LOOKBACK_DAYS) },
        ...(listed.size ? { id: { notIn: [...listed] } } : {}),
      },
      select: {
        id: true, title: true, priority: true, dueDate: true, estimatedHours: true, completedAt: true, billable: true,
        assignees: { where: { userId }, select: { estimatedHours: true } },
        projectTasks: {
          take: 1,
          select: {
            taskList: { select: { name: true, deletedAt: true } },
            project: { select: { id: true, title: true, code: true, roundSeq: true, deletedAt: true, projectPhase: true } },
          },
        },
        teamTasks: { take: 1, select: { team: { select: { id: true, name: true, deletedAt: true } } } },
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
    });
    for (const t of finished) {
      const project = t.projectTasks[0]?.project;
      const team = t.teamTasks[0]?.team;
      // A deleted or completed client refuses time anyway; offering it would only produce a
      // refusal after the person has typed the hours.
      if (project && (project.deletedAt || project.projectPhase === 'COMPLETED' || project.projectPhase === 'CLOSED')) continue;
      if (team?.deletedAt) continue;
      const group = t.projectTasks[0]?.taskList;
      const seatHours = t.assignees.reduce((s, a) => s + (a.estimatedHours ?? 0), 0);
      rows.push({
        taskId: t.id,
        title: t.title,
        projectId: project?.id ?? team?.id ?? null,
        project: project?.title ?? team?.name ?? null,
        taskGroup: project && group && !group.deletedAt ? group.name : null,
        projectPid: project?.code ?? null,
        projectRound: project?.roundSeq,
        priority: t.priority,
        dueDate: t.dueDate ? dayKey(t.dueDate) : null,
        overdue: false,
        estimatedHours: r1(seatHours || (t.estimatedHours ?? 0)),
        remainingHours: 0,
        loggedToday: r1(loggedByTask.get(t.id) ?? 0),
        plannedHours: 0,
        closed: true,
        billable: t.billable,
        // The IST calendar day it was finished on — the day people mean.
        finishedOn: t.completedAt ? dayKey(startOfIstDay(t.completedAt)) : null,
        when: 'OTHER' as const,
      });
    }

    // Whether each open task's time is billable — the task decides (Task.billable), and the sheet
    // says so on the line so nobody is surprised when the entry comes out non-billable.
    const openIds = rows.filter(r => r.billable === undefined).map(r => r.taskId);
    if (openIds.length) {
      const flags = new Map((await this.prisma.task.findMany({
        where: { id: { in: openIds } }, select: { id: true, billable: true },
      })).map(t => [t.id, t.billable]));
      for (const r of rows) if (r.billable === undefined) r.billable = flags.get(r.taskId) ?? true;
    }

    // Planned first, then tomorrow's, then the rest — the order somebody fills a day in.
    const rank = { TODAY: 0, TOMORROW: 1, OTHER: 2 } as const;
    rows.sort((a, b) =>
      rank[a.when] - rank[b.when] ||
      b.plannedHours - a.plannedHours ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      a.title.localeCompare(b.title));

    const dayStatus = await this.timesheetDay(userId, day);
    return {
      date: dateKey,
      /** No plan exists for a day already past — the sheet says so rather than implying one. */
      hasPlan: day >= today,
      target: dayStatus.target,
      logged: dayStatus.logged,
      rows,
    };
  }

  /** The day's owed and filled hours, without pulling in the timesheets module. */
  private async timesheetDay(userId: string, day: Date): Promise<{ target: number; logged: number }> {
    const agg = await this.prisma.timesheet.aggregate({
      where: { userId, date: day, deletedAt: null }, _sum: { hoursLogged: true },
    });
    const wd = day.getUTCDay();
    const holiday = await this.prisma.holiday.findFirst({ where: { date: day }, select: { id: true } });
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { userId, status: 'APPROVED', startDate: { lte: day }, endDate: { gte: day } },
      select: { dayType: true },
    });
    let target = DAILY_CAPACITY_HOURS;
    if (wd === 0 || wd === 6 || holiday) target = 0;
    else if (leave) target = leave.dayType === 'HALF' ? HALF_DAY_CAPACITY_HOURS : 0;
    return { target, logged: r1(agg._sum.hoursLogged ?? 0) };
  }

  // ── Standing in for somebody ─────────────────────────────────────────────────

  /**
   * Arrange a cover.
   *
   * Nothing about the existing staffing is overwritten — that is the whole point. The record
   * sits beside the seats, the board splits the work from it, and withdrawing it puts the plan
   * back exactly as it was. The old route through the staffing call destroyed what it replaced.
   */
  async createCoverage(organizationId: string, dto: CreateCoverageDto) {
    const mode = dto.mode ?? 'COVER';
    if (mode !== 'COVER' && mode !== 'HANDOVER') {
      throw new BadRequestException('A cover is either COVER (named days) or HANDOVER (permanent).');
    }
    if (!dto.taskId || !dto.fromUserId || !dto.toUserId || !dto.fromDate) {
      throw new BadRequestException('taskId, fromUserId, toUserId and fromDate are all required.');
    }
    if (dto.fromUserId === dto.toUserId) {
      throw new BadRequestException('Somebody cannot stand in for themselves.');
    }
    const from = startOfUtcDay(new Date(dto.fromDate));
    const to = mode === 'HANDOVER' ? null : (dto.toDate ? startOfUtcDay(new Date(dto.toDate)) : null);
    if (Number.isNaN(from.getTime())) throw new BadRequestException('That start date is not a date.');
    // A COVER with no end is a handover wearing the wrong name, and the difference matters: one
    // hands the work back and the other does not.
    if (mode === 'COVER' && !to) throw new BadRequestException('Say which day the cover ends, or make it a handover.');
    if (to && to < from) throw new BadRequestException('A cover cannot end before it starts.');

    const task = await this.prisma.task.findFirst({
      where: { id: dto.taskId, deletedAt: null },
      select: { id: true, title: true, assignees: { select: { userId: true, role: true } } },
    });
    if (!task) throw new NotFoundException('Task not found.');
    // You can only hand over work you actually hold.
    if (!task.assignees.some(a => a.userId === dto.fromUserId)) {
      throw new BadRequestException('That person is not on this task, so there is nothing of theirs to cover.');
    }

    const [away, standIn] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: dto.fromUserId, organizationId }, select: { id: true, firstName: true } }),
      this.prisma.user.findFirst({ where: { id: dto.toUserId, organizationId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    if (!away) throw new NotFoundException('The person being covered is not in this organisation.');
    if (!standIn) throw new NotFoundException('The stand-in is not an active member of this organisation.');

    // Two live covers over the same days would put the same hours on two people at once.
    const clashes = await this.prisma.taskCoverage.findMany({
      where: { taskId: dto.taskId, fromUserId: dto.fromUserId, revokedAt: null },
      select: { id: true, fromDate: true, toDate: true },
    });
    const overlaps = clashes.some(c => {
      const cFrom = startOfUtcDay(c.fromDate);
      const cTo = c.toDate ? startOfUtcDay(c.toDate) : null;
      return (cTo === null || cTo >= from) && (to === null || to >= cFrom);
    });
    if (overlaps) throw new BadRequestException('Those days are already covered for this person on this task.');

    // Handing work to somebody who is themselves away just moves the problem, and the board would
    // then quietly push their share past the window rather than telling anyone.
    const awayThen = await this.prisma.leaveRequest.findFirst({
      where: {
        userId: dto.toUserId, status: 'APPROVED', dayType: 'FULL',
        startDate: { lte: to ?? addDays(from, 30) },
        endDate: { gte: from },
      },
      select: { startDate: true, endDate: true },
    });
    if (awayThen) {
      throw new BadRequestException(
        `${standIn.firstName} is on approved leave over those days — pick somebody who is in.`,
      );
    }

    const actorId = this.actor.requireActorId();
    const created = await this.prisma.$transaction(async tx => {
      const row = await tx.taskCoverage.create({
        data: {
          taskId: dto.taskId, fromUserId: dto.fromUserId, toUserId: dto.toUserId,
          fromDate: from, toDate: to, mode, reason: dto.reason?.trim() || null, createdBy: actorId,
        },
      });
      // The stand-in needs a REAL seat, or they can do the work and then not book an hour of it:
      // time may only be filed against a task you are assigned to. It carries no hours of its own
      // — the board works their share out from the cover — and it is left in place when the cover
      // is withdrawn, because by then it may have timesheets hanging off it.
      const existing = await tx.taskAssignee.findFirst({
        where: { taskId: dto.taskId, userId: dto.toUserId }, select: { id: true },
      });
      if (!existing) {
        await tx.taskAssignee.create({
          data: { taskId: dto.taskId, userId: dto.toUserId, role: 'ANALYST', estimatedHours: 0 },
        });
      }
      return row;
    });

    await this.notifications.notify([dto.toUserId], {
      type: 'coverage.assigned',
      title: mode === 'HANDOVER' ? 'A task has been handed to you' : 'You are covering a task',
      message: `${away.firstName}'s work on "${task.title}"${to ? ` from ${dayKey(from)} to ${dayKey(to)}` : ` from ${dayKey(from)} onwards`}.`,
      link: `/tasks?taskId=${dto.taskId}`,
    });
    return created;
  }

  /**
   * Withdraw a cover. The record is kept and stamped rather than deleted — who covered whom, and
   * why, is a question a firm has to be able to answer afterwards.
   *
   * The stand-in's seat stays. It may already carry logged time, and deleting it would strand
   * those hours; with the cover gone it simply holds no share of the work.
   */
  async revokeCoverage(organizationId: string, id: string) {
    const row = await this.prisma.taskCoverage.findFirst({
      where: { id, fromUser: { organizationId } },
      select: { id: true, revokedAt: true },
    });
    if (!row) throw new NotFoundException('That cover does not exist.');
    if (row.revokedAt) return row; // already withdrawn — saying so twice is not an error
    return this.prisma.taskCoverage.update({
      where: { id },
      data: { revokedAt: new Date(), revokedBy: this.actor.requireActorId() },
    });
  }

  /** Live covers, newest first. */
  async listCoverage(organizationId: string, taskId?: string) {
    return this.prisma.taskCoverage.findMany({
      where: { revokedAt: null, fromUser: { organizationId }, ...(taskId ? { taskId } : {}) },
      select: {
        id: true, taskId: true, fromDate: true, toDate: true, mode: true, reason: true, createdAt: true,
        task: { select: { id: true, title: true } },
        fromUser: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        toUser: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Emergency-leave coverage ─────────────────────────────────────────────────
  // Priorities that make an absence worth flagging, and how much notice counts as
  // "short" (an emergency). Capacity already compresses an on-leave person's work
  // into fewer days; coverage surfaces WHO that hurts so it can be reassigned.
  private static readonly RISK_PRIORITIES = ['HIGH', 'CRITICAL'];
  private static readonly EMERGENCY_NOTICE_DAYS = 3;

  /**
   * Short notice = booked ≤ N days before it starts. Whether the leave has already begun
   * is irrelevant: a leave booked three weeks in advance is not an "emergency" just because
   * today falls inside it — that previously flagged every in-progress leave as short-notice.
   */
  private isShortNotice(createdAt: Date, startDate: Date): boolean {
    const noticeDays = Math.floor((startOfUtcDay(startDate).getTime() - startOfUtcDay(createdAt).getTime()) / 86_400_000);
    return noticeDays <= CapacityService.EMERGENCY_NOTICE_DAYS;
  }

  /** Open tasks on HIGH/CRITICAL projects, due on/before `windowEnd`, for the given users. */
  private async atRiskTasks(userIds: string[], windowEnd: Date) {
    if (!userIds.length) return [];
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        assignees: { some: { userId: { in: userIds } } },
        AND: [
          { OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }] },
          // Due before the window ends — by the task's deadline, or by a person's OWN deadline on it.
          { OR: [
            { dueDate: { not: null, lt: windowEnd } },
            { assignees: { some: { userId: { in: userIds }, dueDate: { not: null, lt: windowEnd } } } },
          ] },
        ],
        projectTasks: { some: { project: { deletedAt: null, priority: { in: CapacityService.RISK_PRIORITIES } } } },
      },
      select: {
        id: true, title: true, priority: true, dueDate: true,
        estimatedHours: true, completionPercentage: true,
        assignees: { select: { userId: true, dueDate: true } },
        projectTasks: {
          where: { project: { deletedAt: null, priority: { in: CapacityService.RISK_PRIORITIES } } },
          select: {
            project: { select: { id: true, title: true, priority: true } },
            taskList: { select: { id: true, name: true, dueDate: true, deletedAt: true } },
          },
          take: 1,
        },
      },
    });
    const today = startOfIstDay(new Date()); // "today" = the IST calendar day (org timezone)
    return tasks.map(t => {
      const project = t.projectTasks[0]?.project;
      const group = t.projectTasks[0]?.taskList;
      const liveGroup = group && !group.deletedAt ? group : null;
      const estimate = t.estimatedHours ?? DEFAULT_TASK_HOURS;
      const remaining = Math.max(0, estimate * (1 - (t.completionPercentage ?? 0) / 100));
      // Each person's deadline on the task: their own seat's date when one was set, else the task's.
      const dueByUser: Record<string, Date | null> = {};
      for (const a of t.assignees) dueByUser[a.userId] = a.dueDate ?? t.dueDate ?? null;
      return {
        id: t.id, title: t.title, priority: t.priority,
        dueDate: t.dueDate,
        dueByUser,
        projectId: project?.id, project: project?.title, projectPriority: project?.priority,
        taskGroupId: liveGroup?.id ?? null, taskGroup: liveGroup?.name ?? null,
        taskGroupDueDate: liveGroup?.dueDate ? dayKey(liveGroup.dueDate) : null,
        remainingHours: r1(remaining),
        overdue: !!t.dueDate && startOfUtcDay(t.dueDate) < today,
        userIds: t.assignees.map(a => a.userId),
      };
    });
  }

  /**
   * Who can act on a coverage risk, and WHERE each of them can act on it.
   *
   *   board   — everyone who can open Team Capacity (effective capacity.view: role, group, direct
   *             grant or ALLOW override, less any DENY; Super Admins implicitly). Since Sep 2026
   *             that is Senior Consultant and above, and only they are sent to the board.
   *   clients — the affected clients' own managers who CANNOT open the board, each pointed at the
   *             client instead. Sending them to /capacity would land them on "Access restricted".
   *
   * It used to read role grants alone, so a DENY override or a group grant was invisible to it,
   * and every recipient was told to go to the board whether or not they could open it.
   */
  private async coverageReviewers(organizationId: string, projectIds: string[]): Promise<{
    board: string[]; clients: { userId: string; projectId: string }[];
  }> {
    const holdsBoard = { permission: { code: 'capacity.view' } };
    const [candidates, managers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId, deletedAt: null, status: 'ACTIVE',
          OR: [
            { userRoles: { some: { role: { name: 'Super Admin' } } } },
            { userRoles: { some: { role: { rolePermissions: { some: holdsBoard } } } } },
            { permissionGroupMembers: { some: { group: { permissionGroupPermissions: { some: holdsBoard } } } } },
            { userPermissions: { some: holdsBoard } },
            { permissionOverrides: { some: { ...holdsBoard, effect: 'ALLOW' } } },
          ],
        },
        select: { id: true },
      }),
      projectIds.length
        ? this.prisma.projectMember.findMany({
            where: { projectId: { in: projectIds }, projectRole: 'MANAGER', isActive: true },
            select: { userId: true, projectId: true },
          })
        : Promise.resolve([] as { userId: string; projectId: string }[]),
    ]);
    // The narrowing above is a cheap superset; the resolver has the last word (a DENY wins).
    const board: string[] = [];
    for (const c of candidates) if (await this.permissions.check(c.id, 'capacity.view')) board.push(c.id);
    const onBoard = new Set(board);
    const clients: { userId: string; projectId: string }[] = [];
    for (const m of managers) {
      if (onBoard.has(m.userId) || clients.some(x => x.userId === m.userId)) continue;
      clients.push({ userId: m.userId, projectId: m.projectId });
    }
    return { board, clients };
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
    const today = startOfIstDay(new Date()); // "today" = the IST calendar day (org timezone)
    const horizon = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Number.isFinite(days) ? days : DEFAULT_DAYS));
    const to = addDays(today, horizon);

    const leaves = await this.prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lt: to }, endDate: { gte: today }, user: { organizationId } },
      select: {
        id: true, userId: true, leaveType: true, startDate: true, endDate: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      },
    });
    const emergency = leaves.filter(lv => this.isShortNotice(lv.createdAt, lv.startDate));
    if (!emergency.length) return this.emptyCoverage(today, to);

    const tasks = await this.atRiskTasks([...new Set(emergency.map(l => l.userId))], to);
    if (!tasks.length) return this.emptyCoverage(today, to);

    const risks = emergency.map(lv => {
      const start = startOfUtcDay(lv.startDate);
      const end = startOfUtcDay(lv.endDate);
      const mine = tasks
        // Only work that comes due DURING the leave is a risk caused by it. A task already
        // overdue before the leave began was late independently — don't blame the leave.
        .filter(t => {
          const due = t.dueByUser[lv.userId];
          if (!due) return false;
          return t.userIds.includes(lv.userId) && startOfUtcDay(due) >= start && startOfUtcDay(due) <= end;
        })
        .map(({ userIds: _uids, dueByUser, ...rest }) => {
          const due = dueByUser[lv.userId] as Date; // present: the filter above required it
          return { ...rest, dueDate: dayKey(due), overdue: startOfUtcDay(due) < today };
        })
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
    if (!this.isShortNotice(leave.createdAt, leave.startDate)) return;
    const start = startOfUtcDay(leave.startDate);
    const end = startOfUtcDay(leave.endDate);
    const tasks = (await this.atRiskTasks([userId], addDays(end, 1)))
      // Only tasks falling due DURING the leave — by THIS person's deadline on them — not ones
      // already overdue before it began.
      .filter(t => {
        const due = t.dueByUser[userId];
        if (!due) return false;
        return t.userIds.includes(userId) && startOfUtcDay(due) >= start && startOfUtcDay(due) <= end;
      });
    if (!tasks.length) return;
    const projectIds = [...new Set(tasks.map(t => t.projectId).filter((x): x is string => !!x))];
    const { board, clients } = await this.coverageReviewers(organizationId, projectIds);
    const what = `${name} is on ${leave.leaveType} leave with ${tasks.length} critical task${tasks.length === 1 ? '' : 's'} due while they're out`;
    const toBoard = board.filter(id => id !== userId);
    if (toBoard.length) {
      await this.notifications.notify(toBoard, {
        type: 'coverage.at_risk',
        title: 'Coverage at risk',
        message: `${what} — reassign or extend on the Team Capacity board.`,
        link: '/capacity',
      });
    }
    // A client's own manager who cannot open the board is told the same thing, and sent to the
    // client — where their tasks are — rather than to a page that would refuse them.
    for (const { userId: managerId, projectId } of clients) {
      if (managerId === userId) continue;
      await this.notifications.notify([managerId], {
        type: 'coverage.at_risk',
        title: 'Coverage at risk',
        message: `${what} — reassign or extend the work on the client.`,
        link: `/projects/${projectId}`,
      });
    }
  }
}

@Controller('capacity')
class CapacityController {
  constructor(
    private readonly capacity: CapacityService,
    private readonly actor: ActorContextService,
    private readonly availability: AvailabilityService,
  ) {}

  /**
   * Whole-org availability. The org is taken from the SESSION, not the query — accepting a
   * client-supplied organizationId here was a cross-tenant read (IDOR).
   *
   * `from` (YYYY-MM-DD) is the first day of the window; leave it off and the window starts today,
   * exactly as it always did. It is optional precisely so nothing that calls this endpoint with a
   * length alone has to change.
   *
   * Every read of this board goes through AvailabilityService on the way out: that is where the
   * names of matters this viewer may not open are removed, and where each day's hours are split
   * into the client in focus and everything else — computed once, for every screen. The whole-org
   * board has no client in focus, so all of it is "other", which is what lets a hover card say
   * where a day's hours actually went. Focusing on one client is /capacity/project/:id.
   */
  @Get('team')
  @RequirePermission('capacity.view')
  async team(@Query('days') days?: string, @Query('from') from?: string) {
    const organizationId = await this.actor.requireOrgId();
    const board = await this.capacity.team(organizationId, parseHorizon(days), undefined, {
      from: parseWindowStart(from, startOfIstDay(new Date())),
    });
    return this.availability.forBoard(board, this.actor.requireActorId(), organizationId, null);
  }

  /**
   * What a proposed assignment would do to the people in it — the answer every dialog that hands
   * out work asks before it lets the work be handed out.
   *
   * It is a READ that happens to be a POST: a seat is a small object per person and there may be
   * several, which is more than a query string should carry. It changes nothing.
   *
   * It warns; it does not refuse. A deadline sometimes genuinely costs somebody a ten-hour day,
   * and the server is not the right place to decide that it must not. What it refuses to do is
   * stay quiet: the verdict, the real free hours and the days that would go over all come back,
   * and the dialogs make overriding them a deliberate act.
   */
  @Post('availability/preview')
  @RequirePermission('capacity.view')
  async previewAssignment(@Body() dto: PreviewAssignmentDto): Promise<{ from: string; to: string; seats: SeatPreview[] }> {
    const seats = (dto?.seats ?? []).filter(s => s && typeof s.userId === 'string' && s.userId.trim());
    if (!seats.length) throw new BadRequestException('Say who the work is for.');
    if (seats.length > 50) throw new BadRequestException('That is more people than one assignment can be about.');
    const organizationId = await this.actor.requireOrgId();
    const today = startOfIstDay(new Date());
    // The window has to reach the furthest deadline being assigned, or the days past its end
    // would silently drop out of the arithmetic and the assignment would look like it fits.
    const furthest = seats
      .map(s => (s.dueDate ?? '').slice(0, 10))
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .pop();
    const reach = furthest
      ? Math.ceil((new Date(`${furthest}T00:00:00.000Z`).getTime() - today.getTime()) / 86_400_000) + 2
      : DEFAULT_DAYS;
    // …and never a SHORT one. Placement puts whatever outlasts the window onto its last day —
    // that is how the board makes an impossible plan visible rather than dropping the hours — so
    // a window cut to the deadline piles the person's own later work onto the very day being
    // assigned and reports an overload they do not have. Asking for the board's ordinary fortnight
    // as a floor keeps the days being assigned well inside the window, where the load is real.
    const span = Math.max(DEFAULT_DAYS, reach);
    const board = await this.capacity.team(
      organizationId,
      parseHorizon(String(span), DEFAULT_DAYS),
      [...new Set(seats.map(s => s.userId))],
    );
    const previews = await this.availability.preview(board, this.actor.requireActorId(), organizationId, seats, {
      planFrom: dayKey(today),
      focusProjectId: dto.projectId?.trim() || null,
      excludeTaskId: dto.excludeTaskId?.trim() || null,
    });
    return { from: board.from, to: board.to, seats: previews };
  }

  /** Retrospective: actual attendance over the past `days` (ending today). */
  @Get('history')
  @RequirePermission('capacity.view')
  async history(@Query('days') days?: string) {
    const organizationId = await this.actor.requireOrgId();
    // The history view's intent is "Past 30 days" — default to 30 when unspecified, not the
    // 14-day forward-board default (which silently contradicted the range label).
    return this.capacity.teamHistory(organizationId, parseHorizon(days, 30));
  }

  /**
   * Emergency-leave coverage board: who is on short-notice leave while holding
   * open HIGH/CRITICAL work due in their absence, plus free teammates to reassign to.
   */
  @Get('coverage-risks')
  @RequirePermission('capacity.view')
  async coverageRisks(@Query('days') days?: string) {
    const organizationId = await this.actor.requireOrgId();
    const out = await this.capacity.coverageRisks(organizationId, parseHorizon(days));
    // The suggestions already carry whole-org free hours — they come off the same board. The
    // risks name the matters at risk, and this panel is open to everyone with capacity.view
    // (HR included), so a matter this viewer may not open is counted and not named.
    const vis = await this.availability.visibility(this.actor.requireActorId(), organizationId);
    if (!vis.all) {
      type RiskTask = { title: string; projectId?: string; project?: string; taskGroup?: string | null; restricted?: boolean };
      for (const risk of (out.risks ?? []) as { tasks: RiskTask[] }[]) {
        for (const t of risk.tasks ?? []) {
          if (canName(vis, t.projectId)) continue;
          t.restricted = true; t.title = 'Other work'; t.project = 'Other work'; t.projectId = undefined; t.taskGroup = null;
        }
      }
    }
    return out;
  }

  /**
   * Arrange for somebody to stand in — for named days (COVER) or for good (HANDOVER).
   *
   * Behind task.assign, the same right that staffing a task needs: deciding who does the work is
   * one decision whether it is made at the start or halfway through.
   */
  @Post('coverage')
  @RequirePermission('task.assign')
  async createCoverage(@Body() dto: CreateCoverageDto) {
    return this.capacity.createCoverage(await this.actor.requireOrgId(), dto);
  }

  /** Withdraw a cover — the leave was cancelled, or they came back early. */
  @Post('coverage/:id/revoke')
  @RequirePermission('task.assign')
  async revokeCoverage(@Param('id') id: string) {
    return this.capacity.revokeCoverage(await this.actor.requireOrgId(), id);
  }

  /** Live covers, for the panel that arranges them. */
  @Get('coverage')
  @RequirePermission('capacity.view')
  async listCoverage(@Query('taskId') taskId?: string) {
    return this.capacity.listCoverage(await this.actor.requireOrgId(), taskId);
  }

  /**
   * What I am planned to be doing on a day — the list the day sheet shows instead of a dropdown.
   * Always about the CALLER: there is no userId to supply, so it cannot be pointed at anybody else.
   */
  @Get('my-plan')
  @RequirePermission('timesheet.create')
  async myPlan(@Query('date') date?: string) {
    if (!date?.trim()) throw new BadRequestException('date is required (YYYY-MM-DD).');
    return this.capacity.myPlan(await this.actor.requireOrgId(), this.actor.requireActorId(), date.trim());
  }

  /** Availability of one project's members — the capacity view opened from a project. */
  @Get('project/:projectId')
  @RequirePermission('capacity.view')
  async forProject(@Param('projectId') projectId: string, @Query('days') days?: string, @Query('from') from?: string) {
    if (!projectId?.trim()) throw new BadRequestException('projectId is required');
    const board = await this.capacity.forProject(projectId, parseHorizon(days), {
      from: parseWindowStart(from, startOfIstDay(new Date())),
    });
    // The focus IS this client: every day comes back split into its share and everybody else's,
    // so the tab can draw the rest of the week as load instead of fading it into the background.
    return this.availability.forBoard(board, this.actor.requireActorId(), await this.actor.requireOrgId(), projectId);
  }
}

/** A proposed assignment, as an assignment dialog has it before it is saved. */
export interface PreviewAssignmentDto {
  seats: ProposedSeat[];
  /** The client the work belongs to, so its own hours are not counted as "other". */
  projectId?: string | null;
  /** The task being restaffed — its current hours come out before the new ones go in. */
  excludeTaskId?: string | null;
}

export interface CreateCoverageDto {
  taskId: string;
  fromUserId: string;
  toUserId: string;
  fromDate: string;
  /** Omitted or null for a permanent handover. */
  toDate?: string | null;
  mode?: 'COVER' | 'HANDOVER';
  reason?: string;
}

@Module({
  // OptionalHolidaysModule supplies the per-person approved-optional-holiday days, which the
  // board treats exactly like approved leave: off for that person, nobody else.
  // TasksModule: the board's task CRUD (capacity-tasks.ts) goes through TasksService's own rules.
  // ProjectsModule: a whole new piece of client work (capacity-client-setup.ts) is created through
  // ProjectsService's own create, inside the transaction it opens. Projects imports nothing, so
  // this cannot cycle.
  imports: [OptionalHolidaysModule, TasksModule, ProjectsModule],
  controllers: [CapacityController, CapacityTasksController, CapacityClientSetupController],
  // AvailabilityService is the one place a person's free hours are split, redacted and reported;
  // exported so anything else that has to answer "how free is this person?" asks it rather than
  // deriving a second answer of its own.
  providers: [CapacityService, CapacityTaskOptionsService, AvailabilityService, CapacityClientSetupService],
  exports: [CapacityService, AvailabilityService],
})
export class CapacityModule {}
