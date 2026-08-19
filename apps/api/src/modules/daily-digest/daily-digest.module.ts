import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Patch, Post, Query,
} from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionService } from '../permissions/permission.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { getActorId } from '../../common/context/request-context';
import { startOfIstDay } from '../../common/dates';
import { TimesheetsModule } from '../timesheets/timesheets.module';
import { TimesheetsService } from '../timesheets/timesheets.service';

const SWEEP_INTERVAL_MS = 30 * 60 * 1000; // check twice an hour
const BOOT_DELAY_MS = 45_000;
const SEND_HOUR_IST = 22;                 // 10pm IST

/** The current hour (0–23) in IST. */
function istHour(): number {
  return new Date(Date.now() + 5.5 * 3_600_000).getUTCHours();
}

/**
 * Daily digest for admins. Once a day, at 10pm IST, every org admin receives ONE notification
 * summarising the day: projects created / completed, deadlines met, tasks completed, and what is
 * overdue — so they can act quickly. DB-backed dedup (one 'admin.daily_digest' per admin per IST
 * day) makes it restart-safe and prevents a double-send if the sweep runs twice in the window.
 *
 * Single in-process interval — the deployment is one API container. Set RUN_BACKGROUND_JOBS=false
 * on all but one replica (multi-replica AWS) to avoid duplicates.
 */
/** What a digest send actually did — enough for the UI to explain a zero. */
export type DigestSendResult = { sent: number; admins: number; alreadySentToday: number };

@Injectable()
export class DailyDigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DailyDigest');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly timesheets: TimesheetsService,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * The Daily Digest module is Super-Admin only. It aggregates the whole organisation — every
   * project, every person's hours, every deadline — so it is gated on the ROLE rather than on a
   * permission code an admin might also hold. Checked explicitly (no new permission, no regrant).
   */
  async assertSuperAdmin(): Promise<void> {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const eff = await this.permissions.getEffectivePermissions(actorId);
    if (!eff.isSuperAdmin) throw new ForbiddenException('The daily digest is available to Super Admins only.');
  }

  onModuleInit() {
    if (process.env.RUN_BACKGROUND_JOBS === 'false') return;
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS);
    setTimeout(() => void this.tick(), BOOT_DELAY_MS).unref?.();
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** The admin-configured send hour (IST) for the org; falls back to the 10pm default. */
  async configuredHour(): Promise<number> {
    const org = await this.prisma.organization.findFirst({ select: { digestHourIst: true } });
    const h = org?.digestHourIst;
    return Number.isInteger(h) && h! >= 0 && h! <= 23 ? h! : SEND_HOUR_IST;
  }

  async getSchedule(): Promise<{ hourIst: number }> { return { hourIst: await this.configuredHour() }; }

  async setSchedule(hourIst: number): Promise<{ hourIst: number }> {
    if (!Number.isInteger(hourIst) || hourIst < 0 || hourIst > 23) {
      throw new BadRequestException('The digest hour must be a whole number between 0 and 23 (IST).');
    }
    const org = await this.prisma.organization.findFirst({ select: { id: true } });
    if (org) await this.prisma.organization.update({ where: { id: org.id }, data: { digestHourIst: hourIst } });
    return { hourIst };
  }

  /** Fire the digest only in the admin-configured IST hour (and only once per day, via DB dedup). */
  private async tick(): Promise<void> {
    if (this.running) return;
    if (istHour() !== (await this.configuredHour())) return;
    this.running = true;
    try {
      await this.sendDigests();
      await this.sendTimesheetReminders();
    }
    catch (e) { this.logger.warn(`digest failed: ${String(e)}`); }
    finally { this.running = false; }
  }

  /** Remind anyone who has left a required day incomplete in the last 2 weeks to fill it in.
   *  One reminder per person per IST day (DB-backed dedup). */
  async sendTimesheetReminders(now = new Date()): Promise<number> {
    const dayStart = startOfIstDay(now);
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true },
    });
    const alreadySent = new Set((await this.prisma.notification.findMany({
      where: { type: 'timesheet.incomplete', createdAt: { gte: dayStart }, userId: { in: users.map(u => u.id) } },
      select: { userId: true },
    })).map(n => n.userId));

    let sent = 0;
    for (const u of users) {
      if (alreadySent.has(u.id)) continue;
      const missing = await this.timesheets.incompleteRecentDays(u.id, 14);
      if (!missing.length) continue;
      const n = missing.length;
      await this.prisma.notification.create({
        data: {
          userId: u.id, type: 'timesheet.incomplete', link: '/timesheets',
          title: `${n} day${n === 1 ? '' : 's'} of timesheets not filled`,
          message: `You have ${n} working day${n === 1 ? '' : 's'} in the last 2 weeks with incomplete hours (${missing.slice(0, 5).join(', ')}${n > 5 ? '…' : ''}). Please fill them in.`,
        },
      });
      sent++;
    }
    if (sent) this.logger.log(`timesheet reminders sent to ${sent} user(s)`);
    return sent;
  }

  /** Org admins = holders of BOTH project.approve AND user.manage_access (Admin + Super Admin). */
  private async orgAdmins(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        deletedAt: null, status: 'ACTIVE',
        AND: [
          { userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'project.approve' } } } } } } },
          { userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'user.manage_access' } } } } } } },
        ],
      },
      select: { id: true },
    });
    return admins.map(a => a.id);
  }

  /** Build the day's numbers. Single-org deployment → aggregate across all live data. */
  async buildReport(now = new Date()) {
    const dayStart = startOfIstDay(now);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const [createdToday, completedToday, tasksClosedToday, overdueTasks, dueTodayOpen, activeProjects] = await Promise.all([
      this.prisma.project.findMany({ where: { deletedAt: null, createdAt: { gte: dayStart, lt: dayEnd } }, select: { title: true, code: true } }),
      this.prisma.project.findMany({ where: { deletedAt: null, completedAt: { gte: dayStart, lt: dayEnd } }, select: { title: true, code: true } }),
      // "Closed today" means finished today, not edited today. Windowed on completedAt so an old
      // task someone tidied up does not appear in tonight's digest as new work.
      this.prisma.task.count({ where: { deletedAt: null, currentStatus: { type: 'CLOSED' }, completedAt: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.task.findMany({
        where: { deletedAt: null, dueDate: { lt: dayStart }, OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }] },
        select: { title: true, dueDate: true }, orderBy: { dueDate: 'asc' }, take: 500,
      }),
      // Deadlines DUE today that are already closed = met on time.
      this.prisma.task.count({ where: { deletedAt: null, dueDate: { gte: dayStart, lt: dayEnd }, currentStatus: { type: 'CLOSED' } } }),
      this.prisma.project.count({ where: { deletedAt: null, projectPhase: 'ACTIVE' } }),
    ]);
    return {
      date: dayStart.toISOString().slice(0, 10),
      projectsCreated: createdToday, projectsCompleted: completedToday,
      tasksCompleted: tasksClosedToday, deadlinesMetToday: dueTodayOpen,
      overdueCount: overdueTasks.length, overdueSample: overdueTasks.slice(0, 50),
      activeProjects,
    };
  }

  // ── Deep report (the Daily Digest module) ─────────────────────────────────────
  // The notification digest is a summary; this is the thing behind it. Every number resolves to
  // the actual rows, and every row carries the ids the UI needs to link straight through to the
  // project, the task and the person. Nothing here is a count without its evidence.

  /** How far ahead the "coming up" panel looks, counted in WORKING days (weekends skipped). */
  private static readonly LOOKAHEAD_WORKING_DAYS = 5;

  /** The next N working days starting from `from` (inclusive), skipping weekends and holidays. */
  private async workingDaysFrom(from: Date, count: number): Promise<Date[]> {
    const horizon = new Date(from.getTime() + (count * 3 + 14) * 86_400_000); // generous scan window
    const holidays = await this.prisma.holiday.findMany({
      where: { date: { gte: from, lte: horizon } }, select: { date: true },
    });
    const holidaySet = new Set(holidays.map(h => h.date.toISOString().slice(0, 10)));
    const out: Date[] = [];
    for (let d = new Date(from); out.length < count && d <= horizon; d = new Date(d.getTime() + 86_400_000)) {
      const wd = d.getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (holidaySet.has(d.toISOString().slice(0, 10))) continue;
      out.push(new Date(d));
    }
    return out;
  }

  /** Everything the digest screen needs for one IST day, fully linked and drillable. */
  async buildDetail(dateStr?: string) {
    const base = dateStr ? new Date(`${dateStr.slice(0, 10)}T12:00:00.000Z`) : new Date();
    if (isNaN(base.getTime())) throw new BadRequestException('A valid date is required.');
    const dayStart = startOfIstDay(base);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const today = startOfIstDay(new Date());

    // The lookahead always runs from TODAY — "what is coming up" is a question about now, not
    // about the historical day someone happens to be reading.
    const workingDays = await this.workingDaysFrom(today, DailyDigestService.LOOKAHEAD_WORKING_DAYS);
    const lookaheadEnd = workingDays.length
      ? new Date(workingDays[workingDays.length - 1].getTime() + 86_400_000)
      : new Date(today.getTime() + 86_400_000);

    const projectSelect = {
      id: true, code: true, roundSeq: true, title: true, projectType: true, projectPhase: true, priority: true,
      startDate: true, dueDate: true, clientDueDate: true, completionPercentage: true,
      completedAt: true, clientDeliveryDate: true, workingHours: true, actualHours: true,
      client: { select: { name: true, code: true } },
      members: {
        where: { isActive: true },
        select: { projectRole: true, user: { select: { id: true, firstName: true, lastName: true } } },
      },
      _count: { select: { projectTasks: true } },
    } as const;

    const taskSelect = {
      id: true, title: true, dueDate: true, priority: true, estimatedHours: true, actualHours: true,
      currentStatus: { select: { name: true, type: true } },
      assignees: { select: { estimatedHours: true, dueDate: true, role: true, user: { select: { id: true, firstName: true, lastName: true } } } },
      projectTasks: { select: { project: { select: { id: true, code: true, roundSeq: true, title: true, projectType: true, completionPercentage: true } } } },
    } as const;

    const [createdProjects, completedProjects, tasksClosed, deadlinesMet, overdueTasks, upcomingTasks, upcomingProjects, hoursRows, activeProjects] =
      await Promise.all([
        this.prisma.project.findMany({ where: { deletedAt: null, createdAt: { gte: dayStart, lt: dayEnd } }, select: projectSelect }),
        this.prisma.project.findMany({ where: { deletedAt: null, completedAt: { gte: dayStart, lt: dayEnd } }, select: projectSelect }),
        this.prisma.task.findMany({
          where: { deletedAt: null, currentStatus: { type: 'CLOSED' }, completedAt: { gte: dayStart, lt: dayEnd } },
          select: { ...taskSelect, updatedAt: true, completedAt: true }, take: 500,
        }),
        this.prisma.task.findMany({
          where: { deletedAt: null, dueDate: { gte: dayStart, lt: dayEnd }, currentStatus: { type: 'CLOSED' } },
          select: taskSelect, take: 500,
        }),
        this.prisma.task.findMany({
          where: { deletedAt: null, dueDate: { lt: dayStart }, OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }] },
          select: taskSelect, orderBy: { dueDate: 'asc' }, take: 500,
        }),
        // Coming up: still-open work due inside the next N WORKING days.
        this.prisma.task.findMany({
          where: {
            deletedAt: null, dueDate: { gte: today, lt: lookaheadEnd },
            OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
          },
          select: taskSelect, orderBy: { dueDate: 'asc' }, take: 500,
        }),
        this.prisma.project.findMany({
          where: { deletedAt: null, projectPhase: { in: ['ACTIVE', 'ON_HOLD', 'PLANNING'] }, dueDate: { gte: today, lt: lookaheadEnd } },
          select: projectSelect, orderBy: { dueDate: 'asc' },
        }),
        // Who worked, and on what, that day — the "working hours" side of the picture.
        this.prisma.timesheet.findMany({
          where: { deletedAt: null, date: { gte: dayStart, lt: dayEnd } },
          select: {
            hoursLogged: true, billable: true, notes: true,
            user: { select: { id: true, firstName: true, lastName: true, designation: true } },
            project: { select: { id: true, code: true, roundSeq: true, title: true } },
            task: { select: { id: true, title: true } },
          },
        }),
        this.prisma.project.count({ where: { deletedAt: null, projectPhase: 'ACTIVE' } }),
      ]);

    const person = (u: { id: string; firstName: string | null; lastName: string | null }) =>
      ({ id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Unknown' });

    const shapeProject = (p: any) => {
      const managers = (p.members ?? []).filter((m: any) => m.projectRole === 'PM' || m.projectRole === 'MANAGER');
      return {
        id: p.id, pid: p.code ?? null, roundSeq: p.roundSeq, title: p.title, type: p.projectType ?? null,
        phase: p.projectPhase, priority: p.priority,
        client: p.client?.name ?? p.client?.code ?? null,
        startDate: p.startDate, dueDate: p.dueDate, clientDueDate: p.clientDueDate,
        clientDeliveryDate: p.clientDeliveryDate ?? null,
        workingHours: p.workingHours ?? null, actualHours: p.actualHours ?? null,
        completedAt: p.completedAt ?? null,
        progress: p.completionPercentage, taskCount: p._count?.projectTasks ?? 0,
        managers: managers.map((m: any) => person(m.user)),
        members: (p.members ?? []).map((m: any) => ({ ...person(m.user), role: m.projectRole ?? 'MEMBER' })),
      };
    };

    const shapeTask = (t: any) => {
      const proj = t.projectTasks?.[0]?.project ?? null;
      const due = t.dueDate ? new Date(t.dueDate) : null;
      return {
        id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority,
        status: t.currentStatus?.name ?? null,
        estimatedHours: t.estimatedHours ?? null, actualHours: t.actualHours ?? null,
        daysOverdue: due && due < dayStart ? Math.round((dayStart.getTime() - due.getTime()) / 86_400_000) : 0,
        project: proj ? { id: proj.id, pid: proj.code ?? null, roundSeq: proj.roundSeq, title: proj.title, type: proj.projectType ?? null, progress: proj.completionPercentage } : null,
        assignees: (t.assignees ?? []).map((a: any) => ({
          ...person(a.user), role: a.role ?? 'MEMBER',
          estimatedHours: a.estimatedHours ?? null, dueDate: a.dueDate ?? null,
        })),
      };
    };

    // Hours logged that day, rolled up per person and kept per entry for the drill-down.
    const byPerson = new Map<string, { id: string; name: string; designation: string | null; hours: number; billableHours: number; entries: any[] }>();
    for (const h of hoursRows) {
      const key = h.user.id;
      const row = byPerson.get(key) ?? {
        id: h.user.id, name: `${h.user.firstName ?? ''} ${h.user.lastName ?? ''}`.trim(),
        designation: h.user.designation ?? null, hours: 0, billableHours: 0, entries: [],
      };
      row.hours += h.hoursLogged;
      if (h.billable) row.billableHours += h.hoursLogged;
      row.entries.push({
        hours: h.hoursLogged, billable: h.billable, notes: h.notes ?? null,
        project: h.project ? { id: h.project.id, pid: h.project.code ?? null, roundSeq: h.project.roundSeq, title: h.project.title } : null,
        task: h.task ? { id: h.task.id, title: h.task.title } : null,
      });
      byPerson.set(key, row);
    }
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const people = [...byPerson.values()]
      .map(p => ({ ...p, hours: r1(p.hours), billableHours: r1(p.billableHours) }))
      .sort((a, b) => b.hours - a.hours);

    // Group the lookahead BY DAY so "which deadlines are coming" is answered day by day.
    const upcomingByDay = workingDays.map(d => {
      const k = d.toISOString().slice(0, 10);
      const sameDay = (v: Date | null) => !!v && new Date(v).toISOString().slice(0, 10) === k;
      return {
        date: k,
        tasks: upcomingTasks.filter(t => sameDay(t.dueDate)).map(shapeTask),
        projects: upcomingProjects.filter(p => sameDay(p.dueDate)).map(shapeProject),
      };
    });

    return {
      date: dayStart.toISOString().slice(0, 10),
      lookaheadDays: workingDays.map(d => d.toISOString().slice(0, 10)),
      projectsCreated: createdProjects.map(shapeProject),
      projectsCompleted: completedProjects.map(shapeProject),
      tasksCompleted: tasksClosed.map(shapeTask),
      deadlinesMet: deadlinesMet.map(shapeTask),
      overdue: overdueTasks.map(shapeTask),
      upcoming: upcomingByDay,
      upcomingTotal: upcomingByDay.reduce((n, d) => n + d.tasks.length + d.projects.length, 0),
      hoursByPerson: people,
      totals: {
        hoursLogged: r1(people.reduce((n, p) => n + p.hours, 0)),
        billableHours: r1(people.reduce((n, p) => n + p.billableHours, 0)),
        peopleWhoLogged: people.length,
        activeProjects,
      },
    };
  }

  private format(r: Awaited<ReturnType<DailyDigestService['buildReport']>>): { title: string; message: string } {
    const lines = [
      `Daily report — ${r.date}`,
      ``,
      `• Projects created: ${r.projectsCreated.length}${r.projectsCreated.length ? ' — ' + r.projectsCreated.map(p => `${p.code ?? 'PID-pending'} ${p.title}`).slice(0, 6).join('; ') : ''}`,
      `• Projects completed: ${r.projectsCompleted.length}${r.projectsCompleted.length ? ' — ' + r.projectsCompleted.map(p => `${p.code ?? ''} ${p.title}`).slice(0, 6).join('; ') : ''}`,
      `• Tasks completed today: ${r.tasksCompleted}`,
      `• Deadlines met today: ${r.deadlinesMetToday}`,
      `• Overdue tasks: ${r.overdueCount}${r.overdueCount ? ' — ' + r.overdueSample.map(t => t.title).slice(0, 5).join('; ') + (r.overdueCount > 5 ? ` (+${r.overdueCount - 5} more)` : '') : ''}`,
      `• Active projects: ${r.activeProjects}`,
    ];
    return { title: `Daily report — ${r.projectsCompleted.length} completed · ${r.overdueCount} overdue`, message: lines.join('\n') };
  }

  /**
   * Send the digest to every admin who hasn't already got today's.
   *
   * The daily dedup exists so the half-hourly tick cannot post the same digest twice. It must
   * NOT apply when a human presses "Send now": pressing a button and being told "sent to 0
   * admin(s)" — with no way to tell whether nobody qualifies or everyone already had it — is
   * indistinguishable from the feature being broken. So `force` re-sends, and the result says
   * how many admins there were as well as how many were written.
   */
  async sendDigests(now = new Date(), opts: { force?: boolean } = {}): Promise<DigestSendResult> {
    const admins = await this.orgAdmins();
    if (!admins.length) return { sent: 0, admins: 0, alreadySentToday: 0 };
    const dayStart = startOfIstDay(now);
    const already = await this.prisma.notification.findMany({
      where: { type: 'admin.daily_digest', createdAt: { gte: dayStart }, userId: { in: admins } },
      select: { userId: true },
    });
    const sent = new Set(already.map(n => n.userId));
    const recipients = opts.force ? admins : admins.filter(id => !sent.has(id));
    if (!recipients.length) return { sent: 0, admins: admins.length, alreadySentToday: sent.size };
    const { title, message } = this.format(await this.buildReport(now));
    await this.prisma.notification.createMany({
      data: recipients.map(userId => ({ userId, type: 'admin.daily_digest', title, message, link: '/digest' })),
    });
    this.logger.log(`daily digest sent to ${recipients.length} admin(s)`);
    return { sent: recipients.length, admins: admins.length, alreadySentToday: sent.size };
  }
}

@Controller('daily-digest')
class DailyDigestController {
  constructor(private readonly svc: DailyDigestService) {}

  /** Manual trigger (for testing / on-demand). Admin only. */
  @Post('send') @RequirePermission('user.manage_access')
  async send() {
    await this.svc.assertSuperAdmin();
    // Pressed by a person, so it always sends — the dedup is there for the timer, not for them.
    return this.svc.sendDigests(new Date(), { force: true });
  }

  /** The detailed report for a day (defaults to today) — powers the digest detail screen. */
  @Get('report') @RequirePermission('user.manage_access')
  async report(@Query('date') date?: string) {
    await this.svc.assertSuperAdmin();
    const now = date ? new Date(`${date.slice(0, 10)}T12:00:00.000Z`) : new Date();
    return this.svc.buildReport(isNaN(now.getTime()) ? new Date() : now);
  }

  /** The DEEP report — every number resolved to its rows, with ids so the UI can link through,
   *  plus the next 5 working days of deadlines. Powers the Daily Digest module. */
  @Get('detail') @RequirePermission('user.manage_access')
  async detail(@Query('date') date?: string) {
    await this.svc.assertSuperAdmin();
    return this.svc.buildDetail(date);
  }

  /** Read / set the admin-configured send hour (IST). */
  @Get('schedule') @RequirePermission('user.manage_access')
  async getSchedule() { await this.svc.assertSuperAdmin(); return this.svc.getSchedule(); }

  @Patch('schedule') @RequirePermission('user.manage_access')
  async setSchedule(@Body() body: { hourIst: number }) {
    await this.svc.assertSuperAdmin();
    return this.svc.setSchedule(Number(body?.hourIst));
  }
}

@Module({ imports: [TimesheetsModule, PermissionsModule], providers: [DailyDigestService], controllers: [DailyDigestController], exports: [DailyDigestService] })
export class DailyDigestModule {}
