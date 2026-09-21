import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TaskTimeService } from './task-time.service';
import { CreateSubtaskDto, CreateTaskDto, MoveTaskGroupDto, SetAssigneesDto, SetStaffingDto, SetStatusDto, SetProgressDto, UpdateSubtaskDto, UpdateTaskDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequireFlow } from '../../common/decorators/require-flow.decorator';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly time: TaskTimeService,
  ) {}

  @Post() @RequirePermission('task.create')
  create(@Body() dto: CreateTaskDto) {
    return this.tasks.create(dto);
  }

  @Get() @RequirePermission('task.view')
  list(
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
    @Query('taskListId') taskListId?: string,
  ) {
    if (userId) return this.tasks.listForUser(userId);
    if (projectId) return this.tasks.list(projectId, { taskListId });
    return [];
  }

  // ── Timing ──────────────────────────────────────────────────────────────────
  // Declared ABOVE @Get(':id'): Nest matches routes in declaration order, so putting these
  // after it would make "standards" and "timer" be read as task ids.

  // The stopwatch exists in the PROJECTS flow only (and there, only while the organisation's time
  // mode is TIMER — the service refuses a start otherwise). The CLIENTS flow retired it: time is
  // logged, not clocked — Finish, Reopen and Log time — so these routes answer 404 there.

  /** Every clock this person has running. Several at once is allowed. Drives the My Tasks header. */
  @Get('timer/running') @RequirePermission('task.view') @RequireFlow('PROJECTS')
  runningTimers() {
    return this.time.running();
  }

  /** Today: what the clock recorded per task, what is filed, and what the day still owes. */
  @Get('timer/today') @RequirePermission('task.view') @RequireFlow('PROJECTS')
  today() {
    return this.time.todayBoard();
  }

  /** Every learned standard and the number of completions behind it. */
  @Get('standards') @RequirePermission('task.view')
  standards() {
    return this.time.standards();
  }

  @Post(':id/start') @RequirePermission('task.view') @RequireFlow('PROJECTS')
  startTimer(@Param('id') id: string) {
    return this.time.start(id);
  }

  /** Pause the clock. Resuming is Start again — there is no third state to get wrong. */
  @Post(':id/pause') @RequirePermission('task.view') @RequireFlow('PROJECTS')
  pauseTimer(@Param('id') id: string) {
    return this.time.pause(id);
  }

  /**
   * Finish the task. One click: no hours to enter, no dialog. With the timer (PROJECTS, TIMER
   * mode) the clock stops, what it recorded teaches the estimate, and today's share of it is filed
   * to the timesheet. Without it, the hours LOGGED against the task teach the estimate and
   * nothing is filed automatically.
   */
  @Post(':id/finish') @RequirePermission('task.view')
  finish(@Param('id') id: string, @Body() body: { closedStatusId?: string }) {
    return this.tasks.finish(id, body?.closedStatusId);
  }

  @Post(':id/reopen') @RequirePermission('task.view')
  reopen(@Param('id') id: string, @Body() body: { openStatusId?: string }) {
    return this.time.reopen(id, body?.openStatusId);
  }

  @Get(':id') @RequirePermission('task.view')
  get(@Param('id') id: string) {
    return this.tasks.get(id);
  }

  @Patch(':id') @RequirePermission('task.update')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
  }

  /**
   * Moving a task along its workflow is REPORTING, not editing: the person doing the work
   * says where it has got to. Requiring task.update meant everyone without edit rights —
   * every Employee, and anyone whose role was trimmed in the permission matrix — hit
   * "Missing permission: task.update" just for ticking their own work as done.
   *
   * So this needs only task.view. It is not a hole: setStatus() still calls
   * assertTaskAccess() (you must have access to the task's project) and
   * assertTaskWritable() (no moves on a completed or closed matter), and the workflow's
   * own transition rules still apply. Editing a task's CONTENT — title, dates, estimates —
   * remains behind task.update.
   */
  @Put(':id/status') @RequirePermission('task.view')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.tasks.setStatus(id, dto);
  }

  /**
   * Same reasoning as the status route: saying "this is 60% done" is reporting your own
   * work, not editing the task. Kept as its own route rather than relaxing PATCH :id,
   * because that one also carries the title, dates and priority — which must stay behind
   * task.update. Delegates to update() so progress roll-up and the overdue re-arm still run.
   */
  @Put(':id/progress') @RequirePermission('task.view')
  setProgress(@Param('id') id: string, @Body() dto: SetProgressDto) {
    return this.tasks.update(id, { completionPercentage: dto.completionPercentage });
  }

  @Put(':id/assignees') @RequirePermission('task.assign')
  setAssignees(@Param('id') id: string, @Body() dto: SetAssigneesDto) {
    return this.tasks.setAssignees(id, dto);
  }

  /** CLIENTS-FLOW: move a task into another task group of the same client. */
  @Put(':id/task-group') @RequirePermission('task.update') @RequireFlow('CLIENTS')
  moveToGroup(@Param('id') id: string, @Body() dto: MoveTaskGroupDto) {
    return this.tasks.moveToGroup(id, dto.projectId, dto.taskListId);
  }

  /** Role-based staffing (PM/Reviewer/Analyst + per-person hours). */
  @Put(':id/staffing') @RequirePermission('task.assign')
  setStaffing(@Param('id') id: string, @Body() dto: SetStaffingDto) {
    return this.tasks.setStaffing(id, dto);
  }

  /** Move ONE person's deadline on the task (their seat's date); `dueDate: null` clears it. */
  @Patch(':id/assignees/:userId/deadline') @RequirePermission('task.update')
  setAssigneeDeadline(@Param('id') id: string, @Param('userId') userId: string, @Body() body: { dueDate?: string | null }) {
    return this.tasks.setAssigneeDeadline(id, userId, body?.dueDate ?? null);
  }

  @Delete(':id') @RequirePermission('task.delete')
  remove(@Param('id') id: string) {
    return this.tasks.softDelete(id);
  }

  // ── Subtasks ───────────────────────────────────────────────

  @Post(':id/subtasks') @RequirePermission('task.update')
  createSubtask(@Param('id') taskId: string, @Body() dto: CreateSubtaskDto) {
    return this.tasks.createSubtask(taskId, dto);
  }

  @Get(':id/subtasks') @RequirePermission('task.view')
  listSubtasks(@Param('id') taskId: string) {
    return this.tasks.listSubtasks(taskId);
  }

  @Post(':id/subtasks/:subtaskId/close') @RequirePermission('task.update')
  closeSubtask(@Param('id') taskId: string, @Param('subtaskId') subtaskId: string) {
    return this.tasks.closeSubtask(taskId, subtaskId);
  }

  @Post(':id/subtasks/:subtaskId/reopen') @RequirePermission('task.update')
  reopenSubtask(@Param('id') taskId: string, @Param('subtaskId') subtaskId: string) {
    return this.tasks.reopenSubtask(taskId, subtaskId);
  }

  @Patch(':id/subtasks/:subtaskId') @RequirePermission('task.update')
  updateSubtask(@Param('id') taskId: string, @Param('subtaskId') subtaskId: string, @Body() dto: UpdateSubtaskDto) {
    return this.tasks.updateSubtask(taskId, subtaskId, dto);
  }

  @Delete(':id/subtasks/:subtaskId') @RequirePermission('task.update')
  deleteSubtask(@Param('id') taskId: string, @Param('subtaskId') subtaskId: string) {
    return this.tasks.softDeleteSubtask(taskId, subtaskId);
  }
}
