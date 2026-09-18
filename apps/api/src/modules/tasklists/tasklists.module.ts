import { Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { getActorId } from '../../common/context/request-context';
import { PermissionService } from '../permissions/permission.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { OPEN_TASK_WHERE } from '../../common/task-state';
import { startOfIstDay, startOfUtcDay } from '../../common/dates';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectsService } from '../projects/projects.service';
import { TasksModule } from '../tasks/tasks.module';
import { TasksService } from '../tasks/tasks.service';
import { CustomDomainDto, TaskGroupSpecDto } from '../projects/dto';
import { PROJECT_TYPES } from '../projects/project-templates';

/** POST body: exactly the shape a client's first task group takes — one definition, two doors. */
class CreateTaskListDto extends TaskGroupSpecDto {}

class UpdateTaskListDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;

  // CLIENTS-FLOW: the rest of what a task group carries. `null` clears; absent leaves alone.
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  /** Relabels the kind of work. It does NOT add the type's standard tasks — that happens once, at creation. */
  @IsOptional() @IsString() @MaxLength(60)
  groupType?: string | null;

  @IsOptional() @IsString() @MaxLength(60)
  technologyDomain?: string | null;

  @IsOptional() @ValidateNested() @Type(() => CustomDomainDto)
  customDomain?: CustomDomainDto;

  @IsOptional() @IsDateString() @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  @IsOptional() @IsDateString() @Transform(({ value }) => (value === '' ? null : value))
  dueDate?: string | null;
}

/**
 * A PROJECT's task lists — which the CLIENTS-FLOW calls TASK GROUPS: one piece of work for the
 * client, with its kind, its field, its dates and a status. Team-space columns are also TaskList
 * rows, but they are reached through /teams/:id/lists in the Teams module — nothing here touches
 * them.
 *
 * Every method walls on ProjectAccessService first. A task list names the shape of a matter —
 * "Claim chart round 2", "Opposition response" — and its counts say how much of it is left, so
 * reading one is reading the matter. The delivery domain already refuses a non-member on
 * /projects/:id, /tasks, /comments, /timesheets and /projects/:id/documents; these routes went
 * straight to Prisma on a bare projectId, so the same person got 403 on the project and 200 on
 * its board, and a Consultant could file a list into a matter they had never been staffed on.
 * Same service, same wording as its neighbours, so the wall reads as one wall.
 *
 * THE RULES A TASK GROUP KEEPS
 *
 *   • Complete only when every task in it is closed. A reopened task re-opens the group (see
 *     common/task-groups.ts); new or moved open work cannot enter a completed group.
 *   • Deleting a group never deletes work — its tasks move to the client's default group.
 *   • The default group cannot be deleted; it is where tasks made from the board or capacity land.
 *   • Nothing changes on a completed or deleted client (assertProjectWritable).
 */
@Injectable()
export class TaskListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
  ) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('You must be signed in.');
    return id;
  }

  /**
   * CLIENTS-FLOW: create a task group — with the standard tasks of its type, and optionally staffed.
   *
   * Everything that can fail is checked BEFORE anything is written: the wall, the client being
   * open, the type and domain, the dates, the right to assign and the person assigned. The group
   * and its tasks are then one transaction. Staffing goes through TasksService.setStaffing, the
   * same path the task panel uses, so the seats it makes are exactly the seats a person would
   * have made by hand — role, hours, start — and the capacity board places them the same way.
   */
  async create(projectId: string, dto: CreateTaskListDto) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true, title: true } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
    if (!actor) throw new ForbiddenException('You must be signed in.');

    const group = await this.projects.prepareTaskGroup(actor.organizationId, actorId, dto);

    // Assigning is its own right. Someone who may create a group but not assign work gets a clear
    // refusal instead of a group created half-way with nobody on it.
    const assigneeId = dto.assigneeId?.trim() || null;
    if (assigneeId) {
      if (!(await this.permissions.check(actorId, 'task.assign'))) {
        throw new ForbiddenException('You can create the group, but assigning its work needs the right to assign tasks.');
      }
      const person = await this.prisma.user.findFirst({
        where: { id: assigneeId, organizationId: actor.organizationId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!person) throw new BadRequestException('The person chosen is not an active member of this organisation.');
      // The same rule staffing applies, asked up front so it cannot fail after the group exists.
      const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId: assigneeId, isActive: true }, select: { id: true } });
      if (!member && !(await this.access.hasOversight(actorId))) {
        throw new BadRequestException('You can only assign people who are on this client. Ask a manager to add them first.');
      }
    }

    const { list, taskIds } = await this.prisma.$transaction(async tx => {
      const count = await tx.taskList.count({ where: { projectId, deletedAt: null } });
      return this.projects.createTaskGroupTx(tx, { projectId, actorId, isDefault: false, sequence: count, group });
    });

    // Staff each standard task. A start date PLACES the hours on the capacity board from that day
    // forward; without one they would be smeared to the deadline, which is a guess nobody made.
    let assignmentWarning: string | null = null;
    let assigned = 0;
    if (assigneeId && taskIds.length) {
      const start = group.startDate ?? startOfIstDay(new Date());
      for (const taskId of taskIds) {
        try {
          await this.tasks.setStaffing(taskId, {
            assignees: [{
              userId: assigneeId, role: 'ANALYST',
              estimatedHours: dto.hoursPerTask ?? 0,
              startDate: start.toISOString(),
            }],
          } as any);
          assigned++;
        } catch (e) {
          assignmentWarning = `The group was created, but ${taskIds.length - assigned} of its ${taskIds.length} tasks could not be assigned: ${e instanceof Error ? e.message : 'unknown error'}`;
          break;
        }
      }
    }

    await this.events.emit({
      action: EVENTS.TASKGROUP_CREATED,
      entityType: 'TASK_GROUP',
      entityId: list.id,
      metadata: {
        projectId, name: list.name, groupType: list.groupType, taskCount: taskIds.length,
        ...(assigneeId ? { assigneeId, assigned } : {}),
      },
    });
    return { ...(await this.find(projectId, list.id)), createdTaskCount: taskIds.length, assigned, assignmentWarning };
  }

  /**
   * The client's task groups, in order, each with how many tasks it holds and how many are still
   * open — enough for the group headers and the client card without loading every task.
   */
  async list(projectId: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const lists = await this.prisma.taskList.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { sequence: 'asc' },
      include: { _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } } },
    });
    if (!lists.length) return lists;
    const open = await this.prisma.projectTask.groupBy({
      by: ['taskListId'],
      where: { projectId, taskListId: { in: lists.map(l => l.id) }, task: { deletedAt: null, ...OPEN_TASK_WHERE } },
      _count: { _all: true },
    });
    const openBy = new Map(open.map(o => [o.taskListId, o._count._all]));
    return lists.map(l => ({ ...l, openTaskCount: openBy.get(l.id) ?? 0 }));
  }

  async get(projectId: string, id: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    return this.find(projectId, id);
  }

  /**
   * The unguarded lookup, for callers that have ALREADY asserted access. Split out so a mutation
   * does not pay for the membership query twice — the assert stays at the entry point, where it
   * cannot be skipped by a future caller who only wanted the row.
   */
  private async find(projectId: string, id: string) {
    const list = await this.prisma.taskList.findFirst({
      where: { id, projectId, deletedAt: null },
      include: { _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } } },
    });
    if (!list) throw new NotFoundException(`Task list ${id} not found`);
    const openTaskCount = await this.openTasksIn(projectId, id);
    return { ...list, openTaskCount };
  }

  private openTasksIn(projectId: string, taskListId: string) {
    return this.prisma.projectTask.count({
      where: { projectId, taskListId, task: { deletedAt: null, ...OPEN_TASK_WHERE } },
    });
  }

  async update(projectId: string, id: string, dto: UpdateTaskListDto) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    const existing = await this.find(projectId, id);
    // The DEFAULT group may be renamed. "General" is a placeholder nobody chose, and on a project
    // running several pieces of work it has to be able to say what it actually is ("Prior-art
    // search", "Round 2"). What must not change is its ROLE: isDefault is untouched here, so it
    // remains the fallback new tasks land in — which is what actually needs protecting, not its
    // name. Deleting it is still refused (see remove).

    // CLIENTS-FLOW: the rest of the group. Dates are checked as they will END UP, so moving only
    // the start past an existing deadline is caught as surely as sending both.
    const start = dto.startDate === undefined ? existing.startDate : (dto.startDate ? startOfUtcDay(new Date(dto.startDate)) : null);
    const due = dto.dueDate === undefined ? existing.dueDate : (dto.dueDate ? startOfUtcDay(new Date(dto.dueDate)) : null);
    if (start && due && due < start) throw new BadRequestException('The deadline cannot be before the start date.');

    let groupType: string | null | undefined = undefined;
    if (dto.groupType !== undefined) {
      groupType = dto.groupType?.trim() || null;
      if (groupType) {
        const builtIn = PROJECT_TYPES.find(t => t.value === groupType);
        if (builtIn?.comingSoon) throw new BadRequestException(`Work of type "${builtIn.label}" isn't available yet.`);
        const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
        const saved = builtIn ? null : await this.prisma.projectTemplate.findFirst({
          where: { organizationId: actor?.organizationId ?? '', value: groupType, isActive: true }, select: { value: true },
        });
        // A group created with a one-off custom type keeps it; a new value must be a real type.
        if (!builtIn && !saved && groupType !== existing.groupType) {
          throw new BadRequestException(`"${groupType}" is not a type of work this organisation offers.`);
        }
      }
    }

    let technologyDomain: string | null | undefined = undefined;
    if (dto.customDomain?.label?.trim() || dto.technologyDomain !== undefined) {
      const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
      technologyDomain = dto.technologyDomain === null && !dto.customDomain?.label?.trim()
        ? null
        : await this.projects.resolveDomain(actor?.organizationId ?? '', actorId, {
            technologyDomain: dto.technologyDomain ?? undefined, customDomain: dto.customDomain,
          });
    }

    const updated = await this.prisma.taskList.update({
      where: { id },
      data: {
        name: dto.name,
        sequence: dto.sequence,
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(groupType !== undefined ? { groupType } : {}),
        ...(technologyDomain !== undefined ? { technologyDomain } : {}),
        ...(dto.startDate !== undefined ? { startDate: start } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: due } : {}),
      },
    });
    // A pure reorder is not worth a line in anybody's feed.
    const meaningful = Object.keys(dto).some(k => k !== 'sequence');
    if (meaningful) {
      await this.events.emit({
        action: EVENTS.TASKGROUP_UPDATED,
        entityType: 'TASK_GROUP',
        entityId: id,
        metadata: { projectId, name: updated.name, ...(dto.name && dto.name !== existing.name ? { previousName: existing.name } : {}) },
      });
    }
    return this.find(projectId, id);
  }

  /** CLIENTS-FLOW: mark a group complete — only when nothing in it is still open. */
  async complete(projectId: string, id: string) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    const group = await this.find(projectId, id);
    if (group.status === 'COMPLETED') return group;
    if (group._count.projectTasks === 0) {
      throw new BadRequestException('This group has no tasks yet — there is nothing to complete.');
    }
    const open = await this.openTasksIn(projectId, id);
    if (open > 0) {
      throw new BadRequestException(open === 1
        ? 'One task in this group is still open. Finish it or move it to another group first.'
        : `${open} tasks in this group are still open. Finish them or move them to another group first.`);
    }
    // Conditional on still being ACTIVE, so two clicks at once complete it once.
    await this.prisma.taskList.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'COMPLETED', completedAt: new Date() } });
    await this.events.emit({
      action: EVENTS.TASKGROUP_COMPLETED,
      entityType: 'TASK_GROUP',
      entityId: id,
      metadata: { projectId, name: group.name, taskCount: group._count.projectTasks },
    });
    return this.find(projectId, id);
  }

  /** CLIENTS-FLOW: re-open a completed group so work can be added to it again. */
  async reopen(projectId: string, id: string) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    const group = await this.find(projectId, id);
    if (group.status !== 'COMPLETED') return group;
    await this.prisma.taskList.updateMany({ where: { id, status: 'COMPLETED' }, data: { status: 'ACTIVE', completedAt: null } });
    await this.events.emit({
      action: EVENTS.TASKGROUP_REOPENED,
      entityType: 'TASK_GROUP',
      entityId: id,
      metadata: { projectId, name: group.name },
    });
    return this.find(projectId, id);
  }

  async remove(projectId: string, id: string) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    const list = await this.find(projectId, id);
    if (list.isDefault) {
      throw new BadRequestException(`"${list.name}" is this client's default group and cannot be deleted — rename it instead.`);
    }
    // L2: move this list's tasks onto the default list instead of orphaning the
    // ProjectTask join rows (which pointed at a now-soft-deleted list).
    const def = await this.prisma.taskList.findFirst({ where: { projectId, isDefault: true, deletedAt: null } });
    const moving = list._count.projectTasks;
    // CLIENTS-FLOW: if open work is about to land in a COMPLETED default group, that group is not
    // complete any more — re-open it in the same transaction, so the rule never breaks for an instant.
    const reopenDefault = !!def && def.status === 'COMPLETED' && list.openTaskCount > 0;
    const [, updated] = await this.prisma.$transaction([
      this.prisma.projectTask.updateMany({ where: { taskListId: id }, data: { taskListId: def?.id ?? null } }),
      this.prisma.taskList.update({ where: { id }, data: { deletedAt: new Date() } }),
      ...(reopenDefault ? [this.prisma.taskList.update({ where: { id: def!.id }, data: { status: 'ACTIVE', completedAt: null } })] : []),
    ]);
    await this.events.emit({
      action: EVENTS.TASKGROUP_DELETED,
      entityType: 'TASK_GROUP',
      entityId: id,
      metadata: { projectId, name: list.name, movedTasks: moving, movedTo: def?.name ?? null },
    });
    return { ...updated, movedTasks: moving, movedTo: def ? { id: def.id, name: def.name } : null };
  }
}

@Controller('projects/:projectId/tasklists')
class TaskListsController {
  constructor(private readonly service: TaskListsService) {}

  @Post() @RequirePermission('tasklist.create')
  create(@Param('projectId') projectId: string, @Body() dto: CreateTaskListDto) {
    return this.service.create(projectId, dto);
  }

  // The reads carry `tasklist.view` like every other read in the catalog. PermissionGuard is
  // opt-in — a route with no decorator is a route with no RBAC at all — so leaving these bare
  // meant HR, who holds no tasklist permission of any kind, was answered 200. The decorator says
  // WHAT you may do; the service's project wall says WHICH matters you may do it to, and both
  // have to be there.
  @Get() @RequirePermission('tasklist.view')
  list(@Param('projectId') projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':id') @RequirePermission('tasklist.view')
  get(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.get(projectId, id);
  }

  @Patch(':id') @RequirePermission('tasklist.update')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateTaskListDto) {
    return this.service.update(projectId, id, dto);
  }

  @Post(':id/complete') @RequirePermission('tasklist.update')
  complete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.complete(projectId, id);
  }

  @Post(':id/reopen') @RequirePermission('tasklist.update')
  reopen(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.reopen(projectId, id);
  }

  @Delete(':id') @RequirePermission('tasklist.delete')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.remove(projectId, id);
  }
}

@Module({
  imports: [ProjectsModule, TasksModule],
  controllers: [TaskListsController],
  providers: [TaskListsService],
  exports: [TaskListsService],
})
export class TaskListsModule {}
