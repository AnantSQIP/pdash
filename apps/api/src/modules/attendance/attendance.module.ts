import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

// ── date helpers (UTC day boundaries) ───────────────────────────────────────────
function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function utcDay(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function parseDay(s: string): Date { return new Date(`${s}T00:00:00.000Z`); }
function round(n: number, p = 1): number { const f = 10 ** p; return Math.round((n ?? 0) * f) / f; }

const WORKING = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'];

// ════════════════════════════════════════════════════════════════════════════════
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async orgOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  async getToday(userId: string) {
    const today = utcDay(new Date());
    return this.prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
  }

  /** Punch toggles: first call sets checkIn (PRESENT), next sets/updates checkOut + totalHours. */
  async punch(userId: string) {
    const today = utcDay(new Date());
    const now = new Date();
    const existing = await this.prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });

    if (!existing || !existing.checkIn) {
      const organizationId = await this.orgOf(userId);
      return this.prisma.attendance.upsert({
        where: { userId_date: { userId, date: today } },
        create: { userId, organizationId, date: today, checkIn: now, status: 'PRESENT' },
        update: { checkIn: now, status: 'PRESENT' },
      });
    }
    const totalHours = round((now.getTime() - existing.checkIn.getTime()) / 3_600_000, 2);
    return this.prisma.attendance.update({ where: { id: existing.id }, data: { checkOut: now, totalHours } });
  }

  /** Admin/manual mark for a specific user+date. */
  async mark(data: { userId: string; date: string; status: string; note?: string }) {
    const date = parseDay(data.date.slice(0, 10));
    const organizationId = await this.orgOf(data.userId);
    return this.prisma.attendance.upsert({
      where: { userId_date: { userId: data.userId, date } },
      create: { userId: data.userId, organizationId, date, status: data.status, note: data.note ?? null },
      update: { status: data.status, note: data.note ?? null },
    });
  }

  async regularize(id: string, actorId: string, reason: string, newStatus?: string) {
    const row = await this.prisma.attendance.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Attendance ${id} not found`);
    return this.prisma.attendance.update({
      where: { id },
      data: { isRegularized: true, regularizeReason: reason, regularizedBy: actorId, regularizedAt: new Date(), status: newStatus ?? row.status },
    });
  }

  /**
   * Self-service regularization keyed on a DATE (not a row id) so it works even when no
   * punch row exists yet — the common case (missed punch / inferred-absent day). Upserts the
   * day, stamps the audit fields, and applies an optional corrected status + check-in/out.
   * Self-service for now; manager-approval routing via the generic Approval entity is the
   * tracked follow-up (ATTENDANCE_BILLABLE_PLAN.md, C1).
   */
  async regularizeDay(
    userId: string,
    data: { date: string; reason: string; status?: string; checkIn?: string; checkOut?: string },
  ) {
    if (!data?.reason?.trim()) throw new BadRequestException('reason is required');
    const REG_ALLOWED = ['PRESENT', 'HALF_DAY'];
    const status = data.status ?? 'PRESENT';
    if (!REG_ALLOWED.includes(status)) throw new BadRequestException(`status must be one of: ${REG_ALLOWED.join(', ')}`);
    const date = parseDay(data.date.slice(0, 10));
    if (date > utcDay(new Date())) throw new BadRequestException('Cannot regularise a future date');
    const checkIn = data.checkIn ? new Date(data.checkIn) : null;
    const checkOut = data.checkOut ? new Date(data.checkOut) : null;
    if (checkIn && checkOut && checkOut <= checkIn) throw new BadRequestException('Check-out must be after check-in');
    const totalHours = checkIn && checkOut ? round((checkOut.getTime() - checkIn.getTime()) / 3_600_000, 2) : undefined;
    const organizationId = await this.orgOf(userId);
    const audit = {
      status,
      isRegularized: true,
      regularizeReason: data.reason.trim(),
      regularizedBy: userId,
      regularizedAt: new Date(),
      ...(checkIn ? { checkIn } : {}),
      ...(checkOut ? { checkOut } : {}),
      ...(totalHours != null ? { totalHours } : {}),
    };
    return this.prisma.attendance.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, organizationId, date, ...audit },
      update: audit,
    });
  }

  /**
   * Merged month view — explicit attendance wins, then approved leave, holiday,
   * weekend, then "present" inferred from a logged timesheet that day, else absent.
   * This is what links attendance to the rest of the system.
   */
  async getMonth(userId: string, year: number, month: number) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    const daysInMonth = last.getUTCDate();
    const organizationId = await this.orgOf(userId);

    const [rows, leaves, holidays, sheets] = await Promise.all([
      this.prisma.attendance.findMany({ where: { userId, date: { gte: first, lte: last } } }),
      this.prisma.leaveRequest.findMany({ where: { userId, status: 'APPROVED', startDate: { lte: last }, endDate: { gte: first } } }),
      this.prisma.holiday.findMany({ where: { organizationId: organizationId ?? undefined, date: { gte: first, lte: last } } }),
      this.prisma.timesheet.findMany({ where: { userId, deletedAt: null, date: { gte: first, lte: last } }, select: { date: true } }),
    ]);
    const byDay = new Map(rows.map(r => [dayKey(r.date), r]));
    const holidayByDay = new Map(holidays.map(h => [dayKey(h.date), h]));
    const tsDays = new Set(sheets.map(s => dayKey(s.date)));
    const onLeave = (k: string) => leaves.some(l => dayKey(l.startDate) <= k && k <= dayKey(l.endDate));
    const todayKey = dayKey(utcDay(new Date()));

    type DayCell = { date: string; status: string; checkIn: Date | null; checkOut: Date | null; totalHours: number | null; isRegularized: boolean; note: string | null };
    const days: DayCell[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, i));
      const k = dayKey(d);
      const wd = d.getUTCDay();
      const ex = byDay.get(k);
      if (ex) {
        days.push({ date: k, status: ex.status, checkIn: ex.checkIn, checkOut: ex.checkOut, totalHours: ex.totalHours, isRegularized: ex.isRegularized, note: ex.note });
      } else if (onLeave(k)) {
        days.push({ date: k, status: 'ON_LEAVE', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: null });
      } else if (holidayByDay.has(k)) {
        days.push({ date: k, status: 'HOLIDAY', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: holidayByDay.get(k)!.name });
      } else if (wd === 0 || wd === 6) {
        days.push({ date: k, status: 'WEEKEND', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: null });
      } else if (tsDays.has(k)) {
        days.push({ date: k, status: 'PRESENT', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: 'from timesheet' });
      } else if (k < todayKey) {
        days.push({ date: k, status: 'ABSENT', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: null });
      } else {
        days.push({ date: k, status: k === todayKey ? 'NONE' : 'FUTURE', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: null });
      }
    }
    const count = (s: string) => days.filter(d => d.status === s).length;
    const present = count('PRESENT') + count('HALF_DAY');
    const workingDays = days.filter(d => WORKING.includes(d.status)).length;
    const summary = {
      present, absent: count('ABSENT'), onLeave: count('ON_LEAVE'), holiday: count('HOLIDAY'),
      weekend: count('WEEKEND'), workingDays, attendanceRate: workingDays ? Math.round((present / workingDays) * 100) : 0,
      hoursLogged: round(days.reduce((s, d) => s + (d.totalHours ?? 0), 0)),
    };
    return { userId, year, month, days, summary };
  }

  /** Per-user attendance summary across a date range — admin all-users view. */
  async orgSummary(organizationId: string, from: string, to: string) {
    const fromD = parseDay(from.slice(0, 10));
    const toD = parseDay(to.slice(0, 10));
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, designation: true },
    });
    const userIds = users.map(u => u.id);
    const [att, leaves, holidays, sheets] = await Promise.all([
      this.prisma.attendance.findMany({ where: { userId: { in: userIds }, date: { gte: fromD, lte: toD } } }),
      this.prisma.leaveRequest.findMany({ where: { userId: { in: userIds }, status: 'APPROVED', startDate: { lte: toD }, endDate: { gte: fromD } } }),
      this.prisma.holiday.findMany({ where: { organizationId, date: { gte: fromD, lte: toD } } }),
      this.prisma.timesheet.findMany({ where: { userId: { in: userIds }, deletedAt: null, date: { gte: fromD, lte: toD } }, select: { userId: true, date: true } }),
    ]);
    const attByUserDay = new Map(att.map(a => [`${a.userId}|${dayKey(a.date)}`, a]));
    const tsByUserDay = new Set(sheets.map(s => `${s.userId}|${dayKey(s.date)}`));
    const holidaySet = new Set(holidays.map(h => dayKey(h.date)));
    const leavesByUser = new Map<string, { start: string; end: string }[]>();
    leaves.forEach(l => {
      const arr = leavesByUser.get(l.userId) ?? [];
      arr.push({ start: dayKey(l.startDate), end: dayKey(l.endDate) });
      leavesByUser.set(l.userId, arr);
    });
    const days: string[] = [];
    for (const d = new Date(fromD); d <= toD; d.setUTCDate(d.getUTCDate() + 1)) days.push(dayKey(d));
    const todayKey = dayKey(utcDay(new Date()));

    const rows = users.map(u => {
      let present = 0, absent = 0, onLeave = 0, holiday = 0, hours = 0;
      for (const k of days) {
        const wd = parseDay(k).getUTCDay();
        const ex = attByUserDay.get(`${u.id}|${k}`);
        if (ex) {
          if (ex.status === 'PRESENT' || ex.status === 'HALF_DAY') { present++; hours += ex.totalHours ?? 0; }
          else if (ex.status === 'ABSENT') absent++;
          else if (ex.status === 'ON_LEAVE') onLeave++;
          else if (ex.status === 'HOLIDAY') holiday++;
          continue;
        }
        if ((leavesByUser.get(u.id) ?? []).some(l => l.start <= k && k <= l.end)) { onLeave++; continue; }
        if (holidaySet.has(k)) { holiday++; continue; }
        if (wd === 0 || wd === 6) continue;
        if (tsByUserDay.has(`${u.id}|${k}`)) { present++; continue; }
        if (k < todayKey) absent++;
      }
      const workdays = present + absent + onLeave;
      return {
        userId: u.id, name: `${u.firstName} ${u.lastName}`.trim(), designation: u.designation ?? undefined,
        present, absent, onLeave, holiday, hoursLogged: round(hours),
        attendanceRate: workdays ? Math.round((present / workdays) * 100) : 0,
      };
    });
    return { from, to, rows };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  private async orgOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  private readonly userSelect = { select: { id: true, firstName: true, lastName: true, email: true } };

  listForUser(userId: string, status?: string) {
    return this.prisma.leaveRequest.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: { user: this.userSelect }, orderBy: { createdAt: 'desc' },
    });
  }
  listForOrg(organizationId: string, status?: string) {
    return this.prisma.leaveRequest.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: { user: this.userSelect }, orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: { leaveType: string; startDate: string; endDate: string; reason?: string }) {
    const start = parseDay(dto.startDate.slice(0, 10));
    const end = parseDay(dto.endDate.slice(0, 10));
    if (end < start) throw new BadRequestException('endDate must be on or after startDate');
    const numDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const organizationId = await this.orgOf(userId);
    return this.prisma.leaveRequest.create({
      data: { userId, organizationId, leaveType: dto.leaveType, startDate: start, endDate: end, numDays, reason: dto.reason ?? null, status: 'PENDING' },
      include: { user: this.userSelect },
    });
  }

  async approve(id: string, actorId: string, note?: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`Leave request ${id} not found`);
    if (req.status !== 'PENDING') throw new BadRequestException('Only PENDING requests can be approved');

    // Write ON_LEAVE attendance for each day in range (skip days already marked).
    const rows: { userId: string; organizationId: string | null; date: Date; status: string; note: string }[] = [];
    for (const d = new Date(req.startDate); d <= req.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      rows.push({ userId: req.userId, organizationId: req.organizationId, date: utcDay(d), status: 'ON_LEAVE', note: `${req.leaveType} leave` });
    }
    if (rows.length) await this.prisma.attendance.createMany({ data: rows, skipDuplicates: true });

    return this.prisma.leaveRequest.update({
      where: { id }, data: { status: 'APPROVED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.userSelect },
    });
  }

  async reject(id: string, actorId: string, note?: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`Leave request ${id} not found`);
    if (req.status !== 'PENDING') throw new BadRequestException('Only PENDING requests can be rejected');
    return this.prisma.leaveRequest.update({
      where: { id }, data: { status: 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.userSelect },
    });
  }

  async cancel(id: string, actorId: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`Leave request ${id} not found`);
    if (req.userId !== actorId) throw new ForbiddenException('You can only cancel your own leave requests');
    if (!['PENDING', 'APPROVED'].includes(req.status)) throw new BadRequestException('Cannot cancel this request');
    // Remove generated ON_LEAVE attendance if it was approved.
    if (req.status === 'APPROVED') {
      await this.prisma.attendance.deleteMany({ where: { userId: req.userId, status: 'ON_LEAVE', date: { gte: utcDay(req.startDate), lte: utcDay(req.endDate) } } });
    }
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include: { user: this.userSelect } });
  }

  // ── leave types & balances ──────────────────────────────────────────────────
  listTypes(organizationId: string) {
    return this.prisma.leaveType.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
  }

  async balances(userId: string) {
    const organizationId = await this.orgOf(userId);
    if (!organizationId) return [];
    const year = new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const types = await this.prisma.leaveType.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    const approved = await this.prisma.leaveRequest.groupBy({
      by: ['leaveType'],
      where: { userId, status: 'APPROVED', startDate: { gte: start, lt: end } },
      _sum: { numDays: true },
    });
    const usedByCode = new Map(approved.map(a => [a.leaveType, a._sum.numDays ?? 0]));
    return types.map(t => {
      const used = usedByCode.get(t.code) ?? 0;
      return { code: t.code, name: t.name, quota: t.annualQuota, used, remaining: Math.max(0, t.annualQuota - used), colorHex: t.colorHex };
    });
  }

  // ── holidays ──────────────────────────────────────────────────────────────────
  listHolidays(organizationId: string, year?: number) {
    const where: any = { organizationId };
    if (year) where.date = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    return this.prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
  }
  createHoliday(dto: { organizationId: string; name: string; date: string; type?: string; recurring?: boolean }) {
    return this.prisma.holiday.create({
      data: { organizationId: dto.organizationId, name: dto.name, date: parseDay(dto.date.slice(0, 10)), type: dto.type ?? 'PUBLIC', recurring: dto.recurring ?? false },
    });
  }
  removeHoliday(id: string) {
    return this.prisma.holiday.delete({ where: { id } });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
@Controller('attendance')
class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Get('me/today')
  today(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.getToday(actorId);
  }

  @Get('me/month')
  myMonth(@Actor() actorId: string | null, @Query('year') year: string, @Query('month') month: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.getMonth(actorId, parseInt(year, 10), parseInt(month, 10));
  }

  @Post('punch')
  punch(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.punch(actorId);
  }

  @Post('me/regularize')
  regularizeDay(
    @Actor() actorId: string | null,
    @Body() body: { date: string; reason: string; status?: string; checkIn?: string; checkOut?: string },
  ) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.regularizeDay(actorId, body);
  }

  @Post(':id/regularize')
  regularize(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { reason: string; newStatus?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.regularize(id, actorId, body.reason, body.newStatus);
  }

  @Get('users/:userId/month')
  @RequirePermission('attendance.view.organization')
  userMonth(@Param('userId') userId: string, @Query('year') year: string, @Query('month') month: string) {
    return this.svc.getMonth(userId, parseInt(year, 10), parseInt(month, 10));
  }

  @Get('org/summary')
  @RequirePermission('attendance.view.organization')
  orgSummary(@Query('organizationId') organizationId: string, @Query('from') from: string, @Query('to') to: string) {
    if (!organizationId || !from || !to) throw new BadRequestException('organizationId, from, to are required');
    return this.svc.orgSummary(organizationId, from, to);
  }

  @Post('mark')
  @RequirePermission('attendance.manage')
  mark(@Body() body: { userId: string; date: string; status: string; note?: string }) {
    return this.svc.mark(body);
  }
}

@Controller('leave')
class LeaveController {
  constructor(private readonly svc: LeaveService) {}

  @Get('requests/me')
  myRequests(@Actor() actorId: string | null, @Query('status') status?: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.listForUser(actorId, status);
  }

  @Get('requests/org')
  @RequirePermission('leave.view.organization')
  orgRequests(@Query('organizationId') organizationId: string, @Query('status') status?: string) {
    if (!organizationId) throw new BadRequestException('organizationId required');
    return this.svc.listForOrg(organizationId, status);
  }

  @Post('requests')
  create(@Actor() actorId: string | null, @Body() body: { leaveType: string; startDate: string; endDate: string; reason?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.create(actorId, body);
  }

  @Post('requests/:id/approve')
  @RequirePermission('leave.approve')
  approve(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.approve(id, actorId ?? '', body?.note);
  }

  @Post('requests/:id/reject')
  @RequirePermission('leave.approve')
  reject(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.reject(id, actorId ?? '', body?.note);
  }

  @Post('requests/:id/cancel')
  cancel(@Actor() actorId: string | null, @Param('id') id: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.cancel(id, actorId);
  }

  @Get('balance/me')
  balances(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.balances(actorId);
  }

  @Get('types')
  types(@Query('organizationId') organizationId: string) {
    if (!organizationId) throw new BadRequestException('organizationId required');
    return this.svc.listTypes(organizationId);
  }

  @Get('holidays')
  holidays(@Query('organizationId') organizationId: string, @Query('year') year?: string) {
    if (!organizationId) throw new BadRequestException('organizationId required');
    return this.svc.listHolidays(organizationId, year ? parseInt(year, 10) : undefined);
  }

  @Post('holidays')
  @RequirePermission('holiday.manage')
  createHoliday(@Body() body: { organizationId: string; name: string; date: string; type?: string; recurring?: boolean }) {
    return this.svc.createHoliday(body);
  }

  @Delete('holidays/:id')
  @RequirePermission('holiday.manage')
  removeHoliday(@Param('id') id: string) {
    return this.svc.removeHoliday(id);
  }
}

@Module({
  controllers: [AttendanceController, LeaveController],
  providers: [AttendanceService, LeaveService],
  exports: [AttendanceService, LeaveService],
})
export class AttendanceModule {}
