import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { NotificationsService } from '../notifications/notifications.module';
import { CapacityModule, CapacityService } from '../capacity/capacity.module';

// ── date helpers (UTC day boundaries) ───────────────────────────────────────────
function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function utcDay(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function parseDay(s: string): Date { return new Date(`${s}T00:00:00.000Z`); }
function round(n: number, p = 1): number { const f = 10 ** p; return Math.round((n ?? 0) * f) / f; }
/**
 * Parse a manual check-in/out timestamp unambiguously. An offset-less string
 * (e.g. a datetime-local input "2026-07-09T09:00") is interpreted as UTC rather
 * than the server's local timezone, so stored regularized times don't shift by
 * the host's offset. Strings that already carry Z or an offset are used as-is.
 */
function parseInstant(s?: string | null): Date | null {
  if (!s) return null;
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s.trim());
  return new Date(hasTz ? s : `${s}Z`);
}

const WORKING = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'];

// ════════════════════════════════════════════════════════════════════════════════
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async orgOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  /** Everyone who can approve regularisations (holds attendance.regularize) — HR/Admins. */
  private async approverIds(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'attendance.regularize' } } } } } },
      },
      select: { id: true },
    });
    return rows.map(r => r.id);
  }

  async getToday(userId: string) {
    const today = utcDay(new Date());
    return this.prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
  }

  /**
   * Daily punch with exactly ONE check-in and ONE check-out:
   *   1. no check-in yet        → clock in (PRESENT)
   *   2. clocked in, not out    → clock out + compute totalHours
   *   3. already clocked out    → REJECT — the day is locked so a stray third
   *      punch can never overwrite/erase the real check-out time.
   */
  async punch(userId: string) {
    const today = utcDay(new Date());
    const now = new Date();
    const existing = await this.prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });

    if (!existing || !existing.checkIn) {
      // M1: never silently overwrite an approved-leave or holiday day.
      if (existing && (existing.status === 'ON_LEAVE' || existing.status === 'HOLIDAY')) {
        const label = existing.status === 'ON_LEAVE' ? 'on approved leave' : 'a holiday';
        throw new BadRequestException(`Today is marked ${label}. Cancel the leave or ask an admin to adjust it before clocking in.`);
      }
      // M2: overnight shift — a shift opened on a PRIOR day and still open is closed
      // by this punch (clock-out across the UTC midnight boundary), instead of
      // opening a brand-new shift and orphaning yesterday's. Bounded to <24h so a
      // long-forgotten open row isn't closed with a huge total.
      if (!existing) {
        const openPrior = await this.prisma.attendance.findFirst({
          where: { userId, checkIn: { not: null }, checkOut: null, date: { lt: today } },
          orderBy: { date: 'desc' },
        });
        if (openPrior?.checkIn && now.getTime() - openPrior.checkIn.getTime() < 24 * 3_600_000) {
          const totalHours = round((now.getTime() - openPrior.checkIn.getTime()) / 3_600_000, 2);
          return this.prisma.attendance.update({ where: { id: openPrior.id }, data: { checkOut: now, totalHours } });
        }
      }
      const organizationId = await this.orgOf(userId);
      return this.prisma.attendance.upsert({
        where: { userId_date: { userId, date: today } },
        create: { userId, organizationId, date: today, checkIn: now, status: 'PRESENT' },
        update: { checkIn: now, status: 'PRESENT' },
      });
    }
    if (existing.checkOut) {
      throw new BadRequestException('You have already clocked out for today. The day is complete.');
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

  private readonly regUserSelect = { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } };

  /**
   * An employee RAISES a regularisation request for one day (missed / late / forgot punch).
   * It does NOT change attendance — it goes to HR (attendance.regularize) to approve or reject.
   * Regularisation used to be a silent self-edit; now it is reviewed, so the record is trusted.
   */
  async requestRegularization(
    userId: string,
    data: { date: string; reason: string; requestType?: string; status?: string; checkIn?: string; checkOut?: string },
  ) {
    if (!data?.reason?.trim()) throw new BadRequestException('A reason is required.');
    const REG_ALLOWED = ['PRESENT', 'HALF_DAY'];
    const status = data.status ?? 'PRESENT';
    if (!REG_ALLOWED.includes(status)) throw new BadRequestException(`status must be one of: ${REG_ALLOWED.join(', ')}`);
    const date = parseDay(data.date.slice(0, 10));
    if (date > utcDay(new Date())) throw new BadRequestException('Cannot regularise a future date.');
    const checkIn = parseInstant(data.checkIn);
    const checkOut = parseInstant(data.checkOut);
    if (checkIn && checkOut && checkOut <= checkIn) throw new BadRequestException('Check-out must be after check-in.');

    // One open request per day — a second would let two approvals fight over the same row.
    const existing = await this.prisma.regularizationRequest.findFirst({
      where: { userId, date, status: 'PENDING' },
    });
    if (existing) throw new BadRequestException('You already have a pending request for this day.');

    const organizationId = await this.orgOf(userId);
    const req = await this.prisma.regularizationRequest.create({
      data: {
        userId, organizationId, date, reason: data.reason.trim(),
        requestType: data.requestType ?? 'OTHER',
        requestedStatus: status,
        requestedCheckIn: checkIn ?? undefined,
        requestedCheckOut: checkOut ?? undefined,
        status: 'PENDING',
      },
      include: { user: this.regUserSelect },
    });

    const u = (req as any).user;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'An employee';
    await this.notifications.notify(await this.approverIds(organizationId), {
      type: 'attendance.regularization_requested',
      title: 'Attendance regularisation to review',
      message: `${name} asked to regularise ${dayKey(date)}: ${req.reason}`,
    });
    return req;
  }

  myRegularizations(userId: string) {
    return this.prisma.regularizationRequest.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 60,
      include: { user: this.regUserSelect },
    });
  }

  /** The pending queue, scoped to the REVIEWER'S own org (resolved from the session actor). */
  async pendingRegularizations(reviewerId: string) {
    const organizationId = await this.orgOf(reviewerId);
    if (!organizationId) return [];
    return this.prisma.regularizationRequest.findMany({
      where: { organizationId, status: 'PENDING' }, orderBy: { createdAt: 'asc' },
      include: { user: this.regUserSelect },
    });
  }

  /** HR approves: NOW the change is written to the attendance row, and the request is closed. */
  async approveRegularization(id: string, actorId: string, note?: string) {
    const req = await this.prisma.regularizationRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Regularisation request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Only pending requests can be approved.');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own request.');

    const checkIn = req.requestedCheckIn;
    const checkOut = req.requestedCheckOut;
    const totalHours = checkIn && checkOut ? round((checkOut.getTime() - checkIn.getTime()) / 3_600_000, 2) : undefined;
    const audit = {
      status: req.requestedStatus,
      isRegularized: true,
      regularizeReason: req.reason,
      regularizedBy: actorId,
      regularizedAt: new Date(),
      ...(checkIn ? { checkIn } : {}),
      ...(checkOut ? { checkOut } : {}),
      ...(totalHours != null ? { totalHours } : {}),
    };
    await this.prisma.$transaction([
      this.prisma.attendance.upsert({
        where: { userId_date: { userId: req.userId, date: req.date } },
        create: { userId: req.userId, organizationId: req.organizationId, date: req.date, ...audit },
        update: audit,
      }),
      this.prisma.regularizationRequest.update({
        where: { id }, data: { status: 'APPROVED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      }),
    ]);
    await this.notifications.notify(req.userId, {
      type: 'attendance.regularization_approved',
      title: 'Regularisation approved',
      message: `Your attendance for ${dayKey(req.date)} was regularised.`,
    });
    return this.prisma.regularizationRequest.findUnique({ where: { id }, include: { user: this.regUserSelect } });
  }

  async rejectRegularization(id: string, actorId: string, note?: string) {
    const req = await this.prisma.regularizationRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Regularisation request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Only pending requests can be rejected.');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own request.');
    const updated = await this.prisma.regularizationRequest.update({
      where: { id }, data: { status: 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.regUserSelect },
    });
    await this.notifications.notify(req.userId, {
      type: 'attendance.regularization_rejected',
      title: 'Regularisation rejected',
      message: `Your regularisation for ${dayKey(req.date)} was not approved${note ? `: ${note}` : '.'}`,
    });
    return updated;
  }

  async cancelRegularization(id: string, actorId: string) {
    const req = await this.prisma.regularizationRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Regularisation request not found');
    if (req.userId !== actorId) throw new ForbiddenException('You can only cancel your own requests.');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending request can be cancelled.');
    return this.prisma.regularizationRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
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
      } else if (holidayByDay.has(k)) {
        days.push({ date: k, status: 'HOLIDAY', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: holidayByDay.get(k)!.name });
      } else if (wd === 0 || wd === 6) {
        days.push({ date: k, status: 'WEEKEND', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: null });
      } else if (onLeave(k)) {
        days.push({ date: k, status: 'ON_LEAVE', checkIn: null, checkOut: null, totalHours: null, isRegularized: false, note: null });
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
    // Approved leave must NOT count against attendance rate (it isn't an expected
    // working day). Denominator = working days minus approved-leave days.
    const expectedDays = workingDays - count('ON_LEAVE');
    const summary = {
      present, absent: count('ABSENT'), onLeave: count('ON_LEAVE'), holiday: count('HOLIDAY'),
      weekend: count('WEEKEND'), workingDays, attendanceRate: expectedDays > 0 ? Math.round((present / expectedDays) * 100) : 0,
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
        if (holidaySet.has(k)) { holiday++; continue; }
        if (wd === 0 || wd === 6) continue;
        if ((leavesByUser.get(u.id) ?? []).some(l => l.start <= k && k <= l.end)) { onLeave++; continue; }
        if (tsByUserDay.has(`${u.id}|${k}`)) { present++; continue; }
        if (k < todayKey) absent++;
      }
      // Approved leave is not an expected working day, so it must not drag the rate
      // down — mirror getMonth, where the denominator excludes leave days.
      const expectedDays = present + absent;
      return {
        userId: u.id, name: `${u.firstName} ${u.lastName}`.trim(), designation: u.designation ?? undefined,
        present, absent, onLeave, holiday, hoursLogged: round(hours),
        attendanceRate: expectedDays ? Math.round((present / expectedDays) * 100) : 0,
      };
    });
    return { from, to, rows };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly capacity: CapacityService,
  ) {}

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

  /** Working days within [start,end], excluding weekends and org holidays. */
  private async businessDays(organizationId: string | null, start: Date, end: Date): Promise<Date[]> {
    const holidays = await this.prisma.holiday.findMany({
      where: { organizationId: organizationId ?? undefined, date: { gte: utcDay(start), lte: utcDay(end) } },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map(h => dayKey(h.date)));
    const days: Date[] = [];
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const wd = d.getUTCDay();
      if (wd === 0 || wd === 6) continue;            // weekend
      if (holidaySet.has(dayKey(d))) continue;        // holiday
      days.push(utcDay(d));
    }
    return days;
  }

  async create(userId: string, dto: { leaveType: string; startDate: string; endDate: string; reason?: string }) {
    const start = parseDay(dto.startDate.slice(0, 10));
    const end = parseDay(dto.endDate.slice(0, 10));
    if (end < start) throw new BadRequestException('endDate must be on or after startDate');
    // M4: reject leave that is entirely in the past (approval would retroactively debit balance).
    if (end < utcDay(new Date())) throw new BadRequestException('Cannot request leave for dates in the past.');
    // M3: reject a request overlapping an existing pending/approved one (double-debits balance).
    const clash = await this.prisma.leaveRequest.findFirst({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (clash) throw new BadRequestException('You already have a leave request overlapping these dates.');
    const organizationId = await this.orgOf(userId);
    // Count business days only — weekends and holidays do not consume leave balance.
    const numDays = (await this.businessDays(organizationId, start, end)).length;
    if (numDays === 0) throw new BadRequestException('Selected dates contain no working days');
    // Comp-off leave is spent against EARNED credits (approved comp-off claims), not a quota.
    if (dto.leaveType === 'CO') {
      const { available } = await this.compOffBalance(userId);
      if (available < numDays) {
        throw new BadRequestException(`Not enough comp-off credits — you have ${available} day${available === 1 ? '' : 's'} available.`);
      }
    }
    return this.prisma.leaveRequest.create({
      data: { userId, organizationId, leaveType: dto.leaveType, startDate: start, endDate: end, numDays, reason: dto.reason ?? null, status: 'PENDING' },
      include: { user: this.userSelect },
    });
  }

  async approve(id: string, actorId: string, note?: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`Leave request ${id} not found`);
    if (req.status !== 'PENDING') throw new BadRequestException('Only PENDING requests can be approved');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own leave request');

    // Write ON_LEAVE attendance only for business days (skip weekends + holidays),
    // so leave spanning a weekend doesn't inflate ON_LEAVE / working-day counts.
    const days = await this.businessDays(req.organizationId, req.startDate, req.endDate);
    const rows = days.map(date => ({ userId: req.userId, organizationId: req.organizationId, date, status: 'ON_LEAVE', note: `${req.leaveType} leave` }));
    if (rows.length) await this.prisma.attendance.createMany({ data: rows, skipDuplicates: true });

    const updated = await this.prisma.leaveRequest.update({
      where: { id }, data: { status: 'APPROVED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.userSelect },
    });

    // M6: surface approved leave on the shared Calendar (it previously only wrote
    // ON_LEAVE attendance rows, which the calendar never reads).
    if (req.organizationId) {
      const u = (updated as any).user;
      const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'Employee';
      await this.prisma.calendarEvent.create({
        data: {
          organizationId: req.organizationId,
          title: `${name} — ${req.leaveType} leave`,
          type: 'LEAVE',
          startDate: req.startDate,
          endDate: req.endDate,
          allDay: true,
          color: '#fe841f',
          createdBy: req.userId,
        },
      });
    }

    await this.notifications.notify(req.userId, {
      type: 'leave.approved',
      title: 'Leave approved',
      message: `Your ${req.leaveType} leave (${req.numDays} day${req.numDays === 1 ? '' : 's'}) was approved.`,
    });

    // Emergency-leave coverage: if this is short-notice leave and the person holds
    // HIGH/CRITICAL work due while they're out, alert admins & the projects' managers
    // so they can reassign or extend. Best-effort — never fail the approval over it.
    try {
      const u = (updated as { user?: { firstName?: string; lastName?: string } }).user;
      const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'A teammate' : 'A teammate';
      await this.capacity.notifyIfCoverageAtRisk(req.organizationId, req.userId,
        { startDate: req.startDate, endDate: req.endDate, createdAt: req.createdAt, leaveType: req.leaveType }, name);
    } catch { /* coverage alert is advisory; the leave is already approved */ }

    return updated;
  }

  async reject(id: string, actorId: string, note?: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`Leave request ${id} not found`);
    if (req.status !== 'PENDING') throw new BadRequestException('Only PENDING requests can be rejected');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own leave request');
    const updated = await this.prisma.leaveRequest.update({
      where: { id }, data: { status: 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.userSelect },
    });
    await this.notifications.notify(req.userId, {
      type: 'leave.rejected',
      title: 'Leave rejected',
      message: `Your ${req.leaveType} leave request was rejected.`,
    });
    return updated;
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
    return Promise.all(types.map(async t => {
      // Comp Off is not an annual quota — its "balance" is what you EARNED by working
      // non-working days (approved comp-off claims) minus what you've already availed.
      if (t.code === 'CO') {
        const b = await this.compOffBalance(userId);
        return { code: 'CO', name: t.name, quota: b.earned, used: b.used, remaining: b.available, colorHex: t.colorHex };
      }
      const used = usedByCode.get(t.code) ?? 0;
      return { code: t.code, name: t.name, quota: t.annualQuota, used, remaining: Math.max(0, t.annualQuota - used), colorHex: t.colorHex };
    }));
  }

  // ── comp-off (worked a non-working day → compensatory day off) ────────────────
  /** Users who may review comp-off claims — holders of leave.approve (HR/managers). */
  private async leaveApprovers(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const users = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'leave.approve' } } } } } },
      },
      select: { id: true },
    });
    return users.map(u => u.id);
  }

  /** A day is claimable for comp-off only if it was a weekend or an org holiday. */
  private async isNonWorkingDay(organizationId: string | null, date: Date): Promise<boolean> {
    const wd = date.getUTCDay();
    if (wd === 0 || wd === 6) return true;
    const h = await this.prisma.holiday.findFirst({ where: { organizationId: organizationId ?? undefined, date: utcDay(date) } });
    return !!h;
  }

  /** Comp Off is a leave type that must exist for the org before a credit can be availed. */
  private async ensureCompOffType(organizationId: string | null) {
    if (!organizationId) return;
    const existing = await this.prisma.leaveType.findFirst({ where: { organizationId, code: 'CO' } });
    if (!existing) {
      await this.prisma.leaveType.create({
        data: { organizationId, name: 'Comp Off', code: 'CO', annualQuota: 0, colorHex: '#6366f1' },
      }).catch(() => { /* raced with another approval — fine */ });
    }
  }

  /** Earned (approved) comp-off credits minus CO leave already availed (pending + approved). */
  async compOffBalance(userId: string): Promise<{ earned: number; used: number; available: number }> {
    const [earned, used] = await Promise.all([
      this.prisma.compOffRequest.count({ where: { userId, status: 'APPROVED' } }),
      this.prisma.leaveRequest.aggregate({ where: { userId, leaveType: 'CO', status: { in: ['PENDING', 'APPROVED'] } }, _sum: { numDays: true } }),
    ]);
    const usedDays = used._sum.numDays ?? 0;
    return { earned, used: usedDays, available: Math.max(0, earned - usedDays) };
  }

  async requestCompOff(userId: string, data: { workDate: string; reason: string; hoursWorked?: number }) {
    if (!data?.reason?.trim()) throw new BadRequestException('Tell us what you worked on.');
    const workDate = parseDay(data.workDate.slice(0, 10));
    if (workDate > utcDay(new Date())) throw new BadRequestException('You can only claim comp-off for a day you have already worked.');
    const organizationId = await this.orgOf(userId);
    if (!(await this.isNonWorkingDay(organizationId, workDate))) {
      throw new BadRequestException('Comp-off is only for working on a weekend or a company holiday.');
    }
    const existing = await this.prisma.compOffRequest.findFirst({ where: { userId, workDate, status: { in: ['PENDING', 'APPROVED'] } } });
    if (existing) throw new BadRequestException('You already have a comp-off claim for this day.');
    const req = await this.prisma.compOffRequest.create({
      data: { userId, organizationId, workDate, reason: data.reason.trim(), hoursWorked: data.hoursWorked ?? null, status: 'PENDING' },
      include: { user: this.userSelect },
    });
    const u = (req as { user?: { firstName?: string; lastName?: string } }).user;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'An employee';
    await this.notifications.notify(await this.leaveApprovers(organizationId), {
      type: 'compoff.requested', title: 'Comp-off to review',
      message: `${name} claims comp-off for working ${dayKey(workDate)}: ${req.reason}`,
    });
    return req;
  }

  myCompOffs(userId: string) {
    return this.prisma.compOffRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 60, include: { user: this.userSelect } });
  }

  /** Pending comp-off queue for the reviewer's org, each with the day's actual work as evidence. */
  async pendingCompOffs(reviewerId: string) {
    const organizationId = await this.orgOf(reviewerId);
    if (!organizationId) return [];
    const reqs = await this.prisma.compOffRequest.findMany({
      where: { organizationId, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, include: { user: this.userSelect },
    });
    if (!reqs.length) return [];
    const evidence = await Promise.all(reqs.map(async r => {
      const day = utcDay(r.workDate);
      const next = new Date(day); next.setUTCDate(next.getUTCDate() + 1);
      const [sheets, att] = await Promise.all([
        this.prisma.timesheet.findMany({
          where: { userId: r.userId, deletedAt: null, date: { gte: day, lt: next } },
          select: { hoursLogged: true, notes: true, task: { select: { title: true } } },
        }),
        this.prisma.attendance.findFirst({ where: { userId: r.userId, date: day }, select: { checkIn: true, checkOut: true, totalHours: true } }),
      ]);
      return {
        id: r.id,
        timesheets: sheets.map(s => ({ task: s.task?.title ?? 'General', hours: s.hoursLogged, notes: s.notes ?? undefined })),
        attendance: att ? { checkIn: att.checkIn, checkOut: att.checkOut, totalHours: att.totalHours } : null,
      };
    }));
    const evById = new Map(evidence.map(e => [e.id, e]));
    return reqs.map(r => ({ ...r, evidence: evById.get(r.id) ?? null }));
  }

  async approveCompOff(id: string, actorId: string, note?: string) {
    const req = await this.prisma.compOffRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Comp-off request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending claim can be approved.');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own comp-off claim.');
    await this.ensureCompOffType(req.organizationId); // so the earned credit is availeable as CO leave
    const updated = await this.prisma.compOffRequest.update({
      where: { id }, data: { status: 'APPROVED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.userSelect },
    });
    // Record the earned comp-off on the shared calendar (the non-working day they worked).
    if (req.organizationId) {
      const u = (updated as { user?: { firstName?: string; lastName?: string } }).user;
      const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'Employee';
      await this.prisma.calendarEvent.create({
        data: {
          organizationId: req.organizationId, title: `${name} — Comp Off earned (worked)`,
          type: 'COMPOFF', startDate: utcDay(req.workDate), endDate: utcDay(req.workDate),
          allDay: true, color: '#6366f1', createdBy: req.userId,
        },
      });
    }
    await this.notifications.notify(req.userId, {
      type: 'compoff.approved', title: 'Comp-off approved',
      message: `Your comp-off for working ${dayKey(req.workDate)} was approved — you have a day off to use.`,
    });
    return updated;
  }

  async rejectCompOff(id: string, actorId: string, note?: string) {
    const req = await this.prisma.compOffRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Comp-off request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending claim can be rejected.');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own comp-off claim.');
    const updated = await this.prisma.compOffRequest.update({
      where: { id }, data: { status: 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.userSelect },
    });
    await this.notifications.notify(req.userId, {
      type: 'compoff.rejected', title: 'Comp-off rejected',
      message: `Your comp-off claim for ${dayKey(req.workDate)} was not approved${note ? `: ${note}` : '.'}`,
    });
    return updated;
  }

  async cancelCompOff(id: string, userId: string) {
    const req = await this.prisma.compOffRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Comp-off request not found');
    if (req.userId !== userId) throw new ForbiddenException('You can only cancel your own comp-off claims.');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending claim can be cancelled.');
    return this.prisma.compOffRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
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
    const y = parseInt(year, 10), m = parseInt(month, 10);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new BadRequestException('year and month are required');
    return this.svc.getMonth(actorId, y, m);
  }

  @Post('punch')
  punch(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.punch(actorId);
  }

  // An employee RAISES a regularisation request. This no longer edits attendance directly —
  // it goes to HR to approve (see the review routes below).
  @Post('me/regularize')
  requestRegularization(
    @Actor() actorId: string | null,
    @Body() body: { date: string; reason: string; requestType?: string; status?: string; checkIn?: string; checkOut?: string },
  ) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.requestRegularization(actorId, body);
  }

  /** My own regularisation requests + their status. */
  @Get('regularizations/me')
  myRegularizations(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.myRegularizations(actorId);
  }

  /** The pending queue for reviewers (HR/Admin). */
  @Get('regularizations/pending')
  @RequirePermission('attendance.regularize')
  pendingRegularizations(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.pendingRegularizations(actorId);
  }

  @Post('regularizations/:id/approve')
  @RequirePermission('attendance.regularize')
  approveRegularization(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.approveRegularization(id, actorId, body?.note);
  }

  @Post('regularizations/:id/reject')
  @RequirePermission('attendance.regularize')
  rejectRegularization(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.rejectRegularization(id, actorId, body?.note);
  }

  @Post('regularizations/:id/cancel')
  cancelRegularization(@Actor() actorId: string | null, @Param('id') id: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.cancelRegularization(id, actorId);
  }

  // Regularising an ARBITRARY attendance row (by id) is a privileged action —
  // gate it so an Employee can't rewrite anyone's attendance (IDOR).
  @Post(':id/regularize') @RequirePermission('attendance.regularize')
  regularize(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { reason: string; newStatus?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.regularize(id, actorId, body.reason, body.newStatus);
  }

  @Get('users/:userId/month')
  @RequirePermission('attendance.view.organization')
  userMonth(@Param('userId') userId: string, @Query('year') year: string, @Query('month') month: string) {
    const y = parseInt(year, 10), m = parseInt(month, 10);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new BadRequestException('year and month are required');
    return this.svc.getMonth(userId, y, m);
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

  // ── comp-off ──────────────────────────────────────────────────────────────────
  @Post('compoff')
  requestCompOff(@Actor() actorId: string | null, @Body() body: { workDate: string; reason: string; hoursWorked?: number }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.requestCompOff(actorId, body);
  }

  @Get('compoff/me')
  myCompOffs(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.myCompOffs(actorId);
  }

  @Get('compoff/pending')
  @RequirePermission('leave.approve')
  pendingCompOffs(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.pendingCompOffs(actorId);
  }

  @Post('compoff/:id/approve')
  @RequirePermission('leave.approve')
  approveCompOff(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.approveCompOff(id, actorId ?? '', body?.note);
  }

  @Post('compoff/:id/reject')
  @RequirePermission('leave.approve')
  rejectCompOff(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.rejectCompOff(id, actorId ?? '', body?.note);
  }

  @Post('compoff/:id/cancel')
  cancelCompOff(@Actor() actorId: string | null, @Param('id') id: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.cancelCompOff(id, actorId);
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
  imports: [CapacityModule],
  controllers: [AttendanceController, LeaveController],
  providers: [AttendanceService, LeaveService],
  exports: [AttendanceService, LeaveService],
})
export class AttendanceModule {}
