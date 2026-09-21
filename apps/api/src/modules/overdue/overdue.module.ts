import {
  Controller, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.module';
import { WorkspaceFlowService } from '../workspace-flow/workspace-flow.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { startOfUtcDay, startOfIstDay } from '../../common/dates';

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
    private readonly flows: WorkspaceFlowService,
  ) {}

  /**
   * Of these people, the ones whose firm is running `flow` right now.
   *
   * WHY PER RECIPIENT. This sweep runs on a timer: there is no request, no actor and no
   * organisation to ask "which flow?" of. The question only has an answer per PERSON — the flow
   * of the firm they belong to — so it is asked once per recipient, against the flow of the
   * project the alert is about. After a switch, the work of the other flow is hidden from them;
   * an alert naming it would point at a task and a client they can no longer open.
   * WorkspaceFlowService caches both halves of the answer, so asking per person is cheap.
   */
  private async inFlow(userIds: string[], flow: string): Promise<string[]> {
    const out: string[] = [];
    for (const id of userIds) if ((await this.flows.flowOfUser(id)) === flow) out.push(id);
    return out;
  }

  onModuleInit() {
    // Skip on replicas that aren't the designated background runner (multi-replica AWS) — set
    // RUN_BACKGROUND_JOBS=false on all but one task to avoid duplicate alerts/digests. Single
    // instance (Contabo) leaves it unset, so the sweep runs as before.
    if (process.env.RUN_BACKGROUND_JOBS === 'false') return;
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
                // workspaceFlow is read only to decide WHO may be told; no message ever names it.
                id: true, title: true, deletedAt: true, workspaceFlow: true,
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
    const today = startOfIstDay(new Date()); // "today" = the IST calendar day (org timezone)
    const tasks = (await this.overdueTasks(today)).filter(t => !t.overdueNotifiedAt);
    if (!tasks.length) return 0;

    const admins = await this.orgAdmins();
    let sent = 0;

    for (const task of tasks) {
      const projects = task.projectTasks.map(pt => pt.project).filter(p => p && !p.deletedAt);
      if (!projects.length) continue; // orphaned/archived — nothing to escalate to
      const assignees = task.assignees.map(a => a.userId);
      const late = daysLate(task.dueDate!, today);
      const lateLabel = late === 1 ? '1 day' : `${late} days`;

      // One alert per flow the task's work sits in, each sent only to the people currently in
      // that flow and naming only that flow's project. In practice a task is filed in one flow
      // and this loop runs once; it is a loop so that the rare task linked into both can never
      // put one flow's client name in front of somebody working in the other.
      let told = false;
      for (const flow of [...new Set(projects.map(p => p.workspaceFlow))]) {
        const inThisFlow = projects.filter(p => p.workspaceFlow === flow);
        const projectTitle = inThisFlow[0].title;
        const managers = [...new Set(inThisFlow.flatMap(p => p.members.map(m => m.userId)))];

        // The person doing the work gets a nudge…
        const nudge = await this.inFlow(assignees, flow);
        if (nudge.length) {
          await this.notifications.notify(nudge, {
            type: 'task.overdue',
            title: 'Task overdue',
            message: `"${task.title}" (${projectTitle}) passed its internal deadline ${lateLabel} ago and is ${task.completionPercentage}% done.`,
          });
          told = true;
        }
        // …and the people accountable for delivery get told, so they can act.
        const oversight = await this.inFlow(
          [...new Set([...managers, ...admins])].filter(uid => !assignees.includes(uid)), flow,
        );
        if (oversight.length) {
          await this.notifications.notify(oversight, {
            type: 'task.overdue',
            title: 'Task overdue — action may be needed',
            message: `"${task.title}" (${projectTitle}) is ${lateLabel} past its internal deadline at ${task.completionPercentage}%. Assignee has not completed it on time.`,
          });
          told = true;
        }
      }

      // A task whose work belongs to NOBODY's current flow — the firm switched away from the flow
      // it was made in — is skipped without being stamped. `overdueNotifiedAt` means "this slip
      // has been announced", and it has not been: nobody who could act on it was told. Left
      // unstamped, it is announced properly the first sweep after the firm switches back, rather
      // than returning as work that silently went overdue while nobody was looking.
      //
      // A task with nobody to tell in ANY flow — no assignee, no manager, no admin — is not a flow
      // question, and is stamped exactly as it always was, so the sweep does not revisit it hourly.
      const anyoneAtAll = assignees.length > 0 || admins.length > 0 || projects.some(p => p.members.length > 0);
      if (anyoneAtAll && !told) continue;

      await this.prisma.task.update({ where: { id: task.id }, data: { overdueNotifiedAt: new Date() } });
      sent++;
    }
    return sent;
  }

  /** Once per UTC day: one summary per manager of everything still overdue they own. */
  private async sendDailyDigests(): Promise<number> {
    const today = startOfIstDay(new Date()); // "today" = the IST calendar day (org timezone)
    const tasks = await this.overdueTasks(today);
    if (!tasks.length) return 0;

    // manager → overdue tasks across the projects they manage
    const byManager = new Map<string, { title: string; project: string; late: number }[]>();
    for (const task of tasks) {
      for (const pt of task.projectTasks) {
        const project = pt.project;
        if (!project || project.deletedAt) continue;
        for (const m of project.members) {
          // Only the projects of the flow the manager's firm is in now — the same per-recipient
          // rule as the alerts above. Managing a matter the firm has switched away from does not
          // earn a daily reminder about work they cannot open, and a digest that is ALL such
          // work is simply not sent.
          if (!(await this.inFlow([m.userId], project.workspaceFlow)).length) continue;
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
