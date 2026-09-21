/**
 * Start a whole piece of client work from the Team Capacity board — behind capacity.manage.
 *
 * Owner, Sep 2026: "in the team capacity option there is an option to create a new task; I want
 * the option to create a new client and its task groups and tasks, and then assigning the tasks to
 * the team, also the working hours of the team — like the whole team per task — and other stuff
 * must not collide, everything should be well structured."
 *
 * The board could already create ONE task on an EXISTING client. This is the other half: a client
 * that does not exist yet, its task groups, the tasks inside them and who does each one for how
 * many hours from when — settled in a single call.
 *
 * ── All of it, or none of it ────────────────────────────────────────────────────────────────
 *
 * A client is expensive to half-make: it takes a CID out of the organisation's series for the
 * year, and a CID is never re-used. So a refused seat on the seventh task must not leave a client
 * behind holding a number nobody asked for.
 *
 * Prisma's interactive transactions do not nest, so "create the client, then write its work" —
 * two calls, two transactions — was never an option. ClientsProjectsService.createWithin() opens the one
 * transaction and hands it back: the client, its CID, its ledger row, its members, its task groups,
 * their tasks and every seat are written on the same `tx`, and anything thrown in here rolls all of
 * it back together.
 *
 * ── Nothing is decided here ─────────────────────────────────────────────────────────────────
 *
 * Not one business rule lives in this file. The client is ClientsProjectsService's to create (the CID, the
 * manager's authority, the client-deadline permission); a task group is prepareTaskGroup() +
 * createTaskGroupTx() (its type, its standard tasks, its domain, its dates); a task and its seats
 * are TasksService's (a task never due after its group, at most one PM, one seat per person per
 * role, a seat that does not start after it is due, people who are not on the client added to it).
 * What is here is the ORDER those are done in, and the single transaction they are done inside.
 *
 * ── Collisions ──────────────────────────────────────────────────────────────────────────────
 *
 * The screen asks POST /capacity/availability/preview as the hours and dates are chosen — the same
 * AvailabilityService every other assignment dialog asks — so a person's whole week, across every
 * client, is on screen before anything is saved, and an overload has to be ticked through. That is
 * a warning, deliberately, not a refusal: see the note on previewAssignment(). The server's job is
 * to make the hours real, and it does that by writing exactly the seats the preview was given.
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Injectable, Post,
} from '@nestjs/common';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString,
  MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ClientsProjectsService } from '../projects/projects.clients.service';
import { TasksService, type SeatInput } from '../tasks/tasks.service';
import { PermissionService } from '../permissions/permission.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequireFlow } from '../../common/decorators/require-flow.decorator';
// The CLIENTS flow's own definitions: a client, its task groups and their fields. The PROJECTS
// flow's are ../projects/dto.ts, and nothing here is reachable from that flow.
import { CustomDomainDto, CustomTypeDto, OFFICES, PROJECT_PRIORITIES, type CreateProjectDto } from '../projects/dto.clients';
import { TASK_PRIORITIES } from '../tasks/dto';
import { CapacitySeatDto } from './capacity-tasks';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** One task inside a new client's task group, with the people on it. */
export class CapacityNewTaskDto {
  @IsString() @Transform(trimmed) @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsIn(TASK_PRIORITIES)
  priority?: string;

  /** Left out, the task takes its group's start. */
  @IsOptional() @IsDateString() @Transform(emptyToNull)
  startDate?: string | null;

  /** Left out, the task takes its group's deadline — which it may never fall after. */
  @IsOptional() @IsDateString() @Transform(emptyToNull)
  dueDate?: string | null;

  /** The whole team may be on one task: a seat each, with its own hours, start and hours a day. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CapacitySeatDto)
  seats?: CapacitySeatDto[];
}

/**
 * One piece of work for the new client. The same questions "add a task group" asks — what kind of
 * work, in what field, by when — because that is where those answers live; with its TASKS instead
 * of the one blanket assignee that dialog offers, since the board is staffing them individually.
 */
export class CapacityNewGroupDto {
  @IsString() @Transform(trimmed) @MinLength(1) @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  /** A project-type value (built-in or saved by the org). */
  @IsOptional() @IsString() @MaxLength(60)
  groupType?: string;

  @IsOptional() @ValidateNested() @Type(() => CustomTypeDto)
  customType?: CustomTypeDto;

  @IsOptional() @IsString() @MaxLength(60)
  technologyDomain?: string;

  @IsOptional() @ValidateNested() @Type(() => CustomDomainDto)
  customDomain?: CustomDomainDto;

  @IsOptional() @IsDateString() @Transform(emptyToNull)
  startDate?: string | null;

  @IsOptional() @IsDateString() @Transform(emptyToNull)
  dueDate?: string | null;

  /** The date promised to the client. Restricted — deadline.view.client, checked server-side. */
  @IsOptional() @IsDateString() @Transform(emptyToNull)
  clientDueDate?: string | null;

  /**
   * The group's tasks. Sent, they ARE the group's tasks and its type's standard ones are not
   * seeded underneath them — the dialog starts from those titles, so seeding them again would
   * create every one twice. Left empty, a typed group still arrives with its standard tasks.
   */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CapacityNewTaskDto)
  tasks?: CapacityNewTaskDto[];
}

/** A whole piece of client work, as the board's dialog has it when "Create" is pressed. */
export class CapacityNewClientDto {
  @IsString() @Transform(trimmed) @MinLength(1) @MaxLength(100)
  title!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  /** File the client under a client group. */
  @IsOptional() @IsString() @MaxLength(40)
  clientGroupId?: string;

  /** Who runs it. Blank means the person creating it. */
  @IsOptional() @IsString() @MaxLength(40)
  managerId?: string;

  @IsOptional() @IsIn(PROJECT_PRIORITIES)
  priority?: string;

  @IsOptional() @IsIn(OFFICES)
  office?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CapacityNewGroupDto)
  groups!: CapacityNewGroupDto[];
}

/** A task group and its tasks, resolved and refused-if-wrong before the transaction opens. */
type PlannedGroup = {
  group: Awaited<ReturnType<ClientsProjectsService['prepareTaskGroup']>>;
  tasks: {
    title: string; description?: string; priority?: string;
    startDate: Date | null; dueDate: Date | null; seats: SeatInput[];
  }[];
};

const toSeats = (seats: CapacitySeatDto[] | undefined): SeatInput[] =>
  (seats ?? []).filter(s => s.userId?.trim()).map(s => ({ ...s, role: s.role ?? 'ANALYST' }));

@Injectable()
export class CapacityClientSetupService {
  constructor(
    private readonly projects: ClientsProjectsService,
    private readonly tasks: TasksService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly deadlines: DeadlineVisibilityService,
    private readonly actor: ActorContextService,
  ) {}

  async createClientWithWork(dto: CapacityNewClientDto) {
    const actorId = this.actor.requireActorId();
    const organizationId = await this.actor.requireOrgId();

    // TWO rights, and the route can only carry one. capacity.manage — the board — is the guard on
    // it; starting a CLIENT is project.create, and holding the first has never implied the second.
    // Checked here so the API says the same thing the screen does rather than only the screen.
    if (!(await this.permissions.check(actorId, 'project.create'))) {
      throw new ForbiddenException('You can plan the work, but starting a new client needs the right to create one.');
    }

    // ── 1. Everything that can be refused, refused before a CID is taken out ──────────────
    const scope = await this.deadlines.scope(actorId);
    const planned: PlannedGroup[] = [];
    for (const spec of dto.groups) {
      const group = await this.projects.prepareTaskGroup(organizationId, actorId, spec);
      // A brand-new client has no manager relationship yet, so only the global permission
      // qualifies — the same rule a client's own client date has always had.
      if (group.clientDueDate) await this.deadlines.assertMaySetClientDue([], scope);

      const tasks = (spec.tasks ?? []).map(t => {
        const startDate = t.startDate ? new Date(t.startDate) : group.startDate;
        // With no date of its own a task takes its group's, exactly as it does everywhere else —
        // and a template task seeded into the same group already does.
        const dueDate = t.dueDate ? new Date(t.dueDate) : group.dueDate;
        const seats = toSeats(t.seats);
        // The task's rules and its seats' rules, asked of a group that does not exist yet.
        this.tasks.assertTaskAndSeats({ group, startDate, dueDate, seats });
        return { title: t.title.trim(), description: t.description, priority: t.priority, startDate, dueDate, seats };
      });
      planned.push({ group, tasks });
    }

    const everyone = [...new Set(planned.flatMap(p => p.tasks.flatMap(t => t.seats.map(s => s.userId))))];
    // The board offers everyone in the organisation, not a client's members — so every name is
    // checked to be a real, active person of it, as the board's own create does.
    if (everyone.length) await this.tasks.assertStaffable(everyone);

    const workflowId = await this.tasks.globalWorkflowId();

    // ── 2. One transaction: the client, its CID, its groups, their tasks and every seat ───
    const projectDto: CreateProjectDto = {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      office: dto.office,
      clientGroupId: dto.clientGroupId,
      managerId: dto.managerId,
    } as CreateProjectDto;

    const created = await this.projects.createWithin(projectDto, async (tx, client, ctx) => {
      // Seats for people who are not on the client put them on it — the board's standing rule.
      // For a client this new, "who is already on it" is exactly its manager and its creator.
      const outsiders = everyone.filter(id => !ctx.memberIds.includes(id));
      await this.tasks.addMembersForWorkTx(tx, { primary: client.id, outsiders });

      const groups: { id: string; name: string; groupType: string | null; taskIds: string[]; standardTaskIds: string[] }[] = [];
      const written: { taskId: string; title: string; people: string[]; seats: SeatInput[] }[] = [];
      for (let i = 0; i < planned.length; i++) {
        const { group, tasks } = planned[i];
        const { list, taskIds } = await this.projects.createTaskGroupTx(tx, {
          projectId: client.id,
          actorId: ctx.creatorId,
          // The first piece of work is the client's default group: later tasks made from the
          // board with no group named land there rather than in an empty "General".
          isDefault: i === 0,
          sequence: i,
          // See CapacityNewGroupDto.tasks — explicit tasks replace the type's standard ones.
          group: tasks.length ? { ...group, titles: [] } : group,
        });
        const mine: string[] = [];
        for (let j = 0; j < tasks.length; j++) {
          const t = tasks[j];
          const taskId = await this.tasks.writeTaskWithSeatsTx(tx, {
            projectId: client.id, taskListId: list.id, sequence: taskIds.length + j,
            title: t.title, description: t.description, priority: t.priority,
            startDate: t.startDate, dueDate: t.dueDate, seats: t.seats,
            actorId: ctx.creatorId, workflowId,
          });
          mine.push(taskId);
          written.push({ taskId, title: t.title, people: [...new Set(t.seats.map(s => s.userId))], seats: t.seats });
        }
        groups.push({ id: list.id, name: list.name, groupType: list.groupType, taskIds: mine, standardTaskIds: taskIds });
      }
      return { groups, written, outsiders };
    }, { ownTaskGroups: true });

    // ── 3. Everything that is SAID, once it has committed ─────────────────────────────────
    // Nothing below can undo the work, so none of it runs before the work is real. The audit
    // trail and the notices are TasksService's own — a task staffed from here tells the people
    // on it exactly what a task staffed from the board's task editor tells them.
    const { groups, written, outsiders } = created.extra;
    await this.tasks.announceMembersAdded({ primary: created.projectId, outsiders });
    // Each piece of work in the client's own activity feed, in the words "add a task group" uses —
    // a client that arrives with four of them should read as four things done, not one.
    for (const g of groups) {
      await this.events.emit({
        action: EVENTS.TASKGROUP_CREATED,
        entityType: 'TASK_GROUP',
        entityId: g.id,
        metadata: {
          projectId: created.projectId, name: g.name, groupType: g.groupType,
          taskCount: g.taskIds.length + g.standardTaskIds.length, via: 'capacity',
        },
      });
    }
    const warnings: string[] = [];
    for (const t of written) {
      await this.tasks.announceTaskCreated({ taskId: t.taskId, projectId: created.projectId, title: t.title, people: t.people });
      warnings.push(...await this.tasks.scheduleWarnings(t.taskId, t.seats));
    }
    await this.tasks.recomputeProgressFor(created.projectId);

    return {
      client: created.project,
      groups: groups.map(g => ({ id: g.id, name: g.name, taskCount: g.taskIds.length + g.standardTaskIds.length })),
      taskCount: written.length + groups.reduce((n, g) => n + g.standardTaskIds.length, 0),
      staffedTaskCount: written.filter(t => t.people.length).length,
      people: [...new Set(written.flatMap(t => t.people))],
      addedToClient: outsiders,
      scheduleWarnings: [...new Set(warnings)],
    };
  }
}

/**
 * CLIENTS flow only (docs/WORKSPACE_FLOWS.md). A client, its client group, its task groups and its
 * CID are CLIENTS ideas; the PROJECTS board has no task CRUD at all, so it does not offer this and
 * the route answers 404 there.
 */
@Controller('capacity/clients')
@RequireFlow('CLIENTS')
export class CapacityClientSetupController {
  constructor(private readonly setup: CapacityClientSetupService) {}

  /**
   * A whole piece of client work in one call: the client, its task groups, their tasks and the
   * people on them. All of it lands, or none of it does.
   *
   * capacity.manage is the board's own right (Senior Consultant and above; HR may look at the
   * board and change nothing on it). project.create is checked inside — see the service.
   */
  @Post()
  @RequirePermission('capacity.manage')
  async create(@Body() dto: CapacityNewClientDto) {
    if (!dto.groups?.length) {
      throw new BadRequestException('A new client starts with at least one piece of work — add a task group.');
    }
    return this.setup.createClientWithWork(dto);
  }
}
