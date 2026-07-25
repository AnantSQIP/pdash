import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../../modules/permissions/permission.service';

/**
 * Object-level authorization for the delivery domain (projects → tasks → issues).
 *
 * The RBAC permission (project.view / task.update / issue.create …) says WHAT a role may
 * do; this service says WHICH projects an actor may do it to. Without it, a permission
 * like task.update (held by every Employee) applies org-wide — letting anyone read or
 * mutate matters they are not staffed on. For an IP firm that is a conflict-wall breach.
 *
 * Access rule for a project P:
 *   • DELIVERY OVERSIGHT — a Super Admin or any holder of project.approve (Managers,
 *     Senior Consultants, Admins). These are the leads/partners who legitimately oversee
 *     every matter (capacity planning, assignment, approvals), so they may see/act on all.
 *   • MEMBER — anyone with an active ProjectMember row on P.
 * Everyone else is denied. Reads and writes use the SAME rule; the permission decorator
 * still gates the action type on top of it.
 */
@Global()
@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  /** Delivery leads/partners who may oversee every matter (super-admin or project.approve). */
  async hasOversight(actorId: string): Promise<boolean> {
    const eff = await this.permissions.getEffectivePermissions(actorId);
    return eff.isSuperAdmin || eff.codes.includes('project.approve');
  }

  async isMember(actorId: string, projectId: string): Promise<boolean> {
    const m = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: actorId, isActive: true }, select: { id: true },
    });
    return !!m;
  }

  async canAccessProject(actorId: string, projectId: string): Promise<boolean> {
    if (await this.hasOversight(actorId)) return true;
    return this.isMember(actorId, projectId);
  }

  async assertProjectAccess(actorId: string | null, projectId: string): Promise<void> {
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    if (!(await this.canAccessProject(actorId, projectId))) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  /**
   * A Prisma Project where-fragment scoping a list to the projects the actor may see:
   * every org project for a lead, only their own memberships otherwise.
   */
  async projectScopeWhere(actorId: string, organizationId: string): Promise<Record<string, unknown>> {
    if (await this.hasOversight(actorId)) {
      return { members: { some: { user: { organizationId } } } };
    }
    return { members: { some: { userId: actorId, isActive: true } } };
  }

  /** Access to a task via the project(s) it is linked to (ProjectTask join). */
  async canAccessTask(actorId: string, taskId: string): Promise<boolean> {
    if (await this.hasOversight(actorId)) return true;
    const links = await this.prisma.projectTask.findMany({ where: { taskId }, select: { projectId: true } });
    for (const l of links) {
      if (await this.isMember(actorId, l.projectId)) return true;
    }
    return false;
  }

  async assertTaskAccess(actorId: string | null, taskId: string): Promise<void> {
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    if (!(await this.canAccessTask(actorId, taskId))) {
      throw new ForbiddenException('You do not have access to this task.');
    }
  }

  /** Boolean form of assertEntityAccess (no throw) — for "may read via any link" checks. */
  async canAccessEntity(actorId: string, entityType: string, entityId: string): Promise<boolean> {
    try { await this.assertEntityAccess(actorId, entityType, entityId); return true; } catch { return false; }
  }

  /** Access to an issue via its project. */
  async assertIssueAccess(actorId: string | null, issueId: string): Promise<void> {
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    if (await this.hasOversight(actorId)) return;
    const issue = await this.prisma.issue.findFirst({ where: { id: issueId, deletedAt: null }, select: { projectId: true } });
    if (issue && (await this.isMember(actorId, issue.projectId))) return;
    throw new ForbiddenException('You do not have access to this issue.');
  }

  /**
   * Access to a polymorphic delivery entity (what a comment or document attaches to).
   * Unknown entity types are DENIED (fail-closed) so a new/garbage entityType can't be
   * used to read or write a discussion thread it has no gate for.
   */
  async assertEntityAccess(actorId: string | null, entityType: string, entityId: string): Promise<void> {
    switch ((entityType ?? '').toUpperCase()) {
      case 'PROJECT': return this.assertProjectAccess(actorId, entityId);
      case 'TASK': return this.assertTaskAccess(actorId, entityId);
      case 'ISSUE': return this.assertIssueAccess(actorId, entityId);
      default: throw new ForbiddenException('You do not have access to this discussion.');
    }
  }

  /**
   * A completed/closed (or deleted) project is LOCKED — no new tasks or logged time. This was
   * previously enforced only in the UI, so the server accepted work (incl. billable time)
   * against closed client matters.
   */
  async assertProjectWritable(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId }, select: { projectPhase: true, deletedAt: true },
    });
    if (!project || project.deletedAt) throw new ForbiddenException('Project not found.');
    if (project.projectPhase === 'COMPLETED' || project.projectPhase === 'CLOSED') {
      throw new ForbiddenException('This project is completed or closed — reopen it to add work or log time.');
    }
  }
}

@Global()
@Module({
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
