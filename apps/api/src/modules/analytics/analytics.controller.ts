import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@Query('organizationId') organizationId: string) {
    return this.analytics.getDashboard(organizationId);
  }

  @Get('projects')
  projects(@Query('organizationId') organizationId: string) {
    return this.analytics.getProjectStats(organizationId);
  }

  @Get('timesheets')
  timesheets(
    @Query('organizationId') organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getTimesheetSummary(organizationId, from, to);
  }
}
