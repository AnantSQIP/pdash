import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateProjectDto, UpdateProjectDto, ApprovalDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';
import { resolveDate } from '../../common/dates';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly deadlines: DeadlineVisibilityService,
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

    // ── Resolve the project manager (= the approver of this request) ──────────────
    const creatorCanApprove = await this.permissions.check(creator.id, 'project.approve');
    let managerId = dto.managerId?.trim() || (creatorCanApprove ? creator.id : '');
    if (!managerId) {
      throw new BadRequestException('Select the project manager who should approve and own this project.');
    }
    if (managerId !== creator.id) {
      const manager = await this.prisma.user.findFirst({
        where: { id: managerId, organizationId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!manager) throw new BadRequestException('The selected project manager is not an active member of this organization.');
    }
    // The manager must actually be able to approve projects, or the request would strand.
    if (!(await this.permissions.check(managerId, 'project.approve'))) {
      throw new BadRequestException('The selected person cannot approve projects. Choose a manager with approval rights.');
    }

    // ── Deadlines: internal is open; the client date is restricted (new project → the
    //    global permission is the only qualifier, there is no manager relationship yet).
    const scope = await this.deadlines.scope(creator.id);
    const internalDue = dto.dueDate ? new Date(dto.dueDate) : undefined;
    const clientDue = dto.clientDueDate ? new Date(dto.clientDueDate) : undefined;
    if (clientDue) await this.deadlines.assertMaySetClientDue([], scope);
    this.deadlines.assertOrdered(internalDue, clientDue);

    const members = managerId === creator.id
      ? [{ userId: creator.id, projectRole: 'MANAGER' }]
      : [{ userId: managerId, projectRole: 'MANAGER' }, { userId: creator.id, projectRole: 'MEMBER' }];

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title: dto.title,
          description: dto.description,
          projectPhase: 'PLANNING',
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

      // D2: create generic Approval record for this project
      await tx.approval.create({
        data: {
          entityType: 'PROJECT',
          entityId: created.id,
          status: 'PENDING',
          requestedBy: creator.id,
        },
      });

      return created;
    });

    await this.events.emit({
      action: EVENTS.PROJECT_CREATED,
      entityType: 'PROJECT',
      entityId: project.id,
      organizationId,
      actorId: creator.id,
      metadata: { projectId: project.id, title: project.title, managerId },
    });

    // Route the approval request to the DESIGNATED manager (not a broadcast to every
    // approver). Org admins are copied so nothing can stall unnoticed; notify() drops
    // the actor, so a self-managed project doesn't ping its own creator.
    const admins = await this.orgAdmins(organizationId);
    const recipients = [...new Set([managerId, ...admins])];
    await this.notifications.notify(recipients, {
      type: 'project.approval_requested',
      title: 'Project awaiting your approval',
      message: `${creator.firstName} ${creator.lastName ?? ''}`.trim()
        + ` requested "${project.title}" — you are its project manager and need to approve it.`,
    });
    return this.deadlines.redactProject(project as any, scope);
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
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        members: { some: { user: { organizationId } } },
        projectPhase: opts.phase,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        projectPhase: true,
        priority: true,
        completionPercentage: true,
        startDate: true,
        dueDate: true,
        clientDueDate: true,
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
        milestones: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: true } },
      },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async get(id: string) {
    const project = await this.getRaw(id);
    return this.deadlines.redactProject(project, await this.deadlines.scope());
  }

  async update(id: string, dto: UpdateProjectDto) {
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

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        projectPhase: dto.projectPhase,
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

  // ── Members (#11: staffing a project — add / remove teammates) ────────────────
  async addMember(projectId: string, userId: string, projectRole?: string) {
    const project = await this.getRaw(projectId);
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { organizationId: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (user.organizationId !== (project as any).organizationId) {
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
    const project = await this.getRaw(projectId);
    // The MANAGER owns and approves this project — removing them would strand it with
    // no owner (and, while PENDING, no approver). Reassign the manager instead.
    const isManager = project.members.some(m => m.userId === userId && m.projectRole === 'MANAGER');
    if (isManager) {
      throw new BadRequestException('The project manager cannot be removed. Assign a different manager first.');
    }
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    return this.get(projectId);
  }

  async softDelete(id: string) {
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
