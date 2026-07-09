import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
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

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  /** Self-or-admin guard for viewing another user's performance. */
  async assertCanView(actorId: string | null, targetUserId: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    if (actorId === targetUserId) return;
    const ok = await this.permissions.check(actorId, 'analytics.view.organization');
    if (!ok) throw new ForbiddenException('Not allowed to view this user\'s performance.');
  }

  async getUserPerformance(userId: string, days = 30) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, designation: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const now = new Date();
    const { from, to, prevFrom, prevTo } = windowRange(days);

    // Point-in-time backlog snapshot (all assigned tasks, current status)
    const tasks = await this.prisma.task.findMany({
      where: { deletedAt: null, assignees: { some: { userId } } },
      select: { id: true, dueDate: true, updatedAt: true, currentStatus: { select: { type: true } } },
    });
    const tasksAssigned = tasks.length;
    const completedTasks = tasks.filter(t => t.currentStatus?.type === 'CLOSED');
    const tasksCompletedAll = completedTasks.length;
    const tasksOpen = tasksAssigned - tasksCompletedAll;
    const tasksOverdue = tasks.filter(t => t.currentStatus?.type !== 'CLOSED' && t.dueDate && t.dueDate < now).length;

    // Windowed throughput (current + previous window) + cycle time
    const [cur, prev, cycleTimeDays] = await Promise.all([
      this.windowMetrics(userId, from, to),
      this.windowMetrics(userId, prevFrom, prevTo),
      this.cycleTime(userId, from, to),
    ]);

    const kpis = {
      tasksAssigned, tasksCompleted: tasksCompletedAll, tasksOpen, tasksOverdue,
      onTimeCompletionRate: cur.onTimeRate,
      completionRate: pct(tasksCompletedAll, tasksAssigned),
      hoursLogged: cur.hoursLogged,
      billableHours: cur.billableHours,
      billablePct: pct(cur.billableHours, cur.hoursLogged),
      issuesReported: cur.issuesReported,
      issuesResolved: cur.issuesResolved,
      commentsPosted: cur.commentsPosted,
      activityVolume: cur.activityVolume,
    };

    const previous = {
      hoursLogged: prev.hoursLogged, billableHours: prev.billableHours, tasksCompleted: prev.tasksCompleted,
      activityVolume: prev.activityVolume, issuesResolved: prev.issuesResolved, commentsPosted: prev.commentsPosted,
      onTimeCompletionRate: prev.onTimeRate,
    };

    const trend = await this.getTrend(userId, Math.min(days, 30));
    return {
      userId: user.id, name: `${user.firstName} ${user.lastName}`.trim(), designation: user.designation ?? undefined,
      periodDays: days, kpis, previous, cycleTimeDays, periodTasksCompleted: cur.tasksCompleted, trend,
    };
  }

  /** Windowed throughput metrics for [from, to). */
  private async windowMetrics(userId: string, from: Date, to: Date) {
    const [completed, hoursAgg, billableAgg, issuesReported, issuesResolved, commentsPosted, activityVolume] = await Promise.all([
      this.prisma.task.findMany({
        where: { deletedAt: null, assignees: { some: { userId } }, currentStatus: { type: 'CLOSED' }, updatedAt: { gte: from, lt: to } },
        select: { dueDate: true, updatedAt: true },
      }),
      this.prisma.timesheet.aggregate({ where: { userId, deletedAt: null, date: { gte: from, lt: to } }, _sum: { hoursLogged: true } }),
      this.prisma.timesheet.aggregate({ where: { userId, deletedAt: null, billable: true, date: { gte: from, lt: to } }, _sum: { hoursLogged: true } }),
      this.prisma.issue.count({ where: { reportedBy: userId, deletedAt: null, createdAt: { gte: from, lt: to } } }),
      this.prisma.issue.count({ where: { assigneeId: userId, deletedAt: null, status: 'RESOLVED', updatedAt: { gte: from, lt: to } } }),
      this.prisma.comment.count({ where: { userId, createdAt: { gte: from, lt: to } } }),
      this.prisma.analyticsEvent.count({ where: { userId, createdAt: { gte: from, lt: to } } }),
    ]);
    const withDue = completed.filter(t => t.dueDate);
    const onTime = withDue.filter(t => t.dueDate && t.updatedAt <= t.dueDate).length;
    return {
      tasksCompleted: completed.length,
      onTimeRate: pct(onTime, withDue.length),
      withDueCount: withDue.length,
      hoursLogged: Math.round((hoursAgg._sum.hoursLogged ?? 0) * 10) / 10,
      billableHours: Math.round((billableAgg._sum.hoursLogged ?? 0) * 10) / 10,
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
    const since = utcDay(new Date());
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const snapshots = await this.prisma.userMetricDaily.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    const byDay = new Map(snapshots.map(s => [dayKey(s.date), s]));

    // live fallback aggregates (used where snapshots are absent)
    const [sheets, events] = await Promise.all([
      this.prisma.timesheet.findMany({ where: { userId, deletedAt: null, date: { gte: since } }, select: { date: true, hoursLogged: true } }),
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
        where: { deletedAt: null, currentStatus: { type: 'CLOSED' }, updatedAt: { gte: from, lt: to }, assignees: { some: { user: { organizationId } } } },
        select: { dueDate: true, updatedAt: true, assignees: { select: { userId: true } } },
      }),
      this.prisma.timesheet.groupBy({ by: ['userId'], where: { deletedAt: null, date: { gte: from, lt: to }, user: { organizationId } }, _sum: { hoursLogged: true } }),
      this.prisma.issue.groupBy({ by: ['assigneeId'], where: { deletedAt: null, status: 'RESOLVED', updatedAt: { gte: from, lt: to }, assignee: { organizationId } }, _count: { _all: true } }),
      this.prisma.analyticsEvent.groupBy({ by: ['userId'], where: { organizationId, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
    ]);

    type Acc = { tasksCompleted: number; withDueCount: number; onTime: number; hoursLogged: number; issuesResolved: number; activityVolume: number };
    const acc = new Map<string, Acc>();
    const at = (id: string) => { let x = acc.get(id); if (!x) { x = { tasksCompleted: 0, withDueCount: 0, onTime: 0, hoursLogged: 0, issuesResolved: 0, activityVolume: 0 }; acc.set(id, x); } return x; };

    for (const t of completedTasks) {
      for (const a of t.assignees) {
        const x = at(a.userId);
        x.tasksCompleted++;
        if (t.dueDate) { x.withDueCount++; if (t.updatedAt <= t.dueDate) x.onTime++; }
      }
    }
    for (const h of hoursByUser) at(h.userId).hoursLogged = Math.round((h._sum.hoursLogged ?? 0) * 10) / 10;
    for (const r of resolvedByUser) if (r.assigneeId) at(r.assigneeId).issuesResolved = r._count._all;
    for (const a of activityByUser) at(a.userId).activityVolume = a._count._all;

    const out = new Map<string, { tasksCompleted: number; withDueCount: number; onTimeRate: number; hoursLogged: number; issuesResolved: number; activityVolume: number }>();
    for (const [id, x] of acc) {
      out.set(id, { tasksCompleted: x.tasksCompleted, withDueCount: x.withDueCount, onTimeRate: pct(x.onTime, x.withDueCount), hoursLogged: x.hoursLogged, issuesResolved: x.issuesResolved, activityVolume: x.activityVolume });
    }
    return out;
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
    const scoreOf = (m: { tasksCompleted: number; onTimeRate: number; hoursLogged: number; issuesResolved: number; activityVolume: number }) =>
      Math.round(m.tasksCompleted * 4 + m.onTimeRate * 0.5 + m.hoursLogged + m.issuesResolved * 3 + m.activityVolume * 0.5);

    // Set-based: two window aggregations (~8 queries total) instead of the old
    // per-user fan-out (14N+2 ≈ 394 round-trips for 28 users).
    const [curM, prevM] = await Promise.all([
      this.orgWindowMetrics(organizationId, from, to),
      this.orgWindowMetrics(organizationId, prevFrom, prevTo),
    ]);
    const zeroM = { tasksCompleted: 0, withDueCount: 0, onTimeRate: 0, hoursLogged: 0, issuesResolved: 0, activityVolume: 0 };
    const rows = users.map(u => {
      const cur = curM.get(u.id) ?? zeroM;
      const prev = prevM.get(u.id) ?? zeroM;
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
    const rated = rows.filter(r => r.withDueCount > 0);
    const avgOnTimeRate = rated.length ? Math.round(rated.reduce((s, r) => s + r.onTimeRate, 0) / rated.length) : 0;
    const activeProjects = await this.prisma.project.count({ where: { deletedAt: null, projectPhase: 'ACTIVE', members: { some: { user: { organizationId } } } } });

    return {
      periodDays: days,
      totals: {
        users: users.length, tasksCompleted: sum(r => r.tasksCompleted), hoursLogged: sum(r => r.hoursLogged),
        activeProjects, avgOnTimeRate,
      },
      previousTotals: {
        tasksCompleted: rows.reduce((s, r) => s + r.prevCompleted, 0),
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
        this.prisma.timesheet.findMany({ where: { userId, deletedAt: null, date: { gte: since } }, select: { date: true, hoursLogged: true, billable: true } }),
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
          task: { select: { projectTasks: { select: { project: { select: { id: true, title: true } } }, take: 1 } } },
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

    const projMap = new Map<string, { name: string; hours: number; billable: number }>();
    for (const s of sheets) {
      const proj = s.task?.projectTasks?.[0]?.project;
      if (!proj) continue;
      const cur = projMap.get(proj.id) ?? { name: proj.title, hours: 0, billable: 0 };
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
      hoursByProject: [...projMap].map(([projectId, v]) => ({ projectId, name: v.name, hours: r1(v.hours), billable: r1(v.billable) }))
        .sort((a, b) => b.hours - a.hours),
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

    const [hoursByUser, tasks, issues, projects] = await Promise.all([
      this.prisma.timesheet.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, deletedAt: null, date: { gte: from, lt: to } },
        _sum: { hoursLogged: true },
      }),
      this.prisma.task.findMany({
        where: { deletedAt: null, assignees: { some: { userId: { in: userIds } } } },
        select: { currentStatus: { select: { name: true, type: true } } },
      }),
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

    const statusMap = new Map<string, number>();
    for (const t of tasks) {
      const s = t.currentStatus?.name ?? (t.currentStatus?.type === 'CLOSED' ? 'Closed' : 'Open');
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }

    const SEV = ['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'];
    const sevMap = new Map(issues.map(i => [i.severity, i._count._all]));

    // capacity vs logged per department.
    // Availability-fair denominator: target = Σ_member (businessDays − company holidays −
    // that member's approved leave) × 9.6h. Excluding holidays/leave means people on approved
    // time off no longer drag utilization down. (ATTENDANCE_BILLABLE_PLAN.md, B2.)
    // Snap the window to UTC-day boundaries so the weekday set lines up with the
    // midnight-stamped holiday/leave rows (avoids a boundary-day mismatch).
    // Work week = 48h over 5 weekdays (Mon–Fri) → 9.6h/day. Weekends are already excluded
    // by businessDays(); holidays + approved leave are subtracted from availableDays.
    const DAILY_HOURS = 48 / 5; // 9.6h/day
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
        this.prisma.timesheet.findMany({ where: { userId: { in: userIds }, deletedAt: null, date: { gte: since } }, select: { userId: true, date: true, hoursLogged: true, billable: true } }),
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
