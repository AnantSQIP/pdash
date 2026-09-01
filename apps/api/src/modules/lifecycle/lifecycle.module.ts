import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { EventService } from '../audit-events/event.service';
import { NotificationsService } from '../notifications/notifications.module';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';

/**
 * Employment lifecycle — probation, confirmation and leaving.
 *
 * WHY THIS EXISTS AT ALL, AT A FIRM OF TWENTY-EIGHT
 *
 * Most HR modules are not worth building at this size; a spreadsheet genuinely is fine for a list
 * of twenty-eight people, and an attrition dashboard tells an HR Specialist who knows everyone by
 * name absolutely nothing. Two things here are different.
 *
 * PROBATION, because a QUARTER OF THIS FIRM IS ON AN INTERNSHIP — seven of twenty-eight — and
 * interns convert to Research Associates. That is a recurring decision with a date attached, and
 * the appraisal module cannot carry it: appraisals run on fixed cycles twice a year, while a
 * confirmation is due a fixed period after each individual's own joining date.
 *
 * EXIT, because of the one thing this system can answer that nothing else can. Revoking ACCESS
 * already works properly — setting a user INACTIVE kills a held token on the very next request.
 * What no spreadsheet can produce is what the leaver was still HOLDING: their open tasks, the
 * projects where they are the manager, the timesheets they never filed. That list is already in
 * the database; it just has never been asked for.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No onboarding flow — that module existed, and was removed in July as redundant with add-member.
 * No payroll, no letters, no asset register. Those are either excluded, or a spreadsheet at this
 * scale, and adding them would be building an HR suite rather than closing a gap.
 */

/** Used when a person has no explicit probation period of their own. */
const DEFAULT_PROBATION_MONTHS = 6;
/** How far ahead the "due for confirmation" list looks. */
const DUE_WINDOW_DAYS = 30;

const PERSON = {
  id: true, firstName: true, lastName: true, email: true, designation: true,
  profilePhoto: true, office: true, joiningDate: true, probationMonths: true,
  confirmedAt: true, confirmedBy: true, confirmationNote: true,
  resignationDate: true, noticeDays: true, lastWorkingDay: true,
  exitReason: true, exitCompletedAt: true, status: true,
} as const;

class SetProbationDto {
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(24) probationMonths?: number;
}
class ConfirmDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Back-date a confirmation that happened before the system knew about it. */
  @IsOptional() @IsDateString() confirmedAt?: string;
}
class ResignDto {
  @IsDateString() resignationDate!: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) noticeDays?: number;
  @IsOptional() @IsDateString() lastWorkingDay?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addMonths = (d: Date, m: number) => {
  const x = new Date(d.getTime());
  x.setUTCMonth(x.getUTCMonth() + m);
  return x;
};

@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
  ) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  /**
   * When probation ends — DERIVED, never stored.
   *
   * A stored end date is a second copy of joiningDate + probationMonths, and it goes stale the
   * first time somebody corrects a joining date. Joining dates get corrected: all twenty-eight
   * were empty when this was written, so every one of them will be entered from a document
   * afterwards, and some will be entered wrong first.
   */
  private probationEnd(u: { joiningDate: Date | null; probationMonths: number | null }): Date | null {
    if (!u.joiningDate) return null;
    return day(addMonths(u.joiningDate, u.probationMonths ?? DEFAULT_PROBATION_MONTHS));
  }

  private decorate(u: any) {
    const ends = this.probationEnd(u);
    const today = day(new Date());
    const onNotice = !!u.lastWorkingDay && !u.exitCompletedAt;
    return {
      ...u,
      probationEndsOn: ends,
      /**
       * Null when there is no joining date — not "overdue". Treating a missing date as an overdue
       * confirmation would put the entire roster on the HR list on day one and teach everyone to
       * ignore it.
       */
      probationStatus: u.confirmedAt ? 'confirmed'
        : !ends ? 'unknown'
        : ends < today ? 'overdue'
        : (ends.getTime() - today.getTime()) / 86_400_000 <= DUE_WINDOW_DAYS ? 'due'
        : 'on-probation',
      daysToProbationEnd: ends ? Math.round((ends.getTime() - today.getTime()) / 86_400_000) : null,
      onNotice,
      daysToLastWorkingDay: u.lastWorkingDay
        ? Math.round((day(u.lastWorkingDay).getTime() - today.getTime()) / 86_400_000) : null,
    };
  }

  /** Everyone HR needs to act on: due, overdue, or serving notice. */
  async board(includeAll = false) {
    const organizationId = await this.actor.requireOrgId();
    const people = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, ...(includeAll ? {} : { status: 'ACTIVE' }) },
      select: PERSON,
      orderBy: [{ joiningDate: 'asc' }, { firstName: 'asc' }],
    });
    const rows = people.map(p => this.decorate(p));
    return {
      /** Confirmation is due, overdue, or the joining date is missing so it cannot be judged. */
      probation: rows.filter(r => ['due', 'overdue', 'on-probation'].includes(r.probationStatus)),
      leaving: rows.filter(r => r.onNotice),
      /** Nothing tenure-based works without this, so it is surfaced rather than left to be noticed. */
      missingJoiningDate: rows.filter(r => !r.joiningDate).map(r => ({
        id: r.id, firstName: r.firstName, lastName: r.lastName, designation: r.designation,
      })),
      counts: {
        total: rows.length,
        confirmed: rows.filter(r => r.probationStatus === 'confirmed').length,
        onProbation: rows.filter(r => r.probationStatus === 'on-probation').length,
        due: rows.filter(r => r.probationStatus === 'due').length,
        overdue: rows.filter(r => r.probationStatus === 'overdue').length,
        onNotice: rows.filter(r => r.onNotice).length,
        noJoiningDate: rows.filter(r => !r.joiningDate).length,
      },
    };
  }

  async person(userId: string) {
    const organizationId = await this.actor.requireOrgId();
    const u = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null }, select: PERSON,
    });
    if (!u) throw new NotFoundException('Person not found.');
    return this.decorate(u);
  }

  /** Record the joining date and/or the probation period. */
  async setProbation(userId: string, dto: SetProbationDto) {
    const organizationId = await this.actor.requireOrgId();
    const u = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!u) throw new NotFoundException('Person not found.');
    const joining = dto.joiningDate ? day(new Date(dto.joiningDate)) : undefined;
    if (joining && joining > day(new Date())) {
      throw new BadRequestException('A joining date cannot be in the future.');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(joining !== undefined ? { joiningDate: joining } : {}),
        ...(dto.probationMonths !== undefined ? { probationMonths: dto.probationMonths } : {}),
      },
      select: PERSON,
    });
    await this.events.emit({
      action: 'user.probation_set', entityType: 'USER', entityId: userId, organizationId,
      metadata: { joiningDate: dto.joiningDate ?? null, probationMonths: dto.probationMonths ?? null },
    });
    return this.decorate(updated);
  }

  /** Confirm somebody at the end of probation. */
  async confirm(userId: string, dto: ConfirmDto) {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    const u = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: { id: true, firstName: true, confirmedAt: true, joiningDate: true },
    });
    if (!u) throw new NotFoundException('Person not found.');
    if (u.confirmedAt) throw new BadRequestException('This person is already confirmed.');
    // Not a hard requirement: a confirmation that genuinely happened should be recordable even if
    // the paperwork behind the joining date has not caught up. It is worth refusing a FUTURE
    // confirmation though — that is a typo, not a decision.
    const when = dto.confirmedAt ? day(new Date(dto.confirmedAt)) : day(new Date());
    if (when > day(new Date())) throw new BadRequestException('A confirmation cannot be dated in the future.');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { confirmedAt: when, confirmedBy: actorId, confirmationNote: dto.note?.trim() || null },
      select: PERSON,
    });
    await this.events.emit({
      action: 'user.confirmed', entityType: 'USER', entityId: userId, organizationId, actorId,
      metadata: { confirmedAt: when.toISOString().slice(0, 10) },
    });
    // The person is told. A confirmation nobody hears about is a database row, not a milestone.
    await this.notifications.notify([userId], {
      type: 'user.confirmed',
      title: 'Your employment is confirmed',
      message: 'Your probation period is complete and your employment has been confirmed.',
      link: '/settings',
    });
    return this.decorate(updated);
  }

  /**
   * Record a resignation and work out the last working day.
   *
   * Calculated from notice rather than typed when only one of the two is given — they are the same
   * fact stated twice, and two people typing them separately is how they end up disagreeing.
   */
  async resign(userId: string, dto: ResignDto) {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    const u = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, lastWorkingDay: true },
    });
    if (!u) throw new NotFoundException('Person not found.');

    const resigned = day(new Date(dto.resignationDate));
    let last = dto.lastWorkingDay ? day(new Date(dto.lastWorkingDay)) : null;
    if (!last && dto.noticeDays != null) {
      last = day(new Date(resigned.getTime() + dto.noticeDays * 86_400_000));
    }
    if (last && last < resigned) {
      throw new BadRequestException('The last working day cannot fall before the resignation date.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        resignationDate: resigned,
        noticeDays: dto.noticeDays ?? null,
        lastWorkingDay: last,
        exitReason: dto.reason?.trim() || null,
      },
      select: PERSON,
    });
    await this.events.emit({
      action: 'user.resignation_recorded', entityType: 'USER', entityId: userId, organizationId, actorId,
      metadata: { resignationDate: dto.resignationDate, lastWorkingDay: last?.toISOString().slice(0, 10) ?? null },
    });
    return this.decorate(updated);
  }

  /**
   * What this person is still holding.
   *
   * The entire point of putting exit in this system rather than a checklist: every one of these
   * is a live query against work in progress, and none of them can be answered by asking the
   * person leaving to remember.
   */
  async handover(userId: string) {
    const organizationId = await this.actor.requireOrgId();
    const u = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null }, select: PERSON,
    });
    if (!u) throw new NotFoundException('Person not found.');

    const [openTasks, managedProjects, memberProjects, unsubmitted, pendingLeave, ownedClients] =
      await Promise.all([
        // Tasks still assigned to them and not closed.
        this.prisma.task.findMany({
          where: {
            deletedAt: null,
            assignees: { some: { userId } },
            OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
          },
          select: {
            id: true, title: true, dueDate: true, priority: true,
            currentStatus: { select: { name: true } },
            projectTasks: { select: { project: { select: { id: true, code: true, title: true } } } },
          },
          orderBy: { dueDate: 'asc' },
          take: 200,
        }),
        // Projects they RUN — the ones that need a new owner before they go.
        this.prisma.project.findMany({
          where: {
            deletedAt: null,
            members: { some: { userId, projectRole: 'MANAGER', isActive: true } },
            projectPhase: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] },
          },
          select: { id: true, code: true, title: true, projectPhase: true, dueDate: true },
          orderBy: { dueDate: 'asc' },
        }),
        this.prisma.project.findMany({
          where: {
            deletedAt: null,
            members: { some: { userId, projectRole: { not: 'MANAGER' }, isActive: true } },
            projectPhase: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] },
          },
          select: { id: true, code: true, title: true, projectPhase: true },
        }),
        // Time logged against no PID yet — it stops being recoverable once they are gone.
        this.prisma.timesheet.findMany({
          where: { userId, deletedAt: null, projectId: null, teamId: null },
          select: { id: true, date: true, hoursLogged: true, notes: true },
          orderBy: { date: 'desc' },
          take: 100,
        }),
        this.prisma.leaveRequest.findMany({
          where: { userId, status: 'PENDING' },
          select: { id: true, leaveType: true, startDate: true, endDate: true, numDays: true },
        }),
        // Client relationships in their name — an account manager who has left is worse than none,
        // because the ledger still shows somebody to ask.
        this.prisma.client.findMany({
          where: { organizationId, deletedAt: null, accountManagerId: userId },
          select: { id: true, code: true, name: true },
        }),
      ]);

    const items = [
      { key: 'projectsManaged', label: 'Projects they manage', count: managedProjects.length, blocking: true },
      { key: 'openTasks', label: 'Open tasks assigned to them', count: openTasks.length, blocking: true },
      { key: 'clientsOwned', label: 'Clients where they are the account manager', count: ownedClients.length, blocking: true },
      { key: 'unsubmittedTime', label: 'Time logged with no PID attached', count: unsubmitted.length, blocking: false },
      { key: 'pendingLeave', label: 'Leave requests still pending', count: pendingLeave.length, blocking: false },
      { key: 'projectsMember', label: 'Other projects they are on', count: memberProjects.length, blocking: false },
    ];

    return {
      person: this.decorate(u),
      summary: {
        items,
        /** Nothing left that needs a new owner. Not "nothing to do" — the non-blocking rows remain. */
        clearToRelease: items.filter(i => i.blocking).every(i => i.count === 0),
        blockingCount: items.filter(i => i.blocking).reduce((n, i) => n + i.count, 0),
      },
      openTasks: openTasks.map(t => ({
        id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority,
        status: t.currentStatus?.name ?? null,
        project: t.projectTasks[0]?.project ?? null,
      })),
      projectsManaged: managedProjects,
      projectsMember: memberProjects,
      clientsOwned: ownedClients,
      unsubmittedTime: unsubmitted,
      pendingLeave,
    };
  }

  /**
   * Mark the handover reviewed.
   *
   * Deliberately does NOT deactivate the account. Losing access and finishing the handover are
   * different events on different days — somebody often works their last day after everything is
   * signed off, and somebody else is walked out before it is. Tying the two together would force
   * whoever runs this to choose between an accurate record and a working login.
   */
  async completeExit(userId: string) {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    const h = await this.handover(userId);
    if (!h.summary.clearToRelease) {
      throw new BadRequestException(
        `${h.summary.blockingCount} item${h.summary.blockingCount === 1 ? ' still needs' : 's still need'} reassigning `
        + '— projects they manage, open tasks, or clients in their name.',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id: userId }, data: { exitCompletedAt: new Date() }, select: PERSON,
    });
    await this.events.emit({
      action: 'user.exit_completed', entityType: 'USER', entityId: userId, organizationId, actorId,
    });
    return this.decorate(updated);
  }
}

@Controller('lifecycle')
class LifecycleController {
  constructor(private readonly svc: LifecycleService) {}

  // Everything here is people-operations, so it sits on the same gate as the rest of HR's work.
  @Get('board') @RequirePermission('user.update')
  board(@Query('all') all?: string) { return this.svc.board(all === 'true'); }

  @Get(':userId') @RequirePermission('user.update')
  person(@Param('userId') userId: string) { return this.svc.person(userId); }

  @Post(':userId/probation') @RequirePermission('user.update')
  setProbation(@Param('userId') userId: string, @Body() dto: SetProbationDto) {
    return this.svc.setProbation(userId, dto);
  }

  @Post(':userId/confirm') @RequirePermission('user.update')
  confirm(@Param('userId') userId: string, @Body() dto: ConfirmDto) {
    return this.svc.confirm(userId, dto);
  }

  @Post(':userId/resign') @RequirePermission('user.update')
  resign(@Param('userId') userId: string, @Body() dto: ResignDto) {
    return this.svc.resign(userId, dto);
  }

  @Get(':userId/handover') @RequirePermission('user.update')
  handover(@Param('userId') userId: string) { return this.svc.handover(userId); }

  @Post(':userId/exit-complete') @RequirePermission('user.update')
  completeExit(@Param('userId') userId: string) { return this.svc.completeExit(userId); }
}

@Module({
  controllers: [LifecycleController],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
