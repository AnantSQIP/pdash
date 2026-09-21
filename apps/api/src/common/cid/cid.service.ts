import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../context/request-context';
import { financialYear, legacyPidScope } from '../financial-year';
import {
  cidPrefix, formatCid, isRetiredCid, parseCid,
  type CidEventType, type CidRegistryStatus,
} from './cid';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

const TERMINAL_PHASES = ['COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED'];

/** One ledger event, as a caller describes it. The actor defaults to the request's actor. */
export type CidEventInput = {
  organizationId: string;
  cid: string;
  projectId?: string | null;
  clientTitle?: string | null;
  type: CidEventType;
  fromCid?: string | null;
  toCid?: string | null;
  fromTitle?: string | null;
  toTitle?: string | null;
  /** undefined → the signed-in actor; null → the system. */
  actorId?: string | null;
  /** A snapshot of who; looked up from actorId when omitted. */
  actorName?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * THE ONE PLACE A CID IS ISSUED, AND THE ONE PLACE ITS LEDGER IS WRITTEN.
 *
 * Every method takes the caller's open transaction. That is the whole design: the number, the
 * client row that carries it, the registry row that reserves it and the ledger event that records
 * it are written together or not at all, so the ledger can never describe something that did not
 * happen, and nothing can happen that the ledger does not describe.
 *
 * ISSUING A NUMBER
 *
 * `mintInTx` takes a transaction-scoped advisory lock on (organisation, financial year) before it
 * reads the highest serial ever used, and the lock is held until the caller's transaction commits
 * — by which time the new registry row is visible to the next waiter. So concurrent creates queue
 * for a moment and come out with consecutive, distinct numbers; nothing retries, nothing collides.
 * The UNIQUE (organizationId, pid) index on the registry is the backstop, not the mechanism.
 *
 * "Highest serial ever used" counts the registry (every status — a purged, merged or retired number
 * is still a row), any client code with the prefix (legacy rows), and a legacy sequence counter.
 * Registry rows are never deleted by the application, so a number is never issued twice.
 */
@Injectable()
export class CidService {
  constructor(private readonly prisma: PrismaService) {}

  /** The sanitised prefix this organisation's CIDs are minted under. */
  async prefixFor(db: Db, organizationId: string): Promise<string> {
    const org = await db.organization.findUnique({ where: { id: organizationId }, select: { code: true } });
    return cidPrefix(org?.code);
  }

  /** Parse a CID someone typed, for this organisation. Returns null when it does not parse. */
  async tryParse(db: Db, organizationId: string, raw: string) {
    const parsed = parseCid(raw, await this.prefixFor(db, organizationId));
    return 'error' in parsed ? null : parsed;
  }

  /**
   * The organisation a client belongs to. `Project` has no organisation column: it is the creator's,
   * else that of its earliest member, else the (single) organisation this install serves — the same
   * order the migration's backfill uses.
   */
  async orgForProject(db: Db, projectId: string): Promise<string | null> {
    const p = await db.project.findUnique({ where: { id: projectId }, select: { createdBy: true } });
    if (p?.createdBy) {
      const u = await db.user.findUnique({ where: { id: p.createdBy }, select: { organizationId: true } });
      if (u) return u.organizationId;
    }
    const m = await db.projectMember.findFirst({
      where: { projectId }, orderBy: [{ isActive: 'desc' }, { joinedAt: 'asc' }],
      select: { user: { select: { organizationId: true } } },
    });
    if (m?.user) return m.user.organizationId;
    const org = await db.organization.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
    return org?.id ?? null;
  }

  /**
   * The organisation a ledger event about a client is filed under: the signed-in ACTOR's, as every
   * tenant decision is — falling back to the client's own when there is no actor.
   */
  async ledgerOrg(db: Db, projectId: string): Promise<string> {
    const actorId = getActorId();
    if (actorId) {
      const u = await db.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
      if (u) return u.organizationId;
    }
    const org = await this.orgForProject(db, projectId);
    if (!org) throw new Error(`Client ${projectId} belongs to no organisation.`);
    return org;
  }

  /** Hold the (organisation, financial year) allocation lock until the caller's transaction ends. */
  private async lockSeries(tx: Tx, organizationId: string, fyLabel: string): Promise<void> {
    const key = `cid:${organizationId}:${fyLabel}`;
    // `::text` because Prisma cannot read a bare `void` column back.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
  }

  /** The highest serial this organisation has EVER used in a financial year — every source counts. */
  async highestSerial(db: Db, organizationId: string, fyLabel: string, prefix: string): Promise<number> {
    const head = `${prefix}_${fyLabel}_`;
    const from = head.length + 1;
    // One after another rather than Promise.all: on a transaction client they would queue anyway.
    const reg = await db.pidReservation.aggregate({ where: { organizationId, fyLabel }, _max: { serial: true } });
    const codes = await db.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(substr("code", ${from}::int)::int) AS max FROM "project"
      WHERE starts_with("code", ${head}) AND substr("code", ${from}::int) ~ '^[0-9]{1,6}$'`;
    const counter = await db.sequenceCounter.findUnique({
      where: { scope: legacyPidScope(organizationId, fyLabel) }, select: { value: true },
    });
    return Math.max(reg._max.serial ?? 0, Number(codes[0]?.max ?? 0), counter?.value ?? 0);
  }

  /** A non-binding look at the number the next client would get (no lock; for previews only). */
  async peekNext(organizationId: string): Promise<string> {
    const prefix = await this.prefixFor(this.prisma, organizationId);
    const fy = financialYear(new Date()).label;
    return formatCid(prefix, fy, (await this.highestSerial(this.prisma, organizationId, fy, prefix)) + 1);
  }

  /**
   * Issue the next CID inside the caller's transaction and register it (ATTACHED).
   * `projectId` may be omitted when the client row does not exist yet — call `pointAt` once it does.
   */
  async mintInTx(tx: Tx, args: { organizationId: string; actorId?: string | null; projectId?: string | null }) {
    const prefix = await this.prefixFor(tx, args.organizationId);
    const fyLabel = financialYear(new Date()).label;
    await this.lockSeries(tx, args.organizationId, fyLabel);
    const serial = (await this.highestSerial(tx, args.organizationId, fyLabel, prefix)) + 1;
    const cid = formatCid(prefix, fyLabel, serial);
    const now = new Date();
    const row = await tx.pidReservation.create({
      data: {
        organizationId: args.organizationId, fyLabel, serial, pid: cid,
        generatedById: (args.actorId === undefined ? getActorId() : args.actorId) ?? 'system',
        status: 'ATTACHED', projectId: args.projectId ?? null, createdAt: now, resolvedAt: now,
      },
      select: { id: true },
    });
    return { cid, fyLabel, serial, reservationId: row.id };
  }

  /** Point a freshly minted registry row at the client that now carries it. */
  async pointAt(tx: Tx, reservationId: string, projectId: string): Promise<void> {
    await tx.pidReservation.update({ where: { id: reservationId }, data: { projectId } });
  }

  /** The registry row for a CID, or null. */
  registryRow(db: Db, organizationId: string, cid: string) {
    return db.pidReservation.findUnique({ where: { organizationId_pid: { organizationId, pid: cid } } });
  }

  /**
   * Make a CID's registry row tell the truth about the clients that carry it, inside the caller's
   * transaction. Called after every change that can move a client onto, off, into or out of a CID.
   *
   *   a live client carries it              → ATTACHED, pointing at the newest live unfinished round
   *   only soft-deleted clients carry it    → DELETED (still reserved to them)
   *   nothing carries it                    → PURGED
   *
   * `retireAs` is how a move says what the number became when work LEFT it (MERGED, with the
   * survivor, or DISCONTINUED); it applies only once no live client carries the number. A retired
   * number stays retired — nothing here ever brings one back to ATTACHED.
   */
  async syncRegistryInTx(
    tx: Tx, organizationId: string, cid: string,
    opts: { retireAs?: 'MERGED' | 'DISCONTINUED'; mergedIntoCid?: string; actorId?: string | null } = {},
  ): Promise<CidRegistryStatus | null> {
    let row = await this.registryRow(tx, organizationId, cid);
    const carriers = await tx.project.findMany({
      where: { code: cid },
      select: { id: true, deletedAt: true, projectPhase: true, roundSeq: true },
    });
    const live = carriers.filter(p => !p.deletedAt);
    const deleted = carriers.filter(p => p.deletedAt);
    const now = new Date();

    if (!row) {
      // A code a client carries with no registry row (legacy data). Register it now so the number
      // is spoken for; one that does not parse cannot be registered and is left as it is.
      const parsed = await this.tryParse(tx, organizationId, cid);
      if (!parsed) return null;
      row = await tx.pidReservation.create({
        data: {
          organizationId, fyLabel: parsed.fyLabel, serial: parsed.serial, pid: parsed.cid,
          generatedById: (opts.actorId === undefined ? getActorId() : opts.actorId) ?? 'system',
          status: 'ATTACHED', createdAt: now, resolvedAt: now,
        },
      });
    }

    const newest = <T extends { roundSeq: number; id: string }>(list: T[]) =>
      [...list].sort((a, b) => b.roundSeq - a.roundSeq || (a.id < b.id ? 1 : -1));
    let status: CidRegistryStatus;
    let projectId: string | null;
    let mergedIntoCid: string | null = row.mergedIntoCid ?? null;

    const liveHead = () => {
      const ordered = newest(live);
      return (ordered.find(p => !TERMINAL_PHASES.includes(p.projectPhase)) ?? ordered[0]).id;
    };
    if (isRetiredCid(row.status)) {
      // Never un-retire. A retired number keeps its status whatever carries it; restore re-homes a
      // client whose number was retired, so a live carrier here would be the belt to that brace.
      status = row.status as CidRegistryStatus;
      projectId = live.length ? liveHead() : deleted.length ? newest(deleted)[0].id : null;
    } else if (live.length) {
      status = 'ATTACHED';
      projectId = liveHead();
    } else if (opts.retireAs) {
      status = opts.retireAs;
      mergedIntoCid = opts.retireAs === 'MERGED' ? (opts.mergedIntoCid ?? null) : null;
      projectId = null;
    } else if (deleted.length) {
      status = 'DELETED';
      projectId = newest(deleted)[0].id;
    } else {
      status = 'PURGED';
      projectId = null;
    }
    if (status === 'MERGED' && !mergedIntoCid) throw new Error(`CID ${cid} cannot be marked merged without a target.`);
    if (status !== 'MERGED') mergedIntoCid = null;

    if (row.status !== status || row.projectId !== projectId || (row.mergedIntoCid ?? null) !== mergedIntoCid) {
      await tx.pidReservation.update({
        where: { id: row.id },
        data: { status, projectId, mergedIntoCid, resolvedAt: now },
      });
    }
    return status;
  }

  /** Write one event to the CID ledger inside the caller's transaction. */
  async recordInTx(tx: Tx, e: CidEventInput): Promise<void> {
    const actorId = e.actorId === undefined ? (getActorId() ?? null) : e.actorId;
    let actorName = e.actorName ?? null;
    if (!actorName) {
      if (actorId) {
        const u = await tx.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
        actorName = u ? `${u.firstName} ${u.lastName}`.trim() : null;
      } else {
        actorName = 'System';
      }
    }
    await tx.cidEvent.create({
      data: {
        organizationId: e.organizationId,
        cid: e.cid,
        projectId: e.projectId ?? null,
        clientTitle: e.clientTitle ?? null,
        type: e.type,
        fromCid: e.fromCid ?? null,
        toCid: e.toCid ?? null,
        fromTitle: e.fromTitle ?? null,
        toTitle: e.toTitle ?? null,
        actorId,
        actorName,
        ...(e.metadata ? { metadata: e.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  }
}

// Global, like the sequence allocator: projects, admin-data and client-groups all write to the one
// ledger, and a second instance would be a second opinion about the same numbers.
@Global()
@Module({
  providers: [CidService],
  exports: [CidService],
})
export class CidModule {}
