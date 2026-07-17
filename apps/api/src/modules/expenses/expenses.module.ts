import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { NotificationsService } from '../notifications/notifications.module';

// Expense management: an employee records a business expense and requests reimbursement.
// Flow: submit → an approver (expense.approve) approves/rejects → mark reimbursed once paid.
const CATEGORIES = ['TRAVEL', 'MEALS', 'SUPPLIES', 'SOFTWARE', 'ACCOMMODATION', 'CLIENT', 'OTHER'];
const userSelect = { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } };

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async orgOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  /** Everyone who can approve expenses (holds expense.approve) — managers / HR / admins. */
  private async approverIds(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const users = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'expense.approve' } } } } } },
      },
      select: { id: true },
    });
    return users.map(u => u.id);
  }

  async submit(userId: string, data: { category?: string; amount: number; currency?: string; spentOn: string; description: string; receiptDocumentId?: string }) {
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter a valid expense amount.');
    if (!data?.description?.trim()) throw new BadRequestException('A description is required.');
    if (!data?.spentOn) throw new BadRequestException('Tell us when the expense was incurred.');
    const category = data.category && CATEGORIES.includes(data.category) ? data.category : 'OTHER';
    const spentOn = new Date(`${data.spentOn.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(spentOn.getTime())) throw new BadRequestException('Invalid date.');
    if (spentOn > new Date()) throw new BadRequestException('The expense date cannot be in the future.');

    const organizationId = await this.orgOf(userId);
    const expense = await this.prisma.expense.create({
      data: {
        userId, organizationId, category, amount, currency: data.currency || 'INR',
        spentOn, description: data.description.trim(), receiptDocumentId: data.receiptDocumentId ?? null,
        status: 'PENDING',
      },
      include: { user: userSelect },
    });
    const u = (expense as { user?: { firstName?: string; lastName?: string } }).user;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'An employee';
    await this.notifications.notify(await this.approverIds(organizationId), {
      type: 'expense.submitted',
      title: 'Expense to review',
      message: `${name} submitted a ${category.toLowerCase()} expense of ${expense.currency} ${amount} for reimbursement.`,
      link: '/expenses',
    });
    return expense;
  }

  mine(userId: string) {
    return this.prisma.expense.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { user: userSelect } });
  }

  async forOrg(reviewerId: string, status?: string) {
    const organizationId = await this.orgOf(reviewerId);
    if (!organizationId) return [];
    return this.prisma.expense.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' }, take: 200, include: { user: userSelect },
    });
  }

  async decide(id: string, actorId: string, approve: boolean, note?: string) {
    const exp = await this.prisma.expense.findUnique({ where: { id } });
    if (!exp) throw new NotFoundException('Expense not found');
    if (exp.status !== 'PENDING') throw new BadRequestException('Only a pending expense can be reviewed.');
    if (exp.userId === actorId) throw new ForbiddenException('You cannot review your own expense.');
    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: userSelect },
    });
    await this.notifications.notify(exp.userId, {
      type: approve ? 'expense.approved' : 'expense.rejected',
      title: approve ? 'Expense approved' : 'Expense rejected',
      message: approve
        ? `Your ${exp.currency} ${exp.amount} expense was approved for reimbursement.`
        : `Your ${exp.currency} ${exp.amount} expense was not approved${note ? `: ${note}` : '.'}`,
      link: '/expenses',
    });
    return updated;
  }

  /** Mark an APPROVED expense as paid out. */
  async markReimbursed(id: string, actorId: string) {
    const exp = await this.prisma.expense.findUnique({ where: { id } });
    if (!exp) throw new NotFoundException('Expense not found');
    if (exp.status !== 'APPROVED') throw new BadRequestException('Only an approved expense can be marked reimbursed.');
    const updated = await this.prisma.expense.update({
      where: { id }, data: { status: 'REIMBURSED', reimbursedAt: new Date() }, include: { user: userSelect },
    });
    await this.notifications.notify(exp.userId, {
      type: 'expense.reimbursed', title: 'Expense reimbursed',
      message: `Your ${exp.currency} ${exp.amount} expense has been reimbursed.`,
      link: '/expenses',
    });
    return updated;
  }

  async cancel(id: string, userId: string) {
    const exp = await this.prisma.expense.findUnique({ where: { id } });
    if (!exp) throw new NotFoundException('Expense not found');
    if (exp.userId !== userId) throw new ForbiddenException('You can only cancel your own expenses.');
    if (exp.status !== 'PENDING') throw new BadRequestException('Only a pending expense can be cancelled.');
    return this.prisma.expense.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}

@Controller('expenses')
class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Post()
  submit(@Actor() actorId: string | null, @Body() body: { category?: string; amount: number; currency?: string; spentOn: string; description: string; receiptDocumentId?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.submit(actorId, body);
  }

  @Get('me')
  mine(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.mine(actorId);
  }

  @Get('org')
  @RequirePermission('expense.view.organization')
  forOrg(@Actor() actorId: string | null, @Query('status') status?: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.forOrg(actorId, status);
  }

  @Post(':id/approve')
  @RequirePermission('expense.approve')
  approve(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.decide(id, actorId ?? '', true, body?.note);
  }

  @Post(':id/reject')
  @RequirePermission('expense.approve')
  reject(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.decide(id, actorId ?? '', false, body?.note);
  }

  @Post(':id/reimburse')
  @RequirePermission('expense.approve')
  reimburse(@Actor() actorId: string | null, @Param('id') id: string) {
    return this.svc.markReimbursed(id, actorId ?? '');
  }

  @Post(':id/cancel')
  cancel(@Actor() actorId: string | null, @Param('id') id: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.cancel(id, actorId);
  }
}

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
