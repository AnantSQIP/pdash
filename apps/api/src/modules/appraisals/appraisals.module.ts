import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post,
} from '@nestjs/common';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { PermissionService } from '../permissions/permission.service';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true, designation: true };

// ── DTOs ─────────────────────────────────────────────────────────────────────
class CycleDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsOptional() @IsDateString() dueDate?: string;
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
  @IsOptional() @IsInt() @Min(1) @Max(5) selfRating?: number;
  @IsOptional() @IsString() @MaxLength(2000) selfComment?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) managerRating?: number;
  @IsOptional() @IsString() @MaxLength(2000) managerComment?: string;
}
class SubmitSelfDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) selfRating?: number;
  @IsOptional() @IsString() @MaxLength(4000) selfComments?: string;
}
class SubmitManagerDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) managerRating?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) overallRating?: number;
  @IsOptional() @IsString() @MaxLength(4000) managerComments?: string;
}

@Injectable()
export class AppraisalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionService,
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
      },
    });
  }

  /** Create an appraisal per selected (or every active) employee; reviewer = their manager. */
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
      await this.prisma.appraisal.create({
        data: { cycleId: id, organizationId, employeeId: e.id, reviewerId: managerOf.get(e.id) ?? null },
      });
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
        cycle: { select: { id: true, name: true, status: true, dueDate: true, periodStart: true, periodEnd: true } },
        employee: { select: USER_SELECT }, reviewer: { select: USER_SELECT },
        goals: { orderBy: { sequence: 'asc' } },
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
    await this.prisma.appraisal.update({
      where: { id },
      data: { status: 'PENDING_MANAGER', selfRating: dto.selfRating ?? null, selfComments: dto.selfComments?.trim() || null, submittedSelfAt: new Date() },
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
    await this.prisma.appraisal.update({
      where: { id },
      data: {
        status: 'COMPLETED', managerRating: dto.managerRating ?? null, overallRating: dto.overallRating ?? dto.managerRating ?? null,
        managerComments: dto.managerComments?.trim() || null, submittedManagerAt: new Date(),
      },
    });
    await this.notifications.notify([a.employeeId], {
      type: 'appraisal.completed', title: 'Your review is ready',
      message: `Your review for "${a.cycle.name}" has been completed.`, link: '/appraisals',
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
  @Post(':id/submit-manager') submitManager(@Param('id') id: string, @Body() dto: SubmitManagerDto) { return this.svc.submitManager(id, dto); }
  @Post(':id/acknowledge') acknowledge(@Param('id') id: string) { return this.svc.acknowledge(id); }
}

@Module({
  controllers: [AppraisalsController],
  providers: [AppraisalsService],
})
export class AppraisalsModule {}
