import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from '../permissions/permission.service';
import { NotificationsService } from '../notifications/notifications.module';
import { getActorId } from '../../common/context/request-context';

/**
 * Optional holidays — the four the firm declares each year, of which each person may take two.
 *
 * The rules come straight off the published calendar: apply in advance, HR approves subject to team
 * requirements, and unused ones neither carry forward nor pay out. That last rule needs no field:
 * the allowance is counted per calendar year, so an unused day simply stops being available when
 * the year ends.
 *
 * These are deliberately NOT rows in `holiday`. Every working-day calculation in the system treats
 * a Holiday row as a day the firm is shut, so an optional holiday stored there is a day off for
 * everybody — which is precisely what had happened to Good Friday. An optional holiday is a
 * per-person fact and lives in its own table.
 */
@Injectable()
export class OptionalHolidaysService {
  /** From the published calendar: "Each employee can avail 2 optional holidays in a calendar year." */
  static readonly ALLOWANCE_PER_YEAR = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
  ) {}

  private async actor(): Promise<string> {
    const id = getActorId();
    if (!id) throw new ForbiddenException('You must be signed in.');
    return id;
  }

  /** Approving somebody's optional holiday is the same class of decision as approving leave. */
  private async assertApprover(actorId: string) {
    if (!(await this.permissions.check(actorId, 'leave.approve'))) {
      throw new ForbiddenException('Only HR can approve optional holidays.');
    }
  }

  /**
   * The year's optional holidays, each showing where this person stands with it, plus how much of
   * the allowance is left. One call, because the two facts are useless apart: a list of dates
   * without "you have one left" cannot be acted on.
   */
  async listForActor(organizationId: string, year?: number) {
    const actorId = await this.actor();
    const y = year ?? new Date().getUTCFullYear();
    const holidays = await this.prisma.optionalHoliday.findMany({
      where: { organizationId, year: y },
      orderBy: { date: 'asc' },
      select: {
        id: true, name: true, date: true, year: true,
        elections: {
          where: { userId: actorId },
          select: { id: true, status: true, reviewNote: true, reviewedAt: true },
        },
      },
    });
    const used = this.countUsed(holidays.map(h => h.elections[0]?.status));
    const today = startOfUtcDay(new Date());
    return {
      year: y,
      allowance: OptionalHolidaysService.ALLOWANCE_PER_YEAR,
      used,
      remaining: Math.max(0, OptionalHolidaysService.ALLOWANCE_PER_YEAR - used),
      holidays: holidays.map(h => ({
        id: h.id, name: h.name, date: h.date,
        election: h.elections[0] ?? null,
        // A holiday that has already passed can no longer be applied for — the rule is "in
        // advance", and a retrospective day off is a leave request, not a holiday.
        past: startOfUtcDay(h.date) <= today,
      })),
    };
  }

  /** PENDING counts against the allowance too — otherwise four requests could all be approved. */
  private countUsed(statuses: (string | undefined)[]): number {
    return statuses.filter(s => s === 'PENDING' || s === 'APPROVED').length;
  }

  /** Apply for one. Refused when it is in the past, already requested, or over the allowance. */
  async elect(organizationId: string, optionalHolidayId: string) {
    const actorId = await this.actor();
    const holiday = await this.prisma.optionalHoliday.findFirst({
      where: { id: optionalHolidayId, organizationId },
      select: { id: true, name: true, date: true, year: true },
    });
    if (!holiday) throw new NotFoundException('That optional holiday does not exist.');
    if (startOfUtcDay(holiday.date) <= startOfUtcDay(new Date())) {
      throw new BadRequestException(`${holiday.name} has already passed — optional holidays must be applied for in advance.`);
    }
    const existing = await this.prisma.optionalHolidayElection.findUnique({
      where: { optionalHolidayId_userId: { optionalHolidayId, userId: actorId } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== 'CANCELLED' && existing.status !== 'REJECTED') {
      throw new BadRequestException(`You have already applied for ${holiday.name}.`);
    }

    // The allowance is counted over the holiday's YEAR, not today's — someone applying in December
    // for a January date is spending next year's allowance, not this year's.
    const yearStatuses = (await this.prisma.optionalHolidayElection.findMany({
      where: {
        userId: actorId,
        optionalHoliday: { organizationId, year: holiday.year },
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { status: true },
    })).map(e => e.status);
    if (this.countUsed(yearStatuses) >= OptionalHolidaysService.ALLOWANCE_PER_YEAR) {
      throw new BadRequestException(
        `You have already used both optional holidays for ${holiday.year}. Cancel one to choose differently.`,
      );
    }

    const election = existing
      ? await this.prisma.optionalHolidayElection.update({
          where: { id: existing.id },
          data: { status: 'PENDING', reviewedBy: null, reviewedAt: null, reviewNote: null },
          select: { id: true, status: true },
        })
      : await this.prisma.optionalHolidayElection.create({
          data: { optionalHolidayId, userId: actorId },
          select: { id: true, status: true },
        });

    // Route it to the people who can actually decide, rather than hoping someone notices.
    const approvers = await this.approverIds(organizationId);
    if (approvers.length) {
      const me = await this.prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
      await this.notifications.notify(approvers, {
        type: 'holiday.optional_requested',
        title: 'Optional holiday request',
        message: `${me?.firstName ?? 'Someone'} ${me?.lastName ?? ''}`.trim() + ` applied for ${holiday.name}.`,
        link: '/attendance?tab=holidays',
      });
    }
    await this.events.emit({
      action: 'holiday.optional_requested', entityType: 'HOLIDAY', entityId: optionalHolidayId,
      organizationId, metadata: { name: holiday.name, userId: actorId },
    });
    return this.listForActor(organizationId, holiday.year);
  }

  /** Withdraw your own request. Frees the allowance again. */
  async cancel(organizationId: string, electionId: string) {
    const actorId = await this.actor();
    const election = await this.prisma.optionalHolidayElection.findFirst({
      where: { id: electionId, userId: actorId },
      select: { id: true, status: true, optionalHoliday: { select: { name: true, date: true, year: true } } },
    });
    if (!election) throw new NotFoundException('Request not found.');
    if (startOfUtcDay(election.optionalHoliday.date) <= startOfUtcDay(new Date())) {
      throw new BadRequestException('That day has passed — it can no longer be withdrawn.');
    }
    await this.prisma.optionalHolidayElection.update({
      where: { id: electionId }, data: { status: 'CANCELLED' },
    });
    return this.listForActor(organizationId, election.optionalHoliday.year);
  }

  /** Everything awaiting a decision — the HR queue. */
  async pending(organizationId: string) {
    const actorId = await this.actor();
    await this.assertApprover(actorId);
    return this.prisma.optionalHolidayElection.findMany({
      where: { status: 'PENDING', optionalHoliday: { organizationId } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, status: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, designation: true, profilePhoto: true } },
        optionalHoliday: { select: { id: true, name: true, date: true } },
      },
    });
  }

  /**
   * Approve or reject. Approval is what makes the date a non-working day FOR THAT PERSON — nothing
   * about the firm's calendar changes.
   */
  async review(organizationId: string, electionId: string, approve: boolean, note?: string) {
    const actorId = await this.actor();
    await this.assertApprover(actorId);
    const election = await this.prisma.optionalHolidayElection.findFirst({
      where: { id: electionId, optionalHoliday: { organizationId } },
      select: {
        id: true, status: true, userId: true,
        optionalHoliday: { select: { name: true, date: true, year: true } },
      },
    });
    if (!election) throw new NotFoundException('Request not found.');
    if (election.status !== 'PENDING') {
      throw new BadRequestException(`That request is already ${election.status.toLowerCase()}.`);
    }
    await this.prisma.optionalHolidayElection.update({
      where: { id: electionId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note?.trim() || null,
      },
    });
    await this.notifications.notify([election.userId], {
      type: approve ? 'holiday.optional_approved' : 'holiday.optional_rejected',
      title: approve ? 'Optional holiday approved' : 'Optional holiday declined',
      message: approve
        ? `${election.optionalHoliday.name} is yours — it will not count as a working day for you.`
        : `${election.optionalHoliday.name} was declined${note ? `: ${note.trim()}` : '.'}`,
      link: '/attendance?tab=holidays',
    });
    await this.events.emit({
      action: approve ? 'holiday.optional_approved' : 'holiday.optional_rejected',
      entityType: 'HOLIDAY', entityId: electionId, organizationId,
      metadata: { userId: election.userId, name: election.optionalHoliday.name },
    });
    return this.pending(organizationId);
  }

  /** Who may approve — resolved by permission, never by role name. */
  private async approverIds(organizationId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' }, select: { id: true },
    });
    const out: string[] = [];
    for (const u of users) {
      if (await this.permissions.check(u.id, 'leave.approve')) out.push(u.id);
    }
    return out;
  }

  /**
   * The approved optional-holiday dates for a set of people, as `userId|YYYY-MM-DD` keys.
   *
   * This is the shape attendance and capacity already use for approved leave, so an approved
   * optional holiday can drop straight into the same per-person, per-day exclusion those modules
   * apply — which is the whole point: the day is off for this person and nobody else.
   */
  async approvedDayKeys(organizationId: string, from: Date, to: Date): Promise<Set<string>> {
    const rows = await this.prisma.optionalHolidayElection.findMany({
      where: {
        status: 'APPROVED',
        optionalHoliday: { organizationId, date: { gte: from, lte: to } },
      },
      select: { userId: true, optionalHoliday: { select: { date: true } } },
    });
    return new Set(rows.map(r => `${r.userId}|${dayKey(r.optionalHoliday.date)}`));
  }
}

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dayKey = (d: Date) => startOfUtcDay(d).toISOString().slice(0, 10);
