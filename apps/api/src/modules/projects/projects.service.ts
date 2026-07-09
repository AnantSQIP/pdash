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

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * D2: any user may request project creation. Project starts with no workflow
   * status (pending approval). A generic Approval record is created, which an
   * admin action will resolve via ApprovalAction.
   * The mandatory "General" task list is also created in the same transaction.
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

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title: dto.title,
          description: dto.description,
          projectPhase: 'PLANNING',
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          createdBy: creator.id,
          members: {
            create: { userId: creator.id, projectRole: 'MANAGER' },
          },
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
      metadata: { projectId: project.id, title: project.title },
    });

    // L5: notify everyone who can approve — the project starts awaiting approval and
    // previously nobody was told (so it just sat PENDING).
    const approvers = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE', id: { not: creator.id },
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'project.approve' } } } } } },
      },
      select: { id: true },
    });
    if (approvers.length) {
      await this.notifications.notify(approvers.map(a => a.id), {
        type: 'project.approval_requested',
        title: 'Project awaiting approval',
        message: `"${project.title}" was created and needs your approval.`,
      });
    }
    return project;
  }

  list(organizationId: string, opts: { phase?: string } = {}) {
    return this.prisma.project.findMany({
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
  }

  async get(id: string) {
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

  async update(id: string, dto: UpdateProjectDto) {
    const existing = await this.get(id);
    // #14: reject an inverted date range (dueDate before startDate). Compare against
    // the incoming value or the current one so a partial edit is still validated.
    const start = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const due = dto.dueDate ? new Date(dto.dueDate) : existing.dueDate;
    if (start && due && due < start) {
      throw new BadRequestException('Due date cannot be before the start date.');
    }
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        projectPhase: dto.projectPhase,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
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
    return project;
  }

  /**
   * D2: approve or reject a project via the generic Approval entity.
   * The acting user must have project.approve permission; for now
   * we enforce Admin role lookup until the PermissionGuard is wired (M5).
   */
  async decide(id: string, approve: boolean, dto: ApprovalDto) {
    const project = await this.get(id);

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
    const project = await this.get(projectId);
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
    const project = await this.get(projectId);
    // Don't strand a project with no members — the creator/manager stays.
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    return this.get(projectId);
  }

  async softDelete(id: string) {
    await this.get(id);
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
