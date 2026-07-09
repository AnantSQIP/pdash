import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { CreateTimesheetDto, UpdateTimesheetDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

// SECURITY: every route is permission-gated (PermissionGuard is global but opt-in
// per-route). Ownership + actor derivation are enforced in the service.
@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get() @RequirePermission('timesheet.view')
  list(
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
  ) {
    if (projectId) return this.timesheets.listForProject(projectId);
    return this.timesheets.listForUser(userId); // scoped to self unless privileged
  }

  @Post() @RequirePermission('timesheet.create')
  create(@Body() dto: CreateTimesheetDto) {
    return this.timesheets.create(dto);
  }

  @Patch(':id') @RequirePermission('timesheet.update')
  update(@Param('id') id: string, @Body() dto: UpdateTimesheetDto) {
    return this.timesheets.update(id, dto);
  }

  @Delete(':id') @RequirePermission('timesheet.delete')
  remove(@Param('id') id: string) {
    return this.timesheets.softDelete(id);
  }
}
