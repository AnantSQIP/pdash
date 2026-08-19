import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Serialise a check-then-write against a key, so two simultaneous requests cannot both pass
 * a check that only one of them should.
 *
 * WHY THIS EXISTS
 *
 * Several guards in this system read a total or look for a clash, and then write:
 *
 *   • the 16-hour daily cap on timesheets   — sum the day, then insert
 *   • "you already have leave on that day"  — look for an overlap, then insert
 *   • the same for work-from-home requests
 *   • "a department called X already exists" — look it up, then insert
 *
 * Each is correct when requests arrive one at a time, and each fails when two arrive together:
 * both read the world before either has written to it, so both are allowed through. Testing
 * confirmed all four. Four simultaneous six-hour entries put TWENTY-FOUR hours against a single
 * day, past a cap that exists to catch exactly that — and because billable hours feed capacity,
 * performance and the client ledger, the bad number does not stay in the timesheet.
 *
 * It needs no malice and no unusual client: a double-click on Save, a retry over a flaky
 * connection, or two open tabs will do it.
 *
 * WHY AN ADVISORY LOCK RATHER THAN A UNIQUE INDEX
 *
 * A unique index is the better tool when the rule is "this exact row may exist only once", and
 * where one fits we use one. But none of these rules are of that shape:
 *
 *   • "no more than 16 hours a day" is a SUM across rows, which no index can express;
 *   • "no overlapping leave" is a RANGE test, not an equality;
 *   • the department rule is case-insensitive, which our schema tool cannot express as an index
 *     without reporting a permanent phantom difference on every future migration.
 *
 * A transaction-scoped advisory lock covers all of them with one mechanism, holds only for the
 * length of the transaction, and is released automatically on commit OR rollback — including if
 * the process dies mid-request, which is the failure mode that makes hand-rolled locks dangerous.
 *
 * The lock is keyed by STRING, so it is scoped as narrowly as the rule it protects — one person's
 * one day, not the whole table. Two people logging time at the same instant never contend.
 */
export async function serialize<T>(
  prisma: PrismaService,
  key: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async tx => {
    // hashtextextended gives a bigint, which is what the two-argument advisory lock wants.
    // _xact_ means Postgres releases it when this transaction ends, however it ends.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    return fn(tx);
  });
}

/** One person, one calendar day — the scope of the daily-hours cap and the duplicate-entry rule. */
export const dayKeyFor = (userId: string, day: Date) =>
  `ts:${userId}:${day.toISOString().slice(0, 10)}`;

/** One person's leave — overlap is a range test across their whole set, so it is keyed per person. */
export const leaveKeyFor = (userId: string) => `leave:${userId}`;

/** One person's work-from-home requests, same reasoning as leave. */
export const wfhKeyFor = (userId: string) => `wfh:${userId}`;

/** One organisation's department names — the uniqueness rule is org-wide. */
export const departmentKeyFor = (organizationId: string) => `dept:${organizationId}`;
