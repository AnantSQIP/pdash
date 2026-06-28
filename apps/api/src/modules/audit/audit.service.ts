import { Injectable } from '@nestjs/common';
import { Prisma } from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  listActivity(q: ActivityQuery) {
    const where: Prisma.ActivityWhereInput = {};
    if (q.organizationId) where.organizationId = q.organizationId;
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId) where.entityId = q.entityId;
    if (q.projectId) where.metadata = { path: ['projectId'], equals: q.projectId };
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
