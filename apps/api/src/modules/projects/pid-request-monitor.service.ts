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

type Waiting = { kind: string; title: string; code: string | null; createdAt: Date };

/**
 * One reminder for everything an organisation has waiting — not one per request. A queue of ten
 * would otherwise land ten notifications on every authority every day, and a reminder people learn
 * to dismiss unread reminds nobody. Longest-waiting first; the full list is one click away.
 */
export function reminderDigest(items: Waiting[], now: Date): { title: string; message: string } {
  const days = (d: Date) => Math.max(1, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
  const waited = (d: Date) => { const n = days(d); return `${n} day${n === 1 ? '' : 's'}`; };
  const sorted = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (sorted.length === 1) {
    const r = sorted[0];
    return r.kind === 'CHANGE'
      ? { title: 'PID change still waiting', message: `"${r.title}" (${r.code}) has waited ${waited(r.createdAt)} for a PID change.` }
      : { title: 'PID still waiting', message: `"${r.title}" has waited ${waited(r.createdAt)} for a PID. Any PID authority can assign it.` };
  }
  const shown = sorted.slice(0, 3).map(r => `"${r.title}" (${waited(r.createdAt)}${r.kind === 'CHANGE' ? ', a change' : ''})`);
  const more = sorted.length - shown.length;
  return {
    title: `${sorted.length} clients waiting on a PID`,
    message: `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}. Any PID authority can act on them.`,
  };
}

/**
 * CLIENTS-FLOW (PID rework): nothing waits silently.
 *
 * Once an hour this looks for PID requests — new PIDs and PID changes — that have been open for a
 * day since they were raised or last reminded, and reminds EVERY authority with ONE notification
 * per organisation naming what waits and for how long. Before, a request sat with one person until
 * they happened to look.
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
      const due = open.filter(x => dueForReminder(x, now));
      const byOrg = new Map<string, typeof due>();
      for (const r of due) (byOrg.get(r.organizationId) ?? byOrg.set(r.organizationId, []).get(r.organizationId)!).push(r);
      for (const [organizationId, rows] of byOrg) {
        // One organisation's failure must not silence every organisation after it in the loop.
        try {
          const told = await this.projects.notifyPidAuthorities(organizationId, null, reminderDigest(
            rows.map(r => ({ kind: r.kind, title: r.project.title, code: r.project.code, createdAt: r.createdAt })), now,
          ));
          // An organisation with no PID authority was told nothing; marking the requests reminded
          // would spend today's reminder on a message that reached nobody and leave them silent
          // for another day.
          if (!told) continue;
          await this.prisma.pidRequest.updateMany({
            // Still PENDING: one of these may have been fulfilled between the read and now, and
            // bumping a resolved request's reminder count says it was chased when it was not.
            where: { id: { in: rows.map(r => r.id) }, status: 'PENDING' },
            data: { remindedAt: now, reminderCount: { increment: 1 } },
          });
          reminded += rows.length;
        } catch (e) {
          this.logger.warn(`PID reminder for org ${organizationId} failed: ${String(e)}`);
        }
      }
    } catch (e) {
      this.logger.warn(`PID reminder sweep failed: ${String(e)}`);
    } finally {
      this.running = false;
    }
    return reminded;
  }
}
