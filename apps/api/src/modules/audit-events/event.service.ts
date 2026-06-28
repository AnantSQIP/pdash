import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId, getActorIp } from '../../common/context/request-context';
import { ALL_SINKS, EventSink } from '../../common/events/canonical-events';

export interface EmitOptions {
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  organizationId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  sinks?: EventSink[];
  ip?: string | null;
  /** When provided, writes participate in the caller's transaction. */
  tx?: Prisma.TransactionClient;
}

/**
 * The single writer to AuditLog + Activity + AnalyticsEvent. Every meaningful
 * mutation in the system calls emit(); audit/activity/analytics stay in sync.
 * Best-effort by default — a logging failure never breaks the main operation
 * (unless a caller transaction `tx` is supplied, in which case errors surface).
 */
@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private readonly orgCache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async emit(opts: EmitOptions): Promise<void> {
    try {
      const actorId = opts.actorId ?? getActorId();
      if (!actorId) return; // cannot attribute an actor — skip
      const ip = opts.ip ?? getActorIp();
      const organizationId = opts.organizationId ?? (await this.resolveOrg(actorId, opts.tx));
      const sinks = opts.sinks ?? ALL_SINKS;
      const db = opts.tx ?? this.prisma;

      const jsonFields: Record<string, unknown> = {};
      if (opts.oldValue !== undefined) jsonFields.oldValue = opts.oldValue as Prisma.InputJsonValue;
      if (opts.newValue !== undefined) jsonFields.newValue = opts.newValue as Prisma.InputJsonValue;
      if (opts.metadata !== undefined) jsonFields.metadata = opts.metadata as Prisma.InputJsonValue;

      if (sinks.includes('audit')) {
        await db.auditLog.create({
          data: {
            userId: actorId,
            organizationId,
            entityType: opts.entityType,
            entityId: opts.entityId,
            action: opts.action,
            ipAddress: ip,
            ...jsonFields,
          },
        });
      }
      if (sinks.includes('activity')) {
        await db.activity.create({
          data: {
            actorId,
            organizationId,
            entityType: opts.entityType,
            entityId: opts.entityId,
            action: opts.action,
            ...(opts.metadata !== undefined ? { metadata: opts.metadata as Prisma.InputJsonValue } : {}),
          },
        });
      }
      if (sinks.includes('analytics')) {
        await db.analyticsEvent.create({
          data: {
            eventType: opts.action,
            entityType: opts.entityType,
            entityId: opts.entityId,
            userId: actorId,
            organizationId,
            payload: {
              old: (opts.oldValue ?? null) as Prisma.InputJsonValue,
              new: (opts.newValue ?? null) as Prisma.InputJsonValue,
              metadata: (opts.metadata ?? null) as Prisma.InputJsonValue,
            },
          },
        });
      }
    } catch (err) {
      if (opts.tx) throw err; // inside a caller transaction, let it roll back cleanly
      this.logger.warn(`event emit failed (${opts.action} ${opts.entityType}:${opts.entityId}): ${String(err)}`);
    }
  }

  private async resolveOrg(actorId: string, tx?: Prisma.TransactionClient): Promise<string | null> {
    const cached = this.orgCache.get(actorId);
    if (cached) return cached;
    const db = tx ?? this.prisma;
    const u = await db.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
    const org = u?.organizationId ?? null;
    if (org) this.orgCache.set(actorId, org);
    return org;
  }
}
