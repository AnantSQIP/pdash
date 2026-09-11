import { Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { PerformanceService, type KpiWindow } from './performance.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

/** Clamp the period window to a sensible range (default 30 days). */
function periodDays(raw?: string): number {
  const n = raw ? parseInt(raw, 10) : 30;
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, n));
}

/**
 * A `YYYY-MM-DD` boundary from the page, read as IST MIDNIGHT.
 *
 * The picker offers calendar periods, and a calendar period is a run of days in the office's own
 * timezone. Parsing the string the way `new Date()` would reads it as UTC midnight, which is
 * 05:30 IST — so a week would start and end at half past five in the morning, and everything
 * anybody finished before breakfast on the first day would land in the window before.
 */
function parseDayIST(raw: string | undefined, fallback: Date): Date {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const d = new Date(`${raw}T00:00:00.000+05:30`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

const DAY_MS = 86_400_000;
/** The longest window the KPI endpoints will measure — a year and a bit, to cover a quarter's comparison. */
const MAX_WINDOW_DAYS = 400;

/**
 * The four dates a KPI query runs over, validated.
 *
 * The page computes these (apps/web/lib/periods.ts owns the calendar arithmetic, and is tested),
 * but they arrive over the wire, so nothing here trusts them: a window that runs backwards, or
 * one spanning a decade, is a denial of service written as a date range. Anything unusable falls
 * back to the last seven days rather than erroring — a report that refuses to render teaches
 * people the module is broken, and the window it fell back to is echoed in the response.
 */
function kpiWindow(q: { from?: string; to?: string; prevFrom?: string; prevTo?: string }): KpiWindow {
  const now = new Date();
  const defaultTo = new Date(now.getTime());
  const defaultFrom = new Date(now.getTime() - 7 * DAY_MS);
  let from = parseDayIST(q.from, defaultFrom);
  let to = parseDayIST(q.to, defaultTo);
  if (!(from < to) || to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    from = defaultFrom; to = defaultTo;
  }
  const span = to.getTime() - from.getTime();
  let prevFrom = parseDayIST(q.prevFrom, new Date(from.getTime() - span));
  let prevTo = parseDayIST(q.prevTo, from);
  if (!(prevFrom < prevTo) || prevTo > from || prevTo.getTime() - prevFrom.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    prevFrom = new Date(from.getTime() - span); prevTo = from;
  }
  return { from, to, prevFrom, prevTo };
}

@Controller('performance')
class PerformanceController {
  constructor(
    private readonly perf: PerformanceService,
    private readonly actor: ActorContextService,
  ) {}

  @Get('me')
  async me(@Actor() actorId: string | null, @Query('days') days?: string) {
    await this.perf.assertCanView(actorId, actorId ?? '');
    return this.perf.getUserPerformance(actorId!, periodDays(days));
  }

  @Get('users/:userId')
  async user(@Actor() actorId: string | null, @Param('userId') userId: string, @Query('days') days?: string) {
    await this.perf.assertCanView(actorId, userId);
    return this.perf.getUserPerformance(userId, periodDays(days));
  }

  @Get('users/:userId/breakdowns')
  async userBreakdowns(@Actor() actorId: string | null, @Param('userId') userId: string, @Query('days') days?: string) {
    await this.perf.assertCanView(actorId, userId);
    return this.perf.getUserBreakdowns(userId, periodDays(days));
  }

  @Get('heatmap/:userId')
  async heatmap(@Actor() actorId: string | null, @Param('userId') userId: string, @Query('days') days?: string) {
    await this.perf.assertCanView(actorId, userId);
    return this.perf.getHeatmap(userId, days ? Math.min(parseInt(days, 10), 366) : 365);
  }

  // ── The two KPIs ─────────────────────────────────────────────────────────────
  // Time spent against time allocated, and the streak of delivering on the day and on the budget.
  // Windowed by explicit calendar dates rather than a day count — see kpiWindow().

  // The four boundaries are taken as NAMED query params rather than a bare `@Query()` object.
  // The global ValidationPipe runs with forbidNonWhitelisted, and an un-DTO'd object parameter
  // slips past it untouched — naming them keeps the contract visible and matches every other
  // route in this controller.

  /** My own KPIs. No permission needed: a person's own performance is theirs. */
  @Get('kpis/me')
  async myKpis(
    @Actor() actorId: string | null,
    @Query('from') from?: string, @Query('to') to?: string,
    @Query('prevFrom') prevFrom?: string, @Query('prevTo') prevTo?: string,
  ) {
    await this.perf.assertCanView(actorId, actorId ?? '');
    return this.perf.getUserKpis(actorId!, kpiWindow({ from, to, prevFrom, prevTo }));
  }

  /** Somebody else's KPIs — performance.view.organization, checked on the server. */
  @Get('kpis/users/:userId')
  async userKpis(
    @Actor() actorId: string | null, @Param('userId') userId: string,
    @Query('from') from?: string, @Query('to') to?: string,
    @Query('prevFrom') prevFrom?: string, @Query('prevTo') prevTo?: string,
  ) {
    await this.perf.assertCanView(actorId, userId);
    return this.perf.getUserKpis(userId, kpiWindow({ from, to, prevFrom, prevTo }));
  }

  // Org from the SESSION, never a query param — see the note on `org` below for what trusting
  // the param allowed.
  @Get('kpis/org')
  @RequirePermission('performance.view.organization')
  async orgKpis(
    @Query('from') from?: string, @Query('to') to?: string,
    @Query('prevFrom') prevFrom?: string, @Query('prevTo') prevTo?: string,
  ) {
    return this.perf.getOrgKpis(await this.actor.requireOrgId(), kpiWindow({ from, to, prevFrom, prevTo }));
  }

  /** Requirements 18–20: project shifts, overshoot on the important work, and whose it is. */
  @Get('kpis/projects')
  @RequirePermission('performance.view.organization')
  async projectKpis(
    @Query('from') from?: string, @Query('to') to?: string,
    @Query('prevFrom') prevFrom?: string, @Query('prevTo') prevTo?: string,
  ) {
    return this.perf.getProjectKpis(await this.actor.requireOrgId(), kpiWindow({ from, to, prevFrom, prevTo }));
  }

  // The organization for every org-wide report is the ACTOR's own org, resolved from the
  // session — never a query param. Trusting the param let a holder of the permission scope
  // the query to any org id (and omitting it dropped the filter, aggregating ALL orgs).
  @Get('org')
  @RequirePermission('performance.view.organization')
  async org(@Query('days') days?: string) {
    return this.perf.getOrgPerformance(await this.actor.requireOrgId(), periodDays(days));
  }

  @Get('org-heatmap')
  @RequirePermission('performance.view.organization')
  async orgHeatmap(@Query('days') days?: string) {
    return this.perf.getOrgHeatmap(await this.actor.requireOrgId(), days ? Math.min(parseInt(days, 10), 366) : 365);
  }

  @Get('org/breakdowns')
  @RequirePermission('performance.view.organization')
  async orgBreakdowns(@Query('days') days?: string) {
    return this.perf.getOrgBreakdowns(await this.actor.requireOrgId(), periodDays(days));
  }

  @Get('org/trend')
  @RequirePermission('performance.view.organization')
  async orgTrend(@Query('days') days?: string) {
    return this.perf.getOrgTrend(await this.actor.requireOrgId(), periodDays(days));
  }

  @Post('snapshots/rebuild')
  @RequirePermission('performance.view.organization')
  async rebuild() {
    return this.perf.rebuildSnapshots(await this.actor.requireOrgId());
  }
}

@Module({
  controllers: [PerformanceController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
