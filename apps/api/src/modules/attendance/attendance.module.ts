import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
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

/**
 * Parse a required calendar-day field to a UTC midnight Date, throwing a clean 400 when
 * it is missing, non-string, or not a real date. The handlers used to do
 * `data.date.slice(0, 10)` directly, so an absent/mistyped field threw a TypeError that
 * surfaced as an opaque HTTP 500 across every attendance/leave create endpoint.
 */
function parseDayStrict(s: unknown, field = 'date'): Date {
  const raw = typeof s === 'string' ? s.slice(0, 10) : '';
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new BadRequestException(`A valid ${field} (YYYY-MM-DD) is required.`);
  return d;
}

// Statuses an admin may set manually / a regularisation may resolve to. Free-text status
// used to be written straight through, silently corrupting attendance reports.
const MARK_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'LATE'];
// What kind of day a regularisation is about (free-form before — a rogue "WFH" type even
// re-routed around the dedicated WFH approval flow).
const REG_TYPES = ['MISSED_PUNCH', 'LATE', 'ON_DUTY', 'WFH', 'OTHER'];
// Upper bounds on free-text so a single request can't store/broadcast a novel-length blob.
const MAX_REASON = 2000;
const MAX_PID = 120;
const MAX_NAME = 160;
// A comp-off claim must be reasonably recent — no farming weekends from years ago.
const COMPOFF_MAX_AGE_DAYS = 90;

const WORKING = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'];
// Escalation owner who is copied on attendance regularisations and comp-off claims
// (in addition to HR / managers). Matched by login account.
const ESCALATION_EMAIL = 'yash@squarkip.com';

// A day is a full "present" only if at least this many hours were worked; below it,
// the day is a HALF_DAY. Punch-in → immediate punch-out (~0h) therefore is not a full day.
const HALF_DAY_HOURS = 4;
function statusForHours(totalHours: number): string {
  return totalHours >= HALF_DAY_HOURS ? 'PRESENT' : 'HALF_DAY';
}

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

  /** 404 unless the target user belongs to the given (caller's) organization. */
  async assertUserInOrg(userId: string, organizationId: string): Promise<void> {
    const u = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null }, select: { id: true } });
    if (!u) throw new NotFoundException(`User ${userId} not found`);
  }

  // Attendance regularisations are routed to HR (people-ops) + Yash (escalation owner)
  // ONLY — deliberately NOT to managers or other admins. Yash is matched by his login
  // account; HR by role, so a change of who holds HR is picked up automatically.
  private async regularizationApproverIds(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        OR: [
          { userRoles: { some: { role: { name: 'HR' } } } },
          { email: ESCALATION_EMAIL },
        ],
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
   *   1. no check-in yet        → clock in. workMode is DERIVED, never chosen at punch
   *      time: WFH only when an APPROVED WfhRequest covers today, else OFFICE. Working
   *      from home is agreed in advance (request → HR/Admin approval), not self-declared.
   *   2. clocked in, not out    → clock out; status is DERIVED from hours worked
   *      (< HALF_DAY_HOURS ⇒ HALF_DAY) so an immediate in→out is not a full present day
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
          return this.prisma.attendance.update({ where: { id: openPrior.id }, data: { checkOut: now, totalHours, status: statusForHours(totalHours) } });
        }
      }
      const approvedWfh = await this.prisma.wfhRequest.findFirst({
        where: { userId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
      });
      const workMode = approvedWfh ? 'WFH' : 'OFFICE';
      const organizationId = await this.orgOf(userId);
      return this.prisma.attendance.upsert({
        where: { userId_date: { userId, date: today } },
        create: { userId, organizationId, date: today, checkIn: now, status: 'PRESENT', workMode },
        update: { checkIn: now, status: 'PRESENT', workMode },
      });
    }
    if (existing.checkOut) {
      throw new BadRequestException('You have already clocked out for today. The day is complete.');
    }
    const totalHours = round((now.getTime() - existing.checkIn.getTime()) / 3_600_000, 2);
    // Validate the day by hours: below a half day, mark HALF_DAY (a punch-in then an
    // immediate punch-out must not count as a full present day).
    return this.prisma.attendance.update({ where: { id: existing.id }, data: { checkOut: now, totalHours, status: statusForHours(totalHours) } });
  }

  /** Admin/manual mark for a specific user+date. */
  async mark(data: { userId: string; date: string; status: string; note?: string }) {
    const date = parseDayStrict(data.date, 'date');
    if (date > utcDay(new Date())) throw new BadRequestException('Cannot mark attendance for a future date.');
    if (!MARK_STATUSES.includes(data.status)) {
      throw new BadRequestException(`status must be one of: ${MARK_STATUSES.join(', ')}`);
    }
    if (data.note && data.note.length > MAX_REASON) throw new BadRequestException('Note is too long.');
    const organizationId = await this.orgOf(data.userId);
    return this.prisma.attendance.upsert({
      where: { userId_date: { userId: data.userId, date } },
      create: { userId: data.userId, organizationId, date, status: data.status, note: data.note ?? null },
      update: { status: data.status, note: data.note ?? null },
    });
  }

  async regularize(id: string, actorId: string, reason: string, newStatus?: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required.');
    if (reason.length > MAX_REASON) throw new BadRequestException('Reason is too long.');
    if (newStatus && !MARK_STATUSES.includes(newStatus)) {
      throw new BadRequestException(`newStatus must be one of: ${MARK_STATUSES.join(', ')}`);
    }
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
    if (data.reason.length > MAX_REASON) throw new BadRequestException('Reason is too long.');
    const REG_ALLOWED = ['PRESENT', 'HALF_DAY'];
    const status = data.status ?? 'PRESENT';
    if (!REG_ALLOWED.includes(status)) throw new BadRequestException(`status must be one of: ${REG_ALLOWED.join(', ')}`);
    const requestType = data.requestType ?? 'OTHER';
    if (!REG_TYPES.includes(requestType)) throw new BadRequestException(`requestType must be one of: ${REG_TYPES.join(', ')}`);
    const date = parseDayStrict(data.date, 'date');
    if (date > utcDay(new Date())) throw new BadRequestException('Cannot regularise a future date.');
    const checkIn = parseInstant(data.checkIn);
    const checkOut = parseInstant(data.checkOut);
    // Times MUST fall on the day being regularised. Otherwise an unrelated-date check-out
    // produced a multi-day span that approval wrote as an absurd single-day total (441h).
    if (checkIn && dayKey(utcDay(checkIn)) !== dayKey(date)) throw new BadRequestException('Check-in time must fall on the day being regularised.');
    if (checkOut && dayKey(utcDay(checkOut)) !== dayKey(date)) throw new BadRequestException('Check-out time must fall on the day being regularised.');
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
        requestType,
        requestedStatus: status,
        requestedCheckIn: checkIn ?? undefined,
        requestedCheckOut: checkOut ?? undefined,
        status: 'PENDING',
      },
      include: { user: this.regUserSelect },
    });

    const u = (req as any).user;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'An employee';
    await this.notifications.notify(await this.regularizationApproverIds(organizationId), {
      type: 'attendance.regularization_requested',
      title: 'Attendance regularisation to review',
      message: `${name} asked to regularise ${dayKey(date)}: ${req.reason}`,
      link: '/attendance',
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
      // A "worked from home" regularisation records the work MODE on the day.
      ...(req.requestType === 'WFH' ? { workMode: 'WFH' } : {}),
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

  // ── work-from-home requests (request → HR/Admin approval → punch derives WFH) ────
  /** Who reviews WFH requests — holders of attendance.manage: HR, Admin, Super Admin. */
  private async wfhApproverIds(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'attendance.manage' } } } } } },
      },
      select: { id: true },
    });
    return rows.map(r => r.id);
  }

  async requestWfh(userId: string, data: { startDate: string; endDate: string; reason: string }) {
    if (!data?.reason?.trim()) throw new BadRequestException('A reason is required.');
    if (data.reason.length > MAX_REASON) throw new BadRequestException('Reason is too long.');
    const start = parseDayStrict(data.startDate, 'startDate');
    const end = parseDayStrict(data.endDate, 'endDate');
    if (end < start) throw new BadRequestException('endDate must be on or after startDate');
    if (end < utcDay(new Date())) throw new BadRequestException('Cannot request work-from-home for dates in the past.');
    // A runaway range would silently turn everything WFH — long arrangements go through HR.
    if ((end.getTime() - start.getTime()) / 86_400_000 > 31) {
      throw new BadRequestException('WFH requests are limited to 31 days — please arrange longer periods with HR directly.');
    }
    const clash = await this.prisma.wfhRequest.findFirst({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (clash) throw new BadRequestException('You already have a WFH request overlapping these dates.');
    // A day can't be both approved leave and WFH — you're either off or working.
    const onLeave = await this.prisma.leaveRequest.findFirst({
      where: { userId, status: 'APPROVED', startDate: { lte: end }, endDate: { gte: start } },
    });
    if (onLeave) throw new BadRequestException('You have approved leave overlapping these dates.');

    const organizationId = await this.orgOf(userId);
    const req = await this.prisma.wfhRequest.create({
      data: { userId, organizationId, startDate: start, endDate: end, reason: data.reason.trim(), status: 'PENDING' },
      include: { user: this.regUserSelect },
    });
    const u = (req as any).user;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'An employee';
    const range = dayKey(start) === dayKey(end) ? dayKey(start) : `${dayKey(start)} – ${dayKey(end)}`;
    await this.notifications.notify(await this.wfhApproverIds(organizationId), {
      type: 'wfh.requested',
      title: 'Work-from-home request to review',
      message: `${name} asked to work from home ${range}: ${req.reason}`,
      link: '/attendance',
    });
    return req;
  }

  myWfhRequests(userId: string) {
    return this.prisma.wfhRequest.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 60,
      include: { user: this.regUserSelect },
    });
  }

  /** The pending WFH queue, scoped to the reviewer's own org. */
  async pendingWfhRequests(reviewerId: string) {
    const organizationId = await this.orgOf(reviewerId);
    if (!organizationId) return [];
    return this.prisma.wfhRequest.findMany({
      where: { organizationId, status: 'PENDING' }, orderBy: { createdAt: 'asc' },
      include: { user: this.regUserSelect },
    });
  }

  async approveWfh(id: string, actorId: string, note?: string) {
    const req = await this.prisma.wfhRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('WFH request not found');
    if (req.organizationId && req.organizationId !== await this.orgOf(actorId)) throw new NotFoundException('WFH request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending request can be approved.');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own WFH request.');

    await this.prisma.$transaction([
      this.prisma.wfhRequest.update({
        where: { id }, data: { status: 'APPROVED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      }),
      // Days in the range already worked (e.g. approved later the same day, after the
      // punch-in) get their mode corrected; future days derive WFH at punch time.
      this.prisma.attendance.updateMany({
        where: { userId: req.userId, date: { gte: req.startDate, lte: req.endDate }, status: { in: ['PRESENT', 'HALF_DAY', 'LATE'] } },
        data: { workMode: 'WFH' },
      }),
    ]);

    const updated = await this.prisma.wfhRequest.findUnique({ where: { id }, include: { user: this.regUserSelect } });
    // Surface the agreed WFH period on the shared calendar, like leave and comp-off.
    if (req.organizationId) {
      const u = (updated as any)?.user;
      const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'Employee';
      await this.prisma.calendarEvent.create({
        data: {
          organizationId: req.organizationId, title: `${name} — Working from home`,
          type: 'WFH', startDate: req.startDate, endDate: req.endDate,
          allDay: true, color: '#8b5cf6', createdBy: req.userId,
        },
      });
    }
    const range = dayKey(req.startDate) === dayKey(req.endDate) ? dayKey(req.startDate) : `${dayKey(req.startDate)} – ${dayKey(req.endDate)}`;
    await this.notifications.notify(req.userId, {
      type: 'wfh.approved',
      title: 'Work-from-home approved',
      message: `Your WFH request for ${range} was approved. Punch in as usual — the day is recorded as WFH.`,
      link: '/attendance',
    });
    return updated;
  }

  async rejectWfh(id: string, actorId: string, note?: string) {
    const req = await this.prisma.wfhRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('WFH request not found');
    if (req.organizationId && req.organizationId !== await this.orgOf(actorId)) throw new NotFoundException('WFH request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Only a pending request can be rejected.');
    if (req.userId === actorId) throw new ForbiddenException('You cannot review your own WFH request.');
    const updated = await this.prisma.wfhRequest.update({
      where: { id }, data: { status: 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: { user: this.regUserSelect },
    });
    const range = dayKey(req.startDate) === dayKey(req.endDate) ? dayKey(req.startDate) : `${dayKey(req.startDate)} – ${dayKey(req.endDate)}`;
    await this.notifications.notify(req.userId, {
      type: 'wfh.rejected',
      title: 'Work-from-home rejected',
      message: `Your WFH request for ${range} was not approved${note ? `: ${note}` : '.'}`,
      link: '/attendance',
    });
    return updated;
  }

  async cancelWfh(id: string, actorId: string) {
    const req = await this.prisma.wfhRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('WFH request not found');
    if (req.userId !== actorId) throw new ForbiddenException('You can only cancel your own WFH requests.');
    // An APPROVED future/ongoing WFH can be cancelled too (plans changed — coming to the
    // office). Days already punched keep their recorded mode; later punches derive OFFICE.
    if (!['PENDING', 'APPROVED'].includes(req.status)) throw new BadRequestException('Cannot cancel this request.');
    const wasApproved = req.status === 'APPROVED';
    const updated = await this.prisma.wfhRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    // Approval published a "Working from home" event to the shared calendar — remove it,
    // or the person keeps showing as WFH after cancelling.
    if (wasApproved && req.organizationId) {
      await this.prisma.calendarEvent.deleteMany({
        where: { organizationId: req.organizationId, type: 'WFH', createdBy: req.userId, startDate: req.startDate, endDate: req.endDate },
      });
    }
    return updated;
  }

  /**
   * Merged month view — explicit attendance wins, then approved leave, holiday,
   * weekend, then "present" inferred from a logged timesheet that day, else absent.
   * This is what links attendance to the rest of the system.
   */
  async getMonth(userId: string, year: number, month: number) {
    if (!Number.isInteger(year) || year < 1970 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('A valid year (1970–9999) and month (1–12) are required.');
    }
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

    type DayCell = { date: string; status: string; workMode?: string; checkIn: Date | null; checkOut: Date | null; totalHours: number | null; isRegularized: boolean; note: string | null };
    const days: DayCell[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, i));
      const k = dayKey(d);
      const wd = d.getUTCDay();
      const ex = byDay.get(k);
      if (ex) {
        days.push({ date: k, status: ex.status, workMode: ex.workMode, checkIn: ex.checkIn, checkOut: ex.checkOut, totalHours: ex.totalHours, isRegularized: ex.isRegularized, note: ex.note });
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
    // A HALF_DAY is half a day present — it must not score as a full day in the rate.
    const presentCredit = count('PRESENT') + 0.5 * count('HALF_DAY');
    const workingDays = days.filter(d => WORKING.includes(d.status)).length;
    // Approved leave must NOT count against attendance rate (it isn't an expected
    // working day). Denominator = working days minus approved-leave days.
    const expectedDays = workingDays - count('ON_LEAVE');
    const summary = {
      present, absent: count('ABSENT'), onLeave: count('ON_LEAVE'), holiday: count('HOLIDAY'),
      weekend: count('WEEKEND'), workingDays, attendanceRate: expectedDays > 0 ? Math.round((presentCredit / expectedDays) * 100) : 0,
      hoursLogged: round(days.reduce((s, d) => s + (d.totalHours ?? 0), 0)),
    };
    return { userId, year, month, days, summary };
  }

  /** Per-user attendance summary across a date range — admin all-users view. */
  async orgSummary(organizationId: string, from: string, to: string) {
    const fromD = parseDayStrict(from, 'from');
    const toD = parseDayStrict(to, 'to');
    if (fromD > toD) throw new BadRequestException('The "from" date must be on or before the "to" date.');
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
      let present = 0, absent = 0, onLeave = 0, holiday = 0, hours = 0, half = 0;
      for (const k of days) {
        const wd = parseDay(k).getUTCDay();
        const ex = attByUserDay.get(`${u.id}|${k}`);
        if (ex) {
          if (ex.status === 'PRESENT' || ex.status === 'HALF_DAY') { present++; if (ex.status === 'HALF_DAY') half++; hours += ex.totalHours ?? 0; }
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
      // down — mirror getMonth, where the denominator excludes leave days. A HALF_DAY
      // scores half a present day in the rate (not a full one).
      const expectedDays = present + absent;
      const presentCredit = present - 0.5 * half;
      return {
        userId: u.id, name: `${u.firstName} ${u.lastName}`.trim(), designation: u.designation ?? undefined,
        present, absent, onLeave, holiday, hoursLogged: round(hours),
        attendanceRate: expectedDays ? Math.round((presentCredit / expectedDays) * 100) : 0,
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
    const start = parseDayStrict(dto.startDate, 'startDate');
    const end = parseDayStrict(dto.endDate, 'endDate');
    if (end < start) throw new BadRequestException('endDate must be on or after startDate');
    // M4: reject leave that is entirely in the past (approval would retroactively debit balance).
    if (end < utcDay(new Date())) throw new BadRequestException('Cannot request leave for dates in the past.');
    if (dto.reason && dto.reason.length > MAX_REASON) throw new BadRequestException('Reason is too long.');
    // A runaway range would loop the business-day counter unbounded and debit an absurd
    // balance — a single leave never spans more than a year.
    if ((end.getTime() - start.getTime()) / 86_400_000 > 366) {
      throw new BadRequestException('A single leave request cannot span more than a year.');
    }
    const organizationId = await this.orgOf(userId);
    // The leave type must be one the org actually offers. Free-text types silently bypassed
    // quota and never showed up in the balance view.
    const type = await this.prisma.leaveType.findFirst({
      where: { organizationId: organizationId ?? undefined, code: dto.leaveType },
    });
    if (!type) throw new BadRequestException(`"${dto.leaveType}" is not a valid leave type.`);
    // M3: only ONE leave can apply to a given day — reject a request that overlaps any
    // existing pending/approved leave (also prevents double-debiting the balance, and
    // stops applying two leave types on the same day).
    const clash = await this.prisma.leaveRequest.findFirst({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (clash) throw new BadRequestException('You already have a leave (pending or approved) on one or more of these days — only one leave can apply to a day.');
    // Count business days only — weekends and holidays do not consume leave balance.
    const numDays = (await this.businessDays(organizationId, start, end)).length;
    if (numDays === 0) throw new BadRequestException('Selected dates contain no working days');
    // Comp-off leave is spent against EARNED credits (approved comp-off claims), not a quota.
    if (dto.leaveType === 'CO') {
      const { available } = await this.compOffBalance(userId);
      if (available < numDays) {
        throw new BadRequestException(`Not enough comp-off credits — you have ${available} day${available === 1 ? '' : 's'} available.`);
      }
    } else if (type.annualQuota > 0) {
      // Enforce the annual quota for regular leave types (CL/SL/EL …). Count both pending
      // and approved days this year so stacked requests can't collectively exceed it.
      const year = new Date().getUTCFullYear();
      const yStart = new Date(Date.UTC(year, 0, 1));
      const yEnd = new Date(Date.UTC(year + 1, 0, 1));
      const usedAgg = await this.prisma.leaveRequest.aggregate({
        where: { userId, leaveType: dto.leaveType, status: { in: ['PENDING', 'APPROVED'] }, startDate: { gte: yStart, lt: yEnd } },
        _sum: { numDays: true },
      });
      const used = usedAgg._sum.numDays ?? 0;
      if (used + numDays > type.annualQuota) {
        const remaining = Math.max(0, type.annualQuota - used);
        throw new BadRequestException(`This exceeds your ${type.name} quota — ${remaining} day${remaining === 1 ? '' : 's'} remaining this year.`);
      }
    }
    const created = await this.prisma.leaveRequest.create({
      data: { userId, organizationId, leaveType: dto.leaveType, startDate: start, endDate: end, numDays, reason: dto.reason ?? null, status: 'PENDING' },
      include: { user: this.userSelect },
    });
    // Route the request to approvers — parity with WFH and comp-off, which both notify.
    const u = (created as { user?: { firstName?: string; lastName?: string } }).user;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'An employee' : 'An employee';
    const range = dayKey(start) === dayKey(end) ? dayKey(start) : `${dayKey(start)} – ${dayKey(end)}`;
    await this.notifications.notify(await this.leaveApprovers(organizationId), {
      type: 'leave.requested',
      title: 'Leave request to review',
      message: `${name} requested ${dto.leaveType} leave (${numDays} day${numDays === 1 ? '' : 's'}) for ${range}.`,
      link: '/attendance',
    });
    return created;
  }

  async approve(id: string, actorId: string, note?: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`Leave request ${id} not found`);
    if (req.organizationId && req.organizationId !== await this.orgOf(actorId)) throw new NotFoundException(`Leave request ${id} not found`);
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
    if (req.organizationId && req.organizationId !== await this.orgOf(actorId)) throw new NotFoundException(`Leave request ${id} not found`);
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
    // Remove generated ON_LEAVE attendance + the shared-calendar event if it was approved,
    // so the person no longer shows as on-leave anywhere after cancelling.
    if (req.status === 'APPROVED') {
      await this.prisma.attendance.deleteMany({ where: { userId: req.userId, status: 'ON_LEAVE', date: { gte: utcDay(req.startDate), lte: utcDay(req.endDate) } } });
      if (req.organizationId) {
        await this.prisma.calendarEvent.deleteMany({
          where: { organizationId: req.organizationId, type: 'LEAVE', createdBy: req.userId, startDate: req.startDate, endDate: req.endDate },
        });
      }
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

  // Comp-off claims route to HR + Managers + Yash (escalation owner) specifically.
  private async compOffApproverIds(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const users = await this.prisma.user.findMany({
      where: {
        organizationId, deletedAt: null, status: 'ACTIVE',
        OR: [
          { userRoles: { some: { role: { name: { in: ['HR', 'Manager'] } } } } },
          { email: ESCALATION_EMAIL },
        ],
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

  async requestCompOff(userId: string, data: { workDate: string; reason: string; hoursWorked?: number; projectRef?: string }) {
    if (!data?.reason?.trim()) throw new BadRequestException('Tell us what you worked on.');
    if (!data?.projectRef?.trim()) throw new BadRequestException('A Project ID (PID) is required.');
    if (data.reason.length > MAX_REASON) throw new BadRequestException('Reason is too long.');
    if (data.projectRef.length > MAX_PID) throw new BadRequestException('Project ID is too long.');
    if (data.hoursWorked != null && (!(data.hoursWorked > 0) || data.hoursWorked > 24)) {
      throw new BadRequestException('Hours worked must be between 0 and 24.');
    }
    const workDate = parseDayStrict(data.workDate, 'workDate');
    if (workDate > utcDay(new Date())) throw new BadRequestException('You can only claim comp-off for a day you have already worked.');
    if ((utcDay(new Date()).getTime() - workDate.getTime()) / 86_400_000 > COMPOFF_MAX_AGE_DAYS) {
      throw new BadRequestException(`Comp-off must be claimed within ${COMPOFF_MAX_AGE_DAYS} days of the day worked.`);
    }
    const organizationId = await this.orgOf(userId);
    if (!(await this.isNonWorkingDay(organizationId, workDate))) {
      throw new BadRequestException('Comp-off is only for working on a weekend or a company holiday.');
    }
    const existing = await this.prisma.compOffRequest.findFirst({ where: { userId, workDate, status: { in: ['PENDING', 'APPROVED'] } } });
    if (existing) throw new BadRequestException('You already have a comp-off claim for this day.');
    const req = await this.prisma.compOffRequest.create({
      data: { userId, organizationId, workDate, reason: data.reason.trim(), projectRef: data.projectRef.trim(), hoursWorked: data.hoursWorked ?? null, status: 'PENDING' },
      include: { user: this.userSelect },
    });
    const u = (req as { user?: { firstName?: string; lastName?: string } }).user;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'An employee';
    // Comp-off routes to HR + Managers + Yash.
    await this.notifications.notify(await this.compOffApproverIds(organizationId), {
      type: 'compoff.requested', title: 'Comp-off to review',
      message: `${name} claims comp-off for working ${dayKey(workDate)} (PID ${req.projectRef}): ${req.reason}`,
      link: '/attendance',
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
    if (req.organizationId && req.organizationId !== await this.orgOf(actorId)) throw new NotFoundException('Comp-off request not found');
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
    if (req.organizationId && req.organizationId !== await this.orgOf(actorId)) throw new NotFoundException('Comp-off request not found');
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
    if (!dto?.name?.trim()) throw new BadRequestException('A holiday name is required.');
    if (dto.name.length > MAX_NAME) throw new BadRequestException('Holiday name is too long.');
    const date = parseDayStrict(dto.date, 'date');
    return this.prisma.holiday.create({
      data: { organizationId: dto.organizationId, name: dto.name.trim(), date, type: dto.type ?? 'PUBLIC', recurring: dto.recurring ?? false },
    });
  }
  removeHoliday(id: string) {
    return this.prisma.holiday.delete({ where: { id } });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
@Controller('attendance')
class AttendanceController {
  constructor(
    private readonly svc: AttendanceService,
    private readonly actor: ActorContextService,
  ) {}

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

  // `mode` in the body is ACCEPTED but IGNORED (older web bundles still send it):
  // workMode is derived server-side from an approved WFH request, never client-chosen.
  @Post('punch')
  punch(@Actor() actorId: string | null, @Body() _body: { mode?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.punch(actorId);
  }

  // ── work-from-home requests ────────────────────────────────────────────────────
  /** Raise a WFH request (from the Leaves section) — goes to HR/Admin for approval. */
  @Post('wfh')
  requestWfh(@Actor() actorId: string | null, @Body() body: { startDate: string; endDate: string; reason: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.requestWfh(actorId, body);
  }

  @Get('wfh/me')
  myWfhRequests(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.myWfhRequests(actorId);
  }

  /** Pending WFH queue for reviewers — HR/Admin only (attendance.manage). */
  @Get('wfh/pending')
  @RequirePermission('attendance.manage')
  pendingWfhRequests(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.pendingWfhRequests(actorId);
  }

  @Post('wfh/:id/approve')
  @RequirePermission('attendance.manage')
  approveWfh(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.approveWfh(id, actorId, body?.note);
  }

  @Post('wfh/:id/reject')
  @RequirePermission('attendance.manage')
  rejectWfh(@Actor() actorId: string | null, @Param('id') id: string, @Body() body: { note?: string }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.rejectWfh(id, actorId, body?.note);
  }

  @Post('wfh/:id/cancel')
  cancelWfh(@Actor() actorId: string | null, @Param('id') id: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.cancelWfh(id, actorId);
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
  async userMonth(@Param('userId') userId: string, @Query('year') year: string, @Query('month') month: string) {
    const y = parseInt(year, 10), m = parseInt(month, 10);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new BadRequestException('year and month are required');
    // The target must be in the caller's own org (no cross-tenant read by path userId).
    await this.svc.assertUserInOrg(userId, await this.actor.requireOrgId());
    return this.svc.getMonth(userId, y, m);
  }

  @Get('org/summary')
  @RequirePermission('attendance.view.organization')
  async orgSummary(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) throw new BadRequestException('from and to are required');
    // Org from the session actor — never a client-supplied query param.
    return this.svc.orgSummary(await this.actor.requireOrgId(), from, to);
  }

  @Post('mark')
  @RequirePermission('attendance.manage')
  mark(@Body() body: { userId: string; date: string; status: string; note?: string }) {
    return this.svc.mark(body);
  }
}

@Controller('leave')
class LeaveController {
  constructor(
    private readonly svc: LeaveService,
    private readonly actor: ActorContextService,
  ) {}

  @Get('requests/me')
  myRequests(@Actor() actorId: string | null, @Query('status') status?: string) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.listForUser(actorId, status);
  }

  @Get('requests/org')
  @RequirePermission('leave.view.organization')
  async orgRequests(@Query('status') status?: string) {
    // Org from the session actor — never a client-supplied query param.
    return this.svc.listForOrg(await this.actor.requireOrgId(), status);
  }

  @Post('requests')
  @RequirePermission('leave.request')
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
  requestCompOff(@Actor() actorId: string | null, @Body() body: { workDate: string; reason: string; hoursWorked?: number; projectRef?: string }) {
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

  // Leave types & holidays are org-public reads (everyone files leave / sees holidays), so
  // they stay open to any authenticated user — but scoped to the caller's OWN org, resolved
  // from the session rather than a client-supplied (and previously unchecked) query param.
  @Get('types')
  async types() {
    return this.svc.listTypes(await this.actor.requireOrgId());
  }

  @Get('holidays')
  async holidays(@Query('year') year?: string) {
    return this.svc.listHolidays(await this.actor.requireOrgId(), year ? parseInt(year, 10) : undefined);
  }

  @Post('holidays')
  @RequirePermission('holiday.manage')
  async createHoliday(@Body() body: { name: string; date: string; type?: string; recurring?: boolean }) {
    // The holiday belongs to the creator's org, taken from the session (not the body).
    return this.svc.createHoliday({ ...body, organizationId: await this.actor.requireOrgId() });
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
