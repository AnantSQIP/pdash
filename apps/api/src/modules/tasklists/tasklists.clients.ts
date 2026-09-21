/**
 * The CLIENTS flow's task lists — TASK GROUPS: one piece of work for a client, with its kind, its
 * field, its dates and a status (docs/CLIENTS_FLOW.md). The PROJECTS flow's task lists are
 * production's (tasklists.module.ts): a name and an order, nothing else. The controller in
 * tasklists.module.ts dispatches on the organisation's workspace flow.
 */
import { ForbiddenException, Injectable } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { getActorId } from '../../common/context/request-context';
import { PermissionService } from '../permissions/permission.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { OPEN_TASK_WHERE } from '../../common/task-state';
import { projectInFlow } from '../../common/flow-scope';
import { startOfIstDay, startOfUtcDay } from '../../common/dates';
import { DeadlineVisibilityService, type DeadlineScope } from '../deadlines/deadline-visibility.service';
import { DeadlineChangeService } from '../deadlines/deadline-change.service';
import { ClientsProjectsService } from '../projects/projects.clients.service';
import { TasksService } from '../tasks/tasks.service';
import { CustomDomainDto, TaskGroupSpecDto } from '../projects/dto.clients';
import { PROJECT_TYPES } from '../projects/project-templates';
import { TECHNOLOGY_DOMAINS } from '../projects/technology-domains';

/** POST body: exactly the shape a client's first task group takes — one definition, two doors. */
export class CreateTaskListDto extends TaskGroupSpecDto {}

export class UpdateTaskListDto {
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

  /** The date promised to the client. Restricted; never before the team's deadline. */
  @IsOptional() @IsDateString() @Transform(({ value }) => (value === '' ? null : value))
  clientDueDate?: string | null;
}

const sameDay = (a?: Date | null, b?: Date | null) =>
  !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/**
 * One page of the CROSS-CLIENT task-group list: a sane default, and a ceiling nobody can raise
 * from a query string. A firm's whole body of work is a real number of rows, and the Clients
 * module asks for this list on every keystroke.
 */
const SEARCH_PAGE = 50;
const SEARCH_PAGE_MAX = 200;
/** Enough words for a real phrase. Past that somebody is pasting, not searching. */
const MAX_SEARCH_TOKENS = 6;
/** How many matching tasks are read to explain a page of matches, and named on one row. */
const MATCHED_TASK_CAP = 400;
const MATCHED_TASKS_SHOWN = 3;

/** What the cross-client task-group list accepts. Everything is optional; nothing widens scope. */
export type TaskGroupQuery = {
  search?: string;
  /** ACTIVE (default), COMPLETED or ALL. */
  status?: string;
  groupType?: string;
  technologyDomain?: string;
  /** Narrow to one client. Can only ever narrow — the reader's scope is ANDed underneath. */
  clientId?: string;
  overdue?: boolean;
  mine?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * A search box's text as the words to match.
 *
 * Every word has to appear somewhere in the group, which is what makes typing more NARROW the
 * result. Matching any word instead would mean a second word widens the list, which is the
 * opposite of what a person doing it expects.
 */
function searchTokens(raw?: string): string[] {
  return (raw ?? '').toLowerCase().split(/\s+/).map(t => t.trim()).filter(Boolean).slice(0, MAX_SEARCH_TOKENS);
}

/**
 * A typed word as a LIKE pattern that means ITSELF.
 *
 * Prisma builds `contains` into `ILIKE '%' || <term> || '%'` and passes the term through
 * untouched, so `%` typed into the search box matched every group in the firm and `_` matched
 * any single character — a search that answers a question nobody asked. Postgres LIKE escapes
 * with a backslash by default, so the three pattern characters are escaped here (the backslash
 * first, or it would escape the escapes).
 */
function likeTerm(token: string): string {
  return token.replace(/\\/g, '\\\\').replace(/[%_]/g, c => `\\${c}`);
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
export class ClientsTaskListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly projects: ClientsProjectsService,
    private readonly tasks: TasksService,
    private readonly deadlines: DeadlineVisibilityService,
    private readonly deadlineChanges: DeadlineChangeService,
  ) {}

  /**
   * CLIENTS-FLOW (deadlines): the client deadline leaves the building only for someone who may see
   * it — the client-deadline permission, or managing this client. The same rule a project's own
   * client date has always had, applied to the level where the promise now lives.
   */
  private redact<T extends { clientDueDate?: Date | null }>(list: T, scope: DeadlineScope, projectId: string): T {
    if (this.deadlines.canSee(scope, [projectId])) return list;
    const { clientDueDate: _hidden, ...rest } = list;
    return rest as T;
  }

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('You must be signed in.');
    return id;
  }

  /**
   * Task groups are a CLIENTS idea and this service is only ever reached in that flow — the
   * controller sends the PROJECTS flow to TaskListsService, and /task-groups is
   * @RequireFlow('CLIENTS') — so the flow is a constant here rather than a lookup.
   */
  private static readonly FLOW = 'CLIENTS' as const;

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
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null, ...projectInFlow(ClientsTaskListsService.FLOW) },
      select: { id: true, title: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
    if (!actor) throw new ForbiddenException('You must be signed in.');

    const group = await this.projects.prepareTaskGroup(actor.organizationId, actorId, dto);
    const scope = await this.deadlines.scope(actorId);
    if (group.clientDueDate) await this.deadlines.assertMaySetClientDue([projectId], scope);

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
      // Membership of the other flow's work is never membership of this client. The client was
      // already held to this flow by assertProjectAccess above; naming the flow here keeps this
      // check honest on its own, since it is what keeps strangers off a client's matters.
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId, userId: assigneeId, isActive: true, project: projectInFlow(ClientsTaskListsService.FLOW) },
        select: { id: true },
      });
      if (!member && !(await this.access.hasOversight(actorId))) {
        throw new BadRequestException('You can only assign people who are on this client. Ask a manager to add them first.');
      }
    }

    const { list, taskIds } = await this.prisma.$transaction(async tx => {
      // The sequence a new group takes is a count of its neighbours, so it counts the rows the
      // client's board will actually show.
      const count = await tx.taskList.count({
        where: { projectId, deletedAt: null, project: projectInFlow(ClientsTaskListsService.FLOW) },
      });
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
    return { ...this.redact(await this.find(projectId, list.id), scope, projectId), createdTaskCount: taskIds.length, assigned, assignmentWarning };
  }

  /**
   * The client's task groups, in order, each with how many tasks it holds and how many are still
   * open — enough for the group headers and the client card without loading every task.
   */
  async list(projectId: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const lists = await this.prisma.taskList.findMany({
      // A list is a LIST: no assert stands between the id in the URL and these rows, so it names
      // the flow it means itself.
      where: { projectId, deletedAt: null, project: projectInFlow(ClientsTaskListsService.FLOW) },
      orderBy: { sequence: 'asc' },
      include: { _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } } },
    });
    if (!lists.length) return lists;
    const open = await this.prisma.projectTask.groupBy({
      by: ['taskListId'],
      // The counts have to be counted over the same rows the headers above were built from.
      where: {
        projectId, taskListId: { in: lists.map(l => l.id) },
        project: projectInFlow(ClientsTaskListsService.FLOW),
        task: { deletedAt: null, ...OPEN_TASK_WHERE },
      },
      _count: { _all: true },
    });
    const openBy = new Map(open.map(o => [o.taskListId, o._count._all]));
    const scope = await this.deadlines.scope();
    return lists.map(l => this.redact({ ...l, openTaskCount: openBy.get(l.id) ?? 0 }, scope, projectId));
  }

  /**
   * CLIENTS-FLOW: every task group the reader may see, ACROSS clients — the Clients module's
   * "find the piece of work, not the client" view.
   *
   * The per-client list above answers "what is in this matter". This answers the other question a
   * patent team actually asks — "where is the FTO on the wafer bonding" — when the person does not
   * remember, or was never told, which client it sits under.
   *
   * SCOPE IS THE SAME WALL AS THE CLIENTS LIST, deliberately reusing ProjectsService.list's own
   * fragment (`projectScopeWhere`): a delivery lead sees every matter in their organisation,
   * everyone else only the matters they are staffed on. A cross-client list is exactly the shape
   * that turns a per-client wall into a directory of the firm's work if it grows its own rule, so
   * it does not have one. `clientId` narrows the list; it can never widen it, because the scope is
   * ANDed underneath and an unreachable client simply matches nothing.
   *
   * The client deadline is redacted per row by the same `redact` the per-client list uses, so the
   * promise made to a client is no more readable here than it is there.
   *
   * SEARCH is case-insensitive and matches PART of a word, across the group's name and
   * description, its kind of work and the field it is in (by stored value AND by the label a
   * person reads — nobody types "SOURCE_CODE"), the client it belongs to, and the titles of the
   * tasks inside it. Several words all have to match, each anywhere: "fto wafer" finds the FTO
   * group about wafer bonding and not every FTO in the firm.
   */
  async search(organizationId: string, q: TaskGroupQuery) {
    const actorId = this.actorId();
    const scope = await this.access.projectScopeWhere(actorId, organizationId);
    // One filter for the whole search: `projectWhere` is ANDed under every query below — the page,
    // the total and the "what the filters are hiding" count — so naming the flow once here is what
    // keeps a cross-client search from becoming a directory of the other flow's work as well.
    const projectWhere = { deletedAt: null, ...scope, ...projectInFlow(ClientsTaskListsService.FLOW) } as Prisma.ProjectWhereInput;

    const status = q.status === 'COMPLETED' || q.status === 'ALL' ? q.status : 'ACTIVE';
    const limit = Math.min(Math.max(q.limit ?? SEARCH_PAGE, 1), SEARCH_PAGE_MAX);
    const offset = Math.max(q.offset ?? 0, 0);
    const tokens = searchTokens(q.search);

    // The labels a person reads live in code (built-ins) and in two per-org tables (the types and
    // domains an organisation added itself), so a token is turned into the set of VALUES whose
    // label it matches before the query — one extra round trip, and only when there is a search.
    let typeValues: string[][] = [];
    let domainValues: string[][] = [];
    if (tokens.length) {
      const [savedTypes, savedDomains] = await Promise.all([
        this.prisma.projectTemplate.findMany({ where: { organizationId, isActive: true }, select: { value: true, label: true } }),
        this.prisma.technologyDomain.findMany({ where: { organizationId, isActive: true }, select: { value: true, label: true } }),
      ]);
      const types = [...PROJECT_TYPES.map(t => ({ value: t.value, label: t.label })), ...savedTypes];
      const domains = [...TECHNOLOGY_DOMAINS.map(d => ({ value: d.value, label: d.label })), ...savedDomains];
      typeValues = tokens.map(tok => types.filter(t => t.label.toLowerCase().includes(tok)).map(t => t.value));
      domainValues = tokens.map(tok => domains.filter(d => d.label.toLowerCase().includes(tok)).map(d => d.value));
    }

    const and: Prisma.TaskListWhereInput[] = [];
    // "Overdue" means what the group header means by it: still running, past its deadline, and
    // with work left in it. A group whose tasks are all closed but which nobody pressed Complete
    // on is not what somebody filtering for overdue work is looking for.
    if (q.overdue) {
      and.push({
        status: 'ACTIVE',
        dueDate: { lt: startOfIstDay(new Date()) },
        projectTasks: { some: { task: { deletedAt: null, ...OPEN_TASK_WHERE } } },
      });
    }
    // "Assigned to me" is staffing, not membership: a group counts as mine when I am on one of
    // its tasks. Being a member of the client is what let me see it at all.
    if (q.mine) {
      and.push({ projectTasks: { some: { task: { deletedAt: null, assignees: { some: { userId: actorId } } } } } });
    }
    tokens.forEach((tok, i) => {
      const like = { contains: likeTerm(tok), mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: like },
          { description: like },
          { groupType: like },
          ...(typeValues[i]?.length ? [{ groupType: { in: typeValues[i] } }] : []),
          { technologyDomain: like },
          ...(domainValues[i]?.length ? [{ technologyDomain: { in: domainValues[i] } }] : []),
          { project: { title: like } },
          { project: { code: like } },
          { projectTasks: { some: { task: { deletedAt: null, title: like } } } },
        ],
      });
    });

    const base: Prisma.TaskListWhereInput = {
      deletedAt: null,
      // A team space's columns are TaskList rows too; they are not a client's work and are reached
      // through /teams/:id/lists. `project` alone would exclude them, but saying so is cheaper to
      // read than inferring it from a relation filter.
      projectId: q.clientId ? q.clientId : { not: null },
      project: projectWhere,
    };
    const where: Prisma.TaskListWhereInput = {
      ...base,
      ...(status !== 'ALL' ? { status } : {}),
      ...(q.groupType ? { groupType: q.groupType } : {}),
      ...(q.technologyDomain ? { technologyDomain: q.technologyDomain } : {}),
      ...(and.length ? { AND: and } : {}),
    };

    const [total, rows, inScope] = await Promise.all([
      this.prisma.taskList.count({ where }),
      this.prisma.taskList.findMany({
        where,
        // Running work first, then whatever is due soonest — the order somebody scanning for what
        // to pick up next is reading for. Undated groups fall to the end rather than the front,
        // and the id tiebreak keeps paging stable.
        orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
        select: {
          id: true, name: true, description: true, groupType: true, technologyDomain: true,
          status: true, isDefault: true, sequence: true,
          startDate: true, dueDate: true, clientDueDate: true, completedAt: true, createdAt: true,
          projectId: true,
          project: {
            select: {
              id: true, title: true, code: true, roundSeq: true, projectPhase: true,
              clientGroup: { select: { id: true, name: true } },
            },
          },
        },
      }),
      // What the filters are hiding, so an empty result can say why instead of implying the
      // reader has no work at all.
      this.prisma.taskList.count({ where: base }),
    ]);

    const ids = rows.map(r => r.id);
    const today = startOfIstDay(new Date());
    const [allTasks, openTasks, overdueTasks, matched] = ids.length ? await Promise.all([
      this.prisma.projectTask.groupBy({ by: ['taskListId'], _count: { _all: true }, where: { taskListId: { in: ids }, task: { deletedAt: null } } }),
      this.prisma.projectTask.groupBy({ by: ['taskListId'], _count: { _all: true }, where: { taskListId: { in: ids }, task: { deletedAt: null, ...OPEN_TASK_WHERE } } }),
      this.prisma.projectTask.groupBy({ by: ['taskListId'], _count: { _all: true }, where: { taskListId: { in: ids }, task: { deletedAt: null, dueDate: { lt: today }, ...OPEN_TASK_WHERE } } }),
      // The tasks that made a group match, so the row can SAY it matched on a task and name it —
      // a group called "Round 2" turning up for "claim chart" is otherwise inexplicable.
      tokens.length ? this.prisma.projectTask.findMany({
        where: { taskListId: { in: ids }, task: { deletedAt: null, OR: tokens.map(t => ({ title: { contains: likeTerm(t), mode: 'insensitive' as const } })) } },
        select: { taskListId: true, task: { select: { id: true, title: true } } },
        take: MATCHED_TASK_CAP,
      }) : Promise.resolve([]),
    ]) : [[], [], [], []];

    const countIn = (rowsIn: { taskListId: string | null; _count: { _all: number } }[]) =>
      new Map(rowsIn.map(r => [r.taskListId ?? '', r._count._all]));
    const all = countIn(allTasks), open = countIn(openTasks), late = countIn(overdueTasks);
    const tasksBy = new Map<string, { id: string; title: string }[]>();
    for (const m of matched) {
      if (!m.taskListId) continue;
      const list = tasksBy.get(m.taskListId) ?? tasksBy.set(m.taskListId, []).get(m.taskListId)!;
      if (list.length < MATCHED_TASKS_SHOWN) list.push(m.task);
    }

    const deadlineScope = await this.deadlines.scope(actorId);
    const items = rows.map(r => {
      const matchedTasks = tasksBy.get(r.id) ?? [];
      const hit = (v?: string | null) => !!v && tokens.some(t => v.toLowerCase().includes(t));
      const matchedOn = tokens.length ? [
        hit(r.name) && 'name',
        hit(r.description) && 'description',
        (hit(r.groupType) || typeValues.some(vs => r.groupType && vs.includes(r.groupType))) && 'type',
        (hit(r.technologyDomain) || domainValues.some(vs => r.technologyDomain && vs.includes(r.technologyDomain))) && 'domain',
        (hit(r.project?.title) || hit(r.project?.code)) && 'client',
        matchedTasks.length > 0 && 'task',
      ].filter((x): x is string => !!x) : [];
      return this.redact({
        ...r,
        taskCount: all.get(r.id) ?? 0,
        openTaskCount: open.get(r.id) ?? 0,
        overdueTaskCount: late.get(r.id) ?? 0,
        matchedTasks,
        matchedOn,
      }, deadlineScope, r.projectId ?? '');
    });

    return { items, total, limit, offset, hasMore: offset + items.length < total, inScope };
  }

  async get(projectId: string, id: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    return this.redact(await this.find(projectId, id), await this.deadlines.scope(), projectId);
  }

  /**
   * The unguarded lookup, for callers that have ALREADY asserted access. Split out so a mutation
   * does not pay for the membership query twice — the assert stays at the entry point, where it
   * cannot be skipped by a future caller who only wanted the row.
   */
  private async find(projectId: string, id: string) {
    const list = await this.prisma.taskList.findFirst({
      // This is the lookup every mutation below goes through, so the flow belongs here: an edit,
      // a complete or a delete aimed at the other flow's list finds nothing rather than finding it.
      where: { id, projectId, deletedAt: null, project: projectInFlow(ClientsTaskListsService.FLOW) },
      include: { _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } } },
    });
    if (!list) throw new NotFoundException(`Task list ${id} not found`);
    const openTaskCount = await this.openTasksIn(projectId, id);
    return { ...list, openTaskCount };
  }

  private openTasksIn(projectId: string, taskListId: string) {
    return this.prisma.projectTask.count({
      // "Is anything still open in here" decides whether a group may be completed, so it counts
      // the same rows the group itself is made of.
      where: {
        projectId, taskListId,
        project: projectInFlow(ClientsTaskListsService.FLOW),
        task: { deletedAt: null, ...OPEN_TASK_WHERE },
      },
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

    // CLIENTS-FLOW (deadlines): the date promised to the client. Only someone who may see it may
    // move it; and whichever of the two dates moved, the team's deadline stays inside the promise.
    const scope = await this.deadlines.scope(actorId);
    if (dto.clientDueDate !== undefined) await this.deadlines.assertMaySetClientDue([projectId], scope);
    const clientDue = dto.clientDueDate === undefined ? existing.clientDueDate : (dto.clientDueDate ? startOfUtcDay(new Date(dto.clientDueDate)) : null);
    if (clientDue && start && clientDue < start) throw new BadRequestException('The client deadline cannot be before the start date.');
    this.deadlines.assertOrdered(due, clientDue);

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

    // The group, and — when its deadline moves — the tasks that hang off that deadline, in ONE
    // transaction, each move written to the deadline ledger. Tasks that were due ON the old date
    // move with it; any open task due after a nearer new date is pulled in to it, because a task in
    // the group cannot be due after the group. Closed tasks are history and are left alone.
    const dueMoved = dto.dueDate !== undefined && !sameDay(existing.dueDate, due) && (!!existing.dueDate || !!due);
    const { updated, movedTasks } = await this.prisma.$transaction(async tx => {
      const updated = await tx.taskList.update({
        where: { id },
        data: {
          name: dto.name,
          sequence: dto.sequence,
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(groupType !== undefined ? { groupType } : {}),
          ...(technologyDomain !== undefined ? { technologyDomain } : {}),
          ...(dto.startDate !== undefined ? { startDate: start } : {}),
          ...(dto.dueDate !== undefined ? { dueDate: due } : {}),
          ...(dto.clientDueDate !== undefined ? { clientDueDate: clientDue } : {}),
        },
      });
      let movedTasks = 0;
      if (dueMoved) {
        await this.deadlineChanges.record({
          entityType: 'TASK_GROUP', entityId: id, projectId,
          previous: existing.dueDate, next: due, changedById: actorId, tx,
        });
        if (due) {
          const open = await tx.task.findMany({
            // These tasks are about to have their deadlines MOVED, so the link that selects them
            // must be to this flow's client — a cascade must never reach into the other flow's work.
            where: {
              deletedAt: null, ...OPEN_TASK_WHERE,
              projectTasks: { some: { projectId, taskListId: id, project: projectInFlow(ClientsTaskListsService.FLOW) } },
            },
            select: { id: true, dueDate: true, startDate: true },
          });
          for (const t of open) {
            const rides = sameDay(t.dueDate, existing.dueDate);
            const overruns = !!t.dueDate && t.dueDate > due;
            if (!rides && !overruns) continue;
            // A task cannot start after it is due. Pulling a group's deadline IN can land in front
            // of a task's start date, and the row it left behind was refused by every later edit
            // ("The due date cannot be before the start date") — the task was effectively frozen,
            // by an action nobody took on it. The start comes with it.
            const startsLate = !!t.startDate && t.startDate > due;
            await tx.task.update({
              where: { id: t.id },
              data: { dueDate: due, overdueNotifiedAt: null, ...(startsLate ? { startDate: due } : {}) },
            });
            await this.deadlineChanges.record({
              entityType: 'TASK', entityId: t.id, projectId,
              previous: t.dueDate, next: due, changedById: actorId, tx,
              reason: rides ? 'moved with its task group' : 'pulled in to its task group',
            });
            movedTasks++;
          }
        }
      }
      return { updated, movedTasks };
    });
    // A pure reorder is not worth a line in anybody's feed.
    const meaningful = Object.keys(dto).some(k => k !== 'sequence');
    if (meaningful) {
      await this.events.emit({
        action: EVENTS.TASKGROUP_UPDATED,
        entityType: 'TASK_GROUP',
        entityId: id,
        metadata: {
          projectId, name: updated.name,
          ...(dto.name && dto.name !== existing.name ? { previousName: existing.name } : {}),
          ...(dueMoved ? { dueDate: due?.toISOString().slice(0, 10) ?? null, movedTasks } : {}),
        },
      });
    }
    return { ...this.redact(await this.find(projectId, id), scope, projectId), movedTasks };
  }

  /** CLIENTS-FLOW: mark a group complete — only when nothing in it is still open. */
  async complete(projectId: string, id: string) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    const group = await this.find(projectId, id);
    if (group.status === 'COMPLETED') return this.redact(group, await this.deadlines.scope(actorId), projectId);
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
    return this.redact(await this.find(projectId, id), await this.deadlines.scope(actorId), projectId);
  }

  /** CLIENTS-FLOW: re-open a completed group so work can be added to it again. */
  async reopen(projectId: string, id: string) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    const group = await this.find(projectId, id);
    if (group.status !== 'COMPLETED') return this.redact(group, await this.deadlines.scope(actorId), projectId);
    await this.prisma.taskList.updateMany({ where: { id, status: 'COMPLETED' }, data: { status: 'ACTIVE', completedAt: null } });
    await this.events.emit({
      action: EVENTS.TASKGROUP_REOPENED,
      entityType: 'TASK_GROUP',
      entityId: id,
      metadata: { projectId, name: group.name },
    });
    return this.redact(await this.find(projectId, id), await this.deadlines.scope(actorId), projectId);
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
    // The tasks being rehomed are this client's, so the group they land on must be too — otherwise
    // a delete here would quietly file them into the other flow's default group.
    const def = await this.prisma.taskList.findFirst({
      where: { projectId, isDefault: true, deletedAt: null, project: projectInFlow(ClientsTaskListsService.FLOW) },
    });
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
    const { clientDueDate: _cd, ...safe } = updated;
    return { ...safe, movedTasks: moving, movedTo: def ? { id: def.id, name: def.name } : null };
  }
}
