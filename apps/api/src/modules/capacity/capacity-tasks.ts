/**
 * Task CRUD from the Team Capacity board — behind capacity.manage.
 *
 * Owner, Sep 2026: "I want the power to do CRUD operations on tasks from the Team Capacity module
 * and directly assign them to anyone anytime", for Senior Consultant and above. So these routes
 * let a capacity manager create a task with its people in one go, edit it, restaff it and delete
 * it — for any client in the organisation and any active person in it, adding that person to the
 * client if they are not on it yet.
 *
 * Nothing here decides a business rule. Every write goes through TasksService — the same create,
 * staffing, edit, move and delete the rest of the app uses — with one explicit option,
 * `oversight: true`: the capacity manager counts as overseeing every client of their own
 * organisation, which is what capacity.manage means. It widens WHICH clients they may act on; it
 * changes nothing about what may be done (a task still cannot be due after its group, a completed
 * group or client still takes no work, a task still has at most one PM, …) and never crosses the
 * tenant boundary.
 */
import {
  Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Put,
} from '@nestjs/common';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { TasksService, type SeatInput, type StaffingOpts } from '../tasks/tasks.service';
import { TASK_ASSIGNEE_ROLES, TASK_PRIORITIES } from '../tasks/dto';

/** The capacity manager's standing on every task route below. */
const AS_CAPACITY_MANAGER: StaffingOpts = { oversight: true, activeOrgUsersOnly: true };

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CapacitySeatDto {
  @IsString() @MaxLength(40)
  userId!: string;

  /** PM, REVIEWER or ANALYST; an analyst when not said. */
  @IsOptional() @IsIn(TASK_ASSIGNEE_ROLES)
  role?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  estimatedHours?: number;

  @IsOptional() @IsDateString() @Transform(emptyToNull)
  startDate?: string | null;

  @IsOptional() @IsDateString() @Transform(emptyToNull)
  dueDate?: string | null;

  @IsOptional() @IsNumber() @Min(0) @Max(24)
  hoursPerDay?: number | null;
}

export class CapacityCreateTaskDto {
  @IsString() @MaxLength(40)
  projectId!: string;

  /** The task group inside the client; the client's default group when left out. */
  @IsOptional() @IsString() @MaxLength(40)
  taskListId?: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsIn(TASK_PRIORITIES)
  priority?: string;

  @IsOptional() @IsDateString() @Transform(emptyToNull)
  startDate?: string | null;

  @IsOptional() @IsDateString() @Transform(emptyToNull)
  dueDate?: string | null;

  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CapacitySeatDto)
  seats!: CapacitySeatDto[];
}

export class CapacityUpdateTaskDto {
  @IsOptional() @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsIn(TASK_PRIORITIES)
  priority?: string;

  // `null` (or an emptied field) CLEARS the date; leaving the field out leaves it alone.
  @IsOptional() @IsDateString() @Transform(emptyToNull)
  startDate?: string | null;

  @IsOptional() @IsDateString() @Transform(emptyToNull)
  dueDate?: string | null;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  estimatedHours?: number;

  /** Move the task to another task group of the same client, in the same save. */
  @IsOptional() @IsString() @MaxLength(40)
  taskListId?: string;
}

export class CapacitySeatsDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CapacitySeatDto)
  seats!: CapacitySeatDto[];
}

const toSeats = (seats: CapacitySeatDto[]): SeatInput[] =>
  seats.map(s => ({ ...s, role: s.role ?? 'ANALYST' }));

/**
 * What the board's task editor chooses from: every client of the organisation that can still take
 * work, with its task groups, and every active person. One read, scoped to the caller's
 * organisation from the session — never from the request.
 */
@Injectable()
export class CapacityTaskOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async options(organizationId: string) {
    const [clients, people] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          deletedAt: null,
          closedAt: null,
          projectPhase: { notIn: ['COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED'] },
          members: { some: { user: { organizationId } } },
        },
        orderBy: { title: 'asc' },
        select: {
          id: true, title: true, code: true, roundSeq: true, projectPhase: true,
          // The team's deadline only. The date promised to the client (clientDueDate) is restricted
          // and has no business in a picker.
          taskLists: {
            where: { deletedAt: null },
            orderBy: { sequence: 'asc' },
            select: { id: true, name: true, isDefault: true, status: true, sequence: true, startDate: true, dueDate: true },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { organizationId, deletedAt: null, status: 'ACTIVE' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, designation: true, profilePhoto: true },
      }),
    ]);
    return { clients, people };
  }

  /** A live client of this organisation, or a 404. */
  async assertClientInOrg(projectId: string, organizationId: string) {
    const client = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null, members: { some: { user: { organizationId } } } },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found.');
  }
}

@Controller('capacity/tasks')
export class CapacityTasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly options: CapacityTaskOptionsService,
    private readonly actor: ActorContextService,
  ) {}

  /** Clients (with their task groups) and people the editor offers. Declared before `:id`. */
  @Get('options')
  @RequirePermission('capacity.manage')
  async assignOptions() {
    return this.options.options(await this.actor.requireOrgId());
  }

  /** One task, as the editor needs it: its fields, its seats and where it sits. */
  @Get(':id')
  @RequirePermission('capacity.manage')
  get(@Param('id') id: string) {
    return this.tasks.get(id, AS_CAPACITY_MANAGER);
  }

  /** Create a task and its seats — all of it, or none of it. */
  @Post()
  @RequirePermission('capacity.manage')
  async create(@Body() dto: CapacityCreateTaskDto) {
    const organizationId = await this.actor.requireOrgId();
    // The client must belong to the caller's organisation. The access check below already
    // refuses another tenant's client when it can tell whose it is; this makes "cannot tell" a
    // 404 too, rather than a client nobody is on being writable from any organisation.
    await this.options.assertClientInOrg(dto.projectId, organizationId);
    return this.tasks.createWithSeats({ ...dto, seats: toSeats(dto.seats) }, AS_CAPACITY_MANAGER);
  }

  /** Edit the task's own fields, and optionally move it to another group of the same client. */
  @Patch(':id')
  @RequirePermission('capacity.manage')
  update(@Param('id') id: string, @Body() dto: CapacityUpdateTaskDto) {
    const { taskListId, ...fields } = dto;
    return this.tasks.update(id, fields, { ...AS_CAPACITY_MANAGER, moveToTaskListId: taskListId });
  }

  /** Replace the task's seats: assign, unassign, reassign, hours, start, deadline, hours a day. */
  @Put(':id/seats')
  @RequirePermission('capacity.manage')
  setSeats(@Param('id') id: string, @Body() dto: CapacitySeatsDto) {
    return this.tasks.setStaffing(id, { assignees: toSeats(dto.seats) }, AS_CAPACITY_MANAGER);
  }

  /** The ordinary soft delete. */
  @Delete(':id')
  @RequirePermission('capacity.manage')
  remove(@Param('id') id: string) {
    return this.tasks.softDelete(id, AS_CAPACITY_MANAGER);
  }
}
