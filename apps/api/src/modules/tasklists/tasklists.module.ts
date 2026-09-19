import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { getActorId } from '../../common/context/request-context';
import { RequireFlow } from '../../common/decorators/require-flow.decorator';
import { validateBody } from '../../common/validation/flow-body';
import { WorkspaceFlowService } from '../workspace-flow/workspace-flow.service';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import {
  ClientsTaskListsService,
  CreateTaskListDto as CreateTaskGroupDto,
  UpdateTaskListDto as UpdateTaskGroupDto,
} from './tasklists.clients';

class CreateTaskListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

}

class UpdateTaskListDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;


  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

/**
 * PROJECTS flow — production's task lists (bb5728b). The CLIENTS flow's task groups, which carry a
 * type, a domain, dates and a status, are ClientsTaskListsService (tasklists.clients.ts).
 *
 * A PROJECT's task lists (the board's groups). Team-space columns are also TaskList rows, but
 * they are reached through /teams/:id/lists in the Teams module — nothing here touches them.
 *
 * Every method walls on ProjectAccessService first. A task list names the shape of a matter —
 * "Claim chart round 2", "Opposition response" — and its counts say how much of it is left, so
 * reading one is reading the matter. The delivery domain already refuses a non-member on
 * /projects/:id, /tasks, /comments, /timesheets and /projects/:id/documents; these routes went
 * straight to Prisma on a bare projectId, so the same person got 403 on the project and 200 on
 * its board, and a Consultant could file a list into a matter they had never been staffed on.
 * Same service, same wording as its neighbours, so the wall reads as one wall.
 */
@Injectable()
export class TaskListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async create(projectId: string, dto: CreateTaskListDto) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const count = await this.prisma.taskList.count({ where: { projectId, deletedAt: null } });
    return this.prisma.taskList.create({
      data: {
        projectId,
        name: dto.name,
        sequence: count,
      },
    });
  }

  async list(projectId: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    return this.prisma.taskList.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { sequence: 'asc' },
      include: { _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } } },
    });
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
    return list;
  }

  async update(projectId: string, id: string, dto: UpdateTaskListDto) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    await this.find(projectId, id);
    // The DEFAULT group may be renamed. "General" is a placeholder nobody chose, and on a project
    // running several pieces of work it has to be able to say what it actually is ("Prior-art
    // search", "Round 2"). What must not change is its ROLE: isDefault is untouched here, so it
    // remains the fallback new tasks land in — which is what actually needs protecting, not its
    // name. Deleting it is still refused (see remove).
    return this.prisma.taskList.update({
      where: { id },
      data: { name: dto.name, sequence: dto.sequence },
    });
  }

  async remove(projectId: string, id: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const list = await this.find(projectId, id);
    if (list.isDefault) {
      throw new BadRequestException('The default "General" task list cannot be deleted.');
    }
    // L2: move this list's tasks onto the default list instead of orphaning the
    // ProjectTask join rows (which pointed at a now-soft-deleted list).
    const def = await this.prisma.taskList.findFirst({ where: { projectId, isDefault: true, deletedAt: null } });
    const [, updated] = await this.prisma.$transaction([
      this.prisma.projectTask.updateMany({ where: { taskListId: id }, data: { taskListId: def?.id ?? null } }),
      this.prisma.taskList.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    return updated;
  }
}

/**
 * One set of routes, two flows. A task list is a name and an order in PROJECTS and a task group in
 * CLIENTS, so create and update validate the body against the caller's flow's DTO (with the global
 * pipe's options), and complete / reopen exist in CLIENTS only.
 */
@Controller('projects/:projectId/tasklists')
class TaskListsController {
  constructor(
    private readonly service: TaskListsService,
    private readonly groups: ClientsTaskListsService,
    private readonly flows: WorkspaceFlowService,
  ) {}

  @Post() @RequirePermission('tasklist.create')
  async create(@Param('projectId') projectId: string, @Body() body: unknown) {
    if (await this.flows.currentIsClients()) {
      return this.groups.create(projectId, await validateBody(CreateTaskGroupDto, body));
    }
    return this.service.create(projectId, await validateBody(CreateTaskListDto, body));
  }

  // The reads carry `tasklist.view` like every other read in the catalog. PermissionGuard is
  // opt-in — a route with no decorator is a route with no RBAC at all — so leaving these bare
  // meant HR, who holds no tasklist permission of any kind, was answered 200. The decorator says
  // WHAT you may do; the service's project wall says WHICH matters you may do it to, and both
  // have to be there.
  @Get() @RequirePermission('tasklist.view')
  async list(@Param('projectId') projectId: string) {
    return (await this.flows.currentIsClients()) ? this.groups.list(projectId) : this.service.list(projectId);
  }

  @Get(':id') @RequirePermission('tasklist.view')
  async get(@Param('projectId') projectId: string, @Param('id') id: string) {
    return (await this.flows.currentIsClients()) ? this.groups.get(projectId, id) : this.service.get(projectId, id);
  }

  @Patch(':id') @RequirePermission('tasklist.update')
  async update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: unknown) {
    if (await this.flows.currentIsClients()) {
      return this.groups.update(projectId, id, await validateBody(UpdateTaskGroupDto, body));
    }
    return this.service.update(projectId, id, await validateBody(UpdateTaskListDto, body));
  }

  /** CLIENTS: mark a task group complete — only when nothing in it is still open. */
  @Post(':id/complete') @RequireFlow('CLIENTS') @RequirePermission('tasklist.update')
  complete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.groups.complete(projectId, id);
  }

  /** CLIENTS: re-open a completed task group. */
  @Post(':id/reopen') @RequireFlow('CLIENTS') @RequirePermission('tasklist.update')
  reopen(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.groups.reopen(projectId, id);
  }

  @Delete(':id') @RequirePermission('tasklist.delete')
  async remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return (await this.flows.currentIsClients()) ? this.groups.remove(projectId, id) : this.service.remove(projectId, id);
  }
}

@Module({
  imports: [ProjectsModule, TasksModule],
  controllers: [TaskListsController],
  providers: [TaskListsService, ClientsTaskListsService],
  exports: [TaskListsService, ClientsTaskListsService],
})
export class TaskListsModule {}
