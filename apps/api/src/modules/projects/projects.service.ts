import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateProjectDto, UpdateProjectDto, ApprovalDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';
import { resolveDate } from '../../common/dates';
import { PROJECT_TYPES, templateFor } from './project-templates';
import { SequenceService } from '../../common/sequence/sequence.service';
import { financialYear, formatPid, pidScope } from '../../common/financial-year';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly deadlines: DeadlineVisibilityService,
    private readonly access: ProjectAccessService,
    private readonly sequence: SequenceService,
  ) {}

  /**
   * Users who may approve projects (hold project.approve) — the pool of people who can
   * be nominated as a project's manager. Powers the "Project Manager" picker, so a
   * requester can only choose someone who can actually approve their request.
   */
  eligibleManagers(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'project.approve' } } } } } },
      },
      select: { id: true, firstName: true, lastName: true, designation: true, profilePhoto: true },
      orderBy: [{ firstName: 'asc' }],
    });
  }

  /**
   * D2: any user may REQUEST a project — including an Employee/intern, who holds
   * project.create but NOT project.approve. The project starts in PLANNING awaiting
   * approval, and a generic Approval record is raised.
   *
   * Every project has a designated MANAGER, who is also its approver:
   *   • a requester who can approve projects manages their own by default;
   *   • a requester who CANNOT (intern/employee/consultant) must nominate a manager
   *     who holds project.approve — the request is routed to that person, and the
   *     requester joins as an ordinary MEMBER.
   * The mandatory "General" task list is created in the same transaction.
   */
  async create(dto: CreateProjectDto) {
    // Identity & org come from the verified cookie actor — never the client body
    // (fixes spoofable createdBy and the email-vs-id create bug).
    const actorId = getActorId();
    const creator = actorId
      ? await this.prisma.user.findFirst({ where: { id: actorId, deletedAt: null } })
      : null;
    if (!creator) throw new ForbiddenException('You must be signed in to create a project.');
    const organizationId = creator.organizationId;

    // ── PID authority: who assigns the Project ID ─────────────────────────────────
    // Authorities (project.generate_pid) attach the PID themselves. Everyone else nominates an
    // authority; the project is created with the PID PENDING and a request is routed to that
    // person, who becomes the project's MANAGER.
    const canGeneratePid = await this.permissions.check(creator.id, 'project.generate_pid');
    let pidAssigneeId = '';
    if (!canGeneratePid) {
      pidAssigneeId = dto.pidAssigneeId?.trim() || '';
      if (!pidAssigneeId) {
        throw new BadRequestException('Select who should assign the Project ID (PID) for this project.');
      }
      const assignee = await this.prisma.user.findFirst({
        where: { id: pidAssigneeId, organizationId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!assignee) throw new BadRequestException('The selected person is not an active member of this organization.');
      if (!(await this.permissions.check(pidAssigneeId, 'project.generate_pid'))) {
        throw new BadRequestException('The selected person cannot assign a PID. Choose someone with PID authority.');
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

    // The creator leads their own project; when a requester nominates an authority, that
    // authority becomes the MANAGER (senior owner) and the requester joins as a MEMBER.
    const members = pidAssigneeId
      ? [{ userId: pidAssigneeId, projectRole: 'MANAGER' }, { userId: creator.id, projectRole: 'MEMBER' }]
      : [{ userId: creator.id, projectRole: 'MANAGER' }];

    // A patent-analysis project TYPE (HML, Claim Chart, FTO, …) auto-creates that type's
    // standard workflow as a task list of ready-made tasks. Resolved before the write.
    const template = templateFor(dto.projectType);

    // ── Patent linkage (Phase 1) — the client is DERIVED from the patents, never picked.
    // Only patent.view holders (Super Admin by default, or anyone granted it) may attach
    // patents; the field is hidden for everyone else and the API re-checks so it can't be forced.
    let patentIds: string[] = [];
    let derivedClientId: string | null = null;
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
    }

    // An authority attaches a PID now — their own generated one (validated + claimed) or a
    // freshly minted serial. A requester's project starts with a null (pending) code, which
    // the nominated authority fills in later via fulfillPidRequest.
    const pid: string | null = canGeneratePid
      ? (dto.pid ? await this.claimPid(organizationId, dto.pid) : await this.mintPid(organizationId))
      : null;

    // Projects are usable immediately — they are created ACTIVE, with no approval gate.
    // Project + members + task lists + any template tasks are one transaction so a partial
    // failure never leaves a project with a half-built workflow.
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          code: pid,
          title: dto.title,
          description: dto.description,
          projectType: dto.projectType ?? null,
          clientId: derivedClientId,
          projectPhase: 'ACTIVE',
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: internalDue,
          clientDueDate: clientDue,
          createdBy: creator.id,
          members: { create: members },
          taskLists: {
            create: { name: 'General', isDefault: true, sequence: 0 },
          },
        },
        include: { taskLists: true },
      });

      if (patentIds.length) {
        await tx.projectPatent.createMany({
          data: patentIds.map(pId => ({ projectId: created.id, patentId: pId, addedBy: creator.id })),
          skipDuplicates: true,
        });
      }

      if (template) {
        // Resolve the org's GLOBAL workflow and its first OPEN status so the generated
        // tasks open in the correct board column (mirrors TasksService.create).
        const wf = await tx.workflow.findFirst({
          where: { type: 'GLOBAL' },
          orderBy: { name: 'asc' },
          select: { id: true, statuses: { orderBy: { sequence: 'asc' }, select: { id: true, type: true } } },
        });
        const initialStatusId = wf ? (wf.statuses.find(s => s.type === 'OPEN') ?? wf.statuses[0])?.id : undefined;

        const list = await tx.taskList.create({
          data: { projectId: created.id, name: template.taskListName!, sequence: 1 },
        });
        // Sequentially, so ProjectTask.sequence reflects the workflow order.
        for (let i = 0; i < template.tasks!.length; i++) {
          const task = await tx.task.create({
            data: {
              title: template.tasks![i],
              priority: 'MEDIUM',
              createdBy: creator.id,
              ...(wf ? { workflowId: wf.id } : {}),
              ...(initialStatusId ? { currentWorkflowStatusId: initialStatusId } : {}),
            },
          });
          await tx.projectTask.create({
            data: { projectId: created.id, taskId: task.id, taskListId: list.id, sequence: i },
          });
        }
      }

      // A requester's project carries a pending PID request, routed to the chosen authority.
      if (pidAssigneeId) {
        await tx.pidRequest.create({
          data: { organizationId, projectId: created.id, requestedById: creator.id, assigneeId: pidAssigneeId },
        });
      }

      return created;
    });

    await this.events.emit({
      action: EVENTS.PROJECT_CREATED,
      entityType: 'PROJECT',
      entityId: project.id,
      organizationId,
      actorId: creator.id,
      metadata: { projectId: project.id, title: project.title, pidPending: !!pidAssigneeId },
    });

    // Route the PID request to the chosen authority (best-effort, outside the tx).
    if (pidAssigneeId) {
      await this.notifications.notify(pidAssigneeId, {
        type: 'project.pid_requested',
        title: 'PID requested',
        message: `${creator.firstName} ${creator.lastName} needs a Project ID for "${project.title}".`,
        link: '/projects',
      });
    }

    // Projects are billable by default; billability is decided per time entry by each
    // logger, so there is no admin billable-review step on creation any more.
    return this.deadlines.redactProject(project as any, scope);
  }

  // ── PID generation + request flow ─────────────────────────────────────────
  /** Mint a fresh PID serial — a real, committed allocation (gap-tolerant). */
  private async mintPid(organizationId: string): Promise<string> {
    const orgRec = await this.prisma.organization.findUnique({
      where: { id: organizationId }, select: { code: true },
    });
    const fy = financialYear(new Date());
    const serial = await this.sequence.allocate(pidScope(organizationId, fy.label));
    return formatPid(orgRec?.code ?? 'SQ', fy.label, serial);
  }

  /** Validate + claim a supplied PID: correct shape for this org, not already in use, and the
   *  FY counter is advanced past it so a future auto-mint can never collide with it. */
  private async claimPid(organizationId: string, raw: string): Promise<string> {
    const orgRec = await this.prisma.organization.findUnique({
      where: { id: organizationId }, select: { code: true },
    });
    const orgCode = orgRec?.code ?? 'SQ';
    const pid = raw.trim().toUpperCase();
    const m = new RegExp(`^${orgCode}_(\\d{2})_(\\d{2})_(\\d{1,6})$`).exec(pid);
    if (!m) {
      throw new BadRequestException(`"${raw}" is not a valid Project ID (expected ${orgCode}_YY_YY_NNN).`);
    }
    const clash = await this.prisma.project.findFirst({ where: { code: pid }, select: { id: true } });
    if (clash) throw new BadRequestException(`Project ID ${pid} is already in use.`);
    await this.sequence.ensureAtLeast(pidScope(organizationId, `${m[1]}_${m[2]}`), parseInt(m[3], 10));
    return pid;
  }

  /** Mint a PID on demand (the "Generate PID" button). Authority-gated at the controller. */
  async generatePid(organizationId: string) {
    return { pid: await this.mintPid(organizationId) };
  }

  /** Members who may assign a PID (hold project.generate_pid) — the request dropdown. */
  pidAuthorities(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'project.generate_pid' } } } } } },
      },
      select: { id: true, firstName: true, lastName: true, designation: true, profilePhoto: true },
      orderBy: [{ firstName: 'asc' }],
    });
  }

  /** PENDING PID requests routed to this authority (their fulfilment queue). */
  async pidRequestsFor(organizationId: string, userId: string) {
    const rows = await this.prisma.pidRequest.findMany({
      where: { organizationId, assigneeId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { project: { select: { id: true, title: true, projectType: true } } },
    });
    const requesterIds = [...new Set(rows.map(r => r.requestedById))];
    const requesters = requesterIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const nameById = new Map(requesters.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    return rows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectTitle: r.project.title,
      projectType: r.project.projectType,
      requestedBy: nameById.get(r.requestedById) ?? 'A colleague',
      note: r.note,
      createdAt: r.createdAt,
    }));
  }

  /** Assign a PID to a pending-request project (the authority pastes or generates the PID). */
  async fulfillPidRequest(organizationId: string, userId: string, requestId: string, rawPid: string) {
    const req = await this.prisma.pidRequest.findFirst({
      where: { id: requestId, organizationId },
      select: { id: true, projectId: true, assigneeId: true, requestedById: true, status: true },
    });
    if (!req) throw new NotFoundException('PID request not found.');
    if (req.assigneeId !== userId) throw new ForbiddenException('This PID request is assigned to someone else.');
    if (req.status !== 'PENDING') throw new BadRequestException('This PID request has already been resolved.');

    const pid = await this.claimPid(organizationId, rawPid);
    await this.prisma.$transaction([
      this.prisma.project.update({ where: { id: req.projectId }, data: { code: pid } }),
      this.prisma.pidRequest.update({ where: { id: req.id }, data: { status: 'FULFILLED', pid, resolvedAt: new Date() } }),
    ]);
    await this.notifications.notify(req.requestedById, {
      type: 'project.pid_assigned',
      title: 'PID assigned',
      message: `Your project has been assigned Project ID ${pid}.`,
      link: `/projects/${req.projectId}`,
    });
    return { pid, projectId: req.projectId };
  }

  /** The catalog of project types (drives the create-form dropdown + task preview). */
  projectTypes() {
    return PROJECT_TYPES;
  }

  /**
   * Non-binding preview of the PID the next created project would get. Labelled non-binding
   * because a concurrent create consumes the serial first — only create()'s result is authoritative.
   */
  async nextPid() {
    const actorId = getActorId();
    const creator = actorId
      ? await this.prisma.user.findFirst({ where: { id: actorId, deletedAt: null }, select: { organizationId: true } })
      : null;
    if (!creator) return { pid: null as string | null };
    const orgRec = await this.prisma.organization.findUnique({
      where: { id: creator.organizationId }, select: { code: true },
    });
    const fy = financialYear(new Date());
    const serial = await this.sequence.peek(pidScope(creator.organizationId, fy.label));
    return { pid: formatPid(orgRec?.code ?? 'SQ', fy.label, serial) };
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

  async list(organizationId: string, opts: { phase?: string } = {}) {
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
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true, // P1: the PID (SQ_26_27_nnn) — so cards/rows/search can show & match it
        title: true,
        projectPhase: true,
        priority: true,
        completionPercentage: true,
        billable: true,
        startDate: true,
        dueDate: true,
        clientDueDate: true,
        completedAt: true,
        closedAt: true,
        currentStatus: { select: { id: true, name: true, colorHex: true } },
        members: {
          where: { isActive: true },
          take: 5,
          select: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } },
      },
    });
    return this.deadlines.redactProjects(projects, await this.deadlines.scope());
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
        taskLists: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
        client: { select: { id: true, name: true, code: true } },
        // Linked patents — HANDLES ONLY. clientId is omitted too, so a member without
        // patent.manage can't correlate the hidden client from the network payload (S2).
        patents: {
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
    // are stricter — patent.manage (Super Admin) only. The PID stays visible to everyone.
    const canViewPatents = actorId ? await this.permissions.check(actorId, 'patent.view') : false;
    const canViewClient = actorId ? await this.permissions.check(actorId, 'patent.manage') : false;
    if (!canViewPatents) delete redacted.patents;
    if (!canViewClient) {
      delete redacted.client;
      delete redacted.clientId;
    } else {
      // #C: derive the client from the CURRENTLY linked patents, so it can never go stale even
      // if the project's patents are changed later (the stored clientId is just a hint).
      const pids = (redacted.patents ?? []).map((x: any) => x.patent?.id).filter(Boolean);
      const rows = pids.length
        ? await this.prisma.patent.findMany({
            where: { id: { in: pids }, deletedAt: null },
            select: { client: { select: { id: true, name: true, code: true } } },
          })
        : [];
      const uniq = [...new Map(rows.map(r => [r.client.id, r.client])).values()];
      redacted.client = uniq.length === 1 ? uniq[0] : null;
      redacted.clientId = (redacted.client as any)?.id ?? null;
    }
    return redacted;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.access.assertProjectAccess(getActorId(), id);
    const existing = await this.getRaw(id);
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
    let lifecycleStamps: { completedAt?: Date | null; closedAt?: Date | null } = {};
    if (dto.projectPhase !== undefined && dto.projectPhase !== existing.projectPhase) {
      if (dto.projectPhase === 'COMPLETED') lifecycleStamps = { completedAt: existing.completedAt ?? new Date(), closedAt: null };
      else if (dto.projectPhase === 'CLOSED') lifecycleStamps = { closedAt: new Date(), completedAt: existing.completedAt ?? new Date() };
      else lifecycleStamps = { completedAt: null, closedAt: null }; // any non-end-state clears the stamps
    }

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        projectPhase: dto.projectPhase,
        ...lifecycleStamps,
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
    // M17: project edits now appear in the audit/activity feed.
    await this.events.emit({
      action: EVENTS.PROJECT_UPDATED,
      entityType: 'PROJECT',
      entityId: id,
      metadata: { projectId: id, title: project.title },
    });
    return this.deadlines.redactProject(project, scope);
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

      // Advance project phase to ACTIVE on approval, back to PLANNING on rejection
      return tx.project.update({
        where: { id },
        data: { projectPhase: approve ? 'ACTIVE' : 'PLANNING' },
      });
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
  private async notifyMembers(project: Awaited<ReturnType<ProjectsService['getRaw']>>, actorId: string | null, payload: { type: string; title: string; message: string }) {
    const recipients = project.members.map(m => m.userId).filter(uid => uid !== actorId);
    if (recipients.length) await this.notifications.notify(recipients, payload);
  }

  /** ACTIVE/ON_HOLD → COMPLETED. Work is done; the project stays listed but locked. */
  async complete(id: string) {
    await this.access.assertProjectAccess(getActorId(), id);
    const project = await this.getRaw(id);
    const phase = (project as { projectPhase: string }).projectPhase;
    if (phase === 'COMPLETED') return this.get(id);
    if (phase === 'CLOSED') throw new BadRequestException('This project is closed. Reopen it before marking it complete.');
    if (phase === 'PLANNING') throw new BadRequestException('A project still in planning cannot be completed — activate it first.');
    const actorId = getActorId();
    const updated = await this.prisma.project.update({
      where: { id },
      data: { projectPhase: 'COMPLETED', completedAt: new Date() },
    });
    await this.events.emit({
      action: EVENTS.PROJECT_COMPLETED, entityType: 'PROJECT', entityId: id,
      actorId: actorId ?? undefined, metadata: { projectId: id, title: project.title },
    });
    await this.notifyMembers(project, actorId, {
      type: 'project.completed', title: 'Project completed',
      message: `"${project.title}" was marked complete.`,
    });
    return this.deadlines.redactProject(updated, await this.deadlines.scope());
  }

  /** COMPLETED (or active) → CLOSED. Archived to the Closed section; still reopenable. */
  async close(id: string) {
    await this.access.assertProjectAccess(getActorId(), id);
    const project = await this.getRaw(id);
    const phase = (project as { projectPhase: string }).projectPhase;
    if (phase === 'CLOSED') return this.get(id);
    if (phase === 'PLANNING') throw new BadRequestException('A project still in planning cannot be closed.');
    const actorId = getActorId();
    const now = new Date();
    const updated = await this.prisma.project.update({
      where: { id },
      // Closing implies completion — backfill completedAt if it was closed directly.
      data: { projectPhase: 'CLOSED', closedAt: now, ...(project.completedAt ? {} : { completedAt: now }) },
    });
    await this.events.emit({
      action: EVENTS.PROJECT_CLOSED, entityType: 'PROJECT', entityId: id,
      actorId: actorId ?? undefined, metadata: { projectId: id, title: project.title },
    });
    await this.notifyMembers(project, actorId, {
      type: 'project.closed', title: 'Project closed',
      message: `"${project.title}" was closed and moved to the Closed section.`,
    });
    return this.deadlines.redactProject(updated, await this.deadlines.scope());
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
    const updated = await this.prisma.project.update({
      where: { id },
      data: { projectPhase: 'ACTIVE', completedAt: null, closedAt: null },
    });
    await this.events.emit({
      action: EVENTS.PROJECT_REOPENED, entityType: 'PROJECT', entityId: id,
      actorId: actorId ?? undefined, metadata: { projectId: id, title: project.title },
    });
    await this.notifyMembers(project, actorId, {
      type: 'project.reopened', title: 'Project reopened',
      message: `"${project.title}" was reopened and is active again.`,
    });
    return this.deadlines.redactProject(updated, await this.deadlines.scope());
  }

  // ── Members (#11: staffing a project — add / remove teammates) ────────────────
  async addMember(projectId: string, userId: string, projectRole?: string) {
    await this.getRaw(projectId);
    await this.access.assertProjectAccess(getActorId(), projectId);
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { organizationId: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    // The Project row has no organizationId column (org is reached through members), so
    // compare the invitee's org against the project's org resolved via its members.
    const projectOrg = await this.orgOfProject(projectId);
    if (projectOrg && user.organizationId !== projectOrg) {
      throw new BadRequestException('User is not in this project\'s organization.');
    }
    // Re-activate if they were previously removed; the global filter maps the unique
    // clash to 409 if they are already an active member.
    const existing = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (existing) {
      await this.prisma.projectMember.update({ where: { id: existing.id }, data: { isActive: true, projectRole: projectRole ?? existing.projectRole } });
    } else {
      await this.prisma.projectMember.create({ data: { projectId, userId, projectRole: projectRole ?? 'MEMBER' } });
    }
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

  async softDelete(id: string) {
    await this.access.assertProjectAccess(getActorId(), id); // S4: match the other project mutations
    await this.getRaw(id);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: { deletedAt: now, projectPhase: 'ARCHIVED' },
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
