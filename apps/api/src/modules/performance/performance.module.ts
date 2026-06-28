import { Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

/** Clamp the period window to a sensible range (default 30 days). */
function periodDays(raw?: string): number {
  const n = raw ? parseInt(raw, 10) : 30;
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, n));
}

@Controller('performance')
class PerformanceController {
  constructor(private readonly perf: PerformanceService) {}

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

  @Get('org')
  @RequirePermission('analytics.view.organization')
  org(@Query('organizationId') organizationId: string, @Query('days') days?: string) {
    return this.perf.getOrgPerformance(organizationId, periodDays(days));
  }

  @Get('org-heatmap')
  @RequirePermission('analytics.view.organization')
  orgHeatmap(@Query('organizationId') organizationId: string, @Query('days') days?: string) {
    return this.perf.getOrgHeatmap(organizationId, days ? Math.min(parseInt(days, 10), 366) : 365);
  }

  @Get('org/breakdowns')
  @RequirePermission('analytics.view.organization')
  orgBreakdowns(@Query('organizationId') organizationId: string, @Query('days') days?: string) {
    return this.perf.getOrgBreakdowns(organizationId, periodDays(days));
  }

  @Get('org/trend')
  @RequirePermission('analytics.view.organization')
  orgTrend(@Query('organizationId') organizationId: string, @Query('days') days?: string) {
    return this.perf.getOrgTrend(organizationId, periodDays(days));
  }

  @Post('snapshots/rebuild')
  @RequirePermission('analytics.view.organization')
  rebuild(@Query('organizationId') organizationId: string) {
    return this.perf.rebuildSnapshots(organizationId);
  }
}

@Module({
  controllers: [PerformanceController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
