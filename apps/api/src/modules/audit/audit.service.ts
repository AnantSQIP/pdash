import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { getActorId } from '../../common/context/request-context';
import { WorkspaceFlowService } from '../workspace-flow/workspace-flow.service';
import { taskInFlow } from '../../common/flow-scope';

const ACTOR_SELECT = { id: true, firstName: true, lastName: true, email: true };

export interface ActivityQuery {
  projectId?: string;
  entityType?: string;
  entityId?: string;
  organizationId?: string;
  limit?: number;
}

export interface AuditQuery {
  organizationId?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly access: ProjectAccessService,
    private readonly flows: WorkspaceFlowService,
  ) {}

  /**
   * The matter an activity query names must be one of this workspace flow's.
   *
   * Activity reaches its project only through a JSON path on `metadata` (and its task or issue
   * through a loose entityType/entityId pair), so no relation filter can bound the feed itself.
   * The TARGET is checked instead, before the feed is read: a project, task or issue of the other
   * flow answers not found. Only the `audit.view` branch needs this — every other branch already
   * reaches its target through a flow-aware check in ProjectAccessService.
   */
  private async assertTargetInFlow(q: ActivityQuery, organizationId: string): Promise<void> {
    const et = (q.entityType ?? '').toUpperCase();
    const projectId = q.projectId ?? (et === 'PROJECT' ? q.entityId : undefined);
    const taskId = et === 'TASK' ? q.entityId : undefined;
    const issueId = et === 'ISSUE' ? q.entityId : undefined;
    if (!projectId && !taskId && !issueId) return;
    const flow = await this.flows.flowOf(organizationId);
    if (projectId && !(await this.prisma.project.findFirst({ where: { id: projectId, workspaceFlow: flow }, select: { id: true } }))) {
      throw new NotFoundException('Project not found.');
    }
    if (taskId && !(await this.prisma.task.findFirst({ where: { id: taskId, ...taskInFlow(flow) }, select: { id: true } }))) {
      throw new NotFoundException('Task not found.');
    }
    if (issueId && !(await this.prisma.issue.findFirst({ where: { id: issueId, project: { workspaceFlow: flow } }, select: { id: true } }))) {
      throw new NotFoundException('Issue not found.');
    }
  }

  /**
   * Activity feed. Org is ALWAYS session-derived.
   *
   *   • `audit.view` (Admin, Super Admin) — org-wide activity.
   *   • the project's MANAGER — that project's activity.
   *   • anyone else — no project activity at all; only a single task/issue they can access.
   *
   * A project's feed used to be open to every member of the project. It is oversight material,
   * so it is now limited to the people who run the matter. Before that it was open to everyone:
   * any `?projectId=`/`?entityId=` filter bypassed the gate with no membership check at all, so
   * any user could read any matter's history (and its document filenames).
   */
  async listActivity(q: ActivityQuery, organizationId: string) {
    const actorId = getActorId();
    const hasAudit = actorId ? await this.permissions.check(actorId, 'audit.view') : false;
    const where: Prisma.ActivityWhereInput = { organizationId };

    if (hasAudit) {
      // audit.view reaches every matter in the organisation, but a matter it NAMES must be this
      // flow's. With no target at all this is the organisation-wide feed, which stays unfiltered for
      // the same reason the audit log does (see listAuditLogs): it is read by the administrators who
      // know both flows exist, and Activity carries no relation to filter on.
      await this.assertTargetInFlow(q, organizationId);
      if (q.entityType) where.entityType = q.entityType;
      if (q.entityId) where.entityId = q.entityId;
      if (q.projectId) where.metadata = { path: ['projectId'], equals: q.projectId };
    } else {
      // Non-audit users: scope to one delivery matter — never org-wide, never sensitive
      // (RBAC/user) activity, which lives under entity types not whitelisted here.
      const et = (q.entityType ?? '').toUpperCase();
      const projectId = q.projectId ?? (et === 'PROJECT' ? q.entityId : undefined);
      if (projectId) {
        // A PROJECT's activity feed is restricted to that project's OWN manager. Membership is
        // deliberately not enough: the feed is the whole matter's history in one list — every
        // task, status change, comment, issue, logged hour and file name — which is oversight
        // material rather than working material. Both routes to it are gated here, because
        // ?projectId= and ?entityType=PROJECT&entityId= return the same thing by different
        // filters and gating only the first would leave the second as a way straight past it.
        // isProjectManager is bounded by the workspace flow, so a project of the other flow
        // is refused here too — nobody manages it in this one.
        if (!actorId || !(await this.access.isProjectManager(actorId, projectId))) {
          throw new ForbiddenException(
            "A project's activity is visible only to its project manager and to administrators.",
          );
        }
        if (q.projectId) where.metadata = { path: ['projectId'], equals: q.projectId };
        else { where.entityType = 'PROJECT'; where.entityId = projectId; }
      } else if (q.entityId && ['TASK', 'ISSUE'].includes(et)) {
        // Flow-aware already: assertTaskAccess and assertIssueAccess refuse the other flow's work.
        await this.access.assertEntityAccess(actorId, et, q.entityId);
        where.entityType = et;
        where.entityId = q.entityId;
      } else {
        throw new ForbiddenException('You may only read the activity of a task or issue you have access to, or of a project you manage.');
      }
    }

    return this.prisma.activity.findMany({
      where,
      include: { actor: { select: ACTOR_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(q.limit ?? 50, 200),
    });
  }

  /**
   * DELIBERATELY NOT FLOW-SCOPED — a decision, not an oversight. The audit log is the organisation's
   * permanent record of everything that happened in it, in both workspace flows, including the
   * tombstones of what was destroyed. It sits behind `audit.view`, and the people who hold that
   * code are the same administrators who know the two flows exist and switch between them.
   * Hiding half of the record from them would make it a record of nothing in particular.
   */
  async listAuditLogs(q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.organizationId) where.organizationId = q.organizationId;
    if (q.entityType) where.entityType = q.entityType;
    if (q.action) where.action = q.action;
    if (q.userId) where.userId = q.userId;
    const take = Math.min(q.limit ?? 50, 200);
    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: ACTOR_SELECT } },
      orderBy: { timestamp: 'desc' },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  /**
   * DELIBERATELY NOT FLOW-SCOPED, for the reason given on listAuditLogs: this is the same permanent
   * record, exported, behind `audit.export`, for the same administrators. The CSV has no column
   * naming a flow and gets none.
   */
  async exportAuditLogsCsv(q: AuditQuery): Promise<string> {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.organizationId) where.organizationId = q.organizationId;
    if (q.entityType) where.entityType = q.entityType;
    if (q.action) where.action = q.action;
    if (q.userId) where.userId = q.userId;
    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: ACTOR_SELECT } },
      orderBy: { timestamp: 'desc' },
      take: 5000,
    });
    const esc = (v: unknown) => {
      const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ['timestamp', 'actor', 'action', 'entityType', 'entityId', 'ipAddress', 'metadata'];
    const lines = rows.map(r =>
      [
        r.timestamp.toISOString(),
        `${r.user.firstName} ${r.user.lastName}`.trim(),
        r.action,
        r.entityType,
        r.entityId,
        r.ipAddress ?? '',
        r.metadata,
      ].map(esc).join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }
}
