/**
 * The CLIENTS flow's projects API (a "client" is a Project row) — see docs/CLIENTS_FLOW.md and
 * docs/WORKSPACE_FLOWS.md. The PROJECTS flow's implementation is projects.service.ts, which is
 * production's as it stood at bb5728b. ProjectsController dispatches on the organisation's flow.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateProjectDto, UpdateProjectDto, ApprovalDto, AddProjectRoundDto } from './dto.clients';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { DeadlineScope, DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';
import { DeadlineChangeService } from '../deadlines/deadline-change.service';
import { resolveDate, startOfIstDay, startOfUtcDay } from '../../common/dates';
import { OPEN_TASK_WHERE } from '../../common/task-state';
import { patentsAndClientCodes } from '../../common/features';

/** This service serves the CLIENTS flow only, where patents and client codes are off. */
const PATENTS_AND_CLIENT_CODES = patentsAndClientCodes('CLIENTS');
import { PROJECT_TYPES, templateFor } from './project-templates';
import { TECHNOLOGY_DOMAINS, builtInDomain, slugifyDomain, domainLabel } from './technology-domains';

/**
 * The orders a project list can be read in.
 *
 * NEWEST is the default and the one that matters most now that a CID can hold several clients:
 * the latest round is almost always the one somebody means, so listing oldest-first buried it
 * under history. The rest exist because "what is due next" and "what is this client called"
 * are genuinely different questions from "what changed most recently".
 *
 * Every order ends with a tiebreak on id so paging is stable — two projects created in the
 * same millisecond otherwise swap places between requests.
 */
export const PROJECT_SORTS: Record<string, { [k: string]: 'asc' | 'desc' }[]> = {
  NEWEST:       [{ createdAt: 'desc' }, { id: 'desc' }],
  OLDEST:       [{ createdAt: 'asc' }, { id: 'asc' }],
  DEADLINE:     [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  NAME:         [{ title: 'asc' }, { createdAt: 'desc' }],
  // Group a CID's rounds together, latest round first within each.
  CID:          [{ code: 'desc' }, { roundSeq: 'desc' }],
  // The same order under its old name, so a saved link or an older screen keeps working.
  PID:          [{ code: 'desc' }, { roundSeq: 'desc' }],
  PROGRESS:     [{ completionPercentage: 'desc' }, { createdAt: 'desc' }],
};
export const PROJECT_SORT_VALUES = Object.keys(PROJECT_SORTS);
import { CidService } from '../../common/cid/cid.service';
import { CID_EVENT_LABELS, isRetiredCid, parseCid, type CidEventType } from '../../common/cid/cid';
import {
  cidFy,
  planMove,
  type MoveMode,
  type MoveProject,
} from './cid-move';

/** Hours to one decimal — the precision timesheets are logged at. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Every CID may hold MORE THAN ONE client row ("rounds").
 *
 * A returning client keeps the number they already know, and each new piece of work for them
 * can become another client row under that same CID. Every client has a CID from the moment it
 * is created, so there is no gate left.
 */
export const supportsRounds = (_office?: string | null): boolean => true;

/**
 * Interactive-transaction budget for anything that mints a CID. Minting takes a lock that queues
 * concurrent creates for a moment, so the default 2s wait / 5s run is too tight for a burst of
 * creates on a busy pool — a queued create must wait its turn, not fail.
 */
const CID_TX = { maxWait: 20_000, timeout: 30_000 };

@Injectable()
export class ClientsProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly deadlines: DeadlineVisibilityService,
    private readonly deadlineChanges: DeadlineChangeService,
    private readonly access: ProjectAccessService,
    private readonly cid: CidService,
  ) {}

  // ── The client fact ───────────────────────────────────────────────────────────────
  //
  // For an IP firm the confidential thing about a matter is WHICH CLIENT it belongs to.
  // Everything else — the CID, the title, the phase, the hours — is org-readable by design;
  // knowing that SQ_26_27_004 is Mailike's is precisely what a conflict wall exists to stop,
  // which is why naming a client requires `patent.manage` (Super Admin) rather than any of
  // the delivery permissions.
  //
  // `get()` has always enforced that, with a `delete` of its own. Every other route reading
  // the same rows — full-report, the CID ledger, the rounds stack, the CID-merge picker, and
  // the project row every mutation hands back — did not, so the name a Consultant is refused
  // on the project page still arrived in their reports export, and HR, who is 403 on the
  // patent portal, read it out of the ledger. One rule kept in five places is a rule that
  // disagrees with itself; it lives here now, and everything that carries the fact goes
  // through it.
  //
  // Deliberately NOT folded into `deadlines.redactProjects`. That redactor answers a
  // different, per-PROJECT question ("do you manage this matter") over a shape it owns, and
  // is shared with analytics; this one is per-ACTOR and the fact turns up in several shapes —
  // a string on the report and the ledger, an object plus `clientId` on a project and its
  // rounds, a bare `clientId` column on a freshly written row — at more than one depth. Two
  // passes that each do one job stay readable; one pass doing both would have to know all of it.

  /** May the CURRENT actor be told which client a matter belongs to? Super Admin only. */
  private async canViewClient(): Promise<boolean> {
    // CLIENTS-FLOW: commented out — with client codes switched off nobody is told the old
    // client fact, so every route that carries it strips it through redactClient below.
    if (!PATENTS_AND_CLIENT_CODES) return false;
    const actorId = getActorId();
    return actorId ? this.permissions.check(actorId, 'patent.manage') : false;
  }

  /**
   * Strip the client fact out of a response unless the actor is cleared for it.
   *
   * Walks the payload rather than naming fields per route, because the ledger nests its rounds
   * a level below the row the caller sees — a per-route `delete` is exactly what let three of
   * these through in the first place. Only the exact keys `client` and `clientId` go:
   * `clientDueDate` and `clientDeliveryDate` are DATES under the looser deadline rule, not the
   * identity. Anything that is not a plain object (Date, Decimal, Buffer) is passed straight
   * through, so the walk cannot quietly flatten a value on its way out.
   */
  private redactClient<T>(payload: T, canView: boolean): T {
    if (canView) return payload;
    const walk = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(walk);
      if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'client' || key === 'clientId') continue;
        // CLIENTS-FLOW: commented out — patent handles travel with the client fact while the
        // feature is off (they read Pat_<clientcode>_n, so they ARE client codes).
        if (!PATENTS_AND_CLIENT_CODES && key === 'patents') continue;
        out[key] = walk(v);
      }
      return out;
    };
    return walk(payload) as T;
  }

  /**
   * The tail every SINGLE-project response shares: the client date rule, then the client
   * identity rule.
   *
   * A raw Prisma project row carries the `clientId` column, so create / update / complete /
   * close / reopen / add-round all handed one back — the correlation `get()` goes out of its
   * way to withhold (S2), one id short of a name, and enough on its own to tell a Manager that
   * two matters are the same party's. Pass `scope` when the caller already resolved one.
   */
  private async redactProjectOut<T extends { id: string }>(project: T, scope?: DeadlineScope): Promise<T> {
    const redacted = this.deadlines.redactProject(project as never, scope ?? await this.deadlines.scope());
    return this.redactClient(redacted as T, await this.canViewClient());
  }

  /**
   * Who can be named manager of a new client — and whether the caller is one of them.
   *
   * Holders of `project.approve` (Super Admin, Admin, Manager, Senior Consultant per the matrix),
   * read from the permission rather than from designation seniority, so this list and the matrix
   * cannot disagree. The caller is ALWAYS in the list: keeping a client you created is not an
   * escalation, and leaving the field blank means "me" for everybody now that no CID authority has
   * to be asked for a number — every client is given its CID automatically when it is created.
   */
  async eligibleManagers(organizationId: string) {
    const actorId = getActorId();
    const MANAGER_SELECT = {
      id: true, firstName: true, lastName: true, designation: true, profilePhoto: true,
    } as const;

    const users = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'project.approve' } } } } } },
      },
      select: MANAGER_SELECT,
    });

    // The creator is always eligible to manage their own client (see create()).
    if (actorId && !users.some(u => u.id === actorId)) {
      const me = await this.prisma.user.findFirst({
        where: { id: actorId, organizationId, deletedAt: null, status: 'ACTIVE' },
        select: MANAGER_SELECT,
      });
      if (me) users.push(me);
    }
    const canManageOwn = actorId ? users.some(u => u.id === actorId) : false;

    const sorted = users.sort((a, b) =>
      `${a.firstName} ${a.lastName}`.toLowerCase().localeCompare(`${b.firstName} ${b.lastName}`.toLowerCase()));

    return {
      /** True when the caller may name themselves — the "I'll manage it" option. */
      canManageOwn,
      managers: sorted.map(u => ({
        ...u,
        isSelf: u.id === actorId,
        // A blank manager field means "me" for everyone.
        youAreDefault: u.id === actorId,
      })),
    };
  }

  /**
   * Create a project type's standard task list and its tasks inside an open transaction.
   *
   * Shared by client creation and by adding a later round to a CID: a second piece of work for a
   * returning client is a fresh project and deserves the same ready-made workflow as the first,
   * so this must not be duplicated in two places that can drift apart.
   */
  private async seedTemplateTasks(
    tx: Prisma.TransactionClient,
    projectId: string,
    template: { taskListName?: string; label?: string; tasks?: string[] },
    creatorId: string,
  ): Promise<void> {
    if (!template.tasks?.length) return;
    // Resolve the org's GLOBAL workflow and its first OPEN status so the generated tasks open in
    // the correct board column (mirrors TasksService.create).
    const wf = await tx.workflow.findFirst({
      where: { type: 'GLOBAL' },
      orderBy: { name: 'asc' },
      select: { id: true, statuses: { orderBy: { sequence: 'asc' }, select: { id: true, type: true } } },
    });
    const initialStatusId = wf ? (wf.statuses.find(s => s.type === 'OPEN') ?? wf.statuses[0])?.id : undefined;

    // This IS the project's group — not a second one sitting under an empty "General". A typed
    // project used to get both, so every board opened with a pointless empty group above the
    // actual work. Being the default also means new tasks land here.
    const list = await tx.taskList.create({
      data: { projectId, name: template.taskListName ?? template.label ?? 'Tasks', isDefault: true, sequence: 0 },
    });
    await this.seedTasksIntoList(tx, projectId, list.id, template.tasks, creatorId, {}, { wf, initialStatusId });
  }

  /**
   * Write a list of task titles into one task list, in order, opened in the GLOBAL workflow's
   * first OPEN status. The half of template seeding that both a project's first list and a
   * CLIENTS-FLOW task group need — kept in one place so they cannot open tasks differently.
   *
   * `dates` are the group's: every standard task inherits them, so the Gantt shows the group's
   * span and the capacity board has a deadline to plan against from the first minute.
   */
  private async seedTasksIntoList(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskListId: string,
    titles: string[],
    creatorId: string,
    dates: { startDate?: Date | null; dueDate?: Date | null } = {},
    resolved?: { wf: { id: string } | null; initialStatusId?: string },
  ): Promise<string[]> {
    let wf = resolved?.wf ?? null;
    let initialStatusId = resolved?.initialStatusId;
    if (!resolved) {
      const found = await tx.workflow.findFirst({
        where: { type: 'GLOBAL' },
        orderBy: { name: 'asc' },
        select: { id: true, statuses: { orderBy: { sequence: 'asc' }, select: { id: true, type: true } } },
      });
      wf = found;
      initialStatusId = found ? (found.statuses.find(s => s.type === 'OPEN') ?? found.statuses[0])?.id : undefined;
    }
    const ids: string[] = [];
    // Sequentially, so ProjectTask.sequence reflects the workflow order.
    for (let i = 0; i < titles.length; i++) {
      const task = await tx.task.create({
        data: {
          title: titles[i],
          priority: 'MEDIUM',
          createdBy: creatorId,
          ...(dates.startDate ? { startDate: dates.startDate } : {}),
          ...(dates.dueDate ? { dueDate: dates.dueDate } : {}),
          ...(wf ? { workflowId: wf.id } : {}),
          ...(initialStatusId ? { currentWorkflowStatusId: initialStatusId } : {}),
        },
      });
      await tx.projectTask.create({ data: { projectId, taskId: task.id, taskListId, sequence: i } });
      ids.push(task.id);
    }
    return ids;
  }

  // ── CLIENTS-FLOW: task groups and client groups ───────────────────────────────────
  //
  // A project row is a CLIENT now; its task lists are TASK GROUPS, one per piece of work. What
  // follows is shared by "create a client" (its first group rides in the same transaction) and
  // by the task-list service's "add a task group", so the two doors cannot disagree about what a
  // group of a given type contains or how its dates are checked.

  /**
   * Validate and resolve everything about a task group that can be decided BEFORE a transaction
   * opens: its type (and the standard tasks that come with it), its domain, and its dates.
   * Upserting a saved custom type or domain happens here, outside the transaction, exactly as it
   * does for a project — a failed create should not have to roll back an org-wide catalogue.
   */
  async prepareTaskGroup(organizationId: string, actorId: string, spec: {
    name: string; description?: string; groupType?: string;
    customType?: { label?: string; tasks?: string[]; save?: boolean };
    technologyDomain?: string; customDomain?: { label?: string; save?: boolean };
    startDate?: string | null; dueDate?: string | null; clientDueDate?: string | null;
  }) {
    const name = (spec.name ?? '').trim();
    if (!name) throw new BadRequestException('Give the task group a name.');
    if (spec.groupType) {
      const t = PROJECT_TYPES.find(pt => pt.value === spec.groupType);
      if (t?.comingSoon) throw new BadRequestException(`Work of type "${t.label}" isn't available yet.`);
    }
    const { template, effectiveType } = await this.resolveTemplate(organizationId, actorId, {
      projectType: spec.groupType, customType: spec.customType as any,
    });
    // A type the org does not have is refused rather than silently stored as a label. A BUILT-IN
    // type is always valid even when it brings no standard tasks (Risk & Strategy, Reverse
    // Engineering) — templateFor() answers "is there anything to create", not "is this a type",
    // and reading it as the second refused real work types.
    if (spec.groupType && !spec.customType?.label && !template && !PROJECT_TYPES.some(pt => pt.value === spec.groupType)) {
      throw new BadRequestException(`"${spec.groupType}" is not a type of work this organisation offers.`);
    }
    const technologyDomain = await this.resolveDomain(organizationId, actorId, spec);
    const startDate = spec.startDate ? startOfUtcDay(new Date(spec.startDate)) : null;
    const dueDate = spec.dueDate ? startOfUtcDay(new Date(spec.dueDate)) : null;
    if (startDate && Number.isNaN(startDate.getTime())) throw new BadRequestException('The start date is not a date.');
    if (dueDate && Number.isNaN(dueDate.getTime())) throw new BadRequestException('The deadline is not a date.');
    if (startDate && dueDate && dueDate < startDate) {
      throw new BadRequestException('The deadline cannot be before the start date.');
    }
    // The date promised to the client. Who may SET it is checked by the caller, which knows
    // whether the client exists yet; the order is the same everywhere — the team's deadline is the
    // buffered one and can never fall after the promise.
    const clientDueDate = spec.clientDueDate ? startOfUtcDay(new Date(spec.clientDueDate)) : null;
    if (clientDueDate && Number.isNaN(clientDueDate.getTime())) throw new BadRequestException('The client deadline is not a date.');
    if (clientDueDate && startDate && clientDueDate < startDate) throw new BadRequestException('The client deadline cannot be before the start date.');
    this.deadlines.assertOrdered(dueDate, clientDueDate);
    return {
      name,
      description: spec.description?.trim() || null,
      groupType: effectiveType,
      titles: (template?.tasks ?? []).map(t => t.trim()).filter(Boolean),
      technologyDomain,
      startDate,
      dueDate,
      clientDueDate,
    };
  }

  /**
   * Create one task group and its standard tasks inside an open transaction. Returns the group
   * and the ids of the tasks written, in order, so the caller can staff them.
   */
  async createTaskGroupTx(
    tx: Prisma.TransactionClient,
    args: {
      projectId: string; actorId: string; isDefault: boolean; sequence: number;
      group: Awaited<ReturnType<ClientsProjectsService['prepareTaskGroup']>>;
    },
  ) {
    const { group } = args;
    const list = await tx.taskList.create({
      data: {
        projectId: args.projectId,
        name: group.name,
        description: group.description,
        groupType: group.groupType,
        technologyDomain: group.technologyDomain,
        startDate: group.startDate,
        dueDate: group.dueDate,
        clientDueDate: group.clientDueDate,
        status: 'ACTIVE',
        createdBy: args.actorId,
        isDefault: args.isDefault,
        sequence: args.sequence,
      },
    });
    const taskIds = group.titles.length
      ? await this.seedTasksIntoList(tx, args.projectId, list.id, group.titles, args.actorId,
          { startDate: group.startDate, dueDate: group.dueDate })
      : [];
    return { list, taskIds };
  }

  /**
   * A client group the actor's organisation owns and has not archived — or a clear refusal.
   * Checked here, not trusted from the form: a group id from another organisation would
   * otherwise file a client under a name its own firm has never heard of.
   */
  async assertClientGroup(organizationId: string, clientGroupId: string) {
    const group = await this.prisma.clientGroup.findFirst({
      where: { id: clientGroupId, organizationId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!group) throw new BadRequestException('That client group does not exist, or has been archived.');
    return group;
  }

  /**
   * Work out which task template applies, from the three places a type can come from:
   * a built-in type, an inline one-off custom type, or a saved org-wide template.
   * Returns the effective type VALUE to store alongside it.
   */
  async resolveTemplate(
    organizationId: string,
    creatorId: string,
    dto: { projectType?: string; customType?: { label?: string; tasks?: string[]; save?: boolean } },
  ): Promise<{ template: { value?: string; label?: string; taskListName?: string; tasks?: string[]; description?: string } | null; effectiveType: string | null }> {
    let template = templateFor(dto.projectType) as { value?: string; label?: string; taskListName?: string; tasks?: string[]; description?: string } | null;
    let effectiveType: string | null = dto.projectType ?? null;
    if (dto.customType?.label) {
      const label = dto.customType.label.trim();
      const tasks = (dto.customType.tasks ?? []).map(t => t.trim()).filter(Boolean);
      const value = (`CUSTOM_${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`).slice(0, 60) || 'CUSTOM';
      effectiveType = value;
      template = { value, label, description: '', taskListName: label, tasks };
      if (dto.customType.save) {
        await this.prisma.projectTemplate.upsert({
          where: { organizationId_value: { organizationId, value } },
          create: { organizationId, value, label, taskListName: label, tasks, isActive: true, createdBy: creatorId },
          update: { label, taskListName: label, tasks, isActive: true },
        });
      }
    } else if (!template && dto.projectType) {
      const db = await this.prisma.projectTemplate.findFirst({ where: { organizationId, value: dto.projectType, isActive: true } });
      if (db) template = { value: db.value, label: db.label, description: db.description ?? '', taskListName: db.taskListName ?? db.label, tasks: db.tasks };
    }
    return { template, effectiveType };
  }

  /**
   * Work out the technology domain to store, from the same three places a project type can come
   * from: a built-in, an inline one-off somebody typed, or a domain this org saved earlier.
   *
   * Saving is opt-in per request (`save`), so a one-off domain does not silently enlarge the
   * list everybody else picks from — the same bargain the custom project type makes.
   */
  async resolveDomain(
    organizationId: string,
    creatorId: string,
    dto: { technologyDomain?: string; customDomain?: { label?: string; save?: boolean } },
  ): Promise<string | null> {
    const typed = dto.customDomain?.label?.trim();
    if (typed) {
      const value = slugifyDomain(typed);
      if (dto.customDomain?.save) {
        // A built-in already covers this name — saving a duplicate would show it twice.
        if (!builtInDomain(value)) {
          await this.prisma.technologyDomain.upsert({
            where: { organizationId_value: { organizationId, value } },
            create: { organizationId, value, label: typed, isActive: true, createdBy: creatorId },
            update: { label: typed, isActive: true },
          });
        }
      }
      return value;
    }
    if (!dto.technologyDomain) return null;
    if (builtInDomain(dto.technologyDomain)) return dto.technologyDomain;
    // Not a built-in: it must be one this organisation actually saved, or it is not a domain
    // at all — accepting any string here would let the filter fill up with typos.
    const saved = await this.prisma.technologyDomain.findFirst({
      where: { organizationId, value: dto.technologyDomain, isActive: true },
      select: { value: true },
    });
    if (!saved) throw new BadRequestException(`"${dto.technologyDomain}" is not a technology domain this organisation offers.`);
    return saved.value;
  }

  /** Built-in domains + this org's saved ones, alphabetical — drives the create-form picker. */
  async technologyDomains(organizationId: string) {
    const custom = await this.prisma.technologyDomain.findMany({
      where: { organizationId, isActive: true }, orderBy: { label: 'asc' },
    });
    return [...TECHNOLOGY_DOMAINS, ...custom.map(c => ({ value: c.value, label: c.label, custom: true }))]
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * A NEW CLIENT ROW UNDER AN EXISTING CID — the returning-client flow ("rounds").
   *
   * The old model reopened the finished project in place, which only works when the client comes
   * back with *the same* work. In practice they return with a different brief: new name, new type,
   * new dates, new team. Piling those tasks into the previous project's list makes the record
   * unreadable and destroys any per-engagement reporting.
   *
   * So each return creates a SIBLING row sharing the CID. The client keeps the number they
   * know; every round keeps its own tasks, time, files, issues and dates; and every module that
   * already works per-project keeps working with no rewiring. The ledger records it (ROUND_ADDED)
   * in the same transaction.
   */
  async addRound(fromProjectId: string, dto: AddProjectRoundDto) {
    const actorId = getActorId();
    const creator = actorId
      ? await this.prisma.user.findFirst({ where: { id: actorId, deletedAt: null } })
      : null;
    if (!creator) throw new ForbiddenException('You must be signed in to add a client.');
    await this.access.assertProjectAccess(actorId, fromProjectId);

    const source = await this.prisma.project.findFirst({
      where: { id: fromProjectId, deletedAt: null },
      select: { id: true, code: true, office: true, clientId: true, title: true },
    });
    if (!source) throw new NotFoundException(`Project ${fromProjectId} not found`);
    // Every live client carries a CID (a database CHECK holds it); this is only a defensive word.
    if (!source.code) throw new BadRequestException('This client has no CID.');
    const sourceCode = source.code;

    const organizationId = creator.organizationId;

    // The next round number is derived from what already exists, INCLUDING soft-deleted rounds, so
    // a deleted round never causes a number to be handed out twice.
    const last = await this.prisma.project.findFirst({
      where: { code: source.code },
      orderBy: { roundSeq: 'desc' },
      select: { roundSeq: true },
    });
    const roundSeq = (last?.roundSeq ?? 0) + 1;

    // Dates: "end date" is this round's own finish, stored as the project's due date.
    const startD = dto.startDate ? new Date(dto.startDate) : undefined;
    const endD = dto.endDate ? new Date(dto.endDate) : undefined;
    if (startD && endD && endD < startD) {
      throw new BadRequestException('The end date cannot be before the start date.');
    }
    const clientDue = dto.clientDueDate ? new Date(dto.clientDueDate) : undefined;
    if (clientDue) await this.deadlines.assertMaySetClientDue([], await this.deadlines.scope(creator.id));
    this.deadlines.assertOrdered(endD, clientDue);

    if (dto.projectType) {
      const t = PROJECT_TYPES.find(pt => pt.value === dto.projectType);
      if (t?.comingSoon) throw new BadRequestException(`Work of type "${t.label}" aren't available yet.`);
    }
    const { template, effectiveType } = await this.resolveTemplate(organizationId, creator.id, dto);
    const technologyDomain = await this.resolveDomain(organizationId, creator.id, dto);

    // Staffing: whoever was chosen for THIS round, with the creator leading if nobody was named.
    let members = [{ userId: creator.id, projectRole: 'MANAGER' }];
    if (dto.members?.length) {
      const wanted = [...new Set(dto.members.map(m => m.userId))];
      const found = await this.prisma.user.findMany({
        where: { id: { in: wanted }, organizationId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      if (found.length !== wanted.length) {
        throw new BadRequestException('One or more selected members are not active in this organization.');
      }
      members = dto.members.map(m => ({ userId: m.userId, projectRole: m.projectRole ?? 'MEMBER' }));
      // Somebody has to own it: if no manager was named, the creator leads.
      if (!members.some(m => m.projectRole === 'MANAGER')) {
        members = members.filter(m => m.userId !== creator.id);
        members.unshift({ userId: creator.id, projectRole: 'MANAGER' });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          // The CID, the client and the office all carry over — that is the point of a round.
          code: source.code,
          clientId: source.clientId,
          office: source.office,
          roundSeq,
          title: dto.title,
          description: dto.description,
          projectType: effectiveType,
          technologyDomain,
          // Usually ACTIVE, but a returning client's next round can be booked in ahead of time.
          projectPhase: dto.projectPhase ?? 'ACTIVE',
          priority: dto.priority ?? 'MEDIUM',
          startDate: startD,
          dueDate: endD,
          clientDueDate: clientDue,
          createdBy: creator.id,
          members: { create: members },
          ...(template?.tasks?.length
            ? {}
            : { taskLists: { create: { name: 'General', isDefault: true, sequence: 0 } } }),
        },
      });
      // The CID's patents carry over with the client. A round is the SAME matter for the same
      // client, so inheriting the client but not the patents left the two rounds disagreeing
      // about what the work is about: round 1 read "client from patents" and locked, round 2 read
      // as directly-set and editable — and editing it silently split one CID across two clients.
      const sourcePatents = await tx.projectPatent.findMany({
        where: { projectId: source.id }, select: { patentId: true },
      });
      if (sourcePatents.length) {
        await tx.projectPatent.createMany({
          data: sourcePatents.map(p => ({ projectId: project.id, patentId: p.patentId, addedBy: creator.id })),
          skipDuplicates: true,
        });
      }

      if (template) await this.seedTemplateTasks(tx, project.id, template, creator.id);

      // The registry points at the newest live round, and the ledger says a client joined the CID.
      await this.cid.syncRegistryInTx(tx, organizationId, sourceCode, { actorId: creator.id });
      await this.cid.recordInTx(tx, {
        organizationId, cid: sourceCode, projectId: project.id, clientTitle: project.title,
        type: 'ROUND_ADDED', toCid: sourceCode, actorId: creator.id,
        metadata: { roundSeq, fromClientId: source.id, fromClientTitle: source.title },
      });
      return project;
    });

    await this.events.emit({
      action: EVENTS.PROJECT_CREATED, entityType: 'PROJECT', entityId: created.id,
      organizationId, actorId: creator.id,
      metadata: { projectId: created.id, title: created.title, cid: sourceCode, roundSeq },
    });
    const recipients = members.map(m => m.userId).filter(uid => uid !== creator.id);
    if (recipients.length) {
      await this.notifications.notify(recipients, {
        type: 'project.created',
        title: `New client under ${sourceCode}`,
        message: `"${created.title}" was started under ${sourceCode} (client ${roundSeq}).`,
        link: `/projects/${created.id}`,
      });
    }
    return this.redactProjectOut(created);
  }

  /**
   * Every client sharing this client's CID, oldest round first — what the client page renders as
   * its stack of cards.
   */
  async roundsForProject(projectId: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const self = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, code: true, office: true },
    });
    if (!self) throw new NotFoundException(`Project ${projectId} not found`);

    const scope = await this.deadlines.scope();
    // Two independent rules over the same rows: the deadline scope decides the client DATE,
    // this decides the client's IDENTITY. Both resolved once here and reused for every round.
    const canViewClient = await this.canViewClient();
    const shape = {
      id: true, code: true, roundSeq: true, office: true, title: true, description: true,
      projectType: true, projectPhase: true, priority: true, completionPercentage: true,
      startDate: true, dueDate: true, clientDueDate: true,
      completedAt: true, closedAt: true, clientDeliveryDate: true, workingHours: true, actualHours: true,
      createdBy: true, createdAt: true,
      client: { select: { id: true, name: true, code: true } },
      // The card's "Add task" needs the round's own default list.
      taskLists: { where: { deletedAt: null }, select: { id: true, name: true, isDefault: true, sequence: true }, orderBy: { sequence: 'asc' } },
      workflowId: true,
      members: {
        where: { isActive: true },
        select: { projectRole: true, user: { select: { id: true, firstName: true, lastName: true, designation: true, profilePhoto: true } } },
      },
      _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: { where: { isActive: true } } } },
    } as const;

    // Defensive: a live client always has a CID, but a row without one simply stands alone.
    if (!self.code) {
      const one = await this.prisma.project.findFirst({ where: { id: projectId }, select: shape });
      return {
        cid: self.code, multiRound: false,
        rounds: this.redactClient(this.deadlines.redactProjects([one] as never, scope), canViewClient),
      };
    }
    const rounds = await this.prisma.project.findMany({
      where: { code: self.code, deletedAt: null },
      orderBy: [{ roundSeq: 'asc' }, { createdAt: 'asc' }],
      select: shape,
    });
    return {
      cid: self.code, multiRound: true,
      rounds: this.redactClient(this.deadlines.redactProjects(rounds as never, scope), canViewClient),
    };
  }

  /**
   * Create a client. It is created ACTIVE and usable immediately, and it is given its CID in the
   * SAME transaction — the next number in the organisation's series for this financial year,
   * minted under a lock (see CidService). There is no request, no queue and no "CID pending":
   * the client row, its CID, the registry row and the ledger's MINTED event commit together or
   * not at all. Members, task groups and any template tasks ride in that transaction too, so a
   * partial failure never leaves a half-built client.
   */
  async create(dto: CreateProjectDto) {
    // Identity & org come from the verified cookie actor — never the client body
    // (fixes spoofable createdBy and the email-vs-id create bug).
    const actorId = getActorId();
    const creator = actorId
      ? await this.prisma.user.findFirst({ where: { id: actorId, deletedAt: null } })
      : null;
    if (!creator) throw new ForbiddenException('You must be signed in to create a client.');
    const organizationId = creator.organizationId;

    // ── Who manages it ─────────────────────────────────────────────────────────────
    // Blank means the creator. Naming SOMEBODY ELSE is delegation, and needs authority over it:
    //   • an organisation admin (project.generate_pid — Admin / Super Admin) may hand a client to
    //     any active member;
    //   • anyone else may hand it only to somebody who can run a client (project.approve), which is
    //     the same list the picker offers, so a name offered there is never refused here.
    // Keeping a client you created is never an escalation: the MANAGER row is scoped to that one
    // client, and everything done inside it stays gated on the permissions the person already has.
    const managerId = dto.managerId?.trim() || '';
    if (managerId && managerId !== creator.id) {
      const manager = await this.prisma.user.findFirst({
        where: { id: managerId, organizationId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!manager) throw new BadRequestException('The selected client manager is not an active member of this organization.');
      const mayDelegateToAnyone = await this.permissions.check(creator.id, 'project.generate_pid');
      if (!mayDelegateToAnyone && !(await this.permissions.check(manager.id, 'project.approve'))) {
        throw new BadRequestException('That person cannot manage a client — choose a Manager, Senior Consultant or Admin.');
      }
    }

    // ── Deadlines: internal is open; the client date is restricted (new project → the
    //    global permission is the only qualifier, there is no manager relationship yet).
    const scope = await this.deadlines.scope(creator.id);
    const startD = dto.startDate ? new Date(dto.startDate) : undefined;
    const internalDue = dto.dueDate ? new Date(dto.dueDate) : undefined;
    const clientDue = dto.clientDueDate ? new Date(dto.clientDueDate) : undefined;
    // Reject an inverted range at CREATE too — update() already does (was an A/B gap).
    if (startD && internalDue && internalDue < startD) {
      throw new BadRequestException('Due date cannot be before the start date.');
    }
    if (clientDue) await this.deadlines.assertMaySetClientDue([], scope);
    this.deadlines.assertOrdered(internalDue, clientDue);

    // The manager leads. When somebody else was named, the creator joins as a member so they keep
    // access to the client they set up. One person, one row: naming yourself is not two rows.
    const managerIsCreator = !managerId || managerId === creator.id;
    const members = managerIsCreator
      ? [{ userId: creator.id, projectRole: 'MANAGER' }]
      : [{ userId: managerId, projectRole: 'MANAGER' }, { userId: creator.id, projectRole: 'MEMBER' }];

    // A "coming soon" type (MONETIZATION) is shown-but-disabled in the UI; reject it server-side
    // too so a direct API call can't create a live project of an unbuilt type.
    if (dto.projectType) {
      const t = PROJECT_TYPES.find(pt => pt.value === dto.projectType);
      if (t?.comingSoon) throw new BadRequestException(`Work of type "${t.label}" aren't available yet.`);
    }

    // Resolve the project TYPE template that auto-creates a task list. Three sources:
    //   1. a built-in type (templateFor),
    //   2. an INLINE one-off custom type ("+ Create new type") — used for this project, and
    //      persisted as a reusable org-wide ProjectTemplate when `save` is set,
    //   3. a saved org ProjectTemplate value.
    //
    // CLIENTS-FLOW: a client's first task group, when one is sent, carries the type and domain
    // that used to sit on the project. The project-level type is then left empty — a client does
    // many kinds of work, and stamping one type on the whole client would misdescribe the rest.
    const firstGroup = dto.taskGroup
      ? await this.prepareTaskGroup(organizationId, creator.id, dto.taskGroup)
      : null;
    const { template, effectiveType } = firstGroup
      ? { template: null, effectiveType: null }
      : await this.resolveTemplate(organizationId, creator.id, dto);
    const technologyDomain = firstGroup ? null : await this.resolveDomain(organizationId, creator.id, dto);
    const clientGroup = dto.clientGroupId?.trim()
      ? await this.assertClientGroup(organizationId, dto.clientGroupId.trim())
      : null;
    // A client deadline on the first group: a new client has no manager relationship yet, so only
    // the global permission qualifies — the same rule a project's own client date always had.
    if (firstGroup?.clientDueDate) await this.deadlines.assertMaySetClientDue([], scope);

    // ── Patent linkage — TAGGED PATENTS DECIDE THE CLIENT, and nothing else does while any
    // exist. Only patent.view holders (Super Admin by default, or anyone granted it) may attach
    // patents; the field is hidden for everyone else and the API re-checks so it can't be forced.
    let patentIds: string[] = [];
    let derivedClientId: string | null = null;
    // CLIENTS-FLOW: commented out — patent IDs and client codes are switched off, so a request that
    // still carries them is told so rather than having them silently dropped.
    if (!PATENTS_AND_CLIENT_CODES && (dto.patentIds?.length || dto.clientId)) {
      throw new BadRequestException('Patent IDs and client codes are switched off in this version.');
    }
    if (dto.patentIds?.length) {
      if (!(await this.permissions.check(creator.id, 'patent.view'))) {
        throw new ForbiddenException('You are not permitted to attach patents.');
      }
      const wanted = [...new Set(dto.patentIds)];
      const found = await this.prisma.patent.findMany({
        where: { id: { in: wanted }, organizationId, deletedAt: null },
        select: { id: true, clientId: true },
      });
      if (found.length !== wanted.length) {
        throw new BadRequestException('One or more selected patents are invalid.');
      }
      patentIds = found.map(p => p.id);
      const clientIds = [...new Set(found.map(p => p.clientId))];
      if (clientIds.length > 1) {
        throw new BadRequestException('Selected patents belong to different clients — a project maps to one client.');
      }
      derivedClientId = clientIds[0] ?? null;
    } else if (dto.clientId) {
      // Only ever consulted when there are no patents, so the stored client can never contradict
      // them. Client identity is confidential, so naming one requires patent.manage.
      derivedClientId = await this.resolveNamedClient(organizationId, creator.id, dto.clientId);
    }

    const project = await this.prisma.$transaction(async (tx) => {
      // The CID first: the client row is inserted carrying it (the database refuses a live client
      // without one). The allocation lock taken here is held until this transaction commits.
      const minted = await this.cid.mintInTx(tx, { organizationId, actorId: creator.id });
      const created = await tx.project.create({
        data: {
          code: minted.cid,
          title: dto.title,
          description: dto.description,
          projectType: effectiveType,
          technologyDomain,
          clientId: derivedClientId,
          clientGroupId: clientGroup?.id ?? null,
          projectPhase: 'ACTIVE',
          // Taken from the creator unless they picked another office on the form.
          office: dto.office ?? creator.office ?? null,
          roundSeq: 1,
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: internalDue,
          clientDueDate: clientDue,
          createdBy: creator.id,
          members: { create: members },
          // "General" is only created when the type brings no group of its own — otherwise the
          // type's group is the default and an empty "General" would just be noise.
          //
          // CLIENTS-FLOW: a client created WITH a first task group gets that group as its default
          // instead — same reasoning, one level down.
          ...(template?.tasks?.length || firstGroup
            ? {}
            : { taskLists: { create: { name: 'General', isDefault: true, sequence: 0 } } }),
        },
        include: { taskLists: true },
      });
      await this.cid.pointAt(tx, minted.reservationId, created.id);
      await this.cid.recordInTx(tx, {
        organizationId, cid: minted.cid, projectId: created.id, clientTitle: created.title,
        type: 'MINTED', toCid: minted.cid, actorId: creator.id,
        metadata: {
          fyLabel: minted.fyLabel, serial: minted.serial,
          manager: managerIsCreator ? creator.id : managerId,
          ...(clientGroup ? { clientGroupId: clientGroup.id, clientGroup: clientGroup.name } : {}),
        },
      });

      if (patentIds.length) {
        await tx.projectPatent.createMany({
          data: patentIds.map(pId => ({ projectId: created.id, patentId: pId, addedBy: creator.id })),
          skipDuplicates: true,
        });
      }

      if (template) await this.seedTemplateTasks(tx, created.id, template, creator.id);
      if (firstGroup) {
        await this.createTaskGroupTx(tx, {
          projectId: created.id, actorId: creator.id, isDefault: true, sequence: 0, group: firstGroup,
        });
      }

      // Re-read the groups: `include` above ran BEFORE the type's group and the first task group
      // were created in this same transaction, so the create response said the client had none.
      return { ...created, taskLists: await tx.taskList.findMany({
        where: { projectId: created.id, deletedAt: null },
        orderBy: { sequence: 'asc' },
      }) };
    }, CID_TX);

    await this.events.emit({
      action: EVENTS.PROJECT_CREATED,
      entityType: 'PROJECT',
      entityId: project.id,
      organizationId,
      actorId: creator.id,
      metadata: {
        projectId: project.id, title: project.title, cid: project.code,
        ...(clientGroup ? { clientGroup: clientGroup.name } : {}),
        ...(firstGroup ? { firstTaskGroup: firstGroup.name } : {}),
      },
    });

    // Projects are billable by default; billability is decided per time entry by each
    // logger, so there is no admin billable-review step on creation any more.
    return this.redactProjectOut(project as any, scope);
  }

  // ── Correcting a CID: reassign / split / merge ────────────────────────────────────
  //
  // A CID is issued automatically when a client is created, so it is never "wrong" in the sense
  // a hand-typed number was — but two clients can turn out to be one matter, or one CID can turn
  // out to hold two matters. Three shapes of correction, in the words the firm uses:
  //
  //   "this client should have its own number"   → REASSIGN: move it to a freshly minted CID.
  //   "these two were filed under one CID and
  //    are really separate matters"               → SPLIT: one of them takes a fresh CID.
  //   "these two numbers are one matter"          → MERGE: one client moves under the other's
  //                                                 CID and becomes its next round.
  //
  // Mechanically they are one operation: a client's `code` changes and the round numbers on both
  // sides are re-dealt. The arithmetic and every refusal live in ./cid-move.ts (tested without a
  // database in tools/cid-move.spec.ts); what is left here is the part done against real rows.
  //
  //  · A CID IS NEVER REISSUED. A fresh number only ever comes from CidService.mintInTx. A named
  //    destination must already hold live work (a merge); a number that holds nothing — retired,
  //    merged, purged, or only in the bin — is refused rather than taken over.
  //  · A NUMBER LEFT HOLDING NOTHING IS RETIRED, in the same transaction: MERGED (pointing at the
  //    survivor) for a merge, DISCONTINUED for a reassign/split. Retired numbers never come back.
  //  · NOTHING BUT THE NUMBER MOVES. Only `code` and `roundSeq` are written on client rows.
  //  · THE LEDGER RECORDS IT in the same transaction, filed under the new CID with the old one as
  //    `fromCid`, so the move appears on both numbers' timelines.

  /** What a caller asks for. Which correction it is comes from the ROUTE; the rest is a destination. */
  private async resolveMove(
    organizationId: string,
    projectId: string,
    opts: { mode: MoveMode; cid?: string; intoProjectId?: string },
  ) {
    const prefix = await this.cid.prefixFor(this.prisma, organizationId);
    const shape = {
      id: true, code: true, roundSeq: true, projectPhase: true, deletedAt: true, title: true, clientId: true,
    } as const;

    const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: shape });
    if (!project) throw new NotFoundException('Client not found.');
    await this.assertProjectInOrg(organizationId, projectId);

    // Resolve the destination: named as a CLIENT (the merge picker — people think in clients, not
    // serials) or as a CID (typed). Both end up as one canonical CID string.
    let targetCid: string | null = null;
    if (opts.intoProjectId) {
      const into = await this.prisma.project.findFirst({
        where: { id: opts.intoProjectId }, select: { id: true, code: true, deletedAt: true, title: true },
      });
      if (!into) throw new NotFoundException('The client to merge into was not found.');
      await this.assertProjectInOrg(organizationId, into.id);
      if (into.deletedAt) throw new BadRequestException('The client to merge into is in the bin.');
      if (!into.code) throw new BadRequestException(`"${into.title}" has no CID of its own to merge into.`);
      targetCid = into.code;
    } else if (opts.cid?.trim()) {
      const parsed = parseCid(opts.cid, prefix);
      if ('error' in parsed) throw new BadRequestException(parsed.error);
      targetCid = parsed.cid;
    }

    const toRef = (p: { id: string; code: string | null; roundSeq: number; projectPhase: string; title: string }): MoveProject =>
      ({ id: p.id, code: p.code, roundSeq: p.roundSeq, phase: p.projectPhase, title: p.title });

    // Live rounds only, on both sides: a soft-deleted round neither holds a round number nor keeps
    // a number from being vacated.
    const groupShape = { id: true, code: true, roundSeq: true, projectPhase: true, title: true } as const;
    const sourceGroup = project.code
      ? (await this.prisma.project.findMany({
          where: { code: project.code, deletedAt: null }, orderBy: { roundSeq: 'asc' }, select: groupShape,
        })).map(toRef)
      : [];
    const targetGroup = targetCid
      ? (await this.prisma.project.findMany({
          where: { code: targetCid, deletedAt: null }, orderBy: { roundSeq: 'asc' }, select: groupShape,
        })).map(toRef)
      : [];

    let decision = planMove({
      project: { ...toRef(project), deleted: !!project.deletedAt },
      sourceGroup, targetCid, targetGroup,
      targetProjectId: opts.intoProjectId,
      declaredMode: opts.mode,
    });
    // A named destination that holds no live work would be a number taken over rather than minted —
    // and every such number is spoken for (retired, merged, purged, or reserved to clients in the
    // bin). Only a merge names its destination; a reassign or split always mints the next one.
    if (decision.ok && decision.plan.toCid && decision.plan.mode !== 'MERGE') {
      decision = {
        ok: false, reason: 'NO_REUSE',
        message: `${decision.plan.toCid} holds no live client, and a CID is never re-used. `
          + 'Leave the destination empty to issue the next CID, or merge into a CID that holds work.',
      };
    }
    return { project, sourceGroup, targetGroup, targetCid, decision };
  }

  /**
   * A project's org, asserted rather than assumed. `Project` has no organization column, so a
   * lookup by id alone is org-blind — without this an oversight actor in one tenant could move a
   * CID belonging to another. A project with no resolvable active member is not over-blocked
   * (there is nothing to compare against), matching ProjectAccessService.
   */
  private async assertProjectInOrg(organizationId: string, projectId: string): Promise<void> {
    const owner = await this.orgOfProject(projectId);
    if (owner && owner !== organizationId) throw new NotFoundException('Client not found.');
  }

  /**
   * What a move WOULD do, before anyone commits to it. Deliberately NOT passcode-gated: looking is
   * not a change. A refusal comes back as a refusal rather than an exception, so the dialog can say
   * "not allowed, and why" while the person is still choosing.
   */
  async cidMovePreview(organizationId: string, projectId: string, opts: { mode: MoveMode; cid?: string; intoProjectId?: string }) {
    const { project, sourceGroup, targetGroup, targetCid, decision } =
      await this.resolveMove(organizationId, projectId, opts);

    const rounds = (list: MoveProject[]) =>
      list.map(p => ({ id: p.id, title: p.title ?? '', roundSeq: p.roundSeq, phase: p.phase, isThisProject: p.id === projectId }));

    // For a mint, show the number that would be issued. Non-binding: a client created between this
    // preview and the move takes it first.
    const mintPreview = !targetCid ? await this.cid.peekNext(organizationId) : null;

    const base = {
      projectId, projectTitle: project.title,
      fromCid: project.code, fromRoundSeq: project.roundSeq,
      sourceRounds: rounds(sourceGroup),
      targetRounds: rounds(targetGroup),
      targetCid, mintPreview,
    };
    if (!decision.ok) return { ...base, ok: false as const, reason: decision.reason, message: decision.message };

    const plan = decision.plan;
    const titleOf = new Map([...sourceGroup, ...targetGroup].map(p => [p.id, p.title ?? '']));
    const named = (cs: { id: string; from: number; to: number }[]) =>
      cs.map(c => ({ ...c, title: titleOf.get(c.id) ?? '' }));
    return {
      ...base,
      ok: true as const,
      mode: plan.mode,
      toCid: plan.toCid ?? mintPreview,
      /** True when the number does not exist yet — the preview above is a prediction, not a promise. */
      mintsNewCid: !plan.toCid,
      newRoundSeq: plan.newRoundSeq,
      sourceRenumber: named(plan.sourceRenumber),
      targetRenumber: named(plan.targetRenumber),
      sourceRemaining: plan.sourceRemaining,
      targetTotal: plan.targetTotal,
      /** The old number is retired into the ledger — kept forever, never issued again. */
      retiresFromCid: plan.vacatesSource,
      affectedCount: plan.affected.length,
    };
  }

  /**
   * Existing CIDs a client could be merged into: every number in this org that still holds live
   * work, in the same financial year, excluding the client's own. Scoped through the registry
   * because `Project` carries no org column — the registry knows which numbers belong to which tenant.
   */
  async cidMoveTargets(organizationId: string, projectId: string) {
    await this.assertProjectInOrg(organizationId, projectId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: { code: true } });
    const fy = cidFy(project?.code ?? null);

    const registry = await this.prisma.pidReservation.findMany({
      where: { organizationId, status: 'ATTACHED', ...(fy ? { fyLabel: fy } : {}) },
      orderBy: [{ fyLabel: 'desc' }, { serial: 'desc' }],
      select: { pid: true, fyLabel: true, serial: true },
      take: 500,
    });
    const cids = registry.map(r => r.pid).filter(p => p !== project?.code);
    if (!cids.length) return [];

    const projects = await this.prisma.project.findMany({
      where: { code: { in: cids }, deletedAt: null },
      orderBy: [{ roundSeq: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, code: true, roundSeq: true, title: true, projectPhase: true },
    });
    const byCid = new Map<string, typeof projects>();
    for (const p of projects) {
      if (!p.code) continue;
      byCid.set(p.code, [...(byCid.get(p.code) ?? []), p]);
    }
    const targets = registry
      .filter(r => (byCid.get(r.pid) ?? []).length > 0)
      .map(r => ({
        cid: r.pid, fyLabel: r.fyLabel, serial: r.serial,
        rounds: byCid.get(r.pid)!.map(p => ({ id: p.id, title: p.title, roundSeq: p.roundSeq, phase: p.projectPhase })),
      }));
    return this.redactClient(targets, await this.canViewClient());
  }

  /**
   * Perform the move. One transaction: the client has its new number, both sides are renumbered,
   * both registry rows tell the truth and the ledger says what happened — or nothing happened.
   */
  async moveCid(
    organizationId: string,
    userId: string,
    projectId: string,
    opts: { mode: MoveMode; cid?: string; intoProjectId?: string },
  ) {
    const { project, decision } = await this.resolveMove(organizationId, projectId, opts);
    if (!decision.ok) throw new BadRequestException(decision.message);
    const plan = decision.plan;

    // One CID is one client's matter. A merge is the only operation here that can put two clients
    // under one number, so it goes through the same check that stops a round being re-tagged.
    if (plan.mode === 'MERGE') {
      if (!plan.toCid) throw new BadRequestException('No CID was given to merge into.');
      await this.assertPidClientConsistent(projectId, plan.toCid, project.clientId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // The destination: a merge joins a CID that holds live work; anything else mints the next one.
      let toCid: string;
      let reservationId: string | null = null;
      if (plan.mode === 'MERGE') {
        toCid = plan.toCid!;
        const reg = await this.cid.registryRow(tx, organizationId, toCid);
        if (reg && isRetiredCid(reg.status)) {
          throw new BadRequestException(`${toCid} is retired and cannot take a client.`);
        }
      } else {
        const minted = await this.cid.mintInTx(tx, { organizationId, actorId: userId });
        toCid = minted.cid;
        reservationId = minted.reservationId;
      }

      // Re-read both sides under the transaction: the plan was made from a snapshot, and a client
      // joining or leaving either number since then would make its round numbers wrong.
      const liveIds = async (code: string) => (await tx.project.findMany({
        where: { code, deletedAt: null }, select: { id: true },
      })).map(p => p.id).sort();
      const nowTarget = plan.mode === 'MERGE' ? await liveIds(toCid) : [];
      if (plan.mode === 'MERGE' && nowTarget.length !== plan.targetTotal - 1) {
        throw new BadRequestException(`${toCid} changed while you were looking — open the dialog again.`);
      }
      const nowSource = await liveIds(plan.fromCid);
      if (nowSource.length !== plan.sourceRemaining + 1) {
        throw new BadRequestException(`${plan.fromCid} changed while you were looking — open the dialog again.`);
      }

      // The move itself. `code` and `roundSeq` are the ONLY things written on client rows.
      await tx.project.update({ where: { id: projectId }, data: { code: toCid, roundSeq: plan.newRoundSeq } });
      for (const c of plan.targetRenumber) await tx.project.update({ where: { id: c.id }, data: { roundSeq: c.to } });
      for (const c of plan.sourceRenumber) await tx.project.update({ where: { id: c.id }, data: { roundSeq: c.to } });

      if (reservationId) await this.cid.pointAt(tx, reservationId, projectId);
      await this.cid.syncRegistryInTx(tx, organizationId, toCid, { actorId: userId });
      const fromStatus = await this.cid.syncRegistryInTx(tx, organizationId, plan.fromCid, {
        actorId: userId,
        ...(plan.vacatesSource
          ? { retireAs: plan.mode === 'MERGE' ? 'MERGED' as const : 'DISCONTINUED' as const, mergedIntoCid: toCid }
          : {}),
      });

      const type: CidEventType = plan.mode === 'MERGE' ? 'MERGED' : plan.mode === 'SPLIT' ? 'SPLIT' : 'REASSIGNED';
      await this.cid.recordInTx(tx, {
        organizationId, cid: toCid, projectId, clientTitle: project.title, type,
        fromCid: plan.fromCid, toCid, actorId: userId,
        metadata: {
          mode: plan.mode, fromRoundSeq: plan.oldRoundSeq, toRoundSeq: plan.newRoundSeq,
          minted: !!reservationId, retiredFromCid: plan.vacatesSource, fromCidStatus: fromStatus,
          sourceRenumbered: plan.sourceRenumber, targetRenumbered: plan.targetRenumber,
          affectedProjectIds: plan.affected,
        },
      });
      return { toCid, fromStatus };
    }, CID_TX);
    const toCid = result.toCid;

    await this.events.emit({
      action: EVENTS.PROJECT_CID_MOVED,
      entityType: 'PROJECT',
      entityId: projectId,
      organizationId,
      actorId: userId,
      oldValue: { cid: plan.fromCid, roundSeq: plan.oldRoundSeq },
      newValue: { cid: toCid, roundSeq: plan.newRoundSeq },
      metadata: {
        projectId, title: project.title, mode: plan.mode,
        fromCid: plan.fromCid, toCid,
        fromRoundSeq: plan.oldRoundSeq, toRoundSeq: plan.newRoundSeq,
        retiredFromCid: plan.vacatesSource,
        sourceRenumbered: plan.sourceRenumber,
        targetRenumbered: plan.targetRenumber,
        affectedProjectIds: plan.affected,
      },
    });

    // The number is what the team quotes on everything they send out, so the people staffed on the
    // client are told it changed. Best-effort: a notification failure must not undo a correction.
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, isActive: true }, select: { userId: true },
    });
    const recipients = members.map(m => m.userId).filter(uid => uid !== userId);
    if (recipients.length) {
      await this.notifications.notify(recipients, {
        type: 'project.cid_moved',
        title: 'CID changed',
        message: `"${project.title}" moved from ${plan.fromCid} to ${toCid}`
          + (plan.mode === 'MERGE' ? ` (client ${plan.newRoundSeq} under ${toCid}).` : '.'),
        link: `/projects/${projectId}`,
      });
    }

    return {
      projectId,
      mode: plan.mode,
      fromCid: plan.fromCid,
      toCid,
      roundSeq: plan.newRoundSeq,
      /** True when the old number was left holding nothing and has been retired into the ledger. */
      retiredFromCid: plan.vacatesSource,
      fromCidStatus: result.fromStatus,
      renumbered: [...plan.sourceRenumber, ...plan.targetRenumber],
    };
  }

  // ── The CID ledger ────────────────────────────────────────────────────────────────
  //
  // One row per CID the organisation has EVER issued — live, completed, in the bin, merged away,
  // retired or permanently deleted — with every client that has carried it (rounds), the hours,
  // and the full timeline of events from the stored, append-only cid_event table. Deleted and
  // purged clients stay visible: a deleted client's rows are still in `project`; a purged one
  // survives only in the ledger, through the PURGED event's snapshot.
  //
  // Gated on `user.manage_access` (Admin, Super Admin, HR). The client's name — the client row's
  // title — is part of what the ledger is FOR and HR has always read it here; the separate
  // confidential client fact (the patent-portal Client, keys `client` / `clientId`) is withheld by
  // the same redactClient pass every other route uses.

  async cidLedger(organizationId: string) {
    const [registry, events] = await Promise.all([
      this.prisma.pidReservation.findMany({
        where: { organizationId },
        orderBy: [{ fyLabel: 'desc' }, { serial: 'desc' }],
        take: 5000,
      }),
      this.prisma.cidEvent.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const cids = registry.map(r => r.pid);

    // Every client row carrying one of these numbers — live AND in the bin.
    const projects = cids.length ? await this.prisma.project.findMany({
      where: { code: { in: cids } },
      orderBy: [{ roundSeq: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, code: true, roundSeq: true, office: true, title: true, description: true,
        projectPhase: true, projectType: true, technologyDomain: true, priority: true,
        startDate: true, dueDate: true, completionPercentage: true,
        createdBy: true, createdAt: true, deletedAt: true,
        completedAt: true, closedAt: true, clientDeliveryDate: true, workingHours: true, actualHours: true,
        clientGroup: { select: { id: true, name: true } },
        members: {
          where: { isActive: true },
          select: { projectRole: true, user: { select: { id: true, firstName: true, lastName: true } } },
        },
        _count: { select: { taskLists: { where: { deletedAt: null } } } },
      },
    }) : [];
    const ids = projects.map(p => p.id);

    // Hours LOGGED per client (timesheets outlive a soft delete) and hours ALLOTTED (task
    // estimates). A deleted client's tasks were archived with it — at the same instant — so those
    // still count toward what it was allotted; a task deleted separately, earlier, does not.
    const [loggedRows, estimateRows] = ids.length ? await Promise.all([
      this.prisma.timesheet.groupBy({
        by: ['projectId'], where: { projectId: { in: ids }, deletedAt: null }, _sum: { hoursLogged: true },
      }),
      this.prisma.projectTask.findMany({
        where: { projectId: { in: ids } },
        select: { projectId: true, task: { select: { estimatedHours: true, deletedAt: true } } },
      }),
    ]) : [[], []];
    const logged = new Map(loggedRows.map(l => [l.projectId, round1(l._sum.hoursLogged ?? 0)]));
    const deletedAtOf = new Map(projects.map(p => [p.id, p.deletedAt?.getTime() ?? null]));
    const allotted = new Map<string, number>();
    for (const row of estimateRows) {
      const t = row.task;
      const counts = !t.deletedAt || (deletedAtOf.get(row.projectId) != null && t.deletedAt.getTime() === deletedAtOf.get(row.projectId));
      if (counts) allotted.set(row.projectId, (allotted.get(row.projectId) ?? 0) + (t.estimatedHours ?? 0));
    }

    const names = await this.nameMap([...registry.map(r => r.generatedById), ...projects.map(p => p.createdBy)]);
    const person = (u: { firstName: string | null; lastName: string | null }) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();

    const shapeRound = (p: (typeof projects)[number]) => ({
      id: p.id,
      round: p.roundSeq,
      title: p.title,
      description: p.description ?? null,
      phase: p.projectPhase,
      deleted: !!p.deletedAt,
      deletedAt: p.deletedAt ?? null,
      purged: false,
      type: p.projectType ?? null,
      domain: p.technologyDomain ?? null,
      domainLabel: domainLabel(p.technologyDomain),
      priority: p.priority ?? null,
      office: p.office ?? null,
      clientGroup: p.clientGroup?.name ?? null,
      managers: p.members.filter(m => m.projectRole === 'MANAGER').map(m => person(m.user)),
      members: p.members.map(m => ({ name: person(m.user), role: m.projectRole ?? 'MEMBER' })),
      startDate: p.startDate ?? null,
      dueDate: p.dueDate ?? null,
      completedAt: p.completedAt ?? null,
      clientDeliveryDate: p.clientDeliveryDate ?? null,
      workingHours: p.workingHours ?? null,
      actualHours: p.actualHours ?? null,
      loggedHours: logged.get(p.id) ?? 0,
      allottedHours: round1(allotted.get(p.id) ?? 0),
      taskGroupCount: p._count.taskLists,
      progress: p.completionPercentage ?? null,
      createdBy: names.get(p.createdBy) ?? null,
      createdAt: p.createdAt,
    });

    const roundsByCid = new Map<string, ReturnType<typeof shapeRound>[]>();
    for (const p of projects) {
      if (!p.code) continue;
      roundsByCid.set(p.code, [...(roundsByCid.get(p.code) ?? []), shapeRound(p)]);
    }

    // Events touch a CID when it is filed under it, or when it moved away from or onto it.
    const eventsByCid = new Map<string, typeof events>();
    for (const e of events) {
      for (const c of new Set([e.cid, e.fromCid, e.toCid].filter((x): x is string => !!x))) {
        eventsByCid.set(c, [...(eventsByCid.get(c) ?? []), e]);
      }
    }

    const shapeEvent = (e: (typeof events)[number]) => ({
      id: e.id,
      type: e.type,
      label: CID_EVENT_LABELS[e.type as CidEventType] ?? e.type,
      at: e.createdAt,
      cid: e.cid,
      projectId: e.projectId,
      clientTitle: e.clientTitle,
      fromCid: e.fromCid, toCid: e.toCid,
      fromTitle: e.fromTitle, toTitle: e.toTitle,
      actorName: e.actorName ?? 'System',
      metadata: e.metadata ?? null,
    });

    const ledger = registry.map(r => {
      const rounds = roundsByCid.get(r.pid) ?? [];
      const timeline = eventsByCid.get(r.pid) ?? [];

      // Clients that carried this number and were permanently deleted exist only as PURGED events.
      const purged = timeline
        .filter(e => e.type === 'PURGED' && e.cid === r.pid && !rounds.some(x => x.id === e.projectId))
        .map(e => {
          const m = (e.metadata ?? {}) as Record<string, any>;
          return {
            id: e.projectId ?? e.id, round: typeof m.roundSeq === 'number' ? m.roundSeq : null,
            title: e.clientTitle ?? '(unknown)', description: null, phase: 'PURGED',
            deleted: true, deletedAt: m.softDeletedAt ?? null, purged: true, purgedAt: e.createdAt,
            type: m.projectType ?? null, domain: m.technologyDomain ?? null, domainLabel: domainLabel(m.technologyDomain ?? null),
            priority: null, office: m.office ?? null, clientGroup: m.clientGroup ?? null,
            managers: Array.isArray(m.managers) ? m.managers : [], members: [],
            startDate: m.startDate ?? null, dueDate: m.dueDate ?? null, completedAt: m.completedAt ?? null,
            clientDeliveryDate: null, workingHours: null, actualHours: null,
            loggedHours: typeof m.loggedHours === 'number' ? m.loggedHours : 0,
            allottedHours: typeof m.allottedHours === 'number' ? m.allottedHours : 0,
            taskGroupCount: typeof m.taskGroupCount === 'number' ? m.taskGroupCount : 0,
            progress: null, createdBy: m.createdByName ?? null, createdAt: m.createdAt ?? null,
          };
        });

      const live = rounds.filter(x => !x.deleted);
      const byRound = <T extends { round: number | null }>(xs: T[]) => [...xs].sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
      // Whose CID this is: its FIRST live client (round 1 is the client the number was issued to;
      // later rounds are more work for the same client, or a client merged in). With nobody live,
      // the newest one in the bin.
      const head = byRound(live)[0] ?? byRound(rounds).reverse()[0] ?? null;

      let status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'DELETED' | 'MERGED' | 'PURGED' | 'RETIRED';
      if (r.status === 'MERGED') status = 'MERGED';
      else if (r.status === 'PURGED') status = 'PURGED';
      else if (r.status === 'DISCONTINUED') status = 'RETIRED';
      else if (r.status === 'DELETED' || !live.length) status = live.length ? 'ACTIVE' : (rounds.length ? 'DELETED' : 'PURGED');
      else if (live.some(x => x.phase === 'ACTIVE')) status = 'ACTIVE';
      else if (live.some(x => x.phase === 'ON_HOLD')) status = 'ON_HOLD';
      else if (live.every(x => x.phase === 'COMPLETED' || x.phase === 'CLOSED')) status = 'COMPLETED';
      else status = 'ACTIVE';

      // The name: the client's title (see `head`), else the last title the ledger recorded for this
      // number (a purged or moved-away client). `pastNames` is every OTHER name recorded under the
      // number — earlier titles, other clients that carried it — so a search by any of them finds it.
      const lastKnown = [...timeline].reverse().find(e => e.cid === r.pid && (e.toTitle || e.clientTitle));
      const clientName = head?.title ?? lastKnown?.toTitle ?? lastKnown?.clientTitle ?? null;
      const pastNames = [...new Set([
        ...timeline.flatMap(e => [e.clientTitle, e.fromTitle, e.toTitle]),
        ...rounds.map(x => x.title), ...purged.map(x => x.title),
      ].filter((t): t is string => !!t && t !== clientName))];

      const minted = timeline.find(e => (e.type === 'MINTED' || e.type === 'BACKFILLED' || e.type === 'IMPORTED') && e.cid === r.pid);
      const allRounds = [...rounds, ...purged].sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
      return {
        id: r.id,
        cid: r.pid,
        fyLabel: r.fyLabel,
        serial: r.serial,
        registryStatus: r.status,
        status,
        mergedIntoCid: r.mergedIntoCid ?? null,
        clientName,
        pastNames,
        clientGroup: head?.clientGroup ?? null,
        managers: head?.managers ?? [],
        createdBy: minted?.actorName && minted.type !== 'IMPORTED' ? minted.actorName : (names.get(r.generatedById) ?? minted?.actorName ?? null),
        createdAt: r.createdAt,
        rounds: allRounds,
        liveRoundCount: live.length,
        roundCount: allRounds.length,
        totalLoggedHours: round1(allRounds.reduce((n, x) => n + (x.loggedHours ?? 0), 0)),
        totalAllottedHours: round1(allRounds.reduce((n, x) => n + (x.allottedHours ?? 0), 0)),
        taskGroupCount: allRounds.reduce((n, x) => n + (x.taskGroupCount ?? 0), 0),
        events: timeline.map(shapeEvent),
        lastEventAt: timeline.length ? timeline[timeline.length - 1].createdAt : r.createdAt,
      };
    });
    return this.redactClient(ledger, await this.canViewClient());
  }

  private async nameMap(ids: (string | null | undefined)[]) {
    const clean = [...new Set(ids.filter((x): x is string => !!x))];
    if (!clean.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  /** The catalog of project types — built-ins + the org's saved custom templates. Drives the
   *  create-form dropdown + task preview. */
  async projectTypes(organizationId: string) {
    const custom = await this.prisma.projectTemplate.findMany({
      where: { organizationId, isActive: true }, orderBy: { label: 'asc' },
    });
    return [
      ...PROJECT_TYPES,
      ...custom.map(c => ({
        value: c.value, label: c.label, description: c.description ?? 'Custom project type',
        taskListName: c.taskListName ?? c.label, tasks: c.tasks, custom: true,
      })),
    ];
  }

  /** The org that owns a project (reached through its members, like list()). */
  private async orgOfProject(id: string): Promise<string | null> {
    const m = await this.prisma.projectMember.findFirst({
      where: { projectId: id, isActive: true }, select: { user: { select: { organizationId: true } } },
    });
    return m?.user?.organizationId ?? null;
  }

  /**
   * Org admins = holders of BOTH project.approve and user.manage_access. In the seeded
   * catalog that is exactly Admin + Super Admin (a Manager has project.approve but not
   * user.manage_access; HR has user.manage_access but not project.approve) — resolved
   * by permission code rather than role name, per the RBAC convention.
   */
  private async orgAdmins(organizationId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        AND: [
          { userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'project.approve' } } } } } } },
          { userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'user.manage_access' } } } } } } },
        ],
      },
      select: { id: true },
    });
    return admins.map(a => a.id);
  }

  async list(organizationId: string, opts: { phase?: string; technologyDomain?: string; sort?: string } = {}) {
    // Scope to the projects the actor may see: a delivery lead sees every org project,
    // everyone else sees only the matters they are staffed on (conflict wall).
    const actorId = getActorId();
    const scope = actorId
      ? await this.access.projectScopeWhere(actorId, organizationId)
      : { members: { some: { user: { organizationId } } } };
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...scope,
        projectPhase: opts.phase,
        ...(opts.technologyDomain ? {
          // CLIENTS-FLOW: the domain lives on task groups now, so a client matches when it OR any
          // of its live task groups is in the domain. Reading only the client row would find no
          // client created since.
          OR: [
            { technologyDomain: opts.technologyDomain },
            { taskLists: { some: { deletedAt: null, technologyDomain: opts.technologyDomain } } },
          ],
        } : {}),
      },
      // Newest first by default: a CID's later rounds are what somebody is looking for, and a
      // long-running client's first engagement is rarely the one being asked about. The other
      // orders are offered because "what is due next" and "what is this client called" are
      // different questions from "what happened most recently".
      orderBy: PROJECT_SORTS[opts.sort ?? ''] ?? PROJECT_SORTS.NEWEST,
      select: {
        id: true,
        code: true, // P1: the CID (SQ_26_27_nnn) — so cards/rows/search can show & match it
        // A CID can hold several projects; the round distinguishes them in every list.
        roundSeq: true,
        office: true,
        title: true,
        // The KIND of matter (FTO / Invalidity / HML / Claim Chart …). Cards and list rows show
        // this as a tag — it was missing from this projection, so the tag silently never rendered
        // no matter what the card code did.
        projectType: true,
        // The FIELD the work is in (Medical, Automobile …) — cards, filters and search read it.
        technologyDomain: true,
        projectPhase: true,
        priority: true,
        completionPercentage: true,
        billable: true,
        startDate: true,
        dueDate: true,
        clientDueDate: true,
        completedAt: true,
        closedAt: true,
        // The cards show when a project was created and the client sorts on it — it was never
        // selected, so `createdAt` arrived undefined and the card fell back to an empty string.
        createdAt: true,
        currentStatus: { select: { id: true, name: true, colorHex: true } },
        // CLIENTS-FLOW: the list page groups clients under their client group, and each card
        // says how many pieces of work the client has open and when the next one is due.
        clientGroupId: true,
        clientGroup: { select: { id: true, name: true, sequence: true } },
        taskLists: {
          where: { deletedAt: null },
          orderBy: { sequence: 'asc' },
          select: { id: true, name: true, isDefault: true, status: true, dueDate: true, groupType: true, technologyDomain: true },
        },
        members: {
          where: { isActive: true },
          take: 5,
          select: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        // Count active members too, so cards/rows show the true "+N" overflow (was capped at the
        // take:5 preview, e.g. a 10-member project showed "+1" instead of "+6").
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: { where: { isActive: true } } } },
      },
    });
    // Postgres orders text by byte value, which puts "Zebra" before "apple". Nobody reading an
    // A–Z list means that, so the by-name order is settled here instead. Safe to do in code
    // because this list is not paginated — every row the caller will see is already in hand.
    const ordered = opts.sort === 'NAME'
      ? [...projects].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
      : projects;
    // CLIENTS-FLOW: open and overdue task counts per client, two grouped queries for the whole
    // page rather than one per card. "Open" is the capacity board's definition, shared.
    const ids = ordered.map(p => p.id);
    // The firm's day, not UTC's: between midnight and 05:30 IST a UTC "today" is yesterday, so a
    // task due yesterday was left out of the overdue count while the screen already called it late.
    const today = startOfIstDay(new Date());
    const [openRows, overdueRows] = ids.length ? await Promise.all([
      this.prisma.projectTask.groupBy({
        by: ['projectId'], _count: { _all: true },
        where: { projectId: { in: ids }, task: { deletedAt: null, ...OPEN_TASK_WHERE } },
      }),
      this.prisma.projectTask.groupBy({
        by: ['projectId'], _count: { _all: true },
        where: { projectId: { in: ids }, task: { deletedAt: null, dueDate: { lt: today }, ...OPEN_TASK_WHERE } },
      }),
    ]) : [[], []];
    const openBy = new Map(openRows.map(r => [r.projectId, r._count._all]));
    const overdueBy = new Map(overdueRows.map(r => [r.projectId, r._count._all]));
    const withCounts = ordered.map(p => ({
      ...p, openTaskCount: openBy.get(p.id) ?? 0, overdueTaskCount: overdueBy.get(p.id) ?? 0,
    }));
    return this.deadlines.redactProjects(withCounts, await this.deadlines.scope());
  }

  /**
   * The COMPLETE project dataset for the Reports module, in one call.
   *
   * The reports table used to fetch a thin project list and then lazily pull tasks per row, which
   * meant an export could only ever contain what the table happened to have loaded — seven columns
   * and no staffing. This returns every field a report needs, tasks and assignees included, so the
   * screen and the CSV are the same data.
   *
   * Scope and client-deadline redaction are identical to list(): a report must never become a way
   * to read a matter you aren't on, or a client date you aren't cleared for.
   */
  async fullReport(organizationId: string) {
    const actorId = getActorId();
    const scope = actorId
      ? await this.access.projectScopeWhere(actorId, organizationId)
      : { members: { some: { user: { organizationId } } } };
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, ...scope },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, code: true, roundSeq: true, office: true,
        title: true, description: true, projectType: true,
        projectPhase: true, priority: true, completionPercentage: true, billable: true,
        startDate: true, dueDate: true, clientDueDate: true,
        completedAt: true, closedAt: true,
        clientDeliveryDate: true, workingHours: true, actualHours: true,
        createdBy: true, createdAt: true,
        client: { select: { name: true, code: true } },
        currentStatus: { select: { name: true } },
        members: {
          where: { isActive: true },
          select: { projectRole: true, user: { select: { id: true, firstName: true, lastName: true, designation: true } } },
        },
        // Deleting a patent leaves its link row — a soft delete does not cascade — so without
        // this filter a removed patent goes on appearing as a live tag, and the handle it shows
        // resolves to nothing. The patent portal has always filtered them; these did not.
        patents: {
          where: { patent: { deletedAt: null } },
          select: { patent: { select: { handle: true } } },
        },
        projectTasks: {
          where: { task: { deletedAt: null } },
          select: {
            task: {
              select: {
                id: true, title: true, dueDate: true, priority: true,
                estimatedHours: true, actualHours: true,
                currentStatus: { select: { name: true, type: true } },
                assignees: {
                  select: {
                    role: true, estimatedHours: true, dueDate: true,
                    user: { select: { id: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: { where: { isActive: true } } } },
      },
    });

    // Hours actually logged per project — the report's "what did this cost" column, which is not
    // the same as the workingHours snapshot taken at completion.
    const logged = await this.prisma.timesheet.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projects.map(p => p.id) }, deletedAt: null },
      _sum: { hoursLogged: true },
    });
    const loggedById = new Map(logged.map(l => [l.projectId, round1(l._sum.hoursLogged ?? 0)]));

    const creatorIds = [...new Set(projects.map(p => p.createdBy).filter(Boolean))];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const creatorById = new Map(creators.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    const name = (u: { firstName: string | null; lastName: string | null }) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    const shaped = projects.map(p => {
      const tasks = p.projectTasks.map(pt => pt.task);
      const closed = tasks.filter(t => t.currentStatus?.type === 'CLOSED').length;
      return {
        id: p.id, pid: p.code ?? null, roundSeq: p.roundSeq, office: p.office ?? null,
        title: p.title, description: p.description ?? null,
        type: p.projectType ?? null, phase: p.projectPhase, priority: p.priority,
        status: p.currentStatus?.name ?? null,
        client: p.client?.name ?? p.client?.code ?? null,
        billable: p.billable,
        progress: p.completionPercentage,
        startDate: p.startDate, dueDate: p.dueDate, clientDueDate: p.clientDueDate,
        completedAt: p.completedAt, closedAt: p.closedAt,
        clientDeliveryDate: p.clientDeliveryDate ?? null,
        workingHours: p.workingHours ?? null, actualHours: p.actualHours ?? null,
        loggedHours: loggedById.get(p.id) ?? 0,
        estimatedHours: round1(tasks.reduce((n, t) => n + (t.estimatedHours ?? 0), 0)),
        taskCount: tasks.length, tasksClosed: closed, tasksOpen: tasks.length - closed,
        memberCount: p._count.members,
        createdBy: creatorById.get(p.createdBy) ?? null, createdAt: p.createdAt,
        patents: p.patents.map(pp => pp.patent.handle),
        managers: p.members.filter(m => m.projectRole === 'PM' || m.projectRole === 'MANAGER')
          .map(m => ({ id: m.user.id, name: name(m.user) })),
        members: p.members.map(m => ({
          id: m.user.id, name: name(m.user), role: m.projectRole ?? 'MEMBER',
          designation: m.user.designation ?? null,
        })),
        tasks: tasks.map(t => ({
          id: t.id, title: t.title, status: t.currentStatus?.name ?? null,
          isClosed: t.currentStatus?.type === 'CLOSED',
          priority: t.priority, dueDate: t.dueDate,
          estimatedHours: t.estimatedHours ?? null, actualHours: t.actualHours ?? null,
          assignees: t.assignees.map(a => ({
            id: a.user.id, name: name(a.user), role: a.role ?? 'MEMBER',
            estimatedHours: a.estimatedHours ?? null, dueDate: a.dueDate ?? null,
          })),
        })),
      };
    });
    // Redact the client deadline exactly as the list does — same rule, same scope — and then the
    // client's IDENTITY, which is a stricter rule this route never applied. `report.view` is held
    // by nearly every role, so without the second pass the report was the way round the wall that
    // the project page puts up: same rows, same client, no patent.manage anywhere in sight.
    return this.redactClient(
      this.deadlines.redactProjects(shaped as never, await this.deadlines.scope()),
      await this.canViewClient(),
    );
  }

  /**
   * Projects waiting on the CURRENT actor's approval — the manager they were routed to,
   * or (for an org admin) anything still pending. Never includes the actor's own request:
   * you cannot approve what you asked for.
   */
  async pendingApprovals(organizationId: string) {
    const actorId = getActorId();
    if (!actorId) return [];
    if (!(await this.permissions.check(actorId, 'project.approve'))) return [];

    const pending = await this.prisma.approval.findMany({
      where: { entityType: 'PROJECT', status: 'PENDING', requestedBy: { not: actorId } },
      select: { entityId: true, requestedBy: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending.length) return [];

    const isAdmin = (await this.orgAdmins(organizationId)).includes(actorId);
    const projects = await this.prisma.project.findMany({
      where: {
        id: { in: pending.map(p => p.entityId) },
        deletedAt: null,
        members: { some: { user: { organizationId } } },
        // A manager sees the requests routed to them; an admin sees every pending one.
        ...(isAdmin ? {} : { members: { some: { userId: actorId, projectRole: 'MANAGER', isActive: true } } }),
      },
      select: {
        id: true, title: true, priority: true, dueDate: true, createdAt: true, createdBy: true,
        members: {
          where: { isActive: true },
          select: { userId: true, projectRole: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
        },
      },
    });
    const requestedAt = new Map(pending.map(p => [p.entityId, p.createdAt]));
    return projects
      .map(p => ({
        id: p.id,
        title: p.title,
        priority: p.priority,
        dueDate: p.dueDate,
        requestedAt: requestedAt.get(p.id) ?? p.createdAt,
        requester: p.members.find(m => m.userId === p.createdBy)?.user ?? null,
      }))
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  /** Unredacted read for internal callers (approval, membership, rollups). */
  private async getRaw(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        currentStatus: true,
        members: {
          where: { isActive: true },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } },
          },
        },
        // Named columns, not the whole row: an unbounded include is how clientDueDate — the date
        // promised to the client — reached members who may not see it. It is selected here and
        // stripped by redactProject below for anyone outside the deadline scope.
        taskLists: {
          where: { deletedAt: null },
          orderBy: { sequence: 'asc' },
          select: {
            id: true, name: true, description: true, isDefault: true, sequence: true,
            groupType: true, technologyDomain: true, status: true, completedAt: true,
            startDate: true, dueDate: true, clientDueDate: true, createdBy: true, createdAt: true,
          },
        },
        clientGroup: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, code: true } },
        // Linked patents — HANDLES ONLY. clientId is omitted too, so a member without
        // patent.manage can't correlate the hidden client from the network payload (S2).
        patents: {
          where: { patent: { deletedAt: null } },
          select: { patent: { select: { id: true, handle: true, serial: true } } },
        },
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: true } },
      },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async get(id: string) {
    // Membership/oversight gate: a non-member (even a Super Admin who was never staffed)
    // cannot read a matter they are not on.
    const actorId = getActorId();
    await this.access.assertProjectAccess(actorId, id);
    const project = await this.getRaw(id);
    const redacted: any = this.deadlines.redactProject(project, await this.deadlines.scope());
    // Patent HANDLES are visible to patent.view holders (any project creator); CLIENT details
    // are stricter — patent.manage (Super Admin) only. The CID stays visible to everyone.
    // CLIENTS-FLOW: commented out — no patent handles while patent IDs are switched off.
    const canViewPatents = PATENTS_AND_CLIENT_CODES && actorId ? await this.permissions.check(actorId, 'patent.view') : false;
    const canViewClient = await this.canViewClient();
    if (!canViewPatents) delete redacted.patents;
    // Same pass the report, the ledger and the rounds stack use. This route's own `delete` was
    // the rule the other three were meant to be copying, and keeping four copies of it is how
    // they came to disagree in the first place.
    if (!canViewClient) return this.redactClient(redacted, false);

    // #C: while the project HAS patents they decide the client, recomputed here so it can
    // never go stale if they change. With NO patents there is nothing to derive from, and the
    // stored column is the answer — that is a client someone named directly, and returning
    // null for it (as this used to) made the whole case invisible.
    const pids = (redacted.patents ?? []).map((x: any) => x.patent?.id).filter(Boolean);
    if (pids.length) {
      const rows = await this.prisma.patent.findMany({
        where: { id: { in: pids }, deletedAt: null },
        select: { client: { select: { id: true, name: true, code: true } } },
      });
      const uniq = [...new Map(rows.map(r => [r.client.id, r.client])).values()];
      redacted.client = uniq.length === 1 ? uniq[0] : null;
    }
    redacted.clientId = (redacted.client as any)?.id ?? null;
    // Tells the UI whether the client is locked to the patents or editable on its own.
    redacted.clientFromPatents = pids.length > 0;
    return redacted;
  }

  /**
   * The organisation a ledger event about a client is filed under: the ACTOR's, as every tenant
   * decision in this service is (a project row has no organisation column). Falls back to the
   * client's own when there is no actor.
   */
  private ledgerOrg(projectId: string): Promise<string> {
    return this.cid.ledgerOrg(this.prisma, projectId);
  }

  /** One ledger event about one client, inside the caller's transaction. */
  private async recordClientEvent(
    tx: Prisma.TransactionClient, organizationId: string,
    project: { id: string; code: string | null; title: string },
    type: CidEventType,
    extra: { fromTitle?: string | null; toTitle?: string | null; metadata?: Record<string, unknown> } = {},
  ): Promise<void> {
    // Every live client carries a CID (a database CHECK); a row without one has nothing to file under.
    if (!project.code) return;
    await this.cid.recordInTx(tx, {
      organizationId, cid: project.code, projectId: project.id, clientTitle: project.title, type, ...extra,
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.access.assertProjectAccess(getActorId(), id);
    const existing = await this.getRaw(id);
    const organizationId = await this.ledgerOrg(id);
    // The generic edit may only move a project between the NON-terminal phases
    // (ACTIVE/ON_HOLD). Terminal states are reached through their own guarded
    // actions — Complete/Close (which stamp completedAt/closedAt + emit canonical events) and
    // Delete (ARCHIVED) — so a plain edit can no longer slip a project into
    // COMPLETED/CLOSED/ARCHIVED/CANCELLED, which used to leave it visible AND still writable
    // for billable time (the writability lock only checks COMPLETED/CLOSED).
    if (dto.projectPhase !== undefined && dto.projectPhase !== existing.projectPhase
        && ['COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED'].includes(dto.projectPhase)) {
      throw new BadRequestException('Use Complete, Close or Delete to change a project to that state — it cannot be set by editing.');
    }
    // #14: reject an inverted date range (dueDate before startDate). Compare against
    // the incoming value or the current one so a partial edit is still validated.
    const start = resolveDate(dto.startDate, existing.startDate);
    const due = resolveDate(dto.dueDate, existing.dueDate);
    if (start && due && due < start) {
      throw new BadRequestException('Due date cannot be before the start date.');
    }
    // Only a client-deadline viewer (or this project's manager) may set/see the client date.
    const scope = await this.deadlines.scope();
    if (dto.clientDueDate !== undefined) await this.deadlines.assertMaySetClientDue([id], scope);
    const clientDue = resolveDate(dto.clientDueDate, existing.clientDueDate);
    this.deadlines.assertOrdered(due, clientDue);

    // Keep the lifecycle timestamps consistent with the phase however it is set. Setting
    // projectPhase via this generic edit used to skip completedAt/closedAt entirely (they
    // are set only by complete()/close()), so a project edited straight to COMPLETED/CLOSED
    // had no end-date and a "reopened"-via-edit project kept a stale one.
    // CLIENTS-FLOW: filing the client under a group. null takes it out of any group. The group
    // must be this organisation's and live — checked against the ACTOR's org, who has already
    // passed the project wall above, so a group id from elsewhere cannot be planted.
    let clientGroupChange: { from: string | null; to: string | null; toName: string | null } | null = null;
    if (dto.clientGroupId !== undefined) {
      const wanted = dto.clientGroupId === null ? null : dto.clientGroupId.trim() || null;
      if (wanted !== existing.clientGroupId) {
        let toName: string | null = null;
        if (wanted) {
          if (!getActorId()) throw new ForbiddenException('You must be signed in.');
          toName = (await this.assertClientGroup(organizationId, wanted)).name;
        }
        clientGroupChange = { from: existing.clientGroupId, to: wanted, toName };
      }
    }

    let lifecycleStamps: { completedAt?: Date | null; closedAt?: Date | null } = {};
    if (dto.projectPhase !== undefined && dto.projectPhase !== existing.projectPhase) {
      if (dto.projectPhase === 'COMPLETED') lifecycleStamps = { completedAt: existing.completedAt ?? new Date(), closedAt: null };
      else if (dto.projectPhase === 'CLOSED') lifecycleStamps = { closedAt: new Date(), completedAt: existing.completedAt ?? new Date() };
      else lifecycleStamps = { completedAt: null, closedAt: null }; // any non-end-state clears the stamps
    }

    // The edit and the record that the deadline moved are ONE transaction. Split them and the
    // two disagree the first time anything fails in between: either a project quietly carries a
    // date the shift ledger has never heard of, or Performance reports a slip that was rolled
    // back. Both show up months later as a number nobody can reconcile.
    const project = await this.prisma.$transaction(async tx => {
      const p = await tx.project.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        projectPhase: dto.projectPhase,
        ...lifecycleStamps,
        ...(clientGroupChange ? { clientGroupId: clientGroupChange.to } : {}),
        // `undefined` leaves the column alone; `null` CLEARS it. Collapsing the two would
        // make a date impossible to remove once set (the update silently no-ops).
        ...(dto.startDate === undefined ? {} : { startDate: start }),
        ...(dto.dueDate === undefined ? {} : { dueDate: due }),
        ...(dto.clientDueDate === undefined ? {} : { clientDueDate: clientDue }),
        // M24: completionPercentage is DERIVED from task rollup (recomputeProjectProgress)
        // — it is the single writer. Ignore any client-supplied value to avoid the two
        // writers clobbering each other.
      },
      });
      // This is the path the capacity board's "extend deadline" (scope: project) lands on, as
      // well as the ordinary project edit form — so it is where most recorded shifts come from.
      if (dto.dueDate !== undefined) {
        await this.deadlineChanges.record({
          entityType: 'PROJECT', entityId: id, projectId: id,
          previous: existing.dueDate, next: due, tx,
        });
      }
      // The CID ledger, in the same transaction as the change it records.
      if (dto.title !== undefined && p.title !== existing.title) {
        await this.recordClientEvent(tx, organizationId, p, 'RENAMED', { fromTitle: existing.title, toTitle: p.title });
      }
      if (clientGroupChange) {
        await this.recordClientEvent(tx, organizationId, p, 'CLIENT_GROUP_CHANGED', {
          metadata: {
            fromGroupId: clientGroupChange.from, fromGroup: existing.clientGroup?.name ?? null,
            toGroupId: clientGroupChange.to, toGroup: clientGroupChange.toName,
          },
        });
      }
      if (dto.projectPhase !== undefined && p.projectPhase !== existing.projectPhase) {
        await this.recordClientEvent(tx, organizationId, p, 'PHASE_CHANGED', {
          metadata: { from: existing.projectPhase, to: p.projectPhase },
        });
      }
      return p;
    });
    // M17: project edits now appear in the audit/activity feed.
    await this.events.emit({
      action: EVENTS.PROJECT_UPDATED,
      entityType: 'PROJECT',
      entityId: id,
      metadata: { projectId: id, title: project.title },
    });
    if (clientGroupChange) {
      await this.events.emit({
        action: EVENTS.PROJECT_CLIENT_GROUP_CHANGED,
        entityType: 'PROJECT',
        entityId: id,
        metadata: { projectId: id, title: project.title, clientGroupId: clientGroupChange.to, clientGroup: clientGroupChange.toName },
      });
    }
    return this.redactProjectOut(project, scope);
  }

  /**
   * D2: approve or reject a project via the generic Approval entity.
   * The acting user must have project.approve permission; for now
   * we enforce Admin role lookup until the PermissionGuard is wired (M5).
   */
  async decide(id: string, approve: boolean, dto: ApprovalDto) {
    const project = await this.getRaw(id);

    const approval = await this.prisma.approval.findFirst({
      where: { entityType: 'PROJECT', entityId: id, status: 'PENDING' },
    });
    if (!approval) {
      throw new BadRequestException(`No pending approval for project ${id}.`);
    }

    // The approver is the verified cookie actor — never a client-supplied id.
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    await this.assertHasProjectApprovePermission(actorId);

    // Segregation of duties: the requester may not decide their own project
    // request unless they are a Super Admin.
    if (approval.requestedBy === actorId) {
      const perms = await this.permissions.getEffectivePermissions(actorId);
      if (!perms.isSuperAdmin) {
        throw new ForbiddenException('You cannot approve or reject your own project request.');
      }
    }

    const organizationId = await this.ledgerOrg(id);
    const result = await this.prisma.$transaction(async (tx) => {
      const newStatus = approve ? 'APPROVED' : 'REJECTED';

      await tx.approvalAction.create({
        data: {
          approvalId: approval.id,
          userId: actorId,
          action: approve ? 'APPROVE' : 'REJECT',
          comments: dto.reason,
        },
      });

      await tx.approval.update({
        where: { id: approval.id },
        data: { status: newStatus },
      });

      // Approval activates. Rejection PAUSES rather than sending it back to planning:
      // there is no planning phase any more, and a rejected project is not cancelled — it
      // is waiting on changes, which is exactly what ON_HOLD means.
      const updated = await tx.project.update({
        where: { id },
        data: { projectPhase: approve ? 'ACTIVE' : 'ON_HOLD' },
      });
      if (updated.projectPhase !== project.projectPhase) {
        await this.recordClientEvent(tx, organizationId, updated, 'PHASE_CHANGED', {
          metadata: { from: project.projectPhase, to: updated.projectPhase, via: approve ? 'approval' : 'rejection' },
        });
      }
      return updated;
    });

    await this.events.emit({
      action: approve ? EVENTS.PROJECT_APPROVED : EVENTS.PROJECT_REJECTED,
      entityType: 'PROJECT',
      entityId: id,
      actorId,
      metadata: { projectId: id, title: project.title, reason: dto.reason },
    });
    // Notify the requester (project creator) of the decision.
    await this.notifications.notify(approval.requestedBy, {
      type: approve ? 'project.approved' : 'project.rejected',
      title: approve ? 'Project approved' : 'Project rejected',
      message: `Your project "${project.title}" was ${approve ? 'approved' : 'rejected'}.`,
    });
    return result;
  }

  // ── Lifecycle: Complete → Close → Reopen ─────────────────────────────────────
  // These end-states are DISTINCT from soft-delete (softDelete sets deletedAt +
  // ARCHIVED). A CLOSED project stays fully intact and reopenable; it is merely moved
  // out of the active list into the Closed section.

  /** Notify every active member (except the person doing it) of a lifecycle change. */
  private async notifyMembers(project: Awaited<ReturnType<ClientsProjectsService['getRaw']>>, actorId: string | null, payload: { type: string; title: string; message: string }) {
    const recipients = project.members.map(m => m.userId).filter(uid => uid !== actorId);
    if (recipients.length) await this.notifications.notify(recipients, payload);
  }

  /** ACTIVE/ON_HOLD → COMPLETED. Work is done; the project stays listed but locked. */
  /**
   * The hours a project has consumed ON PAPER — the sum of logged timesheets, falling back to the
   * sum of task estimates when nobody logged time. This is what prefills the completion form; the
   * closer can overwrite it, and `actualHours` is a separate, hand-typed number for what it really
   * took. Exposed so the UI can show the suggestion before anyone commits to it.
   */
  async completionHoursSuggestion(id: string): Promise<{ loggedHours: number; estimatedHours: number; suggested: number }> {
    const [logged, tasks] = await Promise.all([
      this.prisma.timesheet.aggregate({ where: { projectId: id, deletedAt: null }, _sum: { hoursLogged: true } }),
      this.prisma.projectTask.findMany({
        where: { projectId: id, task: { deletedAt: null } },
        select: { task: { select: { estimatedHours: true } } },
      }),
    ]);
    const loggedHours = round1(logged._sum.hoursLogged ?? 0);
    const estimatedHours = round1(tasks.reduce((sum, t) => sum + (t.task.estimatedHours ?? 0), 0));
    return { loggedHours, estimatedHours, suggested: loggedHours > 0 ? loggedHours : estimatedHours };
  }

  async complete(id: string, dto?: { clientDeliveryDate?: string; workingHours?: number; actualHours?: number }) {
    await this.access.assertProjectAccess(getActorId(), id);
    const project = await this.getRaw(id);
    const phase = (project as { projectPhase: string }).projectPhase;
    if (phase === 'COMPLETED') return this.get(id);
    if (phase === 'CLOSED') throw new BadRequestException('This client is closed. Reopen it before marking it complete.');

    // A project is only "complete" when its WORK is complete. Every task must be closed (or
    // deleted) first — otherwise a project could be signed off with live work still on it.
    const openTasks = await this.prisma.projectTask.findMany({
      where: {
        projectId: id,
        task: { deletedAt: null, OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }] },
      },
      select: { task: { select: { title: true } } },
      take: 50,
    });
    if (openTasks.length) {
      const names = openTasks.slice(0, 3).map(t => `“${t.task.title}”`).join(', ');
      const more = openTasks.length > 3 ? ` and ${openTasks.length - 3} more` : '';
      throw new BadRequestException(
        `${openTasks.length} task${openTasks.length === 1 ? ' is' : 's are'} still open — ${names}${more}. Close or delete every task before completing the client.`,
      );
    }

    const actorId = getActorId();
    // Delivery + cost are captured AT completion, because that is the only moment anyone actually
    // knows them. Anything the caller omits falls back to something honest: delivery defaults to
    // now (the work is being signed off), and working hours to what the timesheets say.
    const suggestion = await this.completionHoursSuggestion(id);
    const delivery = dto?.clientDeliveryDate ? new Date(dto.clientDeliveryDate) : new Date();
    if (isNaN(delivery.getTime())) throw new BadRequestException('The client delivery date is not a valid date/time.');
    const hours = (v: unknown, label: string): number | null => {
      if (v == null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`${label} must be a number of hours (0 or more).`);
      // A project cannot plausibly have consumed more than a decade of one person's working life;
      // this only exists to catch a fat-fingered 80000 before it poisons every report.
      if (n > 100_000) throw new BadRequestException(`${label} looks wrong — ${n} hours.`);
      return round1(n);
    };
    const workingHours = hours(dto?.workingHours, 'Working hours') ?? suggestion.suggested;
    const actualHours = hours(dto?.actualHours, 'Actual hours');
    const organizationId = await this.ledgerOrg(id);
    const updated = await this.prisma.$transaction(async tx => {
      const u = await tx.project.update({
        where: { id },
        data: {
          projectPhase: 'COMPLETED', completedAt: new Date(),
          clientDeliveryDate: delivery, workingHours, actualHours,
        },
      });
      await this.recordClientEvent(tx, organizationId, u, 'COMPLETED', {
        metadata: { fromPhase: phase, clientDeliveryDate: delivery.toISOString(), workingHours, actualHours },
      });
      return u;
    });
    await this.events.emit({
      action: EVENTS.PROJECT_COMPLETED, entityType: 'PROJECT', entityId: id,
      actorId: actorId ?? undefined,
      metadata: { projectId: id, title: project.title, clientDeliveryDate: delivery.toISOString(), workingHours, actualHours },
    });
    await this.notifyMembers(project, actorId, {
      type: 'project.completed', title: 'Client completed',
      message: `"${project.title}" was marked complete — delivered ${delivery.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}${actualHours != null ? `, ${actualHours}h actual` : ''}.`,
    });
    return this.redactProjectOut(updated);
  }

  /** COMPLETED/CLOSED → ACTIVE. Clears the end-state timestamps. */
  async reopen(id: string) {
    await this.access.assertProjectAccess(getActorId(), id);
    const project = await this.getRaw(id);
    const phase = (project as { projectPhase: string }).projectPhase;
    if (phase !== 'COMPLETED' && phase !== 'CLOSED') {
      throw new BadRequestException('Only a completed or closed project can be reopened.');
    }
    const actorId = getActorId();
    const organizationId = await this.ledgerOrg(id);
    // Reopening keeps the same CID. The registry is re-read (the number points at the round that is
    // live again) and the ledger records it, in one transaction.
    const updated = await this.prisma.$transaction(async tx => {
      const u = await tx.project.update({
        where: { id },
        data: { projectPhase: 'ACTIVE', completedAt: null, closedAt: null },
      });
      if (u.code) await this.cid.syncRegistryInTx(tx, organizationId, u.code);
      await this.recordClientEvent(tx, organizationId, u, 'REOPENED', { metadata: { fromPhase: phase } });
      return u;
    });
    await this.events.emit({
      action: EVENTS.PROJECT_REOPENED, entityType: 'PROJECT', entityId: id,
      actorId: actorId ?? undefined, metadata: { projectId: id, title: project.title },
    });
    await this.notifyMembers(project, actorId, {
      type: 'project.reopened', title: 'Client reopened',
      message: `"${project.title}" was reopened — same CID, back to Working.`,
    });
    return this.redactProjectOut(updated);
  }

  /**
   * Re-initialize a finished client for a returning engagement — put it back to work in place,
   * KEEPING THE SAME CID and every bit of its existing data, so nothing is re-entered.
   *
   * Works from COMPLETED (or a legacy CLOSED). The number was never freed for anyone else, so
   * keeping it is integrity-safe — this is what lets an admin bring a client back under the number
   * the client already knows. The ledger records it as REINITIALIZED.
   */
  async reinitialize(id: string) {
    await this.access.assertProjectAccess(getActorId(), id);
    const project = await this.getRaw(id);
    const phase = (project as { projectPhase: string }).projectPhase;
    if (phase !== 'COMPLETED' && phase !== 'CLOSED') {
      throw new BadRequestException('Only a completed or closed project can be re-initialized.');
    }
    const actorId = getActorId();
    const organizationId = await this.ledgerOrg(id);
    // Back to ACTIVE, clearing both end-state timestamps. The code (CID) is never touched.
    const updated = await this.prisma.$transaction(async tx => {
      const u = await tx.project.update({
        where: { id },
        data: { projectPhase: 'ACTIVE', completedAt: null, closedAt: null },
      });
      if (u.code) await this.cid.syncRegistryInTx(tx, organizationId, u.code);
      await this.recordClientEvent(tx, organizationId, u, 'REINITIALIZED', { metadata: { fromPhase: phase } });
      return u;
    });
    await this.events.emit({
      action: EVENTS.PROJECT_REOPENED, entityType: 'PROJECT', entityId: id,
      actorId: actorId ?? undefined, metadata: { projectId: id, title: project.title, reinitialized: true, fromPhase: phase },
    });
    await this.notifyMembers(project, actorId, {
      type: 'project.reopened', title: 'Client re-initialized',
      message: `"${project.title}" was re-initialized — same CID, existing work kept.`,
    });
    return this.redactProjectOut(updated);
  }

  // ── Members (#11: staffing a project — add / remove teammates) ────────────────
  async addMember(projectId: string, userId: string, projectRole?: string) {
    const before = await this.getRaw(projectId);
    await this.access.assertProjectAccess(getActorId(), projectId);
    await this.access.assertProjectWritable(projectId); // no staffing a completed/closed matter
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { organizationId: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    // The Project row has no organizationId column (org is reached through members), so
    // compare the invitee's org against the project's org resolved via its members.
    const projectOrg = await this.orgOfProject(projectId);
    if (projectOrg && user.organizationId !== projectOrg) {
      throw new BadRequestException('User is not in this project\'s organization.');
    }
    const organizationId = await this.ledgerOrg(projectId);
    const person = (u: { id: string; firstName: string | null; lastName: string | null }) =>
      ({ id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() });
    const managersBefore = before.members.filter(m => m.projectRole === 'MANAGER').map(m => person(m.user));
    await this.prisma.$transaction(async tx => {
      // Re-activate if they were previously removed; the global filter maps the unique
      // clash to 409 if they are already an active member.
      const existing = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
      if (existing) {
        await tx.projectMember.update({ where: { id: existing.id }, data: { isActive: true, projectRole: projectRole ?? existing.projectRole } });
      } else {
        await tx.projectMember.create({ data: { projectId, userId, projectRole: projectRole ?? 'MEMBER' } });
      }
      // Staffing somebody AS the manager (or re-roling the manager) changes who runs the client —
      // a fact the CID ledger keeps, in the same transaction.
      const managersAfter = (await tx.projectMember.findMany({
        where: { projectId, isActive: true, projectRole: 'MANAGER' },
        select: { user: { select: { id: true, firstName: true, lastName: true } } },
      })).map(m => person(m.user));
      const key = (xs: { id: string }[]) => xs.map(x => x.id).sort().join(',');
      if (key(managersBefore) !== key(managersAfter)) {
        await this.recordClientEvent(tx, organizationId, before, 'MANAGER_CHANGED', {
          metadata: { from: managersBefore, to: managersAfter },
        });
      }
    });
    return this.get(projectId);
  }

  async removeMember(projectId: string, userId: string) {
    await this.access.assertProjectAccess(getActorId(), projectId);
    const project = await this.getRaw(projectId);
    // The MANAGER owns and approves this project — removing them would strand it with
    // no owner (and, while PENDING, no approver). Reassign the manager instead.
    const isManager = project.members.some(m => m.userId === userId && m.projectRole === 'MANAGER');
    if (isManager) {
      throw new BadRequestException('The project manager cannot be removed. Assign a different manager first.');
    }
    // Unassign the removed member from this project's tasks — otherwise a stale non-member
    // stays selected and 400s every future assignee edit on those tasks (D1).
    const links = await this.prisma.projectTask.findMany({ where: { projectId }, select: { taskId: true } });
    const taskIds = links.map(l => l.taskId);
    await this.prisma.$transaction([
      this.prisma.projectMember.deleteMany({ where: { projectId, userId } }),
      ...(taskIds.length ? [this.prisma.taskAssignee.deleteMany({ where: { userId, taskId: { in: taskIds } } })] : []),
    ]);
    return this.get(projectId);
  }

  // ── Client attribution (Phase 2) ─────────────────────────────────────────────
  /**
   * Validate a client named directly (rather than inferred from patents).
   *
   * Naming one requires `patent.manage`: a client's identity — that "MLK" is a particular
   * company — is the confidential fact this system protects, and a dropdown of client names is
   * exactly that fact. Everyone else attaches a client the indirect way, by tagging a patent
   * handle, which reveals nothing about who the client is.
   */
  private async resolveNamedClient(organizationId: string, actorId: string, clientId: string): Promise<string> {
    if (!(await this.permissions.check(actorId, 'patent.manage'))) {
      throw new ForbiddenException('You are not permitted to set a project\'s client.');
    }
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
      select: { id: true, code: true, archivedAt: true },
    });
    if (!client) throw new BadRequestException('That client does not exist.');
    if (client.archivedAt) {
      throw new BadRequestException(`Client ${client.code} is archived — restore it before assigning new work to it.`);
    }
    return client.id;
  }

  /**
   * Set (or clear) a project's client directly.
   *
   * REFUSED while the project has tagged patents. That is the whole guarantee: a project's
   * client is either inferred from its patents or stated on its own, never both, so the two can
   * never end up disagreeing about who the work is for.
   */

  /**
   * A CID identifies ONE matter for ONE client. Refuse anything that would make it mean two.
   *
   * `Project.code` is the CID, and it is deliberately not unique: a returning client's next piece
   * of work is a new Project row under the same code — "round 2". Every round is therefore the
   * same engagement for the same client, and the CID is what the firm quotes on reports and
   * invoices to identify it.
   *
   * `addRound` copies the client and the patent links, so a round starts out correct. Nothing
   * stopped it being changed AFTERWARDS. Re-tagging round 2 to another client's patent, or naming
   * a different client directly, silently left one CID spanning two clients — the ledger then
   * attributed round 1's hours to one and round 2's to another under a single identifier, and two
   * people quoting the same CID meant different matters.
   *
   * Checked against the OTHER live rounds only. A single-round project has nothing to disagree
   * with, and soft-deleted rounds are excluded: a round that has been removed should not veto a
   * correction to the one that remains.
   */
  private async assertPidClientConsistent(
    projectId: string,
    code: string | null,
    nextClientId: string | null,
  ): Promise<void> {
    // No CID, or no client being set, means there is nothing a sibling could contradict.
    if (!code || !nextClientId) return;

    const siblings = await this.prisma.project.findMany({
      where: { code, deletedAt: null, id: { not: projectId }, clientId: { not: null } },
      select: { roundSeq: true, clientId: true, client: { select: { code: true } } },
      orderBy: { roundSeq: 'asc' },
    });
    const conflicting = siblings.find(sib => sib.clientId !== nextClientId);
    if (!conflicting) return;

    throw new BadRequestException(
      `${code} already belongs to client ${conflicting.client?.code ?? 'another client'} `
      + `(round ${conflicting.roundSeq}). Every round under one CID is the same client's `
      + 'work — start a new project instead of re-pointing this one.',
    );
  }

  async setClient(projectId: string, clientId: string | null) {
    const actorId = getActorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId);
    if (!actorId) throw new ForbiddenException('Not signed in.');
    const organizationId = await this.orgOfProject(projectId);

    const tagged = await this.prisma.projectPatent.count({ where: { projectId } });
    if (tagged) {
      throw new BadRequestException(
        'This project\'s client comes from its tagged patents. Change the patents to change the client.',
      );
    }
    const resolved = clientId
      ? await this.resolveNamedClient(organizationId ?? '', actorId, clientId)
      : null;
    // Clearing still needs the same authority as setting — otherwise anyone who can edit the
    // project could quietly detach it from the client it is billed to.
    if (!clientId && !(await this.permissions.check(actorId, 'patent.manage'))) {
      throw new ForbiddenException('You are not permitted to change a project\'s client.');
    }
    const { code } = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId }, select: { code: true },
    });
    await this.assertPidClientConsistent(projectId, code, resolved);
    await this.prisma.project.update({ where: { id: projectId }, data: { clientId: resolved } });
    await this.events.emit({
      action: 'project.client_changed', entityType: 'PROJECT', entityId: projectId,
      ...(organizationId ? { organizationId } : {}),
      metadata: { clientId: resolved },
    });
    return this.get(projectId);
  }

  // ── Patent tagging (Phase 2) ─────────────────────────────────────────────────
  /**
   * Replace the set of patents tagged to a project.
   *
   * Until now patents could only be chosen at creation, so a project tagged with the wrong
   * patent — or created before its patents were registered — could never be corrected. Sending
   * the WHOLE desired set rather than add/remove deltas makes the call idempotent: two people
   * saving the same list twice land on the same state instead of stacking up duplicate links.
   *
   * Who may do this: anyone who can edit the project. It is deliberately NOT gated on
   * `patent.manage` (the Super-Admin-only confidential surface) — tagging a handle to your own
   * project needs no sight of the real patent number. `patent.view` sits in everyone's basics,
   * so the check below only bites if a Super Admin has explicitly taken it away from a role.
   */
  async setPatents(projectId: string, patentIds: string[]) {
    const actorId = getActorId();
    await this.access.assertProjectAccess(actorId, projectId);
    await this.access.assertProjectWritable(projectId); // a completed/closed matter is settled
    if (!actorId || !(await this.permissions.check(actorId, 'patent.view'))) {
      throw new ForbiddenException('You are not permitted to tag patents.');
    }
    const organizationId = await this.orgOfProject(projectId);

    const wanted = [...new Set(patentIds.filter(Boolean))];
    const currentIds = new Set((await this.prisma.projectPatent.findMany({
      where: { projectId }, select: { patentId: true },
    })).map(l => l.patentId));
    const added = wanted.filter(id => !currentIds.has(id));
    const removed = [...currentIds].filter(id => !wanted.includes(id));
    if (!added.length && !removed.length) return this.get(projectId);

    // Validate the whole desired set, not just the additions — a patent deleted since the page
    // loaded must not be silently re-linked by a save that was only meant to add one.
    const found = wanted.length ? await this.prisma.patent.findMany({
      where: { id: { in: wanted }, deletedAt: null, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, handle: true, clientId: true, client: { select: { code: true, archivedAt: true } } },
    }) : [];
    if (found.length !== wanted.length) {
      throw new BadRequestException('One or more selected patents are invalid.');
    }
    // An archived client takes no NEW work. Patents already tagged stay tagged, so archiving a
    // client never quietly rewrites a project that referenced it.
    const fromArchived = found.filter(p => added.includes(p.id) && p.client.archivedAt);
    if (fromArchived.length) {
      throw new BadRequestException(
        `${fromArchived.map(p => p.handle).join(', ')} ${fromArchived.length === 1 ? 'belongs' : 'belong'} to archived client ${fromArchived[0].client.code} — restore it first.`,
      );
    }
    const clientIds = [...new Set(found.map(p => p.clientId))];
    if (clientIds.length > 1) {
      throw new BadRequestException('Selected patents belong to different clients — a project maps to one client.');
    }
    const derivedClientId = clientIds[0] ?? null;

    // Same rule as setClient, and it has to be here too: tagging is the OTHER way a project's
    // client changes, and it is the one people actually use.
    const { code: pid } = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId }, select: { code: true },
    });
    await this.assertPidClientConsistent(projectId, pid, derivedClientId);

    await this.prisma.$transaction([
      ...(removed.length ? [this.prisma.projectPatent.deleteMany({ where: { projectId, patentId: { in: removed } } })] : []),
      ...(added.length ? [this.prisma.projectPatent.createMany({
        data: added.map(patentId => ({ projectId, patentId, addedBy: actorId })),
        skipDuplicates: true,
      })] : []),
      // Keep the stored client in step with the links — the column is what every other query
      // (the client ledger above all) reads.
      //
      // Removing the LAST patent deliberately leaves the client alone rather than nulling it.
      // "I tagged the wrong patent" is not "this is no longer that client's work", and wiping
      // the attribution would silently drop the project out of the ledger. With no patents left
      // the client becomes directly editable, so it can still be corrected on purpose.
      ...(wanted.length ? [this.prisma.project.update({ where: { id: projectId }, data: { clientId: derivedClientId } })] : []),
    ]);
    // Counts only: which handles sit on which project is project-scoped information, and the
    // audit log is read by people who are not on the project.
    await this.events.emit({
      action: 'project.patents_changed', entityType: 'PROJECT', entityId: projectId,
      ...(organizationId ? { organizationId } : {}),
      metadata: { added: added.length, removed: removed.length, total: wanted.length },
    });
    return this.get(projectId);
  }

  async softDelete(id: string) {
    await this.access.assertProjectAccess(getActorId(), id); // S4: match the other project mutations
    const before = await this.getRaw(id);
    const organizationId = await this.ledgerOrg(id);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: { deletedAt: now, projectPhase: 'ARCHIVED' },
      });
      // The CID stays reserved to the deleted client: the registry reads DELETED once no live
      // client carries it (ATTACHED while another round still does), and the ledger records the
      // phase it held — which is what lets a restore put it back where it was.
      if (project.code) await this.cid.syncRegistryInTx(tx, organizationId, project.code);
      await this.recordClientEvent(tx, organizationId, project, 'DELETED', {
        metadata: {
          phaseBefore: before.projectPhase, deletedAt: now.toISOString(),
          clientGroup: before.clientGroup?.name ?? null,
          managers: before.members.filter(m => m.projectRole === 'MANAGER')
            .map(m => `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim()),
        },
      });
      // Cascade so children stop surfacing in cross-project reads (My Tasks, issues, perf).
      await tx.issue.updateMany({ where: { projectId: id, deletedAt: null }, data: { deletedAt: now } });
      const links = await tx.projectTask.findMany({ where: { projectId: id }, select: { taskId: true } });
      const taskIds = [...new Set(links.map(l => l.taskId))];
      if (taskIds.length) {
        // Keep tasks that also live in another non-deleted project (M2M); archive the rest.
        const shared = await tx.projectTask.findMany({
          where: { taskId: { in: taskIds }, projectId: { not: id }, project: { deletedAt: null } },
          select: { taskId: true },
        });
        const keep = new Set(shared.map(l => l.taskId));
        const toArchive = taskIds.filter(t => !keep.has(t));
        if (toArchive.length) {
          await tx.task.updateMany({ where: { id: { in: toArchive }, deletedAt: null }, data: { deletedAt: now } });
        }
      }
      return project;
    });
  }

  private async assertHasProjectApprovePermission(userId: string) {
    const allowed = await this.permissions.check(userId, 'project.approve');
    if (!allowed) {
      throw new ForbiddenException('project.approve permission required.');
    }
  }
}
