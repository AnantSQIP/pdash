import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Atomic, gap-tolerant serial allocator backed by the `sequence_counter` table.
 *
 * `allocate` runs as a SINGLE auto-committed statement (INSERT … ON CONFLICT … RETURNING),
 * so the row lock lives only for that statement — it is never held across a caller's larger
 * interactive transaction (which is what would otherwise serialise concurrent project creates
 * and hit Prisma's 5s timeout). A caller that later rolls back simply burns a serial (a rare,
 * harmless gap) — the trade-off that buys non-blocking, collision-free numbering.
 *
 * NOTE: uses `$queryRaw` (not `$executeRaw`) — only `$queryRaw` returns the RETURNING payload;
 * `$executeRaw` would return the affected-row count (always 1) and every caller would get serial 1.
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Consume and return the next serial for `scope`. Safe under concurrency. */
  async allocate(scope: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ value: number }>>`
      INSERT INTO "sequence_counter" ("scope", "value") VALUES (${scope}, 1)
      ON CONFLICT ("scope") DO UPDATE SET "value" = "sequence_counter"."value" + 1
      RETURNING "value"`;
    return Number(rows[0].value);
  }

  /** The next serial WITHOUT consuming it — for a non-binding preview only. */
  async peek(scope: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ value: number }>>`
      SELECT "value" FROM "sequence_counter" WHERE "scope" = ${scope}`;
    return (rows.length ? Number(rows[0].value) : 0) + 1;
  }

  /** Seed a scope's counter to a known floor (used by the idempotent PID backfill). */
  async ensureAtLeast(scope: string, floor: number): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "sequence_counter" ("scope", "value") VALUES (${scope}, ${floor})
      ON CONFLICT ("scope") DO UPDATE SET "value" = GREATEST("sequence_counter"."value", ${floor})`;
  }
}
