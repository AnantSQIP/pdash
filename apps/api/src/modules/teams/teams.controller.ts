import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { TeamsService } from './teams.service';
import {
  CreateTeamDto, CreateTeamListDto, CreateTeamTaskDto, MoveTeamTaskDto, SetTeamMembersDto,
  TeamMemberDto, UpdateTeamDto, UpdateTeamListDto, UpdateTeamTaskDto,
} from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

/**
 * Team spaces — HR, BD, operations: work that is not client delivery.
 *
 * `team.view` sits in everyone's basics and only opens the module; WHICH spaces you can read is
 * decided by membership inside the service, exactly as it is for projects. Changing a space —
 * creating, renaming, archiving, who is in it — additionally needs `team.manage`.
 *
 * Working inside a space reuses the ordinary `task.*` permissions, so being added to one grants
 * no capability over work that the person did not already have.
 */
@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly actor: ActorContextService,
  ) {}

  @Get() @RequirePermission('team.view')
  async list() {
    return this.teams.list(await this.actor.requireOrgId());
  }

  @Post() @RequirePermission('team.manage')
  async create(@Body() dto: CreateTeamDto) {
    return this.teams.create(await this.actor.requireOrgId(), dto);
  }

  @Get(':id') @RequirePermission('team.view')
  get(@Param('id') id: string) {
    return this.teams.get(id);
  }

  @Patch(':id') @RequirePermission('team.manage')
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teams.update(id, dto);
  }

  // Archive is reversible and destroys nothing, so no step-up prompt — the same reasoning as
  // archiving a client.
  @Post(':id/archive') @RequirePermission('team.manage')
  archive(@Param('id') id: string) {
    return this.teams.setArchived(id, true);
  }

  @Post(':id/restore') @RequirePermission('team.manage')
  restore(@Param('id') id: string) {
    return this.teams.setArchived(id, false);
  }

  @Delete(':id') @RequirePermission('team.manage')
  remove(@Param('id') id: string) {
    return this.teams.remove(id);
  }

  // ── Members ───────────────────────────────────────────────────────────────
  /** Replace the whole membership — idempotent, same shape as project patent tagging. */
  @Put(':id/members') @RequirePermission('team.manage')
  setMembers(@Param('id') id: string, @Body() dto: SetTeamMembersDto) {
    return this.teams.setMembers(id, dto.userIds ?? []);
  }

  @Post(':id/members') @RequirePermission('team.manage')
  addMember(@Param('id') id: string, @Body() dto: TeamMemberDto) {
    return this.teams.addMember(id, dto);
  }

  @Delete(':id/members/:userId') @RequirePermission('team.manage')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.teams.removeMember(id, userId);
  }

  // ── Lists (board columns) ─────────────────────────────────────────────────
  // Managing the columns of a space you belong to is ordinary task-list work, not space
  // administration, so it follows tasklist.* rather than team.manage.
  @Post(':id/lists') @RequirePermission('tasklist.create')
  createList(@Param('id') id: string, @Body() dto: CreateTeamListDto) {
    return this.teams.createList(id, dto);
  }

  @Patch(':id/lists/:listId') @RequirePermission('tasklist.update')
  updateList(@Param('id') id: string, @Param('listId') listId: string, @Body() dto: UpdateTeamListDto) {
    return this.teams.updateList(id, listId, dto);
  }

  @Delete(':id/lists/:listId') @RequirePermission('tasklist.delete')
  removeList(@Param('id') id: string, @Param('listId') listId: string) {
    return this.teams.removeList(id, listId);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  @Get(':id/tasks') @RequirePermission('task.view')
  tasks(@Param('id') id: string) {
    return this.teams.tasks(id);
  }

  /** The statuses a team task can take — the same GLOBAL workflow projects use. */
  @Get('meta/statuses') @RequirePermission('task.view')
  statuses() {
    return this.teams.statuses();
  }

  /** Edit a task: title, dates, assignees, and above all its STATUS — an open task consumes
   *  its owner's capacity for ever, so being unable to close one is not a cosmetic gap. */
  @Patch(':id/tasks/:taskId') @RequirePermission('task.update')
  updateTask(@Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: UpdateTeamTaskDto) {
    return this.teams.updateTask(id, taskId, dto);
  }

  @Post(':id/tasks') @RequirePermission('task.create')
  createTask(@Param('id') id: string, @Body() dto: CreateTeamTaskDto) {
    return this.teams.createTask(id, dto);
  }

  @Put(':id/tasks/:taskId/move') @RequirePermission('task.update')
  moveTask(@Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: MoveTeamTaskDto) {
    return this.teams.moveTask(id, taskId, dto.taskListId, dto.sequence);
  }

  @Delete(':id/tasks/:taskId') @RequirePermission('task.delete')
  removeTask(@Param('id') id: string, @Param('taskId') taskId: string) {
    return this.teams.removeTask(id, taskId);
  }
}
