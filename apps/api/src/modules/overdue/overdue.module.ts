import {
  Controller, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.module';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { startOfUtcDay } from '../../common/dates';

function daysLate(due: Date, today: Date): number {
  return Math.max(0, Math.round((today.getTime() - startOfUtcDay(due).getTime()) / 86_400_000));
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const BOOT_DELAY_MS = 30_000;             // let the app settle before the first sweep

/**
 * Watches INTERNAL deadlines and raises alerts when work slips.
 *
 * Per task, the first time it passes its internal deadline while still open:
 *   → the ASSIGNEE is nudged, and the project's MANAGER(s) + org ADMINS are told,
 *     so they can reassign or re-plan.
 * `Task.overdueNotifiedAt` de-duplicates this, so a slip alerts exactly once; moving the
 * deadline into the future clears it (TasksService.update), re-arming a future slip.
 *
 * Once per UTC day, each project manager also receives a DIGEST of everything still
 * overdue across the projects they manage. Digest de-duplication is DB-backed (we look
 * for today's digest notification), so a container restart cannot re-send it.
 *
 * Runs in-process on an interval — the deployment is a single API container, so no
 * distributed scheduler/lock is needed.
 */
@Injectable()
export class OverdueMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OverdueMonitor');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // Delay the first sweep so boot isn't competing with it, then run hourly.
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    setTimeout(() => void this.sweep(), BOOT_DELAY_MS).unref?.();
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass: new-overdue alerts, then (once a day) the per-manager digest. */
  async sweep(): Promise<{ alerted: number; digests: number }> {
    if (this.running) return { alerted: 0, digests: 0 };
    this.running = true;
    try {
      const alerted = await this.alertNewlyOverdue();
      const digests = await this.sendDailyDigests();
      if (alerted || digests) this.logger.log(`overdue sweep: ${alerted} task alert(s), ${digests} digest(s)`);
      return { alerted, digests };
    } catch (err) {
      this.logger.warn(`overdue sweep failed: ${String(err)}`);
      return { alerted: 0, digests: 0 };
    } finally {
      this.running = false;
    }
  }

  /** Every still-open task whose INTERNAL deadline has passed. */
  private overdueTasks(today: Date) {
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        dueDate: { lt: today },
        // "Open" = not in a CLOSED-type workflow status (the system's single completion rule).
        OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
      },
      select: {
        id: true, title: true, dueDate: true, overdueNotifiedAt: true, completionPercentage: true,
        assignees: { select: { userId: true } },
        projectTasks: {
          select: {
            project: {
              select: {
                id: true, title: true, deletedAt: true,
                members: { where: { projectRole: 'MANAGER', isActive: true }, select: { userId: true } },
              },
            },
          },
        },
      },
    });
  }

  /** Org admins: hold BOTH project.approve and user.manage_access (= Admin + Super Admin). */
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

  private async alertNewlyOverdue(): Promise<number> {
    const today = startOfUtcDay(new Date());
    const tasks = (await this.overdueTasks(today)).filter(t => !t.overdueNotifiedAt);
    if (!tasks.length) return 0;

    const admins = await this.orgAdmins();
    let sent = 0;

    for (const task of tasks) {
      const projects = task.projectTasks.map(pt => pt.project).filter(p => p && !p.deletedAt);
      if (!projects.length) continue; // orphaned/archived — nothing to escalate to
      const projectTitle = projects[0].title;
      const managers = [...new Set(projects.flatMap(p => p.members.map(m => m.userId)))];
      const assignees = task.assignees.map(a => a.userId);
      const late = daysLate(task.dueDate!, today);
      const lateLabel = late === 1 ? '1 day' : `${late} days`;

      // The person doing the work gets a nudge…
      await this.notifications.notify(assignees, {
        type: 'task.overdue',
        title: 'Task overdue',
        message: `"${task.title}" (${projectTitle}) passed its internal deadline ${lateLabel} ago and is ${task.completionPercentage}% done.`,
      });
      // …and the people accountable for delivery get told, so they can act.
      const oversight = [...new Set([...managers, ...admins])].filter(uid => !assignees.includes(uid));
      await this.notifications.notify(oversight, {
        type: 'task.overdue',
        title: 'Task overdue — action may be needed',
        message: `"${task.title}" (${projectTitle}) is ${lateLabel} past its internal deadline at ${task.completionPercentage}%. Assignee has not completed it on time.`,
      });

      await this.prisma.task.update({ where: { id: task.id }, data: { overdueNotifiedAt: new Date() } });
      sent++;
    }
    return sent;
  }

  /** Once per UTC day: one summary per manager of everything still overdue they own. */
  private async sendDailyDigests(): Promise<number> {
    const today = startOfUtcDay(new Date());
    const tasks = await this.overdueTasks(today);
    if (!tasks.length) return 0;

    // manager → overdue tasks across the projects they manage
    const byManager = new Map<string, { title: string; project: string; late: number }[]>();
    for (const task of tasks) {
      for (const pt of task.projectTasks) {
        const project = pt.project;
        if (!project || project.deletedAt) continue;
        for (const m of project.members) {
          const arr = byManager.get(m.userId) ?? [];
          arr.push({ title: task.title, project: project.title, late: daysLate(task.dueDate!, today) });
          byManager.set(m.userId, arr);
        }
      }
    }
    if (!byManager.size) return 0;

    // DB-backed dedup: skip anyone who already got today's digest (restart-safe).
    const alreadySent = await this.prisma.notification.findMany({
      where: { type: 'task.overdue_digest', createdAt: { gte: today }, userId: { in: [...byManager.keys()] } },
      select: { userId: true },
    });
    const sentTo = new Set(alreadySent.map(n => n.userId));

    let sent = 0;
    for (const [managerId, items] of byManager) {
      if (sentTo.has(managerId)) continue;
      const worst = items.slice().sort((a, b) => b.late - a.late)[0];
      const n = items.length;
      await this.prisma.notification.create({
        data: {
          userId: managerId,
          type: 'task.overdue_digest',
          title: `${n} overdue task${n === 1 ? '' : 's'} on your projects`,
          message: `Worst: "${worst.title}" (${worst.project}), ${worst.late} day${worst.late === 1 ? '' : 's'} late. Review the team's workload and reassign if needed.`,
        },
      });
      sent++;
    }
    return sent;
  }
}

@Controller('overdue')
class OverdueController {
  constructor(private readonly monitor: OverdueMonitorService) {}

  /** Run the sweep now (the hourly one still runs) — useful after bulk deadline edits. */
  @Post('sweep')
  @RequirePermission('capacity.view')
  sweep() {
    return this.monitor.sweep();
  }
}

@Module({
  controllers: [OverdueController],
  providers: [OverdueMonitorService],
  exports: [OverdueMonitorService],
})
export class OverdueModule {}
