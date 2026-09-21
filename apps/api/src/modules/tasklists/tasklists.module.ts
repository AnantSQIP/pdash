import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { getActorId } from '../../common/context/request-context';
import { ActorContextService } from '../../common/context/actor-context.service';
import { RequireFlow } from '../../common/decorators/require-flow.decorator';
import { validateBody } from '../../common/validation/flow-body';
import { WorkspaceFlowService } from '../workspace-flow/workspace-flow.service';
import { projectInFlow } from '../../common/flow-scope';
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

  /**
   * Every route above reaches this service only when the caller's flow is NOT clients — the
   * controller sends the CLIENTS flow to ClientsTaskListsService instead, and nothing else in the
   * API calls it — so the flow is a constant here rather than a lookup, and the reads say so.
   */
  private static readonly FLOW = 'PROJECTS' as const;

  async create(projectId: string, dto: CreateTaskListDto) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null, ...projectInFlow(TaskListsService.FLOW) },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const count = await this.prisma.taskList.count({
      // The sequence a new list takes is a count of its neighbours, so it has to count the same
      // rows the board will show.
      where: { projectId, deletedAt: null, project: projectInFlow(TaskListsService.FLOW) },
    });
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
      // A list is a LIST: no assert stands between the id in the URL and these rows, so it names
      // the flow it means itself.
      where: { projectId, deletedAt: null, project: projectInFlow(TaskListsService.FLOW) },
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
      // This is the lookup every mutation below goes through, so the flow belongs here: a rename
      // or a delete aimed at the other flow's list finds nothing rather than finding it.
      where: { id, projectId, deletedAt: null, project: projectInFlow(TaskListsService.FLOW) },
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
    // The tasks being rehomed are this flow's, so the list they land on must be too — otherwise a
    // delete here would quietly file them into the other flow's default group.
    const def = await this.prisma.taskList.findFirst({
      where: { projectId, isDefault: true, deletedAt: null, project: projectInFlow(TaskListsService.FLOW) },
    });
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

/** A query string carries text: "true" and "1" mean yes, anything else means no. */
const isTrue = (v?: string) => v === 'true' || v === '1';
/** A query string is whatever was typed into the URL — trimmed, capped, and empty means absent. */
const str = (v?: string, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const toInt = (v?: string) => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : undefined; };

/**
 * CLIENTS FLOW ONLY: task groups across every client the reader may see.
 *
 * Its own controller rather than one more route under /projects/:projectId, because this list is
 * not about one client: hanging it off a project path would have meant a projectId that means
 * nothing and a wall that LOOKS checked without being. The permission is the same `tasklist.view`
 * the per-client reads carry — this is the same data, asked a different way — and the scope is
 * the clients list's own fragment, so what a person can reach here and what they can reach on
 * /projects cannot drift apart.
 *
 * A task group is a CLIENTS idea: it carries a kind of work, a field, dates and a status, and it
 * is searched by all of them. The PROJECTS flow has task lists — a name and an order inside one
 * matter — so there is nothing here for it to search, and the whole controller answers 404 there
 * (docs/WORKSPACE_FLOWS.md).
 */
@Controller('task-groups')
@RequireFlow('CLIENTS')
class TaskGroupSearchController {
  constructor(
    private readonly groups: ClientsTaskListsService,
    private readonly actor: ActorContextService,
  ) {}

  /** The organisation comes from the SESSION, never a query param — the rule /projects keeps. */
  @Get() @RequirePermission('tasklist.view')
  async search(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('groupType') groupType?: string,
    @Query('technologyDomain') technologyDomain?: string,
    @Query('clientId') clientId?: string,
    @Query('overdue') overdue?: string,
    @Query('mine') mine?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.groups.search(await this.actor.requireOrgId(), {
      search: str(search, 120),
      status: str(status, 16),
      groupType: str(groupType),
      technologyDomain: str(technologyDomain),
      clientId: str(clientId, 40),
      overdue: isTrue(overdue),
      mine: isTrue(mine),
      limit: toInt(limit),
      offset: toInt(offset),
    });
  }
}

@Module({
  imports: [ProjectsModule, TasksModule],
  controllers: [TaskListsController, TaskGroupSearchController],
  providers: [TaskListsService, ClientsTaskListsService],
  exports: [TaskListsService, ClientsTaskListsService],
})
export class TaskListsModule {}
