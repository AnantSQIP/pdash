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

  /** The org that owns a project (reached through its members — Project has no org column). */
  private async projectOrg(projectId: string): Promise<string | null> {
    const m = await this.prisma.projectMember.findFirst({
      where: { projectId, isActive: true }, select: { user: { select: { organizationId: true } } },
    });
    return m?.user?.organizationId ?? null;
  }

  /**
   * A tenant boundary that applies EVEN to oversight leads: an oversight actor may see/act on
   * every matter in THEIR OWN org, never another org's. `hasOversight` + the by-id fetches are
   * org-blind, so without this an oversight role could read/mutate a foreign org's project by id
   * (the list path is already org-scoped — this closes the get/update/lifecycle asymmetry).
   * A null projectOrg (no resolvable active member) is not over-blocked.
   */
  private async withinTenant(actorId: string, projectOrg: string | null): Promise<boolean> {
    if (!projectOrg) return true;
    const actor = await this.prisma.user.findFirst({ where: { id: actorId }, select: { organizationId: true } });
    return !actor || actor.organizationId === projectOrg;
  }

  async canAccessProject(actorId: string, projectId: string): Promise<boolean> {
    if (await this.hasOversight(actorId)) return this.withinTenant(actorId, await this.projectOrg(projectId));
    // A member is same-org by construction (addMember validates org), so no extra tenant check.
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
    const links = await this.prisma.projectTask.findMany({ where: { taskId }, select: { projectId: true } });
    if (await this.hasOversight(actorId)) {
      // Oversight is still bounded to the actor's own org — check each linked project's tenant.
      for (const l of links) {
        if (await this.withinTenant(actorId, await this.projectOrg(l.projectId))) return true;
      }
      return links.length === 0; // a task with no live project link isn't cross-tenant
    }
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

  /** Is this user an assignee (PM / reviewer / analyst / plain) of the task? */
  async isTaskAssignee(userId: string, taskId: string): Promise<boolean> {
    const a = await this.prisma.taskAssignee.findFirst({ where: { taskId, userId }, select: { id: true } });
    return !!a;
  }

  /**
   * Time-logging rule: a person may only log/assign time on a task they are STAFFED on.
   * Project membership grants VIEW access to every task in the project, but NOT the right to
   * log hours against work you aren't assigned to (the bug: any project member could log time
   * on any task). Assignment is same-org by construction, so no extra tenant check is needed.
   */
  async assertTaskAssignee(userId: string | null, taskId: string): Promise<void> {
    if (!userId) throw new ForbiddenException('Not authenticated.');
    if (!(await this.isTaskAssignee(userId, taskId))) {
      throw new ForbiddenException('You can only log time on a task you are assigned to. Ask a lead to add you to the task first.');
    }
  }

  /** Boolean form of assertEntityAccess (no throw) — for "may read via any link" checks. */
  async canAccessEntity(actorId: string, entityType: string, entityId: string): Promise<boolean> {
    try { await this.assertEntityAccess(actorId, entityType, entityId); return true; } catch { return false; }
  }

  /** Access to an issue via its project. */
  async assertIssueAccess(actorId: string | null, issueId: string): Promise<void> {
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const issue = await this.prisma.issue.findFirst({ where: { id: issueId, deletedAt: null }, select: { projectId: true } });
    if (!issue) throw new ForbiddenException('You do not have access to this issue.');
    if (await this.hasOversight(actorId)) {
      if (await this.withinTenant(actorId, await this.projectOrg(issue.projectId))) return;
      throw new ForbiddenException('You do not have access to this issue.');
    }
    if (await this.isMember(actorId, issue.projectId)) return;
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

  /**
   * A task is writable while at least one of its live projects is writable. A task whose every
   * linked project is completed/closed is LOCKED — so editing/moving/reassigning/deleting it, not
   * just creating new work, is blocked on a closed matter (the create-only lock was half-real).
   */
  async assertTaskWritable(taskId: string): Promise<void> {
    const links = await this.prisma.projectTask.findMany({
      where: { taskId, project: { deletedAt: null } },
      select: { project: { select: { projectPhase: true } } },
    });
    if (!links.length) return; // no live project link — don't over-block edge/standalone tasks
    const anyWritable = links.some(l => l.project.projectPhase !== 'COMPLETED' && l.project.projectPhase !== 'CLOSED');
    if (!anyWritable) {
      throw new ForbiddenException('This task belongs to a completed or closed project — reopen it to make changes.');
    }
  }
}

@Global()
@Module({
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
