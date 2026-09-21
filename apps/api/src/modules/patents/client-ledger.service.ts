import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { UpdateLedgerOverrideDto } from './dto';

/**
 * The client ledger — what each client actually amounts to.
 *
 * Deliberately a SEPARATE surface from the patent portal. The portal answers "which patents does
 * this client have, and what are their real numbers"; the ledger answers "what work have we done
 * for them, and what is it worth". Folding the two together would put a confidential
 * number-reveal screen and a routine commercial summary behind the same click.
 *
 * Everything here is DERIVED — recomputed from live projects and timesheets on every read, never
 * stored. A stored total is a total that silently drifts the first time someone edits a time
 * entry, and a drifting financial figure is worse than no figure at all.
 */

/** A client's work, counted from live data. Every field is recomputed per request. */
export type DerivedLedger = {
  projectCount: number;
  activeProjectCount: number;
  patentCount: number;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  /** Distinct people who have logged time against this client's projects. */
  contributorCount: number;
  firstLoggedAt: Date | null;
  lastLoggedAt: Date | null;
};

/** Two decimal places. Hours are summed from Floats, so raw totals carry binary noise. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What a client's figures actually are, once any override has had its say. */
export type EffectiveLedger = {
  billableHours: number;
  /** Where the billable-hours figure came from — the UI shows the derived one beside it. */
  billableHoursSource: 'derived' | 'override';
  /**
   * What the work is worth. Stated if somebody stated it, otherwise DERIVED from the client's
   * rate — hours × rate — and null only when neither exists.
   */
  amount: number | null;
  /** Where that figure came from, so the screen never presents an estimate as an agreed sum. */
  amountSource: 'stated' | 'derived' | 'none';
  currency: string;
  /** The rate the derivation used. Null when the client has no rate on file. */
  rate: number | null;
  /** How far the derived figure has moved since the statement was made. Null = nothing stated. */
  driftHours: number | null;
  /** The statement is far enough behind the data to be worth revisiting. */
  stale: boolean;
};

@Injectable()
export class ClientLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  /**
   * Fold an override into the derived figures. The derived values are returned untouched
   * alongside, so the screen can show "we derive 412h; you stated 380h" rather than presenting
   * one number and hiding the other.
   */
  private effective(
    derived: DerivedLedger,
    override: LedgerOverrideRow | null,
    rate?: { billingRate: number | null; billingCurrency: string } | null,
  ): EffectiveLedger {
    const stated = override?.billableHours;
    // Drift is measured against what the data said WHEN the statement was made, not against the
    // stated figure itself — otherwise every deliberate write-down would look like an error.
    const snapshot = override?.derivedHoursWhenSet;
    const drift = stated != null && snapshot != null
      ? Math.round((derived.billableHours - snapshot) * 100) / 100
      : null;
    // Value follows hours. Where a rate exists the ledger can finally price the work itself,
    // instead of holding a hand-typed total that stopped being true the next time anyone logged
    // an hour. A stated amount still wins — somebody who types a figure has agreed something the
    // rate does not know about — but it is now the exception rather than the only option.
    const billable = stated ?? derived.billableHours;
    const rateValue = rate?.billingRate != null && rate.billingRate > 0
      ? round2(billable * rate.billingRate)
      : null;
    const statedAmount = override?.amount ?? null;
    return {
      billableHours: billable,
      billableHoursSource: stated == null ? 'derived' : 'override',
      amount: statedAmount ?? rateValue,
      amountSource: statedAmount != null ? 'stated' : rateValue != null ? 'derived' : 'none',
      rate: rate?.billingRate ?? null,
      // The override's currency only means anything when the override states an amount; otherwise
      // the client's own billing currency is the one the derived figure is in.
      currency: statedAmount != null ? (override?.currency ?? 'INR') : (rate?.billingCurrency ?? 'INR'),
      driftHours: drift,
      // A statement is "stale" once the work underneath it has moved enough to matter. One hour
      // of drift is noise; a full day means the number is describing a different engagement.
      stale: drift != null && Math.abs(drift) >= 8,
    };
  }

  /**
   * One row per client. Computed in four org-wide queries rather than per-client ones, so the
   * cost does not grow with the number of clients.
   */
  async list(organizationId: string, includeArchived = true) {
    const clients = await this.prisma.client.findMany({
      where: { organizationId, deletedAt: null, ...(includeArchived ? {} : { archivedAt: null }) },
      select: CLIENT_LEDGER_SELECT,
      orderBy: [{ archivedAt: 'asc' }, { code: 'asc' }],
    });
    if (!clients.length) return [];
    const ids = clients.map(c => c.id);
    const [derived, overrides] = await Promise.all([this.derive(ids), this.overridesFor(ids)]);
    return clients.map(c => {
      const d = derived.get(c.id) ?? EMPTY_LEDGER();
      const o = overrides.get(c.id) ?? null;
      return { ...c, derived: d, override: o, effective: this.effective(d, o, c) };
    });
  }

  /**
   * Overrides for a set of clients, each carrying the NAME of whoever stated it. The name is
   * resolved here rather than in the UI because "stated by" is half of what makes an override
   * trustworthy — a figure with no author is just an unexplained number.
   */
  private async overridesFor(clientIds: string[]): Promise<Map<string, LedgerOverrideRow>> {
    const rows = await this.prisma.clientLedgerOverride.findMany({
      where: { clientId: { in: clientIds } },
      select: OVERRIDE_SELECT,
    });
    if (!rows.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map(r => r.updatedBy))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    return new Map(rows.map(r => [r.clientId, { ...r, updatedByName: nameOf.get(r.updatedBy) ?? null }]));
  }

  /**
   * Record (or clear) the stated figures for a client.
   *
   * Passing null for a field clears it and lets the derived value take over again — that is the
   * only way back, so it has to be explicit rather than an omitted field. When every field ends
   * up empty the row is deleted outright, because an override of nothing is not a statement.
   */
  async setOverride(organizationId: string, actorId: string, clientId: string, dto: UpdateLedgerOverrideDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null }, select: { id: true, code: true },
    });
    if (!client) throw new NotFoundException('Client not found.');
    if (dto.billableHours != null && dto.billableHours < 0) {
      throw new BadRequestException('Billable hours cannot be negative.');
    }
    if (dto.amount != null && dto.amount < 0) throw new BadRequestException('Amount cannot be negative.');

    const before = await this.prisma.clientLedgerOverride.findUnique({
      where: { clientId }, select: OVERRIDE_SELECT,
    });
    // An omitted field keeps its stored value; an explicit null clears it.
    const next = {
      billableHours: dto.billableHours !== undefined ? dto.billableHours : before?.billableHours ?? null,
      amount: dto.amount !== undefined ? dto.amount : before?.amount ?? null,
      currency: dto.currency ?? before?.currency ?? 'INR',
      note: dto.note !== undefined ? (dto.note || null) : before?.note ?? null,
    };

    if (next.billableHours == null && next.amount == null) {
      // A note explains a figure; on its own it is not a statement about anything, and silently
      // dropping it would look like the save had worked.
      if (next.note) {
        throw new BadRequestException('A note needs a figure to explain — add stated hours or a value.');
      }
      if (before) {
        await this.prisma.clientLedgerOverride.delete({ where: { clientId } });
        await this.events.emit({
          action: 'client.ledger_override_cleared', entityType: 'CLIENT', entityId: clientId,
          organizationId, oldValue: before as any, metadata: { code: client.code },
        });
      }
      return this.detail(organizationId, clientId);
    }

    // Snapshot what the data says RIGHT NOW, so a later reader can tell a deliberate write-down
    // from a figure the work has moved past. Only meaningful when hours are actually stated.
    const derivedNow = next.billableHours == null
      ? null
      : (await this.derive([clientId])).get(clientId)?.billableHours ?? 0;

    await this.prisma.clientLedgerOverride.upsert({
      where: { clientId },
      create: { organizationId, clientId, ...next, derivedHoursWhenSet: derivedNow, updatedBy: actorId },
      update: { ...next, derivedHoursWhenSet: derivedNow, updatedBy: actorId },
    });
    // Financial figures stated by a person are exactly the kind of change that needs a paper
    // trail: both the old and the new values go into the audit log.
    await this.events.emit({
      action: 'client.ledger_override_set', entityType: 'CLIENT', entityId: clientId,
      organizationId, oldValue: (before ?? null) as any, newValue: next as any,
      metadata: { code: client.code },
    });
    return this.detail(organizationId, clientId);
  }

  /**
   * Hours that reach NO client, and why.
   *
   * Two ways time goes unattributed, and a per-client list hides both by definition:
   *   • logged inside the "assign the PID later" buffer, so it has no project yet;
   *   • logged on a real project that has no client.
   * Neither is wrong — they are ordinary states — but a ledger that silently omits them reads as
   * a complete picture of the firm's work when it is not. Showing the number is the whole fix:
   * it turns "where did those hours go" into a question with an answer on screen.
   */
  /**
   * Where the chain from client to patent to PID to logged hour is broken.
   *
   * Each of those four things exists to make work traceable back to whoever it was done for. The
   * links are enforced when they are made — a project cannot hold patents from two clients — but
   * nothing ever said when a link was simply never made at all, and the gaps are invisible from
   * any single screen:
   *
   *   • a patent minted and never tagged to any work — the portal cannot tell it apart from one
   *     with a year of work behind it;
   *   • a client with no projects — created for a deal that never landed, or created twice;
   *   • a project with a PID but no client — its hours fall out of the ledger entirely, which is
   *     the only one of the three that changes a number rather than just leaving a loose end.
   *
   * Counts and identifiers only. No real patent numbers pass through here.
   */
  async chainGaps(organizationId: string) {
    const [clients, patents, projects] = await Promise.all([
      this.prisma.client.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true, code: true, name: true, archivedAt: true,
          _count: { select: { projects: true, patents: true } },
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.patent.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true, handle: true, createdAt: true,
          client: { select: { id: true, code: true, name: true } },
          // Only LIVE work counts. Filtering here rather than after the fact is what keeps this
          // report agreeing with the patent portal, which computes the same "unused" flag from
          // live projects — the two screens previously disagreed about whether a patent whose
          // only project had been deleted was still in use.
          projectLinks: { where: { project: { deletedAt: null } }, select: { projectId: true } },
        },
        orderBy: { serial: 'asc' },
      }),
      // Project carries no organizationId — it reaches the org through its members, which is how
      // every other query in the system scopes one.
      this.prisma.project.findMany({
        where: {
          deletedAt: null, clientId: null,
          members: { some: { user: { organizationId } } },
        },
        select: { id: true, code: true, roundSeq: true, title: true, projectPhase: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    // Hours stranded on the clientless projects — the part of this that is not merely untidy.
    const clientlessIds = projects.map(p => p.id);
    const stranded = clientlessIds.length
      ? await this.prisma.timesheet.aggregate({
          where: { projectId: { in: clientlessIds }, deletedAt: null },
          _sum: { hoursLogged: true },
        })
      : null;

    const unusedPatents = patents.filter(p => p.projectLinks.length === 0);
    // An archived client with no work is not a loose end — it was retired on purpose.
    const clientsWithoutWork = clients.filter(c => c._count.projects === 0 && !c.archivedAt);

    return {
      unusedPatents: {
        count: unusedPatents.length,
        total: patents.length,
        items: unusedPatents.slice(0, 50).map(p => ({
          id: p.id, handle: p.handle, createdAt: p.createdAt, client: p.client,
        })),
      },
      clientsWithoutWork: {
        count: clientsWithoutWork.length,
        total: clients.length,
        items: clientsWithoutWork.map(c => ({
          id: c.id, code: c.code, name: c.name, patentCount: c._count.patents,
        })),
      },
      projectsWithoutClient: {
        count: projects.length,
        /** Hours that will never reach a client ledger while the project has no client. */
        strandedHours: Math.round((stranded?._sum.hoursLogged ?? 0) * 10) / 10,
        items: projects,
      },
    };
  }

  async unattributed(organizationId: string): Promise<Unattributed> {
    // Scope through the person who logged it: Timesheet carries no organizationId, and inside
    // the buffer it has no project to reach one through either.
    const orgUsers = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null }, select: { id: true },
    });
    const userIds = orgUsers.map(u => u.id);
    if (!userIds.length) return EMPTY_UNATTRIBUTED();

    const clientlessIds = (await this.prisma.project.findMany({
      where: { clientId: null, deletedAt: null }, select: { id: true },
    })).map(p => p.id);

    const rows = await this.prisma.timesheet.findMany({
      where: {
        userId: { in: userIds }, deletedAt: null,
        // Internal team-space work is EXCLUDED. It has no project by design, not by omission,
        // and counting it here would overstate the very gap this figure exists to expose —
        // "hours that should have reached a client but did not".
        teamId: null,
        OR: [
          { projectId: null },                              // still inside the PID buffer
          ...(clientlessIds.length ? [{ projectId: { in: clientlessIds } }] : []),
        ],
      },
      select: { projectId: true, hoursLogged: true, billable: true },
    });

    const out = EMPTY_UNATTRIBUTED();
    const projectsSeen = new Set<string>();
    for (const r of rows) {
      out.totalHours += r.hoursLogged;
      if (r.billable) out.billableHours += r.hoursLogged;
      if (r.projectId) { out.onClientlessProjects += r.hoursLogged; projectsSeen.add(r.projectId); }
      else out.awaitingPid += r.hoursLogged;
    }
    out.totalHours = round2(out.totalHours);
    out.billableHours = round2(out.billableHours);
    out.awaitingPid = round2(out.awaitingPid);
    out.onClientlessProjects = round2(out.onClientlessProjects);
    out.projectCount = projectsSeen.size;
    return out;
  }

  /** One client, with the projects behind its numbers so a total can be traced to its parts. */
  async detail(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
      select: CLIENT_LEDGER_SELECT,
    });
    if (!client) throw new NotFoundException('Client not found.');

    const [derived, overrides, projects, patentCount] = await Promise.all([
      this.derive([clientId]),
      this.overridesFor([clientId]),
      this.prisma.project.findMany({
        where: { clientId, deletedAt: null },
        select: {
          id: true, code: true, title: true, projectPhase: true, projectType: true,
          startDate: true, dueDate: true, completedAt: true, workingHours: true, actualHours: true,
          // One PID can group several projects as "rounds". Without the sequence the ledger shows
          // two rows carrying the identical code and nothing to tell them apart, which reads as a
          // duplicate rather than as round 1 and round 2.
          roundSeq: true,
          // A project can exist before its PID does — created while a PID request sits with an
          // authority, or created and never given one at all. The ledger showed both as a bare
          // dash, which says "no data" when the truth is either "waiting on Ritik" or "nobody
          // ever asked". Those need different actions, so they need different words.
          pidRequest: { select: { status: true, assigneeId: true, createdAt: true } },
        },
        orderBy: [{ code: 'asc' }, { roundSeq: 'asc' }],
      }),
      this.prisma.patent.count({ where: { clientId, deletedAt: null } }),
    ]);

    // Per-project hours, so the client total is auditable rather than a number to be trusted.
    const perProject = projects.length
      ? await this.prisma.timesheet.groupBy({
          by: ['projectId', 'billable'],
          where: { projectId: { in: projects.map(p => p.id) }, deletedAt: null },
          _sum: { hoursLogged: true },
        })
      : [];
    const hoursByProject = new Map<string, { billable: number; nonBillable: number }>();
    for (const row of perProject) {
      if (!row.projectId) continue;
      const bucket = hoursByProject.get(row.projectId) ?? { billable: 0, nonBillable: 0 };
      const hours = row._sum.hoursLogged ?? 0;
      if (row.billable) bucket.billable += hours; else bucket.nonBillable += hours;
      hoursByProject.set(row.projectId, bucket);
    }

    const d = derived.get(clientId) ?? EMPTY_LEDGER();
    const o = overrides.get(clientId) ?? null;
    return {
      ...client,
      patentCount,
      derived: d,
      override: o,
      effective: this.effective(d, o, client),
      projects: projects.map(p => {
        const h = hoursByProject.get(p.id) ?? { billable: 0, nonBillable: 0 };
        const { pidRequest, ...rest } = p;
        return {
          ...rest,
          /**
           * Why there is no PID, in one word the screen can act on:
           *   'assigned'  — it has one;
           *   'requested' — a request is open with a PID authority;
           *   'missing'   — nobody has asked, and these hours are one step from being stranded.
           */
          pidStatus: p.code ? 'assigned' : pidRequest?.status === 'PENDING' ? 'requested' : 'missing',
          pidRequestedAt: p.code ? null : pidRequest?.createdAt ?? null,
          billableHours: round2(h.billable),
          nonBillableHours: round2(h.nonBillable),
          totalHours: round2(h.billable + h.nonBillable),
        };
      }),
    };
  }

  /**
   * The derivation itself, for a set of clients at once.
   *
   * Time reaches a client only through a project: `Timesheet.projectId → Project.clientId`. Time
   * logged during the "assign the PID later" buffer has no project yet and therefore belongs to
   * no client — it is correctly invisible here until the entry is completed.
   */
  private async derive(clientIds: string[]): Promise<Map<string, DerivedLedger>> {
    const out = new Map<string, DerivedLedger>();
    for (const id of clientIds) out.set(id, EMPTY_LEDGER());

    const projects = await this.prisma.project.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
      select: { id: true, clientId: true, projectPhase: true },
    });
    const clientOfProject = new Map(projects.map(p => [p.id, p.clientId!]));
    for (const p of projects) {
      const row = out.get(p.clientId!);
      if (!row) continue;
      row.projectCount++;
      if (['ACTIVE', 'ON_HOLD'].includes(p.projectPhase)) row.activeProjectCount++;
    }

    const patents = await this.prisma.patent.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds }, deletedAt: null },
      _count: { _all: true },
    });
    for (const p of patents) {
      const row = out.get(p.clientId);
      if (row) row.patentCount = p._count._all;
    }

    if (projects.length) {
      const entries = await this.prisma.timesheet.findMany({
        where: { projectId: { in: projects.map(p => p.id) }, deletedAt: null },
        select: { projectId: true, userId: true, hoursLogged: true, billable: true, date: true },
      });
      // Contributors are counted per client, so the same person on three of a client's projects
      // counts once — hence a set rather than a running total.
      const contributors = new Map<string, Set<string>>();
      for (const e of entries) {
        const clientId = e.projectId ? clientOfProject.get(e.projectId) : undefined;
        if (!clientId) continue;
        const row = out.get(clientId);
        if (!row) continue;
        if (e.billable) row.billableHours += e.hoursLogged; else row.nonBillableHours += e.hoursLogged;
        if (!row.firstLoggedAt || e.date < row.firstLoggedAt) row.firstLoggedAt = e.date;
        if (!row.lastLoggedAt || e.date > row.lastLoggedAt) row.lastLoggedAt = e.date;
        const seen = contributors.get(clientId) ?? new Set<string>();
        seen.add(e.userId);
        contributors.set(clientId, seen);
      }
      for (const [clientId, seen] of contributors) {
        const row = out.get(clientId);
        if (row) row.contributorCount = seen.size;
      }
    }

    for (const row of out.values()) {
      row.billableHours = round2(row.billableHours);
      row.nonBillableHours = round2(row.nonBillableHours);
      row.totalHours = round2(row.billableHours + row.nonBillableHours);
    }
    return out;
  }
}

/** Hours the ledger cannot attribute to any client, split by the reason. */
export type Unattributed = {
  totalHours: number;
  billableHours: number;
  /** Logged before a PID was assigned — no project yet. */
  awaitingPid: number;
  /** Logged on a real project that has no client. */
  onClientlessProjects: number;
  /** How many clientless projects those hours sit on. */
  projectCount: number;
};

const EMPTY_UNATTRIBUTED = (): Unattributed => ({
  totalHours: 0, billableHours: 0, awaitingPid: 0, onClientlessProjects: 0, projectCount: 0,
});

/**
 * What the ledger needs about a client: identity, the relationship facts a person maintains, and
 * the rate the value is derived from. The account manager is resolved to a name here rather than
 * left as an id — "who owns this relationship" is only useful as a person.
 */
const CLIENT_LEDGER_SELECT = {
  id: true, code: true, name: true, archivedAt: true, createdAt: true,
  contactName: true, contactEmail: true, contactPhone: true, website: true,
  country: true, address: true, industry: true, notes: true,
  billingRate: true, billingCurrency: true, engagementStart: true, accountManagerId: true,
  accountManager: { select: { id: true, firstName: true, lastName: true, designation: true } },
} as const;

const OVERRIDE_SELECT = {
  clientId: true, billableHours: true, amount: true, currency: true, note: true,
  derivedHoursWhenSet: true, updatedBy: true, updatedAt: true,
} as const;

type LedgerOverrideRow = {
  clientId: string;
  billableHours: number | null;
  amount: number | null;
  currency: string;
  note: string | null;
  /** The derived figure at the moment of the statement — the baseline drift is measured from. */
  derivedHoursWhenSet: number | null;
  updatedBy: string;
  updatedAt: Date;
  updatedByName?: string | null;
};

const EMPTY_LEDGER = (): DerivedLedger => ({
  projectCount: 0, activeProjectCount: 0, patentCount: 0,
  billableHours: 0, nonBillableHours: 0, totalHours: 0,
  contributorCount: 0, firstLoggedAt: null, lastLoggedAt: null,
});
