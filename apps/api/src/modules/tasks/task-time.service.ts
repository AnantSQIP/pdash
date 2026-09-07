import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';
import { normaliseTitle, elapsedMinutes } from './task-standards';

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

  /**
   * A task the actor may work on, together with THEIR assignment on it.
   *
   * The assignment matters as much as the task: it carries the person's role, and what their
   * part has already contributed to that role's standard.
   */
  private async assertMine(taskId: string, userId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true, title: true, actualHours: true,
        completedAt: true, startedAt: true, reopenedCount: true,
        // A task can be closed two ways — by the closing dialog (completedAt) or simply by
        // moving it into a CLOSED status. Both have to count as closed, so both are read.
        currentStatus: { select: { type: true } },
        assignees: {
          select: {
            id: true, userId: true, role: true,
            confirmedHours: true, standardKey: true, standardMinutes: true,
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    // A person may hold more than one role on a task. Their ANALYST seat is the one whose
    // hours describe the classified work, so it is preferred when choosing which to credit.
    const mine = task.assignees.filter(a => a.userId === userId);
    if (!mine.length) throw new ForbiddenException('You can only time a task that is assigned to you.');
    const assignment = mine.find(a => (a.role ?? 'ANALYST') === 'ANALYST') ?? mine[0];
    return { task, assignment, role: (assignment.role ?? 'ANALYST').toUpperCase() };
  }

  private async orgOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    if (!u) throw new NotFoundException('User not found.');
    return u.organizationId;
  }

  /**
   * The organisation a task's standards belong to.
   *
   * The signed-in actor first, because they are by definition a live account. Falling back to
   * the task's creator alone was fragile: offboarding purges the account, and every later
   * attempt to withdraw that task's contribution would then throw "User not found" — which
   * surfaces as a failure to delete an ordinary task.
   */
  private async orgForTask(createdBy: string | null | undefined): Promise<string | null> {
    const actorId = getActorId();
    for (const id of [actorId, createdBy]) {
      if (!id) continue;
      const u = await this.prisma.user.findUnique({ where: { id }, select: { organizationId: true } });
      if (u?.organizationId) return u.organizationId;
    }
    return null;
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

  /**
   * What to put in front of the person on closing: what their own timer says, what their
   * ROLE is expected to take, and what the whole task is expected to take across every role.
   */
  async closingSummary(taskId: string) {
    const userId = this.actor();
    const { task, role } = await this.assertMine(taskId, userId);
    const organizationId = await this.orgOf(userId);
    const titleKey = normaliseTitle(task.title);

    const [mineMinutes, standards] = await Promise.all([
      this.minutesFor(taskId, userId),
      this.prisma.taskStandard.findMany({ where: { organizationId, titleKey } }),
    ]);
    const mineStd = standards.find(x => x.role === role) ?? null;
    const assignment = task.assignees.find(a => a.userId === userId && (a.role ?? 'ANALYST').toUpperCase() === role);

    return {
      taskId,
      title: task.title,
      role,
      trackedMinutes: mineMinutes,
      /** Pre-fill for the hours box — one decimal is enough to confirm or correct. */
      suggestedHours: Math.round((mineMinutes / 60) * 10) / 10,
      expectedHoursForMyRole: mineStd?.expectedHours ?? null,
      basedOnCompletions: mineStd?.completions ?? 0,
      /** Every role's expectation summed: what the task as a whole is expected to cost. */
      expectedHoursForTask: standards.reduce((sum, x) => sum + (x.expectedHours ?? 0), 0) || null,
      alreadyCounted: assignment?.standardMinutes != null,
    };
  }

  /** Minutes this ONE person has recorded on a task — their part, not everybody's. */
  async minutesFor(taskId: string, userId: string): Promise<number> {
    const sessions = await this.prisma.taskWorkSession.findMany({
      where: { taskId, userId },
      select: { startedAt: true, endedAt: true, minutes: true },
    });
    const now = new Date();
    return sessions.reduce(
      (sum, x) => sum + (x.endedAt ? (x.minutes ?? 0) : Math.min(MAX_SESSION_MINUTES, elapsedMinutes(x.startedAt, now))),
      0,
    );
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
    tx: any, organizationId: string, titleKey: string, role: string, displayTitle: string,
    minutesDelta: number, countDelta: number,
  ) {
    if (!titleKey) return null;   // an untitled task belongs to no standard
    await tx.$executeRaw`
      INSERT INTO "task_standard"
        ("id","organizationId","titleKey","role","displayTitle","totalMinutes","completions","expectedHours","updatedAt")
      VALUES
        (gen_random_uuid()::text, ${organizationId}, ${titleKey}, ${role}, ${displayTitle},
         GREATEST(0, ${minutesDelta}::int), GREATEST(0, ${countDelta}::int), NULL, NOW())
      ON CONFLICT ("organizationId","titleKey","role") DO UPDATE SET
        "totalMinutes" = GREATEST(0, "task_standard"."totalMinutes" + ${minutesDelta}::int),
        "completions"  = GREATEST(0, "task_standard"."completions"  + ${countDelta}::int),
        "updatedAt"    = NOW()
    `;
    const rows: any[] = await tx.$queryRaw`
      UPDATE "task_standard" SET "expectedHours" =
        CASE WHEN "completions" > 0 AND "totalMinutes" > 0
             THEN GREATEST(1, ROUND("totalMinutes"::numeric / "completions" / 60))::int
             ELSE NULL END
      WHERE "organizationId" = ${organizationId} AND "titleKey" = ${titleKey} AND "role" = ${role}
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
    return this.record(taskId, hoursTaken, { close: true, closedStatusId });
  }

  /**
   * Record MY hours on a task without closing it.
   *
   * The analyst finishes their part and hands over; the reviewer closes later. Forcing the
   * analyst to wait for the close before their hours are recorded would either lose the
   * figure or make somebody else guess it.
   */
  async logMyPart(taskId: string, hoursTaken: number) {
    return this.record(taskId, hoursTaken, { close: false });
  }

  /**
   * Record one person's confirmed hours against their ROLE's standard, and optionally close
   * the task.
   *
   * Three shapes, because a person does not always contribute the same way twice:
   *
   *   never counted before     → add the hours, and one sample
   *   counted, same title      → post only the DIFFERENCE, no new sample. One person's part
   *                              counts once at its final total however often it is reopened.
   *   counted, title CHANGED   → withdraw from the old standard entirely, add to the new.
   *                              Otherwise the old keeps a sample for work no longer carrying
   *                              that name, and the new is understated.
   *
   * Zero hours count as no sample and withdraw any earlier one: a zero measures nothing, and
   * averaging it in would drag the expectation down while carrying no information.
   */
  private async record(taskId: string, hoursTaken: number, opts: { close: boolean; closedStatusId?: string }) {
    const userId = this.actor();
    const { task, assignment, role } = await this.assertMine(taskId, userId);
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
      // Stop this person's clock so the sessions agree with the figure being recorded.
      const open = await tx.taskWorkSession.findMany({ where: { taskId, userId, endedAt: null } });
      for (const x of open) {
        await tx.taskWorkSession.update({
          where: { id: x.id },
          data: { endedAt: now, minutes: elapsedMinutes(x.startedAt, now) },
        });
      }

      const had = assignment.standardKey !== null && assignment.standardMinutes !== null;
      let result: any = null;

      if (had && assignment.standardKey === newKey && counts) {
        result = await this.applyDelta(tx, organizationId, newKey, role, task.title.trim(),
          minutes - (assignment.standardMinutes ?? 0), 0);
      } else {
        if (had) {
          await this.applyDelta(tx, organizationId, assignment.standardKey!, role, task.title.trim(),
            -(assignment.standardMinutes ?? 0), -1);
        }
        if (counts) {
          result = await this.applyDelta(tx, organizationId, newKey, role, task.title.trim(), minutes, 1);
        }
      }

      await tx.taskAssignee.update({
        where: { id: assignment.id },
        data: {
          confirmedHours: hoursTaken,
          standardKey: counts ? newKey : null,
          standardMinutes: counts ? minutes : null,
        },
      });

      // The task's actual hours are the SUM of what everyone confirmed for their own part.
      const parts = await tx.taskAssignee.findMany({
        where: { taskId }, select: { confirmedHours: true },
      });
      const taskHours = parts.reduce((sum, x) => sum + (x.confirmedHours ?? 0), 0);

      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          actualHours: taskHours,
          ...(opts.close
            ? {
                completedAt: now,
                completionPercentage: 100,
                ...(opts.closedStatusId ? { currentWorkflowStatusId: opts.closedStatusId } : {}),
              }
            : {}),
        },
        select: { id: true, actualHours: true, completedAt: true },
      });

      return {
        ...updated,
        role,
        myHours: hoursTaken,
        expectedHoursForMyRole: result?.expectedHours ?? null,
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
    const { task } = await this.assertMine(taskId, userId);
    // Closed by the dialog OR closed by status. Requiring completedAt alone meant every task
    // closed the ordinary way — which is all of them, including everything predating the
    // closing dialog — showed a Reopen button that answered "That task is not closed."
    const isClosed = !!task.completedAt || task.currentStatus?.type === 'CLOSED';
    if (!isClosed) throw new BadRequestException('That task is not closed.');
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

  /**
   * Every learned standard, grouped by task and broken down by role.
   *
   * The task total is the SUM of the roles' expectations — what has to fit in the calendar
   * before a client deadline, and what gets invoiced. The per-role figures are what a person
   * is fairly judged against.
   */
  async standards() {
    const organizationId = await this.orgOf(this.actor());
    const rows = await this.prisma.taskStandard.findMany({
      where: { organizationId },
      orderBy: [{ completions: 'desc' }, { displayTitle: 'asc' }],
    });
    const byTask = new Map<string, { title: string; totalExpectedHours: number; roles: any[] }>();
    for (const r of rows) {
      const entry = byTask.get(r.titleKey) ?? { title: r.displayTitle, totalExpectedHours: 0, roles: [] };
      entry.roles.push({
        role: r.role,
        expectedHours: r.expectedHours,
        // Shown so nobody treats a one-sample average as settled fact.
        completions: r.completions,
        updatedAt: r.updatedAt,
      });
      entry.totalExpectedHours += r.expectedHours ?? 0;
      byTask.set(r.titleKey, entry);
    }
    return [...byTask.values()].sort((a, b) => b.totalExpectedHours - a.totalExpectedHours);
  }

  /**
   * Withdraw the standard contributions of specific assignment rows, inside a caller's
   * transaction.
   *
   * Used when a task is re-staffed and somebody's seat goes away. Their hours were folded
   * into what this kind of work is expected to take; if the row simply disappears, the sample
   * stays in the average with nothing left in the database that could ever take it back out.
   *
   * Returns the rows that actually carried a contribution, so the caller can see what moved.
   */
  async releaseAssignments(
    tx: any,
    organizationId: string,
    displayTitle: string,
    rows: { id: string; role: string | null; standardKey: string | null; standardMinutes: number | null }[],
  ) {
    const carrying = rows.filter(r => r.standardKey && r.standardMinutes !== null);
    for (const r of carrying) {
      await this.applyDelta(tx, organizationId, r.standardKey!, (r.role ?? 'ANALYST').toUpperCase(),
        displayTitle, -(r.standardMinutes ?? 0), -1);
    }
    return carrying;
  }

  /**
   * Withdraw a deleted task's contributions so the averages stop counting work off the books.
   *
   * A task has as many contributions as it had people on it — the analyst's and the
   * reviewer's are separate samples under separate roles, and both must go.
   */
  async withdraw(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        title: true, createdBy: true,
        assignees: { select: { id: true, role: true, standardKey: true, standardMinutes: true } },
      },
    });
    if (!task) return;
    const contributions = task.assignees.filter(a => a.standardKey && a.standardMinutes !== null);
    if (!contributions.length) return;
    const organizationId = await this.orgForTask(task.createdBy);
    if (!organizationId) return;   // nothing to withdraw against; never block the delete
    await this.prisma.$transaction(async tx => {
      await this.releaseAssignments(tx, organizationId, task.title.trim(), contributions);
      await tx.taskAssignee.updateMany({
        where: { id: { in: contributions.map(a => a.id) } },
        data: { standardKey: null, standardMinutes: null },
      });
    });
  }
}
