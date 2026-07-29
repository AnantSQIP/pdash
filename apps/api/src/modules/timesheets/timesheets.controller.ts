import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { AssignTimesheetDto, CreateTimesheetDto, UpdateTimesheetDto } from './dto';
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

  /** The signed-in user's month fill-calendar (color-coded: complete / incomplete / leave / …). */
  @Get('calendar') @RequirePermission('timesheet.view')
  calendar(@Query('year') year: string, @Query('month') month: string) {
    return this.timesheets.myCalendar(parseInt(year, 10), parseInt(month, 10));
  }

  // ── Backdate (backfill) approval ──────────────────────────────────────────
  // Static 'backdate*' paths are declared before the ':id' routes so they never collide.

  /** My own backfill requests (any status). */
  @Get('backdate') @RequirePermission('timesheet.view')
  myBackdates() {
    return this.timesheets.myBackdateRequests();
  }

  /** Pending backfill queue — Super Admin only (enforced in the service). */
  @Get('backdate/pending') @RequirePermission('timesheet.view')
  pendingBackdates() {
    return this.timesheets.pendingBackdateRequests();
  }

  /** Raise a backfill request for a past date range that needs approval (1–3 months old). */
  @Post('backdate') @RequirePermission('timesheet.create')
  requestBackdate(@Body() dto: { fromDate: string; toDate: string; reason: string }) {
    return this.timesheets.requestBackdate(dto);
  }

  @Post('backdate/:id/approve') @RequirePermission('timesheet.view')
  approveBackdate(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.timesheets.approveBackdate(id, body?.note);
  }

  @Post('backdate/:id/reject') @RequirePermission('timesheet.view')
  rejectBackdate(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.timesheets.rejectBackdate(id, body?.note);
  }

  @Post('backdate/:id/cancel') @RequirePermission('timesheet.view')
  cancelBackdate(@Param('id') id: string) {
    return this.timesheets.cancelBackdate(id);
  }

  @Post() @RequirePermission('timesheet.create')
  create(@Body() dto: CreateTimesheetDto) {
    return this.timesheets.create(dto);
  }

  @Patch(':id') @RequirePermission('timesheet.update')
  update(@Param('id') id: string, @Body() dto: UpdateTimesheetDto) {
    return this.timesheets.update(id, dto);
  }

  // Assign a PID (task) to a buffer entry logged without one. Self-scoped in the service.
  @Post(':id/assign') @RequirePermission('timesheet.create')
  assign(@Param('id') id: string, @Body() dto: AssignTimesheetDto) {
    return this.timesheets.assign(id, dto.taskId);
  }

  // No @RequirePermission: deleting a timesheet is self-scoped — the service enforces
  // owner-or-Super-Admin. The catalog's timesheet.delete was granted to no role, so gating
  // on it blocked people from removing even their OWN entry.
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.timesheets.softDelete(id);
  }
}
