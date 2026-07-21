import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // Home + Reports feed. The organization is derived from the session actor (never a query
  // param), and the payload is object-scoped to the projects the actor may see, so a junior
  // never pulls firm-wide client-matter titles/descriptions or aggregate totals for matters
  // they are not staffed on. dashboard.view / report.view are held by every seeded role.
  @Get('dashboard')
  @RequirePermission('dashboard.view')
  dashboard() {
    return this.analytics.getDashboard();
  }

  @Get('projects')
  @RequirePermission('report.view')
  projects() {
    return this.analytics.getProjectStats();
  }

  @Get('timesheets')
  @RequirePermission('analytics.view.organization')
  timesheets(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getTimesheetSummary(from, to);
  }
}
