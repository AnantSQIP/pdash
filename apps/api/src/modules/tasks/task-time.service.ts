import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';
import { normaliseTitle, elapsedMinutes, expectedHoursFrom } from './task-standards';

/**
 * Timing a task, and learning how long that kind of task takes.
 *
 * Everything here exists to take work off the person doing the work. Closing a task and
 * recording the time used to be two errands in two modules; here it is Start, Stop, confirm.
 *
 * The figure that feeds the average is the one the person confirms on closing, NOT the raw
 * timer. A timer left running overnight would otherwise poison the expectation for every
 * future task of that kind, and no statistical trimming reads intent as well as the person
 * who did the work. The timer proposes; the person disposes.
 */

/**
 * A timer nobody stopped. Somebody starts a task at five, goes home, comes back on Monday:
 * with no ceiling the suggestion on closing reads four hundred hours. Twelve is comfortably
 * longer than the 9-to-6 day and short enough that a forgotten timer cannot propose a number
 * nobody would type.
 */
const MAX_SESSION_MINUTES = 12 * 60;

/**
 * Below this a completion measures nothing and is not counted as a sample. A task closed at
 * zero hours says nothing about how long that kind of work takes; letting it in would drag
 * every future expectation down while carrying no information.
 */
const MIN_SAMPLE_MINUTES = 1;

@Injectable()
export class TaskTimeService {
  constructor(private readonly prisma: PrismaService) {}

  private actor(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  /** A task the actor may work on: it exists, is live, and is assigned to them. */
  private async assertMine(taskId: string, userId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true, title: true, actualHours: true,
        standardKey: true, standardMinutes: true,
        completedAt: true, startedAt: true, reopenedCount: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    if (!task.assignees.some(a => a.userId === userId)) {
      throw new ForbiddenException('You can only time a task that is assigned to you.');
    }
    return task;
  }

  private async orgOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    if (!u) throw new NotFoundException('User not found.');
    return u.organizationId;
  }

  /**
   * Close any session clearly left running, capped. Called before anything reads or writes a
   * person's sessions, so a forgotten timer is bounded at the first opportunity.
   */
  private async reconcileStale(userId: string): Promise<number> {
    const cutoff = new Date(Date.now() - MAX_SESSION_MINUTES * 60_000);
    const stale = await this.prisma.taskWorkSession.findMany({
      where: { userId, endedAt: null, startedAt: { lt: cutoff } },
      select: { id: true, startedAt: true },
    });
    for (const s of stale) {
      await this.prisma.taskWorkSession.update({
        where: { id: s.id },
        data: {
          endedAt: new Date(s.startedAt.getTime() + MAX_SESSION_MINUTES * 60_000),
          minutes: MAX_SESSION_MINUTES,
        },
      });
    }
    return stale.length;
  }

  /** The session this person currently has running, if any. */
  async running(userId = this.actor()) {
    await this.reconcileStale(userId);
    return this.prisma.taskWorkSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { id: true, taskId: true, startedAt: true, task: { select: { id: true, title: true } } },
    });
  }

  /**
   * Start work on a task.
   *
   * Idempotent: pressing Start on a task already running returns the session in progress
   * rather than opening a second one. Any session on a DIFFERENT task is stopped first — a
   * person does one thing at a time, and having to remember to stop the last task is exactly
   * the errand this is meant to remove.
   */
  async start(taskId: string) {
    const userId = this.actor();
    await this.assertMine(taskId, userId);
    await this.reconcileStale(userId);
    const now = new Date();

    return this.prisma.$transaction(async tx => {
      const open = await tx.taskWorkSession.findMany({ where: { userId, endedAt: null } });
      const already = open.find(s => s.taskId === taskId);
      if (already) return { id: already.id, taskId, startedAt: already.startedAt, resumed: true };

      for (const s of open) {
        await tx.taskWorkSession.update({
          where: { id: s.id },
          data: { endedAt: now, minutes: elapsedMinutes(s.startedAt, now) },
        });
      }
      // startedAt records when the task was FIRST picked up, and is never overwritten.
      await tx.task.updateMany({ where: { id: taskId, startedAt: null }, data: { startedAt: now } });
      const created = await tx.taskWorkSession.create({
        data: { taskId, userId, startedAt: now },
        select: { id: true, taskId: true, startedAt: true },
      });
      return { ...created, resumed: false };
    });
  }

  /**
   * Stop the running session on a task.
   *
   * Deliberately does NOT require the task still to be assigned to you. Being unassigned
   * while your timer runs would otherwise leave you holding a session you are not allowed to
   * close, accruing hours nobody can stop.
   */
  async stop(taskId: string) {
    const userId = this.actor();
    await this.reconcileStale(userId);
    const now = new Date();
    const open = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) return { stopped: false, minutes: await this.minutesOn(taskId) };
    await this.prisma.taskWorkSession.update({
      where: { id: open.id },
      data: { endedAt: now, minutes: elapsedMinutes(open.startedAt, now) },
    });
    return { stopped: true, minutes: await this.minutesOn(taskId) };
  }

  /** Total recorded minutes on a task — everyone's sessions, plus any still running. */
  async minutesOn(taskId: string): Promise<number> {
    const sessions = await this.prisma.taskWorkSession.findMany({
      where: { taskId },
      select: { startedAt: true, endedAt: true, minutes: true },
    });
    const now = new Date();
    return sessions.reduce(
      (sum, s) => sum + (s.endedAt
        ? (s.minutes ?? 0)
        : Math.min(MAX_SESSION_MINUTES, elapsedMinutes(s.startedAt, now))),
      0,
    );
  }

  /** What to put in front of the person on closing: the timer's total and the expectation. */
  async closingSummary(taskId: string) {
    const userId = this.actor();
    const task = await this.assertMine(taskId, userId);
    const minutes = await this.minutesOn(taskId);
    const standard = await this.prisma.taskStandard.findUnique({
      where: {
        organizationId_titleKey: {
          organizationId: await this.orgOf(userId),
          titleKey: normaliseTitle(task.title),
        },
      },
    });
    return {
      taskId,
      title: task.title,
      trackedMinutes: minutes,
      /** Pre-fill for the hours box — one decimal is enough to confirm or correct. */
      suggestedHours: Math.round((minutes / 60) * 10) / 10,
      expectedHours: standard?.expectedHours ?? null,
      basedOnCompletions: standard?.completions ?? 0,
      alreadyCounted: task.standardMinutes !== null,
    };
  }

  /**
   * Add a signed change to a standard's running totals, IN THE DATABASE.
   *
   * The arithmetic happens inside the statement rather than being read into memory, changed,
   * and written back. Two tasks of the same kind closing in the same instant would otherwise
   * each read the same totals and each overwrite the other — one completion silently lost,
   * with nothing to show it had happened.
   *
   * expectedHours is recomputed from whatever the totals now are, so it can never disagree
   * with them, and is rounded once, here.
   */
  private async applyDelta(
    tx: any, organizationId: string, titleKey: string, displayTitle: string,
    minutesDelta: number, countDelta: number,
  ) {
    if (!titleKey) return null;   // an untitled task belongs to no standard
    await tx.$executeRaw`
      INSERT INTO "task_standard"
        ("id","organizationId","titleKey","displayTitle","totalMinutes","completions","expectedHours","updatedAt")
      VALUES
        (gen_random_uuid()::text, ${organizationId}, ${titleKey}, ${displayTitle},
         GREATEST(0, ${minutesDelta}::int), GREATEST(0, ${countDelta}::int), NULL, NOW())
      ON CONFLICT ("organizationId","titleKey") DO UPDATE SET
        "totalMinutes" = GREATEST(0, "task_standard"."totalMinutes" + ${minutesDelta}::int),
        "completions"  = GREATEST(0, "task_standard"."completions"  + ${countDelta}::int),
        "updatedAt"    = NOW()
    `;
    const rows: any[] = await tx.$queryRaw`
      UPDATE "task_standard" SET "expectedHours" =
        CASE WHEN "completions" > 0 AND "totalMinutes" > 0
             THEN GREATEST(1, ROUND("totalMinutes"::numeric / "completions" / 60))::int
             ELSE NULL END
      WHERE "organizationId" = ${organizationId} AND "titleKey" = ${titleKey}
      RETURNING "totalMinutes", "completions", "expectedHours"
    `;
    return rows[0] ?? null;
  }

  /**
   * Close a task with the hours it actually took, and fold that into what this kind of task
   * is expected to take.
   *
   * Three shapes, because a task does not always contribute the same way twice:
   *
   *   never counted before      → add the hours, and one sample
   *   counted, same title       → post only the DIFFERENCE, no new sample. One task counts
   *                               once at its final total however often it is reopened.
   *   counted, title CHANGED    → withdraw from the old standard entirely, add to the new.
   *                               Without this the old standard keeps a sample for work that
   *                               no longer carries that name.
   *
   * A close at zero hours counts as no sample at all, and withdraws any earlier one: it
   * measures nothing, and averaging it in would drag the expectation down while telling us
   * nothing about the work.
   */
  async complete(taskId: string, hoursTaken: number, closedStatusId?: string) {
    const userId = this.actor();
    const task = await this.assertMine(taskId, userId);
    if (!Number.isFinite(hoursTaken) || hoursTaken < 0) {
      throw new BadRequestException('Hours must be a number of zero or more.');
    }
    if (hoursTaken > 999) {
      throw new BadRequestException('That is more hours than a task can take — please check the figure.');
    }

    const organizationId = await this.orgOf(userId);
    const newKey = normaliseTitle(task.title);
    const minutes = Math.max(0, Math.round(hoursTaken * 60));
    const counts = minutes >= MIN_SAMPLE_MINUTES && newKey.length > 0;
    const now = new Date();

    return this.prisma.$transaction(async tx => {
      // Stop the clock first so the sessions agree with the figure being recorded.
      const open = await tx.taskWorkSession.findMany({ where: { taskId, endedAt: null } });
      for (const s of open) {
        await tx.taskWorkSession.update({
          where: { id: s.id },
          data: { endedAt: now, minutes: elapsedMinutes(s.startedAt, now) },
        });
      }

      const hadContributed = task.standardKey !== null && task.standardMinutes !== null;
      let result: any = null;

      if (hadContributed && task.standardKey === newKey && counts) {
        result = await this.applyDelta(tx, organizationId, newKey, task.title.trim(),
          minutes - (task.standardMinutes ?? 0), 0);
      } else {
        if (hadContributed) {
          await this.applyDelta(tx, organizationId, task.standardKey!, task.title.trim(),
            -(task.standardMinutes ?? 0), -1);
        }
        if (counts) {
          result = await this.applyDelta(tx, organizationId, newKey, task.title.trim(), minutes, 1);
        }
      }

      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          actualHours: hoursTaken,
          standardKey: counts ? newKey : null,
          standardMinutes: counts ? minutes : null,
          completedAt: now,
          completionPercentage: 100,
          ...(closedStatusId ? { currentWorkflowStatusId: closedStatusId } : {}),
        },
        select: { id: true, actualHours: true, completedAt: true },
      });

      return {
        ...updated,
        expectedHours: result?.expectedHours ?? null,
        basedOnCompletions: result?.completions ?? 0,
        counted: counts,
      };
    });
  }

  /**
   * Reopen a completed task.
   *
   * The earlier contribution is deliberately left in place. The work did happen, and the task
   * replaces its own figure when it closes again — withdrawing here would make the average
   * briefly forget a real piece of work for no benefit.
   */
  async reopen(taskId: string, openStatusId?: string) {
    const userId = this.actor();
    const task = await this.assertMine(taskId, userId);
    if (!task.completedAt) throw new BadRequestException('That task is not closed.');
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        completedAt: null,
        reopenedCount: { increment: 1 },
        completionPercentage: 99,
        ...(openStatusId ? { currentWorkflowStatusId: openStatusId } : {}),
      },
      select: { id: true, reopenedCount: true, completedAt: true },
    });
  }

  /** Every learned standard, most-used first — the evidence behind the expectations. */
  async standards() {
    const organizationId = await this.orgOf(this.actor());
    const rows = await this.prisma.taskStandard.findMany({
      where: { organizationId },
      orderBy: [{ completions: 'desc' }, { displayTitle: 'asc' }],
    });
    return rows.map(r => ({
      title: r.displayTitle,
      expectedHours: r.expectedHours,
      /** Shown so nobody treats a one-sample average as settled fact. */
      completions: r.completions,
      averageHours: expectedHoursFrom(r) ?? null,
      updatedAt: r.updatedAt,
    }));
  }

  /** Withdraw a deleted task's contribution so the average stops counting work off the books. */
  async withdraw(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, standardKey: true, standardMinutes: true, createdBy: true },
    });
    if (!task?.standardKey || task.standardMinutes === null) return;
    const organizationId = await this.orgOf(task.createdBy);
    await this.prisma.$transaction(async tx => {
      await this.applyDelta(tx, organizationId, task.standardKey!, task.title.trim(),
        -(task.standardMinutes ?? 0), -1);
    });
  }
}
