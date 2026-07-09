import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateSubtaskDto, CreateTaskDto, SetAssigneesDto, SetStatusDto, UpdateTaskDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post() @RequirePermission('task.create')
  create(@Body() dto: CreateTaskDto) {
    return this.tasks.create(dto);
  }

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
    @Query('taskListId') taskListId?: string,
    @Query('milestoneId') milestoneId?: string,
  ) {
    if (userId) return this.tasks.listForUser(userId);
    if (projectId) return this.tasks.list(projectId, { taskListId, milestoneId });
    return [];
  }

  @Get(':id')
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

  @Delete(':id') @RequirePermission('task.delete')
  remove(@Param('id') id: string) {
    return this.tasks.softDelete(id);
  }

  // ── Subtasks ───────────────────────────────────────────────

  @Post(':id/subtasks') @RequirePermission('task.update')
  createSubtask(@Param('id') taskId: string, @Body() dto: CreateSubtaskDto) {
    return this.tasks.createSubtask(taskId, dto);
  }

  @Get(':id/subtasks')
  listSubtasks(@Param('id') taskId: string) {
    return this.tasks.listSubtasks(taskId);
  }

  @Post(':id/subtasks/:subtaskId/close') @RequirePermission('task.update')
  closeSubtask(@Param('subtaskId') subtaskId: string) {
    return this.tasks.closeSubtask(subtaskId);
  }

  @Post(':id/subtasks/:subtaskId/reopen') @RequirePermission('task.update')
  reopenSubtask(@Param('subtaskId') subtaskId: string) {
    return this.tasks.reopenSubtask(subtaskId);
  }

  @Delete(':id/subtasks/:subtaskId') @RequirePermission('task.update')
  deleteSubtask(@Param('subtaskId') subtaskId: string) {
    return this.tasks.softDeleteSubtask(subtaskId);
  }
}
