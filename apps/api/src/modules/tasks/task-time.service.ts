import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';
import {
  normaliseTitle, elapsedMinutes, postCompletion, withdrawCompletion, expectedHoursFrom,
} from './task-standards';

/**
 * Timing a task, and learning how long that kind of task takes.
 *
 * Everything here exists to remove work from the person doing the work. Before this, closing
 * a task and recording the time were two errands in two modules — twelve interactions and two
 * page loads. Here it is Start, Stop, confirm.
 *
 * The figure the person confirms on closing is what feeds the average, NOT the raw timer.
 * That is deliberate: a timer left running overnight would otherwise poison the expectation
 * for every future task of that kind, and no amount of statistical trimming reads a person's
 * intention as well as the person does. The timer proposes; the human disposes.
 */
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
        id: true, title: true, actualHours: true, standardMinutes: true,
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

  /** The organisation the actor belongs to — standards are kept per organisation. */
  private async orgOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    if (!u) throw new NotFoundException('User not found.');
    return u.organizationId;
  }

  /** The session this person currently has running, if any. */
  async running(userId = this.actor()) {
    return this.prisma.taskWorkSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true, taskId: true, startedAt: true,
        task: { select: { id: true, title: true } },
      },
    });
  }

  /**
   * Start work on a task.
   *
   * Any session already running for this person is stopped first. A person does one thing at
   * a time, and requiring them to remember to stop the last task before starting the next is
   * exactly the kind of errand this is meant to remove — forget once and the previous task
   * silently accrues hours it never took.
   */
  async start(taskId: string) {
    const userId = this.actor();
    await this.assertMine(taskId, userId);
    const now = new Date();

    return this.prisma.$transaction(async tx => {
      const open = await tx.taskWorkSession.findMany({ where: { userId, endedAt: null } });
      for (const s of open) {
        await tx.taskWorkSession.update({
          where: { id: s.id },
          data: { endedAt: now, minutes: elapsedMinutes(s.startedAt, now) },
        });
      }
      // startedAt records when the task was FIRST picked up and is never overwritten.
      await tx.task.updateMany({
        where: { id: taskId, startedAt: null },
        data: { startedAt: now },
      });
      return tx.taskWorkSession.create({
        data: { taskId, userId, startedAt: now },
        select: { id: true, taskId: true, startedAt: true },
      });
    });
  }

  /** Stop the running session on a task. Idempotent — stopping a stopped task is not an error. */
  async stop(taskId: string) {
    const userId = this.actor();
    await this.assertMine(taskId, userId);
    const now = new Date();
    const open = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) return { stopped: false, minutes: await this.minutesOn(taskId, userId) };
    await this.prisma.taskWorkSession.update({
      where: { id: open.id },
      data: { endedAt: now, minutes: elapsedMinutes(open.startedAt, now) },
    });
    return { stopped: true, minutes: await this.minutesOn(taskId, userId) };
  }

  /** Total recorded minutes on a task — everyone's sessions, plus any still running. */
  async minutesOn(taskId: string, _userId?: string): Promise<number> {
    const sessions = await this.prisma.taskWorkSession.findMany({
      where: { taskId },
      select: { startedAt: true, endedAt: true, minutes: true },
    });
    const now = new Date();
    return sessions.reduce(
      (sum, s) => sum + (s.endedAt ? (s.minutes ?? 0) : elapsedMinutes(s.startedAt, now)),
      0,
    );
  }

  /**
   * What to put in front of the person when they close a task: the timer's total, in hours,
   * and the expectation to compare it against.
   */
  async closingSummary(taskId: string) {
    const userId = this.actor();
    const task = await this.assertMine(taskId, userId);
    const minutes = await this.minutesOn(taskId);
    const standard = await this.standardFor(await this.orgOf(userId), task.title);
    return {
      taskId,
      title: task.title,
      trackedMinutes: minutes,
      /** Pre-fill for the hours box. One decimal is enough to confirm or correct. */
      suggestedHours: Math.round((minutes / 60) * 10) / 10,
      expectedHours: standard?.expectedHours ?? null,
      basedOnCompletions: standard?.completions ?? 0,
    };
  }

  private async standardFor(organizationId: string, title: string) {
    return this.prisma.taskStandard.findUnique({
      where: { organizationId_titleKey: { organizationId, titleKey: normaliseTitle(title) } },
    });
  }

  /**
   * Close a task with the hours it actually took, and fold that into what this kind of task
   * is expected to take.
   *
   * `hoursTaken` is the person's confirmed figure. If the task has been completed before —
   * it was reopened — its earlier contribution is replaced rather than added to, so one task
   * counts once, at whatever it finally took.
   */
  async complete(taskId: string, hoursTaken: number, closedStatusId?: string) {
    const userId = this.actor();
    const task = await this.assertMine(taskId, userId);
    if (!Number.isFinite(hoursTaken) || hoursTaken < 0) {
      throw new BadRequestException('Hours must be a number of zero or more.');
    }
    if (hoursTaken > 999) throw new BadRequestException('That is more hours than a task can take — please check the figure.');

    const organizationId = await this.orgOf(userId);
    const titleKey = normaliseTitle(task.title);
    const now = new Date();

    return this.prisma.$transaction(async tx => {
      // Stop the clock first, so the sessions agree with the figure being recorded.
      const open = await tx.taskWorkSession.findMany({ where: { taskId, endedAt: null } });
      for (const s of open) {
        await tx.taskWorkSession.update({
          where: { id: s.id },
          data: { endedAt: now, minutes: elapsedMinutes(s.startedAt, now) },
        });
      }

      const prev = await tx.taskStandard.findUnique({
        where: { organizationId_titleKey: { organizationId, titleKey } },
      });
      const totals = { totalMinutes: prev?.totalMinutes ?? 0, completions: prev?.completions ?? 0 };
      const next = postCompletion(totals, hoursTaken, task.standardMinutes ?? null);

      await tx.taskStandard.upsert({
        where: { organizationId_titleKey: { organizationId, titleKey } },
        create: {
          organizationId, titleKey, displayTitle: task.title.trim(),
          totalMinutes: next.totalMinutes, completions: next.completions, expectedHours: next.expectedHours,
        },
        update: {
          totalMinutes: next.totalMinutes, completions: next.completions, expectedHours: next.expectedHours,
        },
      });

      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          actualHours: hoursTaken,
          standardMinutes: next.contributedMinutes,
          completedAt: now,
          completionPercentage: 100,
          ...(closedStatusId ? { currentWorkflowStatusId: closedStatusId } : {}),
        },
        select: { id: true, actualHours: true, completedAt: true },
      });

      return { ...updated, expectedHours: next.expectedHours, basedOnCompletions: next.completions };
    });
  }

  /**
   * Reopen a completed task.
   *
   * The earlier contribution is deliberately LEFT in place. The work did happen, and the task
   * will replace its own figure when it closes again — withdrawing it here would make the
   * average briefly forget a real piece of work for no benefit.
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
      completions: r.completions,
      /** Shown so nobody treats a one-sample average as settled fact. */
      averageHours: expectedHoursFrom(r) ?? null,
      updatedAt: r.updatedAt,
    }));
  }

  /** Withdraw a deleted task's contribution so the average stops counting work off the books. */
  async withdraw(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, standardMinutes: true, createdBy: true },
    });
    if (!task?.standardMinutes) return;
    const organizationId = await this.orgOf(task.createdBy);
    const titleKey = normaliseTitle(task.title);
    const prev = await this.prisma.taskStandard.findUnique({
      where: { organizationId_titleKey: { organizationId, titleKey } },
    });
    if (!prev) return;
    const next = withdrawCompletion(
      { totalMinutes: prev.totalMinutes, completions: prev.completions },
      task.standardMinutes,
    );
    await this.prisma.taskStandard.update({
      where: { organizationId_titleKey: { organizationId, titleKey } },
      data: { totalMinutes: next.totalMinutes, completions: next.completions, expectedHours: next.expectedHours },
    });
  }
}
