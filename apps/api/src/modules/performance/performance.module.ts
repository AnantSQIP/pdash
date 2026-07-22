import { Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

/** Clamp the period window to a sensible range (default 30 days). */
function periodDays(raw?: string): number {
  const n = raw ? parseInt(raw, 10) : 30;
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, n));
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

  // The organization for every org-wide report is the ACTOR's own org, resolved from the
  // session — never a query param. Trusting the param let a holder of the permission scope
  // the query to any org id (and omitting it dropped the filter, aggregating ALL orgs).
  @Get('org')
  @RequirePermission('analytics.view.organization')
  async org(@Query('days') days?: string) {
    return this.perf.getOrgPerformance(await this.actor.requireOrgId(), periodDays(days));
  }

  @Get('org-heatmap')
  @RequirePermission('analytics.view.organization')
  async orgHeatmap(@Query('days') days?: string) {
    return this.perf.getOrgHeatmap(await this.actor.requireOrgId(), days ? Math.min(parseInt(days, 10), 366) : 365);
  }

  @Get('org/breakdowns')
  @RequirePermission('analytics.view.organization')
  async orgBreakdowns(@Query('days') days?: string) {
    return this.perf.getOrgBreakdowns(await this.actor.requireOrgId(), periodDays(days));
  }

  @Get('org/trend')
  @RequirePermission('analytics.view.organization')
  async orgTrend(@Query('days') days?: string) {
    return this.perf.getOrgTrend(await this.actor.requireOrgId(), periodDays(days));
  }

  @Post('snapshots/rebuild')
  @RequirePermission('analytics.view.organization')
  async rebuild() {
    return this.perf.rebuildSnapshots(await this.actor.requireOrgId());
  }
}

@Module({
  controllers: [PerformanceController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
