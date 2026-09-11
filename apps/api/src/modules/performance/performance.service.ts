import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { Prisma } from '@prisma/client';
import {
  breachesByProject, computeStreak, countBreaches, deadlineVerdict, breachedHours,
  isOnTime, rollUpManagers, summariseDeadlines, summariseHours, summariseProject,
  type Delivery, type ProjectInput,
} from './kpi';

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
// SquarkIP runs on IST (Asia/Kolkata, no DST). Due dates are stored at UTC midnight and
// carry no time-of-day, so "on time" must be judged on the DATE in the org timezone, not on
// a raw instant comparison — otherwise any same-day close after 05:30 IST (i.e. essentially
// every on-time close during 9–6 office hours) reads as late.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istDayKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
// `isOnTime` now lives in ./kpi alongside the two KPIs it feeds. It was defined twice — here and
// implicitly in every place that compared a completion instant with a deadline — and the two
// readings of "on time" have to be one reading, or the on-time rate on a person's page disagrees
// with the on-time rate on the report their appraisal is run from.
/**
 * "Every timesheet entry except miscellaneous non-project time" — NULL-safely.
 *
 * `{ category: { not: 'OTHER' } }` looks like it says this and does not. `category` is nullable,
 * and a normal task entry leaves it NULL; in SQL `NULL <> 'OTHER'` is NULL rather than true, so
 * every ordinary entry was filtered OUT. On this database that is 1,225 of 1,225 rows: the
 * Performance module reported ZERO hours logged for everybody, always, and nobody noticed because
 * zero is a plausible-looking number next to a chart.
 *
 * The rest of the codebase already avoids this — capacity, the digest and the overdue sweep all
 * write the OR form. Performance was the one module that did not.
 */
const notOtherTime = (): { OR: Prisma.TimesheetWhereInput[] } =>
  ({ OR: [{ category: null }, { category: { not: 'OTHER' } }] });

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
/** Current window [from,to) and the equal-length previous window [prevFrom,prevTo). */
function windowRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - days * 86400000);
  return { from, to, prevFrom, prevTo };
}
function r1(n: number): number {
  return Math.round((n ?? 0) * 10) / 10;
}
/** Count of weekdays (Mon–Fri) in [from, to); used to derive capacity targets. */
function businessDays(from: Date, to: Date): number {
  let n = 0;
  const d = new Date(from);
  while (d < to) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return Math.max(1, n);
}

// M22: guards concurrent auto-rebuilds per org (snapshots were never auto-refreshed).
const autoRebuildInFlight = new Set<string>();

/**
 * A `task.status_changed` event is a COMPLETION only when it moved a task INTO a
 * CLOSED status from a non-closed one — not on every transition. Counting every
 * status change inflated "tasks completed" (Open→In Progress→Done counted 3, and
 * reopening also incremented). Historical events lack old.type; treating a missing
 * old.type as "not closed" still counts genuine closes without the 3× inflation.
 */
function isCompletionEvent(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as { new?: { type?: string | null }; old?: { type?: string | null } };
  return p.new?.type === 'CLOSED' && p.old?.type !== 'CLOSED';
}

/**
 * A window and the window it is compared against, as four instants.
 *
 * Four dates rather than a day count because the periods are now CALENDAR periods — last week,
 * last month, last quarter — and the window before a calendar month is the previous month, not
 * "thirty days earlier". A day count cannot express that, and a day count can only ever end
 * today, which is what made every figure in this module report a half-finished week.
 */
export interface KpiWindow {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

/**
 * The columns the two KPIs are built from, in one place.
 *
 * `Prisma.validator` rather than a plain object so the literal `true`s survive: typed loosely,
 * the select still runs but every field comes back as possibly-undefined and the arithmetic below
 * loses the type checking that catches a renamed column.
 */
const TASK_KPI_SELECT = Prisma.validator<Prisma.TaskSelect>()({
  id: true,
  title: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  estimatedHours: true,
  assignees: { select: { userId: true, estimatedHours: true, dueDate: true } },
  // A task can belong to more than one project (two rounds of one PID share tasks), and `take: 1`
  // with no ordering picks whichever row the database returned first — so the same task could be
  // credited to a different project on two consecutive page loads. Ordering by project id makes
  // the choice arbitrary but STABLE, which is the most that can honestly be claimed here.
  projectTasks: {
    select: { project: { select: { id: true, title: true, code: true, roundSeq: true } } },
    orderBy: { projectId: 'asc' },
    take: 1,
  },
});

type TaskKpiRow = Prisma.TaskGetPayload<{ select: typeof TASK_KPI_SELECT }>;

/**
 * One task, seen either through one person's seat on it or as the firm's own row.
 *
 * `userId` null means the second: the task's whole budget against the task's whole cost, which is
 * what a project and its manager are judged on.
 *
 * The per-person allocation is the seat's own hours, because a task with an analyst and a reviewer
 * carries one allocation each and judging the analyst against the pair would mark them over budget
 * for somebody else's review. It falls back to the task's total ONLY when that person is the sole
 * assignee — then the two numbers are the same thing. A shared task with no seat hours is left
 * unallocated rather than guessed at: splitting it evenly would invent a number nobody agreed to,
 * and the module is explicit elsewhere about not scoring what it cannot measure.
 *
 * A seat carrying zero is treated as no allocation. Zero is the DEFAULT the staffing form writes
 * for a reviewer nobody gave hours to, so reading it as a budget of nothing would mark every such
 * reviewer infinitely over.
 */
function toDelivery(t: TaskKpiRow, userId: string | null, spentHours: number | null): Delivery {
  const project = t.projectTasks[0]?.project ?? null;
  const seat = userId ? t.assignees.find(a => a.userId === userId) ?? null : null;
  const seatHours = seat?.estimatedHours ?? null;
  const allocated = userId
    ? (seatHours != null && seatHours > 0 ? seatHours : (t.assignees.length <= 1 ? t.estimatedHours : null))
    : t.estimatedHours;

  return {
    taskId: t.id,
    title: t.title,
    projectId: project?.id ?? null,
    projectName: project?.title ?? null,
    projectCode: project?.code ?? null,
    roundSeq: project?.roundSeq ?? null,
    priority: (t.priority ?? 'MEDIUM').toUpperCase(),
    allocatedHours: allocated,
    spentHours,
    // Their own deadline when they were given one. A personal extension is a decision somebody
    // made — "you have until Friday" — and scoring them against the task's original date marks
    // them late for delivering exactly what was asked of them.
    dueDate: seat?.dueDate ?? t.dueDate,
    completedAt: t.completedAt,
  };
}

/** The window echoed back, so the page can label exactly what it is showing. */
function isoWindow(win: KpiWindow) {
  return {
    from: win.from.toISOString(),
    to: win.to.toISOString(),
    prevFrom: win.prevFrom.toISOString(),
    prevTo: win.prevTo.toISOString(),
  };
}

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * Your own performance is yours; anybody else's needs the organisation code.
   *
   * The code checked here used to be `analytics.view.organization`, which is a DIFFERENT
   * permission held by a DIFFERENT set of roles. The permission matrix has said since 2026-07-28
   * that a Manager keeps their own performance and no longer sees the firm's — and a Manager
   * holds analytics.view.organization, so every Manager could in fact open the whole
   * organisation's performance and drill into any individual's. The gate existed and guarded the
   * wrong door. `performance.view.organization` is the code the matrix actually grants for this,
   * and it is now the code the server enforces, on every route rather than only in the UI.
   */
  async assertCanView(actorId: string | null, targetUserId: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    if (actorId === targetUserId) return;
    const ok = await this.permissions.check(actorId, 'performance.view.organization');
    if (!ok) throw new ForbiddenException('Not allowed to view this user\'s performance.');
  }

  /**
   * 404 when the id does not resolve to a real user. Without this, heatmap/breakdowns
   * echo the attacker-supplied id back inside a synthesized empty payload (a 200), which
   * is inconsistent with getUserPerformance() and lets callers probe id existence.
   */
  private async assertUserExists(userId: string): Promise<void> {
    const u = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!u) throw new NotFoundException(`User ${userId} not found`);
  }

  // ── The two KPIs ───────────────────────────────────────────────────────────────
  //
  // Everything below answers the two questions the module was cut down to: does this person's
  // work cost what it was supposed to cost, and can we rely on them to deliver on the day and on
  // the budget, again and again. The arithmetic is in ./kpi and is tested without a database;
  // these methods only shape rows into `Delivery` and hand them over.
  //
  // The window arrives from the caller as four explicit dates rather than a day count. A day
  // count can only ever describe a window ending TODAY, and a window ending today is exactly the
  // complaint this rework started from: the week on screen was always the half-finished one.

  /**
   * The work one person finished inside a window, with what it was supposed to cost and what it
   * actually cost them.
   *
   * The hours are ALL of the hours booked to the task, not only those inside the window. KPI 1
   * asks what a job cost, and a job started in August and closed in September cost what it cost;
   * clipping its hours at the window boundary would report a two-week task as a two-day one and
   * make every long piece of work look under budget.
   */
  private async deliveriesForUser(userId: string, from: Date, to: Date): Promise<Delivery[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        assignees: { some: { userId } },
        currentStatus: { type: 'CLOSED' },
        completedAt: { gte: from, lt: to },
      },
      select: TASK_KPI_SELECT,
    });
    if (!tasks.length) return [];

    const spent = await this.prisma.timesheet.groupBy({
      by: ['taskId'],
      where: { userId, deletedAt: null, taskId: { in: tasks.map(t => t.id) } },
      _sum: { hoursLogged: true },
    });
    const spentBy = new Map(spent.map(s => [s.taskId ?? '', s._sum.hoursLogged ?? 0]));
    return tasks.map(t => toDelivery(t, userId, spentBy.get(t.id) ?? null));
  }

  /**
   * KPI 1 and KPI 2 for one person, against the window before it.
   *
   * Nothing here counts an open task, an issue, a comment or an analytics event. Ongoing and
   * breaching work already has a home in My Tasks, and repeating it here is what made the two
   * modules impossible to tell apart.
   */
  async getUserKpis(userId: string, win: KpiWindow) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, designation: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const [current, previous, outstanding] = await Promise.all([
      this.deliveriesForUser(userId, win.from, win.to),
      this.deliveriesForUser(userId, win.prevFrom, win.prevTo),
      // Work that was due by the end of the window and is still open — the rest of the pie in
      // "completed out of total". Counted from the task's own date because a seat date cannot be
      // filtered on in SQL without loading every assignment in the firm.
      this.prisma.task.count({
        where: {
          deletedAt: null,
          assignees: { some: { userId } },
          dueDate: { lt: win.to },
          OR: [{ currentWorkflowStatusId: null }, { currentStatus: { type: { not: 'CLOSED' } } }],
        },
      }),
    ]);

    const hoursBreachEvents = current.filter(breachedHours).map(d => ({ entityId: d.taskId }));
    const dateBreachEvents = current.filter(d => deadlineVerdict(d) === 'LATE').map(d => ({ entityId: d.taskId }));
    const prevHours = summariseHours(previous);
    const prevDeadlines = summariseDeadlines(previous);

    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      designation: user.designation ?? undefined,
      window: isoWindow(win),
      tasksCompleted: current.length,
      outstanding,
      hours: summariseHours(current),
      deadlines: summariseDeadlines(current),
      streak: computeStreak(current),
      hoursBreaches: countBreaches(hoursBreachEvents),
      deadlineBreaches: countBreaches(dateBreachEvents),
      byProject: breachesByProject(current),
      previous: {
        tasksCompleted: previous.length,
        withinRate: prevHours.withinRate,
        onTimeRate: prevDeadlines.onTimeRate,
        hoursBreaches: countBreaches(previous.filter(breachedHours).map(d => ({ entityId: d.taskId }))),
        deadlineBreaches: countBreaches(previous.filter(d => deadlineVerdict(d) === 'LATE').map(d => ({ entityId: d.taskId }))),
      },
    };
  }

  /**
   * Everything the org finished in a window, sliced per person AND once per task.
   *
   * Both slices are needed and they are not the same number. A task with three assignees is three
   * people's delivery — each of them is answerable for their own hours against their own seat —
   * but it is ONE task for the firm's total. Summing the per-person figures to get the org's is
   * what makes a headline count drift away from the table under it.
   */
  private async orgDeliveries(organizationId: string, from: Date, to: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        currentStatus: { type: 'CLOSED' },
        completedAt: { gte: from, lt: to },
        assignees: { some: { user: { organizationId } } },
      },
      select: { ...TASK_KPI_SELECT, actualHours: true },
    });
    const ids = tasks.map(t => t.id);
    const spent = ids.length
      ? await this.prisma.timesheet.groupBy({
        by: ['taskId', 'userId'],
        where: { deletedAt: null, taskId: { in: ids } },
        _sum: { hoursLogged: true },
      })
      : [];

    const perSeat = new Map<string, number>();
    const perTask = new Map<string, number>();
    for (const row of spent) {
      const hours = row._sum.hoursLogged ?? 0;
      perSeat.set(`${row.taskId}|${row.userId}`, hours);
      perTask.set(row.taskId ?? '', (perTask.get(row.taskId ?? '') ?? 0) + hours);
    }

    const perUser = new Map<string, Delivery[]>();
    for (const t of tasks) {
      for (const a of t.assignees) {
        const list = perUser.get(a.userId) ?? [];
        list.push(toDelivery(t, a.userId, perSeat.get(`${t.id}|${a.userId}`) ?? null));
        perUser.set(a.userId, list);
      }
    }
    // One row per task, judged on the task's own budget. `actualHours` is the ledger's own sum
    // and the only column with a single writer, so it is preferred; the timesheet total stands in
    // for tasks closed before that column was maintained.
    const distinct = tasks.map(t => toDelivery(t, null, t.actualHours ?? perTask.get(t.id) ?? null));
    return { perUser, distinct };
  }

  /** The same two KPIs for every member of the firm, worst first. */
  async getOrgKpis(organizationId: string, win: KpiWindow) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true, firstName: true, lastName: true, designation: true,
        departmentMemberships: { select: { department: { select: { name: true } } }, take: 1 },
      },
    });
    const [cur, prev, outstanding] = await Promise.all([
      this.orgDeliveries(organizationId, win.from, win.to),
      this.orgDeliveries(organizationId, win.prevFrom, win.prevTo),
      // Work the firm owed by the end of the window and has not closed — the rest of the
      // completed-out-of-total pie. Counted over TASKS, not assignments, so a task with three
      // people on it is one outstanding piece of work rather than three.
      this.prisma.task.count({
        where: {
          deletedAt: null,
          assignees: { some: { user: { organizationId } } },
          dueDate: { lt: win.to },
          OR: [{ currentWorkflowStatusId: null }, { currentStatus: { type: { not: 'CLOSED' } } }],
        },
      }),
    ]);

    const rowFor = (u: typeof users[number]) => {
      const mine = cur.perUser.get(u.id) ?? [];
      const hours = summariseHours(mine);
      const deadlines = summariseDeadlines(mine);
      const breached = mine.filter(d => breachedHours(d) || deadlineVerdict(d) === 'LATE');
      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        designation: u.designation ?? undefined,
        department: u.departmentMemberships[0]?.department?.name ?? undefined,
        tasksCompleted: mine.length,
        hoursBreaches: countBreaches(mine.filter(breachedHours).map(d => ({ entityId: d.taskId }))),
        deadlineBreaches: countBreaches(mine.filter(d => deadlineVerdict(d) === 'LATE').map(d => ({ entityId: d.taskId }))),
        // Requirement 5, as one number: somebody consistently over across ten projects is a
        // different problem from somebody who had one bad matter, and the table has to say which
        // before anyone opens a row.
        projectsBreached: new Set(breached.map(d => d.projectId ?? '')).size,
        overrun: hours.allocatedHours > 0 ? Math.round((hours.spentHours / hours.allocatedHours) * 100) / 100 : null,
        withinRate: hours.withinRate,
        onTimeRate: deadlines.onTimeRate,
        unmeasured: hours.unmeasured,
        allocatedHours: hours.allocatedHours,
        spentHours: hours.spentHours,
        redFlag: hours.redFlag,
        streak: (({ current, longest }) => ({ current, longest }))(computeStreak(mine)),
      };
    };

    const members = users.map(rowFor).sort((a, b) =>
      (b.hoursBreaches.times + b.deadlineBreaches.times) - (a.hoursBreaches.times + a.deadlineBreaches.times) ||
      (b.overrun ?? 0) - (a.overrun ?? 0) ||
      a.name.localeCompare(b.name));

    const hours = summariseHours(cur.distinct);
    const deadlines = summariseDeadlines(cur.distinct);
    const prevHours = summariseHours(prev.distinct);
    const prevDeadlines = summariseDeadlines(prev.distinct);
    return {
      window: isoWindow(win),
      totals: {
        members: users.length,
        tasksCompleted: cur.distinct.length,
        outstanding,
        hours,
        deadlines,
        hoursBreaches: countBreaches(cur.distinct.filter(breachedHours).map(d => ({ entityId: d.taskId }))),
        deadlineBreaches: countBreaches(cur.distinct.filter(d => deadlineVerdict(d) === 'LATE').map(d => ({ entityId: d.taskId }))),
      },
      previous: {
        tasksCompleted: prev.distinct.length,
        withinRate: prevHours.withinRate,
        onTimeRate: prevDeadlines.onTimeRate,
      },
      byProject: breachesByProject(cur.distinct),
      members,
    };
  }

  /**
   * Projects, and the managers who answer for them.
   *
   * Requirement 18 is the deadline ledger: how many times a project's date had to be moved.
   * Requirement 19 is the same over-run arithmetic restricted to the HIGH and CRITICAL work.
   * Requirement 20 says the aggregate of the two IS the project manager's performance, so the
   * managers roll up out of the projects rather than being computed separately — one number
   * cannot disagree with the other if there is only one number.
   *
   * The ledger is young: most projects have no recorded shift, and a project that predates it can
   * never have one. A missing row therefore reports ZERO shifts and renders normally. It must
   * never render as an error or an empty panel, which is what an inner join would have produced.
   */
  async getProjectKpis(organizationId: string, win: KpiWindow) {
    const [tasks, shifts] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          currentStatus: { type: 'CLOSED' },
          completedAt: { gte: win.from, lt: win.to },
          projectTasks: { some: { project: { deletedAt: null, members: { some: { user: { organizationId } } } } } },
        },
        select: { ...TASK_KPI_SELECT, actualHours: true },
      }),
      this.prisma.deadlineChange.groupBy({
        by: ['projectId', 'entityType'],
        where: { organizationId, createdAt: { gte: win.from, lt: win.to }, projectId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const projectShifts = new Map<string, { project: number; task: number }>();
    for (const row of shifts) {
      if (!row.projectId) continue;
      const cur = projectShifts.get(row.projectId) ?? { project: 0, task: 0 };
      if (row.entityType === 'PROJECT') cur.project += row._count._all;
      else cur.task += row._count._all;
      projectShifts.set(row.projectId, cur);
    }

    // `actualHours` is the ledger's own sum and has a single writer, so it is preferred; the
    // timesheet total stands in for tasks closed before that column was maintained. Without the
    // fallback an old task reads as costing nothing, which scores its project as comfortably
    // inside a budget it may well have blown.
    const missingActuals = tasks.filter(t => t.actualHours == null).map(t => t.id);
    const loggedFor = missingActuals.length
      ? new Map((await this.prisma.timesheet.groupBy({
        by: ['taskId'],
        where: { deletedAt: null, taskId: { in: missingActuals } },
        _sum: { hoursLogged: true },
      })).map(r => [r.taskId ?? '', r._sum.hoursLogged ?? 0]))
      : new Map<string, number>();

    const byProject = new Map<string, Delivery[]>();
    for (const t of tasks) {
      const projectId = t.projectTasks[0]?.project?.id;
      if (!projectId) continue;
      const list = byProject.get(projectId) ?? [];
      list.push(toDelivery(t, null, t.actualHours ?? loggedFor.get(t.id) ?? null));
      byProject.set(projectId, list);
    }

    // A project that only SHIFTED still belongs on this panel — a deadline pushed four times with
    // nothing delivered is the clearest signal there is, and keying the panel off completed work
    // alone would hide exactly that project.
    const projectIds = [...new Set([...byProject.keys(), ...projectShifts.keys()])];
    if (!projectIds.length) return { window: isoWindow(win), projects: [], managers: [] };

    const meta = await this.prisma.project.findMany({
      where: { id: { in: projectIds }, deletedAt: null, members: { some: { user: { organizationId } } } },
      select: {
        id: true, title: true, code: true, roundSeq: true,
        members: {
          // 'PM' is the older spelling of the same seat and still exists on projects created
          // before it was renamed; reading only 'MANAGER' silently leaves those unowned.
          where: { projectRole: { in: ['MANAGER', 'PM'] }, isActive: true },
          select: { userId: true },
        },
      },
    });

    const inputs: ProjectInput[] = meta.map(p => ({
      projectId: p.id,
      name: p.title,
      code: p.code,
      roundSeq: p.roundSeq,
      managerIds: p.members.map(m => m.userId),
      projectShifts: projectShifts.get(p.id)?.project ?? 0,
      taskShifts: projectShifts.get(p.id)?.task ?? 0,
      tasks: byProject.get(p.id) ?? [],
    }));

    const projects = inputs.map(summariseProject).sort((a, b) =>
      (b.overrun ?? 0) - (a.overrun ?? 0) ||
      b.deadlineShifts.times - a.deadlineShifts.times ||
      a.name.localeCompare(b.name));

    const managerRows = rollUpManagers(projects);
    const managerUsers = managerRows.length
      ? await this.prisma.user.findMany({
        where: { id: { in: managerRows.map(m => m.userId) } },
        select: { id: true, firstName: true, lastName: true, designation: true },
      })
      : [];
    const nameOf = new Map(managerUsers.map(u => [u.id, { name: `${u.firstName} ${u.lastName}`.trim(), designation: u.designation ?? undefined }]));

    return {
      window: isoWindow(win),
      projects,
      managers: managerRows.map(m => ({ ...m, ...(nameOf.get(m.userId) ?? { name: 'Unknown', designation: undefined }) })),
    };
  }

  async getUserPerformance(userId: string, days = 30) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, designation: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const now = new Date();
    const { from, to, prevFrom, prevTo } = windowRange(days);

    // Point-in-time backlog snapshot (all assigned tasks, current status).
    //
    // Counted in SQL. This used to load every task assigned to the user — id, dueDate, updatedAt
    // and the joined status — purely to call .length and .filter() on the result. The rows were
    // never otherwise used, so the whole backlog crossed the wire to produce three integers.
    //
    // `currentStatus` is an OPTIONAL relation, and a task with no status counts as open. So
    // "not closed" has to be written as the explicit OR below: `currentStatus: { type: { not:
    // 'CLOSED' } }` reads as if it means the same thing, but a relation filter only matches rows
    // where the relation EXISTS, so it silently drops every status-less task. Measured on a
    // fixture: the naive form reported 1 overdue task where the correct answer was 2.
    const assignedToUser = { deletedAt: null, assignees: { some: { userId } } };
    const notClosed = {
      OR: [
        { currentWorkflowStatusId: null },
        { currentStatus: { type: { not: 'CLOSED' } } },
      ],
    };
    const [tasksAssigned, tasksCompletedAll, tasksOverdue] = await Promise.all([
      this.prisma.task.count({ where: assignedToUser }),
      this.prisma.task.count({ where: { ...assignedToUser, currentStatus: { type: 'CLOSED' } } }),
      // dueDate: { lt: now } already excludes rows with no due date.
      this.prisma.task.count({ where: { ...assignedToUser, dueDate: { lt: now }, ...notClosed } }),
    ]);
    const tasksOpen = tasksAssigned - tasksCompletedAll;

    // Windowed throughput (current + previous window) + cycle time
    const [cur, prev, cycleTimeDays] = await Promise.all([
      this.windowMetrics(userId, from, to),
      this.windowMetrics(userId, prevFrom, prevTo),
      this.cycleTime(userId, from, to),
    ]);

    const kpis = {
      tasksAssigned, tasksCompleted: tasksCompletedAll, tasksOpen, tasksOverdue,
      // null, not 0, when nothing with a deadline was closed in the window. pct(0, 0) is 0, and
      // "0% on-time" reads as having missed every deadline when in fact there was none to miss —
      // the same distinction billablePct draws below between a bad score and no score.
      onTimeCompletionRate: cur.withDueCount > 0 ? cur.onTimeRate : null,
      onTimeOf: cur.withDueCount,
      completionRate: pct(tasksCompletedAll, tasksAssigned),
      hoursLogged: cur.hoursLogged,
      billableHours: cur.billableHours,
      // Measured against CLIENT hours, not all hours. Team-space work is non-billable by rule —
      // there is no client to bill — so counting it in the denominator gave everybody in HR and
      // BD a flat 0%, sitting in the same column as a consultant at 85%. That is not a worse
      // performance, it is a different kind of work, and the honest answer is "not applicable".
      billablePct: cur.clientHours > 0 ? pct(cur.billableHours, cur.clientHours) : null,
      clientHours: cur.clientHours,
      issuesReported: cur.issuesReported,
      issuesResolved: cur.issuesResolved,
      commentsPosted: cur.commentsPosted,
      activityVolume: cur.activityVolume,
    };

    const previous = {
      hoursLogged: prev.hoursLogged, billableHours: prev.billableHours, tasksCompleted: prev.tasksCompleted,
      activityVolume: prev.activityVolume, issuesResolved: prev.issuesResolved, commentsPosted: prev.commentsPosted,
      onTimeCompletionRate: prev.withDueCount > 0 ? prev.onTimeRate : null,
    };

    const trend = await this.getTrend(userId, Math.min(days, 30));
    return {
      userId: user.id, name: `${user.firstName} ${user.lastName}`.trim(), designation: user.designation ?? undefined,
      periodDays: days, kpis, previous, cycleTimeDays, periodTasksCompleted: cur.tasksCompleted, trend,
    };
  }

  /** Windowed throughput metrics for [from, to). */
  private async windowMetrics(userId: string, from: Date, to: Date) {
    const [completed, hoursAgg, billableAgg, clientAgg, issuesReported, issuesResolved, commentsPosted, activityVolume] = await Promise.all([
      this.prisma.task.findMany({
        // Windowed on completedAt, not updatedAt: a task closed in January but edited in March
        // used to count as completed in MARCH, inflating the current period and emptying the one
        // where the work actually happened.
        where: { deletedAt: null, assignees: { some: { userId } }, currentStatus: { type: 'CLOSED' }, completedAt: { gte: from, lt: to } },
        // THIS person's seat, for their own deadline — a personal extension is a decision
        // somebody made, and scoring them against the task's original date marks them late for
        // delivering exactly what was asked of them.
        select: { dueDate: true, completedAt: true, assignees: { where: { userId }, select: { dueDate: true } } },
      }),
      // Delivery performance excludes "Other" (non-project) time — admin/meeting/training hours
      // shouldn't inflate a person's delivery hours or score. (billable already excludes it.)
      this.prisma.timesheet.aggregate({ where: { userId, deletedAt: null, ...notOtherTime(), date: { gte: from, lt: to } }, _sum: { hoursLogged: true } }),
      this.prisma.timesheet.aggregate({ where: { userId, deletedAt: null, billable: true, date: { gte: from, lt: to } }, _sum: { hoursLogged: true } }),
      // CLIENT hours — the denominator billable % is honestly measured against. Team-space work
      // is excluded because it can never be billable, so including it would guarantee 0% for
      // anyone in HR or BD however well they worked.
      this.prisma.timesheet.aggregate({
        where: { userId, deletedAt: null, ...notOtherTime(), teamId: null, date: { gte: from, lt: to } },
        _sum: { hoursLogged: true },
      }),
      this.prisma.issue.count({ where: { reportedBy: userId, deletedAt: null, createdAt: { gte: from, lt: to } } }),
      this.prisma.issue.count({ where: { assigneeId: userId, deletedAt: null, status: 'RESOLVED', updatedAt: { gte: from, lt: to } } }),
      this.prisma.comment.count({ where: { userId, createdAt: { gte: from, lt: to } } }),
      this.prisma.analyticsEvent.count({ where: { userId, createdAt: { gte: from, lt: to } } }),
    ]);
    // Their seat's date when they have one, the task's otherwise.
    const dueFor = (t: { dueDate: Date | null; assignees: { dueDate: Date | null }[] }) =>
      t.assignees[0]?.dueDate ?? t.dueDate;
    const withDue = completed.filter(t => dueFor(t) && t.completedAt);
    const onTime = withDue.filter(t => t.completedAt && isOnTime(t.completedAt, dueFor(t)!)).length;
    return {
      tasksCompleted: completed.length,
      onTimeRate: pct(onTime, withDue.length),
      withDueCount: withDue.length,
      hoursLogged: Math.round((hoursAgg._sum.hoursLogged ?? 0) * 10) / 10,
      billableHours: Math.round((billableAgg._sum.hoursLogged ?? 0) * 10) / 10,
      clientHours: Math.round((clientAgg._sum.hoursLogged ?? 0) * 10) / 10,
      issuesReported, issuesResolved, commentsPosted, activityVolume,
    };
  }

  /**
   * Average cycle time (days) from first "In Progress" to "Closed", derived from
   * task.status_changed analytics events the user triggered in the window.
   * Returns null when there isn't enough event history yet.
   */
  private async cycleTime(userId: string, from: Date, to: Date): Promise<number | null> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: { userId, eventType: 'task.status_changed', createdAt: { gte: new Date(from.getTime() - 120 * 86400000), lt: to } },
      select: { entityId: true, createdAt: true, payload: true },
      orderBy: { createdAt: 'asc' },
    });
    const startAt = new Map<string, number>();
    const durations: number[] = [];
    for (const e of events) {
      const p = e.payload as { new?: { status?: string; type?: string } } | null;
      const status = p?.new?.status; const type = p?.new?.type;
      if (status && status.toLowerCase().includes('progress') && !startAt.has(e.entityId)) {
        startAt.set(e.entityId, e.createdAt.getTime());
      } else if (type === 'CLOSED' && startAt.has(e.entityId)) {
        const ms = e.createdAt.getTime() - startAt.get(e.entityId)!;
        if (ms > 0 && e.createdAt >= from) durations.push(ms / 86400000);
        startAt.delete(e.entityId);
      }
    }
    if (!durations.length) return null;
    return Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10;
  }

  /** Last `days` daily points — from UserMetricDaily, falling back to live timesheet/event scans. */
  async getTrend(userId: string, days: number) {
    // Anchored on the IST calendar day. In UTC the window slid a day back between 00:00 and
    // 05:30 IST — the trend dropped today and carried an extra past day instead.
    const since = new Date(`${istDayKey(new Date())}T00:00:00.000Z`);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const snapshots = await this.prisma.userMetricDaily.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    const byDay = new Map(snapshots.map(s => [dayKey(s.date), s]));

    // live fallback aggregates (used where snapshots are absent)
    const [sheets, events] = await Promise.all([
      this.prisma.timesheet.findMany({ where: { userId, deletedAt: null, ...notOtherTime(), date: { gte: since } }, select: { date: true, hoursLogged: true } }),
      this.prisma.analyticsEvent.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true, eventType: true, payload: true } }),
    ]);
    const liveHours = new Map<string, number>();
    sheets.forEach(s => liveHours.set(dayKey(s.date), (liveHours.get(dayKey(s.date)) ?? 0) + s.hoursLogged));
    const liveActivity = new Map<string, number>();
    const liveCompleted = new Map<string, number>();
    events.forEach(e => {
      const k = dayKey(e.createdAt);
      liveActivity.set(k, (liveActivity.get(k) ?? 0) + 1);
      if (e.eventType === 'task.status_changed' && isCompletionEvent(e.payload)) liveCompleted.set(k, (liveCompleted.get(k) ?? 0) + 1);
    });

    const out: { date: string; completed: number; hours: number; activity: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since); d.setUTCDate(since.getUTCDate() + i);
      const k = dayKey(d);
      const snap = byDay.get(k);
      out.push({
        date: k,
        completed: snap?.tasksCompleted ?? liveCompleted.get(k) ?? 0,
        hours: Math.round(((snap?.hoursLogged ?? liveHours.get(k) ?? 0)) * 10) / 10,
        activity: snap?.activityVolume ?? liveActivity.get(k) ?? 0,
      });
    }
    return out;
  }

  async getHeatmap(userId: string, days: number) {
    await this.assertUserExists(userId);
    const since = utcDay(new Date());
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const snaps = await this.prisma.userMetricDaily.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, activityVolume: true },
    });
    const snapDays = new Set(snaps.map(s => dayKey(s.date)));
    const map = new Map(snaps.map(s => [dayKey(s.date), s.activityVolume]));
    // Live fallback so the heatmap isn't empty before a rebuild: for days WITHOUT a
    // snapshot, ACCUMULATE the day's events. (Previously `if (!map.has(k))` set each
    // day exactly once, capping every active day at 1 → all rendered lowest-intensity.)
    const events = await this.prisma.analyticsEvent.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } });
    const live = new Map<string, number>();
    events.forEach(e => { const k = dayKey(e.createdAt); if (!snapDays.has(k)) live.set(k, (live.get(k) ?? 0) + 1); });
    for (const [k, v] of live) map.set(k, v);

    const level = (v: number) => (v === 0 ? 0 : v <= 2 ? 1 : v <= 5 ? 2 : v <= 9 ? 3 : 4);
    const out: { date: string; value: number; level: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since); d.setUTCDate(since.getUTCDate() + i);
      const k = dayKey(d);
      const v = map.get(k) ?? 0;
      out.push({ date: k, value: v, level: level(v) });
    }
    return { userId, days: out };
  }

  /**
   * M22: keep snapshots current without a scheduler. If today's snapshot is missing,
   * kick off a background rebuild of the recent window (guarded so it runs at most
   * once at a time per org). Fire-and-forget — never blocks the dashboard response.
   */
  private maybeAutoRefresh(organizationId: string): void {
    if (autoRebuildInFlight.has(organizationId)) return;
    autoRebuildInFlight.add(organizationId);
    (async () => {
      try {
        const today = utcDay(new Date());
        const fresh = await this.prisma.userMetricDaily.findFirst({ where: { organizationId, date: today }, select: { id: true } });
        if (!fresh) await this.rebuildSnapshots(organizationId, 7);
      } catch { /* best-effort; the live fallback covers gaps */ }
      finally { autoRebuildInFlight.delete(organizationId); }
    })();
  }

  /**
   * Per-user window metrics for the whole org computed with a handful of grouped
   * aggregates (not one windowMetrics() call per user). Returns a userId→metrics map.
   */
  private async orgWindowMetrics(organizationId: string, from: Date, to: Date) {
    const [completedTasks, hoursByUser, resolvedByUser, activityByUser] = await Promise.all([
      this.prisma.task.findMany({
        // Windowed and judged on completedAt, exactly as the per-user query is — the two must
        // agree or the leaderboard contradicts the individual pages it is built from.
        where: { deletedAt: null, currentStatus: { type: 'CLOSED' }, completedAt: { gte: from, lt: to }, assignees: { some: { user: { organizationId } } } },
        select: { dueDate: true, completedAt: true, assignees: { select: { userId: true, dueDate: true } } },
      }),
      this.prisma.timesheet.groupBy({ by: ['userId'], where: { deletedAt: null, ...notOtherTime(), date: { gte: from, lt: to }, user: { organizationId } }, _sum: { hoursLogged: true } }),
      this.prisma.issue.groupBy({ by: ['assigneeId'], where: { deletedAt: null, status: 'RESOLVED', updatedAt: { gte: from, lt: to }, assignee: { organizationId } }, _count: { _all: true } }),
      this.prisma.analyticsEvent.groupBy({ by: ['userId'], where: { organizationId, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
    ]);

    type Acc = { tasksCompleted: number; withDueCount: number; onTime: number; hoursLogged: number; issuesResolved: number; activityVolume: number };
    const acc = new Map<string, Acc>();
    const at = (id: string) => { let x = acc.get(id); if (!x) { x = { tasksCompleted: 0, withDueCount: 0, onTime: 0, hoursLogged: 0, issuesResolved: 0, activityVolume: 0 }; acc.set(id, x); } return x; };

    // Per-task DISTINCT aggregates for the org totals — a task with N assignees is counted
    // ONCE here (summing the per-user figures would inflate it N×). The per-user map below
    // still credits every assignee, which is correct for the leaderboard.
    let distinctCompleted = 0, distinctWithDue = 0, distinctOnTime = 0;
    for (const t of completedTasks) {
      distinctCompleted++;
      if (t.dueDate && t.completedAt) { distinctWithDue++; if (isOnTime(t.completedAt, t.dueDate)) distinctOnTime++; }
      for (const a of t.assignees) {
        const x = at(a.userId);
        x.tasksCompleted++;
        // Judged against THEIR OWN deadline when they were given one. A personal extension is a
        // decision somebody made — "you have until Friday" — and scoring them against the task's
        // original date anyway marks them late for delivering exactly what was asked of them.
        // The DISTINCT org figures above keep using the task's date: that is one number about
        // one task, and it has no single person to belong to.
        const personDue = a.dueDate ?? t.dueDate;
        if (personDue && t.completedAt) { x.withDueCount++; if (isOnTime(t.completedAt, personDue)) x.onTime++; }
      }
    }
    for (const h of hoursByUser) at(h.userId).hoursLogged = Math.round((h._sum.hoursLogged ?? 0) * 10) / 10;
    for (const r of resolvedByUser) if (r.assigneeId) at(r.assigneeId).issuesResolved = r._count._all;
    for (const a of activityByUser) at(a.userId).activityVolume = a._count._all;

    const perUser = new Map<string, { tasksCompleted: number; withDueCount: number; onTimeRate: number; hoursLogged: number; issuesResolved: number; activityVolume: number }>();
    for (const [id, x] of acc) {
      perUser.set(id, { tasksCompleted: x.tasksCompleted, withDueCount: x.withDueCount, onTimeRate: pct(x.onTime, x.withDueCount), hoursLogged: x.hoursLogged, issuesResolved: x.issuesResolved, activityVolume: x.activityVolume });
    }
    return { perUser, distinct: { tasksCompleted: distinctCompleted, withDueCount: distinctWithDue, onTime: distinctOnTime } };
  }

  async getOrgPerformance(organizationId: string, days = 30) {
    this.maybeAutoRefresh(organizationId); // M22: refresh stale snapshots in the background
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true, firstName: true, lastName: true, designation: true,
        departmentMemberships: { select: { department: { select: { name: true } } }, take: 1 },
      },
    });
    const { from, to, prevFrom, prevTo } = windowRange(days);
    /**
     * The ranking score: WHAT SOMEBODY DELIVERED, and how reliably.
     *
     * It used to be `tasks*4 + onTime*0.5 + hours + issues*3 + activity*0.5`, which on the real
     * roster meant hours dominated everything. Somebody with 120 logged hours scored 120 points;
     * completing a task was worth 4. One person ranked SECOND in the firm having completed
     * nothing at all, on logged hours alone. Activity volume counted analytics events, so eight
     * clicks around the app scored the same as finishing a piece of work.
     *
     * Hours and activity measure INPUT — how long someone was present and how much they clicked.
     * Neither belongs in a ranking. Both are still reported as figures, because they are useful
     * to look at; they are simply not what the ordering is built from.
     *
     * On-time is a MULTIPLIER rather than an addition, so reliability modulates delivery instead
     * of being fifty free points. Ten tasks at 80% on time beats one task delivered perfectly,
     * which is the right way round and was not true before.
     */
    const scoreOf = (m: { tasksCompleted: number; onTimeRate: number; withDueCount: number; issuesResolved: number }) => {
      const output = m.tasksCompleted * 10 + m.issuesResolved * 5;
      // No task carried a due date, so there was nothing to be late for. Treat that as neutral —
      // scoring it as 0% on-time would penalise people for deadlines nobody ever set.
      const reliability = m.withDueCount > 0 ? 0.5 + m.onTimeRate / 200 : 1;
      return Math.round(output * reliability);
    };

    // Set-based: two window aggregations (~8 queries total) instead of the old
    // per-user fan-out (14N+2 ≈ 394 round-trips for 28 users).
    const [curM, prevM] = await Promise.all([
      this.orgWindowMetrics(organizationId, from, to),
      this.orgWindowMetrics(organizationId, prevFrom, prevTo),
    ]);
    const zeroM = { tasksCompleted: 0, withDueCount: 0, onTimeRate: 0, hoursLogged: 0, issuesResolved: 0, activityVolume: 0 };
    const rows = users.map(u => {
      const cur = curM.perUser.get(u.id) ?? zeroM;
      const prev = prevM.perUser.get(u.id) ?? zeroM;
      return {
        userId: u.id, name: `${u.firstName} ${u.lastName}`.trim(), designation: u.designation ?? undefined,
        department: u.departmentMemberships[0]?.department?.name ?? undefined,
        tasksCompleted: cur.tasksCompleted, hoursLogged: cur.hoursLogged, onTimeRate: cur.onTimeRate, activityVolume: cur.activityVolume,
        withDueCount: cur.withDueCount,
        score: scoreOf(cur), prevScore: scoreOf(prev), prevHours: prev.hoursLogged, prevCompleted: prev.tasksCompleted,
      };
    });
    rows.sort((a, b) => b.score - a.score);

    const sum = (f: (r: typeof rows[number]) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 10) / 10;
    // A true org-wide ratio (Σ on-time ÷ Σ with-a-due-date, over DISTINCT tasks), not an
    // unweighted mean of per-person rates. tasksCompleted is likewise the distinct count so a
    // multi-assignee task isn't counted once per assignee in the headline total.
    // null, not 0, when nothing with a deadline closed org-wide in the window — the same
    // distinction the personal view draws. A team that closed no dated work has no on-time
    // score; showing 0% says they missed every deadline they had.
    const avgOnTimeRate = curM.distinct.withDueCount > 0
      ? pct(curM.distinct.onTime, curM.distinct.withDueCount)
      : null;
    const activeProjects = await this.prisma.project.count({ where: { deletedAt: null, projectPhase: 'ACTIVE', members: { some: { user: { organizationId } } } } });

    return {
      periodDays: days,
      totals: {
        users: users.length, tasksCompleted: curM.distinct.tasksCompleted, hoursLogged: sum(r => r.hoursLogged),
        activeProjects, avgOnTimeRate,
      },
      previousTotals: {
        tasksCompleted: prevM.distinct.tasksCompleted,
        hoursLogged: Math.round(rows.reduce((s, r) => s + r.prevHours, 0) * 10) / 10,
      },
      leaderboard: rows.map(({ prevScore, prevHours, prevCompleted, withDueCount, ...r }) => r),
    };
  }

  /** Org-wide daily contribution heatmap — summed activity across all members. */
  async getOrgHeatmap(organizationId: string, days: number) {
    const since = utcDay(new Date());
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const snaps = await this.prisma.userMetricDaily.findMany({
      where: { organizationId, date: { gte: since } },
      select: { date: true, activityVolume: true },
    });
    const map = new Map<string, number>();
    snaps.forEach(s => { const k = dayKey(s.date); map.set(k, (map.get(k) ?? 0) + s.activityVolume); });
    // live fallback from events when snapshots are sparse
    const events = await this.prisma.analyticsEvent.findMany({ where: { organizationId, createdAt: { gte: since } }, select: { createdAt: true } });
    if (!snaps.length) events.forEach(e => { const k = dayKey(e.createdAt); map.set(k, (map.get(k) ?? 0) + 1); });

    const max = Math.max(1, ...[...map.values()]);
    const level = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
    const out: { date: string; value: number; level: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since); d.setUTCDate(since.getUTCDate() + i);
      const k = dayKey(d); const v = map.get(k) ?? 0;
      out.push({ date: k, value: v, level: level(v) });
    }
    return { organizationId, days: out };
  }

  /** Recompute UserMetricDaily for the org over the last `days` days. */
  async rebuildSnapshots(organizationId: string, days = 365) {
    const users = await this.prisma.user.findMany({ where: { organizationId, deletedAt: null }, select: { id: true } });
    const since = utcDay(new Date());
    since.setUTCDate(since.getUTCDate() - (days - 1));

    let written = 0;
    for (const u of users) {
      const userId = u.id;
      const [sheets, events, comments] = await Promise.all([
        this.prisma.timesheet.findMany({ where: { userId, deletedAt: null, ...notOtherTime(), date: { gte: since } }, select: { date: true, hoursLogged: true, billable: true } }),
        this.prisma.analyticsEvent.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true, eventType: true, payload: true } }),
        this.prisma.comment.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
      ]);

      type Agg = { hours: number; billable: number; activity: number; completed: number; comments: number; resolved: number };
      const byDay = new Map<string, Agg>();
      const get = (k: string) => { let a = byDay.get(k); if (!a) { a = { hours: 0, billable: 0, activity: 0, completed: 0, comments: 0, resolved: 0 }; byDay.set(k, a); } return a; };
      sheets.forEach(s => { const a = get(dayKey(s.date)); a.hours += s.hoursLogged; if (s.billable) a.billable += s.hoursLogged; a.activity += 1; });
      comments.forEach(c => { const a = get(dayKey(c.createdAt)); a.comments += 1; a.activity += 1; });
      events.forEach(e => {
        const a = get(dayKey(e.createdAt)); a.activity += 1;
        if (e.eventType === 'task.status_changed' && isCompletionEvent(e.payload)) a.completed += 1;
        if (e.eventType === 'issue.resolved') a.resolved += 1;
      });

      // Batch the day-rows: one deleteMany + one createMany per user replaces up to
      // `days` sequential upserts (365×N ≈ 10k round-trips → 2 per user), so the
      // Rebuild button no longer hangs multi-second holding a pool connection.
      const rows = [];
      for (const [k, a] of byDay) {
        if (a.hours === 0 && a.activity === 0) continue;
        rows.push({
          userId, organizationId, date: new Date(`${k}T00:00:00.000Z`),
          hoursLogged: a.hours, billableHours: a.billable, activityVolume: a.activity,
          tasksCompleted: a.completed, commentsPosted: a.comments, issuesResolved: a.resolved, present: true,
        });
      }
      if (rows.length) {
        await this.prisma.$transaction([
          this.prisma.userMetricDaily.deleteMany({ where: { userId, date: { in: rows.map(r => r.date) } } }),
          this.prisma.userMetricDaily.createMany({ data: rows, skipDuplicates: true }),
        ]);
        written += rows.length;
      }
    }
    return { ok: true, days: written };
  }

  // ── Breakdowns & comparison data for the rich dashboard ───────────────────────

  /** Distribution + comparison breakdowns for one user: status/priority/severity mix, hours-by-project, est-vs-actual. */
  async getUserBreakdowns(userId: string, days = 30) {
    await this.assertUserExists(userId);
    const { from, to } = windowRange(days);
    const [tasks, issues, sheets, openTasks] = await Promise.all([
      this.prisma.task.findMany({
        where: { deletedAt: null, assignees: { some: { userId } } },
        select: { priority: true, currentStatus: { select: { name: true, type: true } } },
      }),
      this.prisma.issue.groupBy({
        by: ['severity'],
        where: { deletedAt: null, OR: [{ assigneeId: userId }, { reportedBy: userId }] },
        _count: { _all: true },
      }),
      this.prisma.timesheet.findMany({
        where: { userId, deletedAt: null, date: { gte: from, lt: to } },
        select: {
          hoursLogged: true, billable: true,
          // Attribute by the timesheet's OWN project — that is the project the person logged
          // against. Going through the task's first project link was arbitrary: a task can belong
          // to more than one project, and `take: 1` has no ordering, so a shared task could have
          // credited the wrong round. The task link stays only as a fallback for entries that
          // predate projectId being recorded.
          project: { select: { id: true, code: true, roundSeq: true, title: true } },
          task: {
            select: {
              projectTasks: { select: { project: { select: { id: true, code: true, roundSeq: true, title: true } } }, take: 1 },
              // Team-space work counts toward a person's hours like anything else, but it has no
              // project to group under — so without this it silently vanished from the "where did
              // your time go" breakdown, making the numbers not add up to the total.
              teamTasks: { select: { team: { select: { id: true, name: true } } }, take: 1 },
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: { deletedAt: null, assignees: { some: { userId } }, currentStatus: { type: 'OPEN' }, estimatedHours: { not: null } },
        select: { id: true, title: true, estimatedHours: true, timesheets: { where: { deletedAt: null }, select: { hoursLogged: true } } },
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
    ]);

    const statusMap = new Map<string, number>();
    const prioMap = new Map<string, number>();
    for (const t of tasks) {
      const s = t.currentStatus?.name ?? (t.currentStatus?.type === 'CLOSED' ? 'Closed' : 'Open');
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
      prioMap.set(t.priority, (prioMap.get(t.priority) ?? 0) + 1);
    }

    const projMap = new Map<string, { name: string; pid: string | null; roundSeq: number | null; hours: number; billable: number }>();
    for (const s of sheets) {
      const team = s.task?.teamTasks?.[0]?.team;
      // A team space stands in for a project in this breakdown: same shape, no PID, so the
      // person's hours still sum to their total instead of quietly losing the internal ones.
      const proj = s.project ?? s.task?.projectTasks?.[0]?.project
        ?? (team ? { id: team.id, title: team.name, code: null, roundSeq: null } : null);
      if (!proj) continue;
      const cur = projMap.get(proj.id)
        ?? { name: proj.title, pid: proj.code ?? null, roundSeq: proj.roundSeq ?? null, hours: 0, billable: 0 };
      cur.hours += s.hoursLogged;
      if (s.billable) cur.billable += s.hoursLogged;
      projMap.set(proj.id, cur);
    }

    const PRIO = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const SEV = ['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'];
    const sevMap = new Map(issues.map(i => [i.severity, i._count._all]));

    return {
      userId,
      tasksByStatus: [...statusMap].map(([name, value]) => ({ name, value })),
      tasksByPriority: PRIO.filter(p => prioMap.has(p)).map(p => ({ name: p, value: prioMap.get(p)! })),
      issuesBySeverity: SEV.filter(s => sevMap.has(s)).map(s => ({ name: s, value: sevMap.get(s)! })),
      // pid + roundSeq travel with the name: two rounds of one PID would otherwise be told apart
      // only by their titles.
      hoursByProject: [...projMap].map(([projectId, v]) => ({
        projectId, name: v.name, pid: v.pid, roundSeq: v.roundSeq,
        hours: r1(v.hours), billable: r1(v.billable),
      })).sort((a, b) => b.hours - a.hours),
      estimatedVsActual: openTasks.map(t => ({
        taskId: t.id, name: t.title, target: r1(t.estimatedHours ?? 0),
        actual: r1(t.timesheets.reduce((s, x) => s + x.hoursLogged, 0)),
      })),
    };
  }

  /** Org-wide distributions + comparisons (set-based, no per-user loop). */
  async getOrgBreakdowns(organizationId: string, days = 30) {
    const { from, to } = windowRange(days);
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, designation: true, departmentMemberships: { select: { department: { select: { name: true } } }, take: 1 } },
    });
    const userIds = users.map(u => u.id);
    const deptOf = new Map<string, string>();
    const desigOf = new Map<string, string>();
    for (const u of users) {
      deptOf.set(u.id, u.departmentMemberships[0]?.department?.name ?? 'Unassigned');
      desigOf.set(u.id, u.designation ?? 'Other');
    }

    const [hoursByUser, tasksByStatus, allStatuses, issues, projects] = await Promise.all([
      this.prisma.timesheet.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, deletedAt: null, ...notOtherTime(), date: { gte: from, lt: to } },
        _sum: { hoursLogged: true },
      }),
      // Tallied in SQL. This previously fetched one row per task in the whole organisation, with
      // the status joined on, only to increment a counter per row and discard the rows.
      this.prisma.task.groupBy({
        by: ['currentWorkflowStatusId'],
        where: { deletedAt: null, assignees: { some: { userId: { in: userIds } } } },
        _count: { _all: true },
      }),
      // Statuses are a handful of rows in total, so fetching them all here keeps this to a single
      // round trip rather than a follow-up query once the group keys are known.
      this.prisma.workflowStatus.findMany({ select: { id: true, name: true, type: true } }),
      this.prisma.issue.groupBy({
        by: ['severity'],
        where: { deletedAt: null, project: { members: { some: { user: { organizationId } } } } },
        _count: { _all: true },
      }),
      this.prisma.project.findMany({
        where: { deletedAt: null, members: { some: { user: { organizationId } } } },
        select: { id: true, title: true, completionPercentage: true, projectPhase: true },
        orderBy: { completionPercentage: 'desc' },
      }),
    ]);

    const byDesignation = new Map<string, number>();
    const byDepartment = new Map<string, number>();
    for (const h of hoursByUser) {
      const hrs = h._sum.hoursLogged ?? 0;
      const dz = desigOf.get(h.userId) ?? 'Other';
      const dp = deptOf.get(h.userId) ?? 'Unassigned';
      byDesignation.set(dz, (byDesignation.get(dz) ?? 0) + hrs);
      byDepartment.set(dp, (byDepartment.get(dp) ?? 0) + hrs);
    }

    // A task with no status has no name to show, and is treated as open — matching how the
    // per-user backlog counts it.
    const statusById = new Map(allStatuses.map(st => [st.id, st]));
    const statusMap = new Map<string, number>();
    for (const row of tasksByStatus) {
      const st = row.currentWorkflowStatusId ? statusById.get(row.currentWorkflowStatusId) : undefined;
      const s = st?.name ?? (st?.type === 'CLOSED' ? 'Closed' : 'Open');
      statusMap.set(s, (statusMap.get(s) ?? 0) + row._count._all);
    }

    const SEV = ['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'];
    const sevMap = new Map(issues.map(i => [i.severity, i._count._all]));

    // capacity vs logged per department.
    // Availability-fair denominator: target = Σ_member (businessDays − company holidays −
    // that member's approved leave) × 8h. Excluding holidays/leave means people on approved
    // time off no longer drag utilization down. (ATTENDANCE_BILLABLE_PLAN.md, B2.)
    // Snap the window to UTC-day boundaries so the weekday set lines up with the
    // midnight-stamped holiday/leave rows (avoids a boundary-day mismatch).
    // Office hours 9am–6pm IST minus a 1h lunch = 8 working hours/day over 5 weekdays (Mon–Fri).
    // Weekends are already excluded by businessDays(); holidays + approved leave are subtracted.
    const DAILY_HOURS = 8; // 9am–6pm IST minus 1h lunch
    const fromDay = utcDay(from);
    const toDay = utcDay(to);
    const weekdaySet = new Set<string>();
    for (const d = new Date(fromDay); d < toDay; d.setUTCDate(d.getUTCDate() + 1)) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) weekdaySet.add(dayKey(d));
    }
    const bdays = businessDays(fromDay, toDay);

    const [holidays, approvedLeaves] = await Promise.all([
      this.prisma.holiday.findMany({
        where: { organizationId, date: { gte: fromDay, lt: toDay } },
        select: { date: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: { userId: { in: userIds }, status: 'APPROVED', startDate: { lt: toDay }, endDate: { gte: fromDay } },
        select: { userId: true, startDate: true, endDate: true },
      }),
    ]);

    // Company holidays falling on a weekday in the window — subtracted from everyone.
    const holidayWeekdays = new Set<string>();
    for (const h of holidays) {
      const k = dayKey(h.date);
      if (weekdaySet.has(k)) holidayWeekdays.add(k);
    }
    const holidayCount = holidayWeekdays.size;

    // Distinct approved-leave weekdays per user (clamped to the window, excluding weekends + holidays).
    const leaveDaysByUser = new Map<string, Set<string>>();
    for (const lv of approvedLeaves) {
      const set = leaveDaysByUser.get(lv.userId) ?? new Set<string>();
      const lvEnd = utcDay(lv.endDate);
      const startMs = Math.max(utcDay(lv.startDate).getTime(), fromDay.getTime());
      for (const d = new Date(startMs); d <= lvEnd && d < toDay; d.setUTCDate(d.getUTCDate() + 1)) {
        const k = dayKey(d);
        if (weekdaySet.has(k) && !holidayWeekdays.has(k)) set.add(k);
      }
      leaveDaysByUser.set(lv.userId, set);
    }

    // Available hours per department across ALL members (incl. departments with no logged time).
    const availableHoursByDept = new Map<string, number>();
    for (const uid of userIds) {
      const dp = deptOf.get(uid) ?? 'Unassigned';
      const availableDays = Math.max(0, bdays - holidayCount - (leaveDaysByUser.get(uid)?.size ?? 0));
      availableHoursByDept.set(dp, (availableHoursByDept.get(dp) ?? 0) + availableDays * DAILY_HOURS);
    }
    const capacityVsLogged = [...availableHoursByDept.keys()].map(name => ({
      name,
      actual: r1(byDepartment.get(name) ?? 0),
      target: r1(availableHoursByDept.get(name) ?? 0),
    })).sort((a, b) => b.target - a.target);

    return {
      hoursByDesignation: [...byDesignation].map(([name, value]) => ({ name, value: r1(value) })).sort((a, b) => b.value - a.value),
      hoursByDepartment: [...byDepartment].map(([name, value]) => ({ name, value: r1(value) })).sort((a, b) => b.value - a.value),
      tasksByStatus: [...statusMap].map(([name, value]) => ({ name, value })),
      issuesBySeverity: SEV.filter(s => sevMap.has(s)).map(s => ({ name: s, value: sevMap.get(s)! })),
      projectProgress: projects.map(p => ({ projectId: p.id, name: p.title, completionPercentage: p.completionPercentage, phase: p.projectPhase })),
      capacityVsLogged,
    };
  }

  /** Org-wide daily trend — totals + per-department hours (wide rows for stacked area). */
  async getOrgTrend(organizationId: string, days = 30) {
    const since = utcDay(new Date());
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, departmentMemberships: { select: { department: { select: { name: true } } }, take: 1 } },
    });
    const userIds = users.map(u => u.id);
    const deptOf = new Map<string, string>();
    users.forEach(u => deptOf.set(u.id, u.departmentMemberships[0]?.department?.name ?? 'Unassigned'));
    const departments = [...new Set(deptOf.values())].sort();

    type Tot = { hours: number; billableHours: number; completed: number; activity: number };
    const totByDay = new Map<string, Tot>();
    const deptByDay = new Map<string, Map<string, number>>();
    const tot = (k: string) => { let a = totByDay.get(k); if (!a) { a = { hours: 0, billableHours: 0, completed: 0, activity: 0 }; totByDay.set(k, a); } return a; };
    const addDept = (k: string, dp: string, hrs: number) => { let m = deptByDay.get(k); if (!m) { m = new Map(); deptByDay.set(k, m); } m.set(dp, (m.get(dp) ?? 0) + hrs); };

    const snaps = await this.prisma.userMetricDaily.findMany({
      where: { organizationId, date: { gte: since } },
      select: { userId: true, date: true, hoursLogged: true, billableHours: true, activityVolume: true, tasksCompleted: true },
    });

    if (snaps.length) {
      for (const s of snaps) {
        const k = dayKey(s.date);
        const t = tot(k);
        t.hours += s.hoursLogged; t.billableHours += s.billableHours; t.completed += s.tasksCompleted; t.activity += s.activityVolume;
        addDept(k, deptOf.get(s.userId) ?? 'Unassigned', s.hoursLogged);
      }
    } else {
      // live fallback when snapshots aren't built yet
      const [sheets, events] = await Promise.all([
        this.prisma.timesheet.findMany({ where: { userId: { in: userIds }, deletedAt: null, ...notOtherTime(), date: { gte: since } }, select: { userId: true, date: true, hoursLogged: true, billable: true } }),
        this.prisma.analyticsEvent.findMany({ where: { organizationId, createdAt: { gte: since } }, select: { createdAt: true, eventType: true, payload: true } }),
      ]);
      for (const s of sheets) {
        const k = dayKey(s.date);
        const t = tot(k);
        t.hours += s.hoursLogged; if (s.billable) t.billableHours += s.hoursLogged;
        addDept(k, deptOf.get(s.userId) ?? 'Unassigned', s.hoursLogged);
      }
      for (const e of events) {
        const t = tot(dayKey(e.createdAt));
        t.activity += 1;
        if (e.eventType === 'task.status_changed' && isCompletionEvent(e.payload)) t.completed += 1;
      }
    }

    const totals: { date: string; hours: number; billableHours: number; completed: number; activity: number }[] = [];
    const byDepartment: Record<string, number | string>[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since); d.setUTCDate(since.getUTCDate() + i);
      const k = dayKey(d);
      const t = totByDay.get(k);
      totals.push({ date: k, hours: r1(t?.hours ?? 0), billableHours: r1(t?.billableHours ?? 0), completed: t?.completed ?? 0, activity: t?.activity ?? 0 });
      const dm = deptByDay.get(k);
      const row: Record<string, number | string> = { date: k };
      for (const dep of departments) row[dep] = r1(dm?.get(dep) ?? 0);
      byDepartment.push(row);
    }
    return { totals, byDepartment, departments };
  }
}
