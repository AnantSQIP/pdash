import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, Res, UploadedFile, UseInterceptors,
  NotFoundException, Param, Patch, Post,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { PermissionService } from '../permissions/permission.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentsService, MAX_FILE_BYTES, isInlineSafe, type UploadedFileLike } from '../documents/documents.service';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true, designation: true };

// ── DTOs ─────────────────────────────────────────────────────────────────────
class CycleDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  /** The two the firm runs. Stated, not inferred from the dates. */
  @IsOptional() @IsIn(['HALF_YEARLY', 'ANNUAL']) cycleType?: string;
  /** "26-27" — so a person's history reads a financial year at a time. */
  @IsOptional() @IsString() @MaxLength(10) fyLabel?: string;
}
class LaunchDto {
  @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
}
class GoalDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) weight?: number;
}
class UpdateGoalDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(5) selfRating?: number;
  @IsOptional() @IsString() @MaxLength(2000) selfComment?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(5) managerRating?: number;
  @IsOptional() @IsString() @MaxLength(2000) managerComment?: string;
}
/** One parameter's score. 1-5, 5 highest — bounded here, in the service, and by a DB check. */
class ScoreDto {
  @IsString() parameterId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) score?: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
class SubmitSelfDto {
  // The headline rating is DERIVED from the parameter scores below. Kept optional for the
  // appraisals that predate parameters, whose numbers were typed directly.
  @IsOptional() @IsNumber() @Min(1) @Max(5) selfRating?: number;
  @IsOptional() @IsString() @MaxLength(4000) selfComments?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScoreDto) scores?: ScoreDto[];
}
class SubmitManagerDto {
  @IsOptional() @IsNumber() @Min(1) @Max(5) managerRating?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) overallRating?: number;
  @IsOptional() @IsString() @MaxLength(4000) managerComments?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScoreDto) scores?: ScoreDto[];
  /** Step three: when the review call is. Creates a real calendar event for both parties. */
  @IsOptional() @IsDateString() reviewCallAt?: string;
}
class ReviewCallDto {
  @IsDateString() reviewCallAt!: string;
}
class ParameterDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  /** Null on both = everyone. Either one narrows it to a team or a job title. */
  @IsOptional() @IsString() teamId?: string | null;
  @IsOptional() @IsString() @MaxLength(80) designation?: string | null;
  @IsOptional() @IsNumber() @Min(0) weight?: number;
  @IsOptional() @IsInt() @Min(0) sequence?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Injectable()
export class AppraisalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionService,
    private readonly documents: DocumentsService,
  ) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  // ── cycles (HR) ─────────────────────────────────────────────────────────────
  async listCycles() {
    const organizationId = await this.actor.requireOrgId();
    const cycles = await this.prisma.appraisalCycle.findMany({
      where: { organizationId },
      include: { appraisals: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return cycles.map(({ appraisals, ...c }) => ({
      ...c,
      progress: {
        total: appraisals.length,
        completed: appraisals.filter(a => a.status === 'COMPLETED' || a.status === 'ACKNOWLEDGED').length,
        pendingSelf: appraisals.filter(a => a.status === 'PENDING_SELF').length,
        pendingManager: appraisals.filter(a => a.status === 'PENDING_MANAGER').length,
      },
    }));
  }

  private async ownCycle(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const c = await this.prisma.appraisalCycle.findFirst({ where: { id, organizationId } });
    if (!c) throw new NotFoundException('Cycle not found');
    return c;
  }

  async getCycle(id: string) {
    const c = await this.ownCycle(id);
    const appraisals = await this.prisma.appraisal.findMany({
      where: { cycleId: id },
      include: { employee: { select: USER_SELECT }, reviewer: { select: USER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    return { ...c, appraisals };
  }

  createCycle(dto: CycleDto) {
    return this.actor.requireOrgId().then(organizationId =>
      this.prisma.appraisalCycle.create({
        data: {
          organizationId, createdBy: this.actorId(), name: dto.name.trim(),
          periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
          periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          cycleType: dto.cycleType ?? 'HALF_YEARLY',
          fyLabel: dto.fyLabel?.trim() || null,
        },
      }));
  }

  async updateCycle(id: string, dto: CycleDto) {
    await this.ownCycle(id);
    return this.prisma.appraisalCycle.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        ...(dto.cycleType !== undefined ? { cycleType: dto.cycleType } : {}),
        ...(dto.fyLabel !== undefined ? { fyLabel: dto.fyLabel?.trim() || null } : {}),
      },
    });
  }

  /** Create an appraisal per selected (or every active) employee; reviewer = their manager. */
  /**
   * The parameters a given person is rated on.
   *
   * A parameter applies when it names their team space, or names their designation, or names
   * NEITHER — the last meaning everyone. Assembling the form this way is what lets a BD executive
   * and a Research Associate be rated on genuinely different things without HR maintaining two
   * separate forms.
   */
  async parametersFor(userId: string, organizationId?: string) {
    const orgId = organizationId ?? await this.actor.requireOrgId();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { designation: true, teamMemberships: { select: { teamId: true } } },
    });
    const teamIds = (user?.teamMemberships ?? []).map(t => t.teamId);
    return this.prisma.appraisalParameter.findMany({
      where: {
        organizationId: orgId, active: true, deletedAt: null,
        OR: [
          { teamId: null, designation: null },                       // everyone
          ...(user?.designation ? [{ designation: user.designation }] : []),
          ...(teamIds.length ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true, weight: true, sequence: true, teamId: true, designation: true },
    });
  }

  /**
   * The weighted mean of whatever has been scored, to one decimal.
   *
   * Unscored parameters are skipped rather than counted as zero — a blank is "not yet judged",
   * and treating it as the worst possible mark would drag every partial review down.
   */
  private weightedMean(rows: { score: number | null; weight: number }[]): number | null {
    const scored = rows.filter(r => r.score != null);
    if (!scored.length) return null;
    const totalWeight = scored.reduce((n, r) => n + (r.weight || 1), 0);
    if (totalWeight <= 0) return null;
    const sum = scored.reduce((n, r) => n + (r.score as number) * (r.weight || 1), 0);
    return Math.round((sum / totalWeight) * 10) / 10;
  }

  /** Write one side's scores, then recompute that side's headline rating from them. */
  private async applyScores(
    appraisalId: string, side: 'self' | 'manager', scores: { parameterId: string; score?: number; comment?: string }[],
  ): Promise<number | null> {
    for (const s of scores) {
      if (s.score != null && (s.score < 1 || s.score > 5)) {
        throw new BadRequestException('Ratings are 1 to 5, where 5 is the highest.');
      }
      await this.prisma.appraisalScore.upsert({
        where: { appraisalId_parameterId: { appraisalId, parameterId: s.parameterId } },
        create: {
          appraisalId, parameterId: s.parameterId,
          ...(side === 'self' ? { selfScore: s.score ?? null } : { managerScore: s.score ?? null }),
          comment: s.comment?.trim() || null,
        },
        update: {
          ...(side === 'self' ? { selfScore: s.score ?? null } : { managerScore: s.score ?? null }),
          ...(s.comment !== undefined ? { comment: s.comment?.trim() || null } : {}),
        },
      });
    }
    const all = await this.prisma.appraisalScore.findMany({
      where: { appraisalId },
      select: { selfScore: true, managerScore: true, parameter: { select: { weight: true } } },
    });
    return this.weightedMean(all.map(r => ({
      score: side === 'self' ? r.selfScore : r.managerScore,
      weight: r.parameter.weight,
    })));
  }

  async launch(id: string, employeeIds?: string[]) {
    const cycle = await this.ownCycle(id);
    const organizationId = cycle.organizationId;
    const where = { organizationId, status: 'ACTIVE' as const, deletedAt: null, ...(employeeIds?.length ? { id: { in: employeeIds } } : {}) };
    const employees = await this.prisma.user.findMany({ where, select: { id: true } });
    // Skip anyone who already has an appraisal in this cycle.
    const existing = new Set((await this.prisma.appraisal.findMany({ where: { cycleId: id }, select: { employeeId: true } })).map(a => a.employeeId));
    const managers = await this.prisma.userManager.findMany({
      where: { userId: { in: employees.map(e => e.id) } }, select: { userId: true, managerId: true },
    });
    const managerOf = new Map<string, string>();
    for (const m of managers) if (!managerOf.has(m.userId)) managerOf.set(m.userId, m.managerId);

    let created = 0;
    for (const e of employees) {
      if (existing.has(e.id)) continue;
      const appraisal = await this.prisma.appraisal.create({
        data: { cycleId: id, organizationId, employeeId: e.id, reviewerId: managerOf.get(e.id) ?? null },
        select: { id: true },
      });
      // Fix the form AT LAUNCH. Resolving parameters later would mean a criterion added in
      // October silently appeared on a review already half-completed in September — and two
      // people in the same cycle could end up rated on different things.
      const params = await this.parametersFor(e.id, organizationId);
      if (params.length) {
        await this.prisma.appraisalScore.createMany({
          data: params.map(pm => ({ appraisalId: appraisal.id, parameterId: pm.id })),
          skipDuplicates: true,
        });
      }
      created++;
    }
    if (cycle.status === 'DRAFT') await this.prisma.appraisalCycle.update({ where: { id }, data: { status: 'ACTIVE' } });
    if (created) {
      const newEmpIds = employees.filter(e => !existing.has(e.id)).map(e => e.id);
      await this.notifications.notify(newEmpIds, {
        type: 'appraisal.assigned', title: 'Your appraisal is ready',
        message: `Complete your self-assessment for "${cycle.name}".`, link: '/appraisals',
      });
    }
    return { ok: true, created };
  }

  async closeCycle(id: string) {
    await this.ownCycle(id);
    return this.prisma.appraisalCycle.update({ where: { id }, data: { status: 'CLOSED' } });
  }
  async deleteCycle(id: string) {
    await this.ownCycle(id);
    await this.prisma.appraisalCycle.delete({ where: { id } });
    return { ok: true };
  }

  // ── the actor's own appraisals + the ones they review ─────────────────────────
  async listMine() {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.appraisal.findMany({
      where: { organizationId, employeeId: actorId },
      include: { cycle: { select: { id: true, name: true, status: true, dueDate: true } }, reviewer: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async listToReview() {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.appraisal.findMany({
      where: { organizationId, reviewerId: actorId },
      include: { cycle: { select: { id: true, name: true, status: true, dueDate: true } }, employee: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async loadAppraisal(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const a = await this.prisma.appraisal.findFirst({
      where: { id, organizationId },
      include: {
        cycle: { select: { id: true, name: true, status: true, dueDate: true, periodStart: true, periodEnd: true, cycleType: true, fyLabel: true } },
        employee: { select: USER_SELECT }, reviewer: { select: USER_SELECT },
        goals: { orderBy: { sequence: 'asc' } },
        // The criteria this person was rated on, in the order HR arranged them. Fixed at launch,
        // so it shows what the form actually was rather than what the parameters say today.
        scores: {
          orderBy: [{ parameter: { sequence: 'asc' } }],
          select: {
            id: true, selfScore: true, managerScore: true, comment: true,
            parameter: { select: { id: true, name: true, description: true, weight: true, sequence: true } },
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Appraisal not found');
    return a;
  }

  private async canManage(actorId: string) {
    return this.permissions.check(actorId, 'appraisal.manage');
  }

  async getAppraisal(id: string) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.employeeId !== actorId && a.reviewerId !== actorId && !(await this.canManage(actorId))) {
      throw new ForbiddenException('You cannot view this appraisal.');
    }
    return a;
  }

  // ── goals ─────────────────────────────────────────────────────────────────────
  async addGoal(id: string, dto: GoalDto) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    const isEmployee = a.employeeId === actorId;
    if (!isEmployee && a.reviewerId !== actorId && !(await this.canManage(actorId))) throw new ForbiddenException('Not allowed.');
    if (isEmployee && a.status !== 'PENDING_SELF') throw new BadRequestException('You can only add goals before you submit your self-assessment.');
    const max = await this.prisma.appraisalGoal.aggregate({ where: { appraisalId: id }, _max: { sequence: true } });
    await this.prisma.appraisalGoal.create({
      data: { appraisalId: id, title: dto.title.trim(), description: dto.description?.trim() || null, weight: dto.weight ?? null, sequence: (max._max.sequence ?? -1) + 1 },
    });
    return this.getAppraisal(id);
  }

  async updateGoal(id: string, goalId: string, dto: UpdateGoalDto) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    const goal = await this.prisma.appraisalGoal.findFirst({ where: { id: goalId, appraisalId: id } });
    if (!goal) throw new NotFoundException('Goal not found');
    const isEmployee = a.employeeId === actorId;
    const isReviewer = a.reviewerId === actorId;
    const data: Record<string, unknown> = {};
    if (isEmployee && a.status === 'PENDING_SELF') {
      if (dto.title !== undefined) data.title = dto.title.trim();
      if (dto.description !== undefined) data.description = dto.description?.trim() || null;
      if (dto.selfRating !== undefined) data.selfRating = dto.selfRating;
      if (dto.selfComment !== undefined) data.selfComment = dto.selfComment?.trim() || null;
    } else if (isReviewer && a.status === 'PENDING_MANAGER') {
      if (dto.managerRating !== undefined) data.managerRating = dto.managerRating;
      if (dto.managerComment !== undefined) data.managerComment = dto.managerComment?.trim() || null;
    } else {
      throw new ForbiddenException('You cannot edit this goal at this stage.');
    }
    if (Object.keys(data).length) await this.prisma.appraisalGoal.update({ where: { id: goalId }, data });
    return this.getAppraisal(id);
  }

  async deleteGoal(id: string, goalId: string) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (!(a.employeeId === actorId && a.status === 'PENDING_SELF') && !(await this.canManage(actorId))) {
      throw new ForbiddenException('Not allowed.');
    }
    await this.prisma.appraisalGoal.deleteMany({ where: { id: goalId, appraisalId: id } });
    return this.getAppraisal(id);
  }

  // ── stage transitions ─────────────────────────────────────────────────────────
  async submitSelf(id: string, dto: SubmitSelfDto) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.employeeId !== actorId) throw new ForbiddenException('Only the employee can submit their self-assessment.');
    if (a.status !== 'PENDING_SELF') throw new BadRequestException('Self-assessment already submitted.');
    // The headline is the weighted mean of the parameters, not a number typed on its own — that
    // is the whole point of having parameters. A directly-supplied rating is honoured only when
    // there is nothing to derive from (an appraisal launched before parameters existed).
    const derivedSelf = dto.scores?.length ? await this.applyScores(id, 'self', dto.scores) : null;
    await this.prisma.appraisal.update({
      where: { id },
      data: {
        status: 'PENDING_MANAGER',
        selfRating: derivedSelf ?? dto.selfRating ?? null,
        selfComments: dto.selfComments?.trim() || null,
        submittedSelfAt: new Date(),
      },
    });
    if (a.reviewerId) {
      await this.notifications.notify([a.reviewerId], {
        type: 'appraisal.self_submitted', title: 'A review is ready for you',
        message: `${a.employee.firstName} ${a.employee.lastName} submitted their self-assessment.`, link: '/appraisals',
      });
    }
    return this.getAppraisal(id);
  }

  async submitManager(id: string, dto: SubmitManagerDto) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.reviewerId !== actorId) throw new ForbiddenException('Only the assigned reviewer can submit the review.');
    if (a.status !== 'PENDING_MANAGER') throw new BadRequestException('This appraisal is not awaiting your review.');
    const derivedManager = dto.scores?.length ? await this.applyScores(id, 'manager', dto.scores) : null;
    const manager = derivedManager ?? dto.managerRating ?? null;
    await this.prisma.appraisal.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        managerRating: manager,
        // The overall figure follows the manager's assessment unless one is stated outright.
        overallRating: dto.overallRating ?? manager,
        managerComments: dto.managerComments?.trim() || null, submittedManagerAt: new Date(),
      },
    });
    // Step three of the flow: the review call. Booking it here means the conversation is in both
    // diaries the moment the remarks are written, rather than depending on someone remembering.
    if (dto.reviewCallAt) await this.scheduleReviewCall(id, dto.reviewCallAt);
    await this.notifications.notify([a.employeeId], {
      type: 'appraisal.completed', title: 'Your review is ready',
      message: dto.reviewCallAt
        ? `Your review for "${a.cycle.name}" is written up — a review call has been scheduled.`
        : `Your review for "${a.cycle.name}" has been completed.`,
      link: '/appraisals',
    });
    return this.getAppraisal(id);
  }

  /**
   * Book the review call as a real calendar event, with the employee and the reviewer on it.
   *
   * Deliberately an event rather than a date field: a date stored on an appraisal is invisible to
   * everyone's calendar, so the conversation gets forgotten. Re-scheduling moves the same event
   * rather than leaving a trail of stale ones.
   */
  async scheduleReviewCall(id: string, at: string) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.reviewerId !== actorId && !(await this.canManage(actorId))) {
      throw new ForbiddenException('Only the reviewer or HR can schedule the review call.');
    }
    const startDate = new Date(at);
    if (Number.isNaN(startDate.getTime())) throw new BadRequestException('That is not a valid date and time.');
    const title = `Appraisal review — ${a.employee.firstName} ${a.employee.lastName}`.trim();
    const attendees = [a.employeeId, ...(a.reviewerId ? [a.reviewerId] : [])];

    let eventId = a.reviewCallEventId ?? null;
    if (eventId) {
      const still = await this.prisma.calendarEvent.findUnique({ where: { id: eventId }, select: { id: true } });
      if (!still) eventId = null;   // somebody deleted it from the calendar — book a fresh one
    }
    if (eventId) {
      await this.prisma.calendarEvent.update({
        where: { id: eventId },
        data: { startDate, endDate: new Date(startDate.getTime() + 45 * 60_000), title },
      });
    } else {
      const event = await this.prisma.calendarEvent.create({
        data: {
          organizationId: a.organizationId,
          title,
          description: `Appraisal review call for "${a.cycle.name}".`,
          type: 'MEETING',
          startDate,
          endDate: new Date(startDate.getTime() + 45 * 60_000),
          createdBy: actorId,
          attendees: { create: attendees.map(userId => ({ userId })) },
        },
        select: { id: true },
      });
      eventId = event.id;
    }
    await this.prisma.appraisal.update({
      where: { id }, data: { reviewCallAt: startDate, reviewCallEventId: eventId },
    });
    await this.notifications.notify(attendees.filter(u => u !== actorId), {
      type: 'appraisal.review_scheduled', title: 'Appraisal review call scheduled',
      message: `${title} — ${startDate.toISOString().slice(0, 16).replace('T', ' ')}.`,
      link: '/appraisals',
    });
    return this.getAppraisal(id);
  }

  /**
   * A person's rating history — every completed cycle, newest first, plus the figure for each
   * financial year. The FY figure is the mean of that year's cycles: a half-yearly and an annual
   * review in the same year are two readings of the same year, not two years.
   */
  async history(userId: string) {
    const actorId = this.actorId();
    if (userId !== actorId && !(await this.canManage(actorId))) {
      // A manager may read their own reports' history; nobody else's.
      const line = await this.prisma.userManager.findFirst({
        where: { userId, managerId: actorId }, select: { id: true },
      });
      if (!line) throw new ForbiddenException('You cannot view this person\'s history.');
    }
    const rows = await this.prisma.appraisal.findMany({
      where: { employeeId: userId, overallRating: { not: null } },
      orderBy: [{ cycle: { periodEnd: 'desc' } }, { createdAt: 'desc' }],
      select: {
        id: true, overallRating: true, selfRating: true, managerRating: true, acknowledgedAt: true,
        cycle: { select: { id: true, name: true, cycleType: true, fyLabel: true, periodStart: true, periodEnd: true } },
      },
    });
    const byFy = new Map<string, number[]>();
    for (const r of rows) {
      const fy = r.cycle.fyLabel ?? (r.cycle.periodEnd ? String(r.cycle.periodEnd.getUTCFullYear()) : 'unknown');
      byFy.set(fy, [...(byFy.get(fy) ?? []), r.overallRating as number]);
    }
    return {
      reviews: rows,
      byFinancialYear: [...byFy].map(([fyLabel, ratings]) => ({
        fyLabel,
        reviews: ratings.length,
        rating: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
      })),
    };
  }

  // ── Rating parameters (HR) ────────────────────────────────────────────────
  async listParameters() {
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.appraisalParameter.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
      include: { team: { select: { id: true, name: true } } },
    });
  }

  async createParameter(dto: ParameterDto) {
    const organizationId = await this.actor.requireOrgId();
    const actorId = this.actorId();
    return this.prisma.appraisalParameter.create({
      data: {
        organizationId, name: dto.name.trim(), description: dto.description?.trim() || null,
        teamId: dto.teamId || null, designation: dto.designation?.trim() || null,
        weight: dto.weight ?? 1, sequence: dto.sequence ?? 0,
        active: dto.active ?? true, createdBy: actorId,
      },
    });
  }

  async updateParameter(id: string, dto: ParameterDto) {
    const organizationId = await this.actor.requireOrgId();
    const existing = await this.prisma.appraisalParameter.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!existing) throw new NotFoundException('Parameter not found.');
    return this.prisma.appraisalParameter.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId || null } : {}),
        ...(dto.designation !== undefined ? { designation: dto.designation?.trim() || null } : {}),
        ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  /** Retire a parameter. Soft — appraisals already scored against it keep their scores. */
  async removeParameter(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const existing = await this.prisma.appraisalParameter.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!existing) throw new NotFoundException('Parameter not found.');
    await this.prisma.appraisalParameter.update({
      where: { id }, data: { deletedAt: new Date(), active: false },
    });
    return { ok: true };
  }

  /**
   * Attach (or replace) the performance sheet.
   *
   * The employee, their reviewer and HR may all attach one — the sheet is the thing the
   * conversation is held over, and either side may be the one holding it. Replacing soft-deletes
   * the previous blob so storage does not accumulate every draft.
   */
  async uploadSheet(id: string, file: UploadedFileLike | undefined) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.employeeId !== actorId && a.reviewerId !== actorId && !(await this.canManage(actorId))) {
      throw new ForbiddenException('You cannot attach a sheet to this appraisal.');
    }
    const doc = await this.documents.upload(file);
    if (!doc) throw new BadRequestException('Upload failed.');
    if (a.sheetDocumentId) {
      await this.prisma.document.update({
        where: { id: a.sheetDocumentId }, data: { deletedAt: new Date() },
      }).catch(() => {});
    }
    await this.prisma.appraisal.update({
      where: { id }, data: { sheetDocumentId: doc.id, sheetDocumentName: doc.name },
    });
    return this.getAppraisal(id);
  }

  /** The sheet's bytes. Same three people who may attach one may read it. */
  async sheetContent(id: string) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.employeeId !== actorId && a.reviewerId !== actorId && !(await this.canManage(actorId))) {
      throw new ForbiddenException('You cannot read this appraisal.');
    }
    if (!a.sheetDocumentId) throw new NotFoundException('No performance sheet attached.');
    return this.documents.getContentForPatentPortal(a.sheetDocumentId);
  }

  async removeSheet(id: string) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.employeeId !== actorId && a.reviewerId !== actorId && !(await this.canManage(actorId))) {
      throw new ForbiddenException('You cannot change this appraisal.');
    }
    if (a.sheetDocumentId) {
      await this.prisma.document.update({
        where: { id: a.sheetDocumentId }, data: { deletedAt: new Date() },
      }).catch(() => {});
    }
    await this.prisma.appraisal.update({
      where: { id }, data: { sheetDocumentId: null, sheetDocumentName: null },
    });
    return this.getAppraisal(id);
  }

  async acknowledge(id: string) {
    const actorId = this.actorId();
    const a = await this.loadAppraisal(id);
    if (a.employeeId !== actorId) throw new ForbiddenException('Only the employee can acknowledge their review.');
    if (a.status !== 'COMPLETED') throw new BadRequestException('This review is not ready to acknowledge yet.');
    await this.prisma.appraisal.update({ where: { id }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() } });
    return this.getAppraisal(id);
  }
}

@Controller('appraisals')
export class AppraisalsController {
  constructor(private readonly svc: AppraisalsService) {}

  // ── own surfaces (literal paths BEFORE ':id') ──────────────────────────────────
  @Get('me') listMine() { return this.svc.listMine(); }
  /** Every completed review for a person, plus a figure per financial year. Own, or your reports. */
  @Get('history/:userId') history(@Param('userId') userId: string) { return this.svc.history(userId); }
  /** The criteria a given person would be rated on right now — HR's preview of a form. */
  @Get('parameters/for/:userId') @RequirePermission('appraisal.manage')
  parametersFor(@Param('userId') userId: string) { return this.svc.parametersFor(userId); }

  // ── Rating parameters — different per team and per position (HR) ──────────
  @Get('parameters') @RequirePermission('appraisal.manage')
  listParameters() { return this.svc.listParameters(); }
  @Post('parameters') @RequirePermission('appraisal.manage')
  createParameter(@Body() dto: ParameterDto) { return this.svc.createParameter(dto); }
  @Patch('parameters/:id') @RequirePermission('appraisal.manage')
  updateParameter(@Param('id') id: string, @Body() dto: ParameterDto) { return this.svc.updateParameter(id, dto); }
  @Delete('parameters/:id') @RequirePermission('appraisal.manage')
  removeParameter(@Param('id') id: string) { return this.svc.removeParameter(id); }
  @Get('review') listToReview() { return this.svc.listToReview(); }

  // ── cycles (HR) ─────────────────────────────────────────────────────────────────
  @Get('cycles') @RequirePermission('appraisal.manage') listCycles() { return this.svc.listCycles(); }
  @Post('cycles') @RequirePermission('appraisal.manage') createCycle(@Body() dto: CycleDto) { return this.svc.createCycle(dto); }
  @Get('cycles/:id') @RequirePermission('appraisal.manage') getCycle(@Param('id') id: string) { return this.svc.getCycle(id); }
  @Patch('cycles/:id') @RequirePermission('appraisal.manage') updateCycle(@Param('id') id: string, @Body() dto: CycleDto) { return this.svc.updateCycle(id, dto); }
  @Post('cycles/:id/launch') @RequirePermission('appraisal.manage') launch(@Param('id') id: string, @Body() dto: LaunchDto) { return this.svc.launch(id, dto.employeeIds); }
  @Post('cycles/:id/close') @RequirePermission('appraisal.manage') close(@Param('id') id: string) { return this.svc.closeCycle(id); }
  @Delete('cycles/:id') @RequirePermission('appraisal.manage') deleteCycle(@Param('id') id: string) { return this.svc.deleteCycle(id); }

  // ── individual appraisal (access enforced in the service) ──────────────────────
  @Get(':id') get(@Param('id') id: string) { return this.svc.getAppraisal(id); }
  @Post(':id/goals') addGoal(@Param('id') id: string, @Body() dto: GoalDto) { return this.svc.addGoal(id, dto); }
  @Patch(':id/goals/:goalId') updateGoal(@Param('id') id: string, @Param('goalId') goalId: string, @Body() dto: UpdateGoalDto) { return this.svc.updateGoal(id, goalId, dto); }
  @Delete(':id/goals/:goalId') deleteGoal(@Param('id') id: string, @Param('goalId') goalId: string) { return this.svc.deleteGoal(id, goalId); }
  @Post(':id/submit-self') submitSelf(@Param('id') id: string, @Body() dto: SubmitSelfDto) { return this.svc.submitSelf(id, dto); }
  /** Step three: book the review call. Reviewer or HR. */
  @Post(':id/review-call') scheduleCall(@Param('id') id: string, @Body() dto: ReviewCallDto) { return this.svc.scheduleReviewCall(id, dto.reviewCallAt); }

  // ── Performance sheet — the document the review is actually held over ─────
  @Post(':id/sheet')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  uploadSheet(@Param('id') id: string, @UploadedFile() file: UploadedFileLike | undefined) {
    return this.svc.uploadSheet(id, file);
  }
  @Get(':id/sheet/content')
  async sheetContent(@Param('id') id: string, @Res() res: Response) {
    const { doc, data } = await this.svc.sheetContent(id);
    const inline = isInlineSafe(doc.mimeType);
    res.setHeader('Content-Type', inline ? (doc.mimeType as string) : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(data));
  }
  @Delete(':id/sheet') removeSheet(@Param('id') id: string) { return this.svc.removeSheet(id); }
  @Post(':id/submit-manager') submitManager(@Param('id') id: string, @Body() dto: SubmitManagerDto) { return this.svc.submitManager(id, dto); }
  @Post(':id/acknowledge') acknowledge(@Param('id') id: string) { return this.svc.acknowledge(id); }
}

@Module({
  // DocumentsModule provides the shared on-disk blob storage the performance sheet rides on.
  imports: [DocumentsModule],
  controllers: [AppraisalsController],
  providers: [AppraisalsService],
})
export class AppraisalsModule {}
