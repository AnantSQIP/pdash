import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from '../permissions/permission.service';
import { getActorId } from '../../common/context/request-context';
import { DEAL_STAGES, OPEN_STAGES, stageDef, type DealStage } from '../../common/deal-stages';
import { validateClientCode, suggestClientCode } from '../../common/client-code';
import { CreateDealDto, LogActivityDto, MoveDealDto, UpdateDealDto } from './dto';

const DEAL_SELECT = {
  id: true, company: true, title: true, stage: true, value: true, currency: true,
  ownerId: true, source: true, expectedCloseDate: true, wonAt: true, lostAt: true,
  lostReason: true, clientId: true, notes: true, teamId: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
  client: { select: { id: true, code: true, name: true } },
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The business-development pipeline.
 *
 * Deals are commercial information — who we are talking to and for how much — so the whole module
 * sits behind `deal.view`, and changing a pipeline needs `deal.manage`. It is NOT scoped by
 * ownership: a pipeline that each person can only see their own slice of cannot be forecast, and
 * forecasting is most of the point.
 *
 * The one place this module touches the rest of the system is winning. A won deal can mint or link
 * a Client, after which the work flows through projects and the client ledger like any other. Up to
 * that moment a prospect is deliberately just a name — most never become a client, and creating a
 * client record for every conversation would fill the confidential portal with noise.
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
  ) {}

  private async actor(): Promise<string> {
    const id = getActorId();
    if (!id) throw new ForbiddenException('You must be signed in.');
    return id;
  }

  // ── Reading ───────────────────────────────────────────────────────────────
  async list(organizationId: string, opts: { stage?: string; ownerId?: string } = {}) {
    return this.prisma.deal.findMany({
      where: {
        organizationId, deletedAt: null,
        ...(opts.stage ? { stage: opts.stage } : {}),
        ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
      },
      select: DEAL_SELECT,
      // Biggest first inside each stage: the board should lead with what matters most, and a
      // nameless £5k enquiry should not sit above the deal the quarter depends on.
      orderBy: [{ stage: 'asc' }, { value: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async get(organizationId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: {
        ...DEAL_SELECT,
        activities: {
          orderBy: { occurredAt: 'desc' },
          select: { id: true, type: true, note: true, fromStage: true, toStage: true, occurredAt: true, createdBy: true },
        },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found.');
    // Resolve who did what once, here, rather than making the UI join names to ids.
    const ids = [...new Set(deal.activities.map(a => a.createdBy))];
    const users = ids.length ? await this.prisma.user.findMany({
      where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true },
    }) : [];
    const nameOf = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    return {
      ...deal,
      activities: deal.activities.map(a => ({ ...a, byName: nameOf.get(a.createdBy) ?? null })),
    };
  }

  /**
   * The numbers a pipeline exists to produce: what is open, what it is worth weighted by stage,
   * and how the firm actually converts.
   */
  async summary(organizationId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { organizationId, deletedAt: null },
      select: { stage: true, value: true, currency: true, wonAt: true, lostAt: true, createdAt: true, lostReason: true },
    });

    const byStage = DEAL_STAGES.map(s => {
      const rows = deals.filter(d => d.stage === s.value);
      const value = rows.reduce((n, d) => n + (d.value ?? 0), 0);
      return {
        stage: s.value, label: s.label, probability: s.probability,
        count: rows.length, value: round2(value),
        weighted: round2(value * s.probability),
      };
    });

    const open = deals.filter(d => OPEN_STAGES.includes(d.stage as DealStage));
    const won = deals.filter(d => d.stage === 'WON');
    const lost = deals.filter(d => d.stage === 'LOST');
    const closed = won.length + lost.length;

    // Cycle time is measured on CLOSED deals only. Including open ones would mean the number
    // creeps upward every day simply because nothing has finished yet.
    const cycleDays = won
      .map(d => d.wonAt ? (d.wonAt.getTime() - d.createdAt.getTime()) / 86_400_000 : null)
      .filter((n): n is number => n !== null);

    // Why deals are lost, most common first — the single most actionable thing here, and the
    // reason lostReason is mandatory on the move.
    const reasons = new Map<string, number>();
    for (const d of lost) {
      const r = (d.lostReason || '').trim() || 'Not recorded';
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }

    return {
      byStage,
      openCount: open.length,
      openValue: round2(open.reduce((n, d) => n + (d.value ?? 0), 0)),
      /** Open pipeline weighted by each stage's probability — the forecast. */
      weightedForecast: round2(byStage.filter(s => OPEN_STAGES.includes(s.stage as DealStage))
        .reduce((n, s) => n + s.weighted, 0)),
      wonCount: won.length,
      wonValue: round2(won.reduce((n, d) => n + (d.value ?? 0), 0)),
      lostCount: lost.length,
      /** Of the deals that CLOSED, the share that closed won. Null until something has closed. */
      winRate: closed ? Math.round((won.length / closed) * 100) : null,
      avgCycleDays: cycleDays.length ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) : null,
      lostReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      // Currency is per-deal, so a pipeline mixing them cannot be summed honestly. Say so rather
      // than adding rupees to dollars and presenting the result as a forecast.
      currencies: [...new Set(deals.map(d => d.currency))],
    };
  }

  // ── Writing ───────────────────────────────────────────────────────────────
  async create(organizationId: string, dto: CreateDealDto) {
    const actorId = await this.actor();
    const ownerId = dto.ownerId ?? actorId;
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!owner) throw new BadRequestException('The owner must be someone in this organisation.');

    const deal = await this.prisma.deal.create({
      data: {
        organizationId,
        company: dto.company.trim(),
        title: dto.title?.trim() || null,
        stage: dto.stage ?? 'NEW',
        value: dto.value ?? null,
        currency: dto.currency ?? 'INR',
        ownerId,
        source: dto.source?.trim() || null,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        teamId: dto.teamId ?? null,
        notes: dto.notes?.trim() || null,
        createdBy: actorId,
      },
      select: DEAL_SELECT,
    });
    await this.prisma.dealActivity.create({
      data: { dealId: deal.id, type: 'STAGE_CHANGE', toStage: deal.stage, createdBy: actorId, note: 'Deal created' },
    });
    await this.events.emit({
      action: 'deal.created', entityType: 'DEAL', entityId: deal.id, organizationId,
      metadata: { company: deal.company, stage: deal.stage, value: deal.value },
    });
    return deal;
  }

  async update(organizationId: string, id: string, dto: UpdateDealDto) {
    await this.actor();
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true, stage: true },
    });
    if (!deal) throw new NotFoundException('Deal not found.');
    if (dto.ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: dto.ownerId, organizationId, deletedAt: null }, select: { id: true },
      });
      if (!owner) throw new BadRequestException('The owner must be someone in this organisation.');
    }
    await this.prisma.deal.update({
      where: { id },
      data: {
        ...(dto.company !== undefined ? { company: dto.company.trim() } : {}),
        ...(dto.title !== undefined ? { title: dto.title?.trim() || null } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        ...(dto.source !== undefined ? { source: dto.source?.trim() || null } : {}),
        ...(dto.expectedCloseDate !== undefined
          ? { expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
    return this.get(organizationId, id);
  }

  /**
   * Move a deal along the pipeline.
   *
   * Every move is written to the activity log, so "why has this been in Proposal for four months"
   * has an answer. Losing REQUIRES a reason — the most useful field in any pipeline and the one
   * everybody skips unless it is compulsory.
   */
  async move(organizationId: string, id: string, dto: MoveDealDto) {
    const actorId = await this.actor();
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, stage: true, company: true, clientId: true, value: true },
    });
    if (!deal) throw new NotFoundException('Deal not found.');
    const to = dto.stage as DealStage;
    if (!stageDef(to)) throw new BadRequestException('Unknown pipeline stage.');
    if (deal.stage === to) return this.get(organizationId, id);

    if (to === 'LOST' && !dto.lostReason?.trim()) {
      throw new BadRequestException('Record why the deal was lost — it is the most useful thing in the pipeline.');
    }

    // Winning may tie the deal to a client, either an existing one or a newly minted code. That
    // link is what lets the work show up in the client ledger later.
    let clientId = deal.clientId;
    if (to === 'WON') clientId = await this.resolveWonClient(organizationId, actorId, deal.company, dto) ?? clientId;

    await this.prisma.$transaction([
      this.prisma.deal.update({
        where: { id },
        data: {
          stage: to,
          clientId,
          wonAt: to === 'WON' ? new Date() : null,
          lostAt: to === 'LOST' ? new Date() : null,
          lostReason: to === 'LOST' ? (dto.lostReason?.trim() || null) : null,
        },
      }),
      this.prisma.dealActivity.create({
        data: {
          dealId: id, type: 'STAGE_CHANGE', fromStage: deal.stage, toStage: to,
          note: to === 'LOST' ? dto.lostReason?.trim() : null, createdBy: actorId,
        },
      }),
    ]);
    await this.events.emit({
      action: to === 'WON' ? 'deal.won' : to === 'LOST' ? 'deal.lost' : 'deal.stage_changed',
      entityType: 'DEAL', entityId: id, organizationId,
      metadata: { company: deal.company, from: deal.stage, to, value: deal.value, clientId },
    });
    return this.get(organizationId, id);
  }

  /**
   * Turn a won deal into a client link. Either an existing client, or a new code minted here —
   * which is the natural moment for it, since this is when a prospect becomes a real engagement.
   *
   * Creating a client is a `patent.manage` act everywhere else in the system, and it stays one
   * here: winning a deal does not entitle anyone to add to the confidential client portal.
   */
  private async resolveWonClient(
    organizationId: string, actorId: string, company: string, dto: MoveDealDto,
  ): Promise<string | null> {
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, organizationId, deletedAt: null }, select: { id: true, archivedAt: true, code: true },
      });
      if (!client) throw new BadRequestException('That client does not exist.');
      if (client.archivedAt) throw new BadRequestException(`Client ${client.code} is archived — restore it first.`);
      return client.id;
    }
    if (!dto.newClientCode) return null;

    if (!(await this.permissions.check(actorId, 'patent.manage'))) {
      throw new ForbiddenException('Creating a client code needs the confidential client permission — win the deal and ask a Super Admin to add it.');
    }
    const taken = (await this.prisma.client.findMany({
      where: { organizationId, deletedAt: null }, select: { code: true },
    })).map(c => c.code);
    const problem = validateClientCode(dto.newClientCode, taken);
    if (problem) {
      throw new BadRequestException(
        problem === 'taken'
          ? `Client code "${dto.newClientCode}" is already in use.`
          : `"${dto.newClientCode}" is not a usable client code — 2 to 5 letters or digits, with at least one letter.`,
      );
    }
    const created = await this.prisma.client.create({
      data: { organizationId, code: dto.newClientCode, name: company, createdBy: actorId },
      select: { id: true },
    });
    await this.events.emit({
      action: 'patent.client_created_from_deal', entityType: 'CLIENT', entityId: created.id,
      organizationId, metadata: { code: dto.newClientCode, company },
    });
    return created.id;
  }

  /** A suggested client code for a won deal's company — the same rules the portal uses. */
  async suggestClientCodeFor(organizationId: string, company: string) {
    const taken = (await this.prisma.client.findMany({
      where: { organizationId, deletedAt: null }, select: { code: true },
    })).map(c => c.code);
    return { code: suggestClientCode(company, taken) };
  }

  async logActivity(organizationId: string, id: string, dto: LogActivityDto) {
    const actorId = await this.actor();
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!deal) throw new NotFoundException('Deal not found.');
    await this.prisma.dealActivity.create({
      data: {
        dealId: id, type: dto.type, note: dto.note || null, createdBy: actorId,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
    });
    return this.get(organizationId, id);
  }

  async remove(organizationId: string, id: string) {
    await this.actor();
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true, company: true },
    });
    if (!deal) throw new NotFoundException('Deal not found.');
    await this.prisma.deal.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.events.emit({
      action: 'deal.deleted', entityType: 'DEAL', entityId: id, organizationId, metadata: { company: deal.company },
    });
    return { ok: true };
  }
}
