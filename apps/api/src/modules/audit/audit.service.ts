import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { getActorId } from '../../common/context/request-context';

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
  ) {}

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
        if (!actorId || !(await this.access.isProjectManager(actorId, projectId))) {
          throw new ForbiddenException(
            "A project's activity is visible only to its project manager and to administrators.",
          );
        }
        if (q.projectId) where.metadata = { path: ['projectId'], equals: q.projectId };
        else { where.entityType = 'PROJECT'; where.entityId = projectId; }
      } else if (q.entityId && ['TASK', 'ISSUE'].includes(et)) {
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
