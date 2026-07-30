import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Patch, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
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
@Injectable()
export class DailyDigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DailyDigest');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly timesheets: TimesheetsService,
  ) {}

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
      this.prisma.task.count({ where: { deletedAt: null, currentStatus: { type: 'CLOSED' }, updatedAt: { gte: dayStart, lt: dayEnd } } }),
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

  /** Send the digest to every admin who hasn't already got today's (DB-backed dedup). */
  async sendDigests(now = new Date()): Promise<number> {
    const admins = await this.orgAdmins();
    if (!admins.length) return 0;
    const dayStart = startOfIstDay(now);
    const already = await this.prisma.notification.findMany({
      where: { type: 'admin.daily_digest', createdAt: { gte: dayStart }, userId: { in: admins } },
      select: { userId: true },
    });
    const sent = new Set(already.map(n => n.userId));
    const recipients = admins.filter(id => !sent.has(id));
    if (!recipients.length) return 0;
    const { title, message } = this.format(await this.buildReport(now));
    await this.prisma.notification.createMany({
      data: recipients.map(userId => ({ userId, type: 'admin.daily_digest', title, message, link: '/digest' })),
    });
    this.logger.log(`daily digest sent to ${recipients.length} admin(s)`);
    return recipients.length;
  }
}

@Controller('daily-digest')
class DailyDigestController {
  constructor(private readonly svc: DailyDigestService) {}

  /** Manual trigger (for testing / on-demand). Admin only. */
  @Post('send') @RequirePermission('user.manage_access')
  async send() { return { sent: await this.svc.sendDigests() }; }

  /** The detailed report for a day (defaults to today) — powers the digest detail screen. */
  @Get('report') @RequirePermission('user.manage_access')
  async report(@Query('date') date?: string) {
    const now = date ? new Date(`${date.slice(0, 10)}T12:00:00.000Z`) : new Date();
    return this.svc.buildReport(isNaN(now.getTime()) ? new Date() : now);
  }

  /** Read / set the admin-configured send hour (IST). */
  @Get('schedule') @RequirePermission('user.manage_access')
  async getSchedule() { return this.svc.getSchedule(); }

  @Patch('schedule') @RequirePermission('user.manage_access')
  async setSchedule(@Body() body: { hourIst: number }) { return this.svc.setSchedule(Number(body?.hourIst)); }
}

@Module({ imports: [TimesheetsModule], providers: [DailyDigestService], controllers: [DailyDigestController], exports: [DailyDigestService] })
export class DailyDigestModule {}
