import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // NOTE: dashboard/projects feed the Home dashboard for ALL users and are intentionally
  // left open for now. Gating org-wide stats behind a permission is a product decision
  // tracked under workstream B4 (and depends on real auth). The per-user billable rollup
  // below IS sensitive, so it is locked to org-analytics viewers.
  @Get('dashboard')
  dashboard(@Query('organizationId') organizationId: string) {
    return this.analytics.getDashboard(organizationId);
  }

  @Get('projects')
  projects(@Query('organizationId') organizationId: string) {
    return this.analytics.getProjectStats(organizationId);
  }

  @Get('timesheets')
  @RequirePermission('analytics.view.organization')
  timesheets(
    @Query('organizationId') organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getTimesheetSummary(organizationId, from, to);
  }
}
