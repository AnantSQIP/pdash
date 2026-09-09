import { BadRequestException, ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { SESSION_CAP_MINUTES } from '../../common/work-time';

export type TimeTrackingMode = 'TIMER' | 'MANUAL';
export const TIME_TRACKING_MODES: TimeTrackingMode[] = ['TIMER', 'MANUAL'];

/** Where a timesheet row came from — see Timesheet.source. */
export const TIMESHEET_SOURCE = {
  /** Filed from a stopwatch: the pause dialog, or the top-up when a task is finished. */
  TIMER: 'TIMER',
  /** Typed in by the person, in either flow. */
  MANUAL: 'MANUAL',
  /** The share of a running clock that Finish files against today. */
  FINISH_TOPUP: 'FINISH_TOPUP',
} as const;

/**
 * How this firm records time, and moving between the two ways of doing it.
 *
 * TIMER  — a stopwatch per task: Start, Pause, Resume, and finishing settles the clock, learns
 *          how long that kind of task takes, and files today's share to the timesheet.
 * MANUAL — no stopwatch anywhere. A task is finished or reopened, and the day's hours are filled
 *          in once against the tasks that were worked on.
 *
 * WHY THIS IS ONE SERVICE AND NOT A FLAG READ IN TEN PLACES
 *
 * The mode decides whether a request is even meaningful — starting a clock in the manual flow is
 * not a thing that can half-work. Every guard therefore has to ask the same question and get the
 * same answer, including two requests racing an admin's switch. Reading a column in ten places
 * gives ten chances to forget one; the endpoints that must refuse ask here.
 *
 * WHY SWITCHING IS A METHOD AND NOT AN UPDATE
 *
 * Leaving the stopwatch has to close the clocks that are running at that moment. The buttons that
 * would have stopped them are about to disappear, and a session with no end grows until the stale
 * sweep caps it at twelve hours — so an admin flipping a setting would silently manufacture
 * phantom time for everybody who happened to be working. That settlement is not optional, which
 * is why it is not possible to change the mode without it.
 */
@Injectable()
export class TimeModeService {
  /**
   * Short-lived cache. The mode changes perhaps twice in a firm's life and is asked on nearly
   * every task request, but a stale answer must not outlive the switch by long — a few seconds of
   * a closing window is tolerable, minutes are not.
   */
  private readonly cache = new Map<string, { mode: TimeTrackingMode; at: number }>();
  private static readonly TTL_MS = 5_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  async modeOf(organizationId: string): Promise<TimeTrackingMode> {
    const hit = this.cache.get(organizationId);
    if (hit && Date.now() - hit.at < TimeModeService.TTL_MS) return hit.mode;
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timeTrackingMode: true },
    });
    // An unknown value means somebody wrote to the column by hand. Falling back to TIMER keeps a
    // working product rather than an org that cannot record time at all.
    const mode: TimeTrackingMode = org?.timeTrackingMode === 'MANUAL' ? 'MANUAL' : 'TIMER';
    this.cache.set(organizationId, { mode, at: Date.now() });
    return mode;
  }

  async isTimer(organizationId: string): Promise<boolean> {
    return (await this.modeOf(organizationId)) === 'TIMER';
  }

  /**
   * Refuse a stopwatch action when the firm does not use one.
   *
   * Said plainly and without blame: the person did nothing wrong, their organisation simply
   * records time a different way now, and the screen they were on is about to agree.
   */
  async assertTimerFlow(organizationId: string): Promise<void> {
    if (await this.isTimer(organizationId)) return;
    throw new ForbiddenException(
      'This organisation records time by filling in the day, not with a timer. Finish the task when it is done, and log your hours from My Tasks.',
    );
  }

  /**
   * Change the flow.
   *
   * Returns what the change had to tidy up, because "we switched and everyone's timers vanished"
   * is a thing people notice and then ask about.
   */
  async switchMode(
    organizationId: string,
    toMode: TimeTrackingMode,
    changedBy: string,
    note?: string,
  ): Promise<{ from: TimeTrackingMode; to: TimeTrackingMode; timersClosed: number; minutesClosed: number; changed: boolean }> {
    if (!TIME_TRACKING_MODES.includes(toMode)) {
      throw new BadRequestException('Time can be recorded either with a timer (TIMER) or by filling in the day (MANUAL).');
    }
    const from = await this.modeOf(organizationId);
    if (from === toMode) {
      // Not an error — an admin confirming the mode it is already in has got what they asked for.
      return { from, to: toMode, timersClosed: 0, minutesClosed: 0, changed: false };
    }

    const now = new Date();
    let timersClosed = 0;
    let minutesClosed = 0;

    const result = await this.prisma.$transaction(async tx => {
      // Leaving the stopwatch: stop everything still running, and KEEP the minutes. Discarding
      // them would delete work people had actually done; leaving them open would let a session
      // grow until the stale sweep capped it at twelve hours, inventing time nobody worked.
      if (from === 'TIMER') {
        const running = await tx.taskWorkSession.findMany({
          where: { endedAt: null, user: { organizationId } },
          select: { id: true, startedAt: true },
        });
        for (const s of running) {
          const minutes = Math.min(
            SESSION_CAP_MINUTES,
            Math.max(0, Math.round((now.getTime() - s.startedAt.getTime()) / 60_000)),
          );
          await tx.taskWorkSession.update({ where: { id: s.id }, data: { endedAt: now, minutes } });
          timersClosed++;
          minutesClosed += minutes;
        }
      }

      await tx.organization.update({ where: { id: organizationId }, data: { timeTrackingMode: toMode } });
      return tx.timeTrackingModeChange.create({
        data: {
          organizationId, fromMode: from, toMode, changedBy,
          note: note?.trim() || null, timersClosed, minutesClosed,
        },
      });
    });

    // Drop the cache immediately rather than waiting out the TTL: the admin who just switched
    // will reload the page within the second and must not be shown the flow they just left.
    this.cache.delete(organizationId);

    await this.events.emit({
      action: 'org.time_mode_changed',
      entityType: 'ORGANIZATION',
      entityId: organizationId,
      organizationId,
      oldValue: { mode: from },
      newValue: { mode: toMode },
      metadata: { timersClosed, minutesClosed, changeId: result.id },
    });

    return { from, to: toMode, timersClosed, minutesClosed, changed: true };
  }

  /** Every switch this firm has made, newest first — how a report over an old window is read. */
  async history(organizationId: string, limit = 50) {
    return this.prisma.timeTrackingModeChange.findMany({
      where: { organizationId },
      orderBy: { changedAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }
}

@Global()
@Module({
  providers: [TimeModeService],
  exports: [TimeModeService],
})
export class TimeModeModule {}
