import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';
import { describeShift } from './deadline-shift';

export type DeadlineEntityType = 'PROJECT' | 'TASK';

export interface RecordShiftOptions {
  entityType: DeadlineEntityType;
  entityId: string;
  /** The deadline as it stood BEFORE the write. Null means there wasn't one. */
  previous: Date | null | undefined;
  /** The deadline as it stands after. Null means it was cleared. */
  next: Date | null | undefined;
  /**
   * The project this rolls up to. Supply it when the caller already knows (it usually does);
   * for a TASK it is resolved from the ProjectTask links when omitted.
   */
  projectId?: string | null;
  organizationId?: string | null;
  changedById?: string | null;
  reason?: string | null;
  /** When provided, the row is written inside the caller's transaction. */
  tx?: Prisma.TransactionClient;
}

/**
 * The single writer to DeadlineChange — the ledger of every time a deadline moved.
 *
 * It exists because a deadline is one column, so moving it destroys the only evidence it ever
 * said anything else. The Performance module's question — "how many times did this project's
 * allocated deadline have to be shifted?" — cannot be answered after the fact at any price; it
 * can only be answered by keeping the record as the shifts happen. Hence a service every
 * deadline-writing path calls, rather than a query somebody writes later.
 *
 * TWO RULES THAT DECIDE WHETHER A ROW EXISTS, both enforced in `describeShift`:
 *   · setting a deadline for the first time is NOT a shift, and
 *   · re-saving the same date is NOT a shift.
 * Either one recorded wrongly becomes a number next to a real person's name in a review.
 *
 * Recording is best-effort ONLY when it runs outside a caller transaction: a bookkeeping
 * failure must never make a project edit fail. Callers that care about the two staying in
 * step — and they should — pass their `tx`, and then an error rolls the whole edit back.
 */
@Injectable()
export class DeadlineChangeService {
  private readonly logger = new Logger(DeadlineChangeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(opts: RecordShiftOptions): Promise<void> {
    const shift = describeShift(opts.previous, opts.next);
    if (!shift) return;

    const db = opts.tx ?? this.prisma;
    try {
      const changedById = opts.changedById ?? getActorId();
      if (!changedById) return; // an unattributable shift is worse than no row — skip it

      const projectId = opts.projectId !== undefined
        ? opts.projectId
        : opts.entityType === 'PROJECT'
          ? opts.entityId
          : await this.primaryProjectForTask(db, opts.entityId);

      const organizationId = opts.organizationId ?? await this.resolveOrg(db, changedById);
      if (!organizationId) {
        // organizationId is NOT NULL on the table, so there is no honest row to write.
        this.logger.warn(`deadline shift on ${opts.entityType}:${opts.entityId} not recorded — no organization for actor ${changedById}`);
        return;
      }

      await db.deadlineChange.create({
        data: {
          organizationId,
          entityType: opts.entityType,
          entityId: opts.entityId,
          projectId: projectId ?? null,
          previousDate: shift.previousDate,
          newDate: shift.newDate,
          shiftDays: shift.shiftDays,
          changedById,
          reason: opts.reason ?? null,
        },
      });
    } catch (err) {
      if (opts.tx) throw err; // inside a caller transaction, let the whole edit roll back
      this.logger.warn(`deadline shift record failed (${opts.entityType}:${opts.entityId}): ${String(err)}`);
    }
  }

  /**
   * Which project a TASK's shift is filed under.
   *
   * Tasks reach projects through the ProjectTask many-to-many, so a task can in principle sit in
   * several. The roll-up has to name exactly one, and it names the OLDEST link — the project the
   * task was first attached to, which is the plan the deadline was set against. Link ids are
   * cuids and cuids are time-ordered, so ascending id is creation order.
   *
   * In practice all but a handful of tasks have exactly one project and the rule never bites;
   * it is written down so that the day a task is shared, the count does not quietly move between
   * projects depending on how Postgres felt like ordering the rows.
   */
  private async primaryProjectForTask(db: Prisma.TransactionClient | PrismaService, taskId: string): Promise<string | null> {
    const link = await db.projectTask.findFirst({
      where: { taskId },
      orderBy: { id: 'asc' },
      select: { projectId: true },
    });
    return link?.projectId ?? null;
  }

  private async resolveOrg(db: Prisma.TransactionClient | PrismaService, actorId: string): Promise<string | null> {
    const u = await db.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }
}
