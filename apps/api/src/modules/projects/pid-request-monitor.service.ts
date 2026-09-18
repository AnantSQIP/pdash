import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from './projects.service';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Whether an open PID request is due a reminder: a day has passed since it was raised, or since
 * the last reminder (a nudge from the client's page counts as one). Pure, so it can be tested
 * without a clock or a database — tools/pid-reminder.spec.ts.
 */
export function dueForReminder(r: { createdAt: Date; remindedAt: Date | null }, now: Date): boolean {
  const last = r.remindedAt ?? r.createdAt;
  return now.getTime() - last.getTime() >= DAY_MS;
}

/**
 * CLIENTS-FLOW (PID rework): nothing waits silently.
 *
 * Once an hour this looks for PID requests — new PIDs and PID changes — that have been open for a
 * day since they were raised or last reminded, and reminds EVERY authority, naming the client and
 * how long it has waited. Before, a request sat with one person until they happened to look.
 *
 * Same scheduling contract as the overdue monitor: RUN_BACKGROUND_JOBS=false on every instance
 * but one, so a multi-instance deployment does not remind people twice.
 */
@Injectable()
export class PidRequestMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PidRequestMonitorService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly projects: ProjectsService) {}

  onModuleInit() {
    if (process.env.RUN_BACKGROUND_JOBS === 'false') return;
    this.timer = setInterval(() => void this.sweep(), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let reminded = 0;
    try {
      const open = await this.prisma.pidRequest.findMany({
        where: { status: 'PENDING', project: { deletedAt: null } },
        select: {
          id: true, kind: true, organizationId: true, createdAt: true, remindedAt: true,
          project: { select: { title: true, code: true } },
        },
      });
      for (const r of open.filter(x => dueForReminder(x, now))) {
        const days = Math.max(1, Math.floor((now.getTime() - r.createdAt.getTime()) / DAY_MS));
        const waited = `${days} day${days === 1 ? '' : 's'}`;
        await this.projects.notifyPidAuthorities(r.organizationId, null, {
          title: r.kind === 'CHANGE' ? 'PID change still waiting' : 'PID still waiting',
          message: r.kind === 'CHANGE'
            ? `"${r.project.title}" (${r.project.code}) has waited ${waited} for a PID change.`
            : `"${r.project.title}" has waited ${waited} for a PID. Any PID authority can assign it.`,
        });
        await this.prisma.pidRequest.update({ where: { id: r.id }, data: { remindedAt: now, reminderCount: { increment: 1 } } });
        reminded++;
      }
    } catch (e) {
      this.logger.warn(`PID reminder sweep failed: ${String(e)}`);
    } finally {
      this.running = false;
    }
    return reminded;
  }
}
