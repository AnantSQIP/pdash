import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateSubtaskDto, CreateTaskDto, SetAssigneesDto, SetStaffingDto, SetStatusDto, UpdateSubtaskDto, UpdateTaskDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

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

  @Get(':id') @RequirePermission('task.view')
  get(@Param('id') id: string) {
    return this.tasks.get(id);
  }

  @Patch(':id') @RequirePermission('task.update')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
  }

  @Put(':id/status') @RequirePermission('task.update')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.tasks.setStatus(id, dto);
  }

  @Put(':id/assignees') @RequirePermission('task.assign')
  setAssignees(@Param('id') id: string, @Body() dto: SetAssigneesDto) {
    return this.tasks.setAssignees(id, dto);
  }

  /** Role-based staffing (PM/Reviewer/Analyst + per-person hours). */
  @Put(':id/staffing') @RequirePermission('task.assign')
  setStaffing(@Param('id') id: string, @Body() dto: SetStaffingDto) {
    return this.tasks.setStaffing(id, dto);
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
