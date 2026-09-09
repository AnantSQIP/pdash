import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';
import { normaliseTitle, elapsedMinutes } from './task-standards';
import { startOfIstDay } from '../../common/dates';
import { istDayWindow, overlapMinutes, totalMinutes as sessionMinutes, ceilQuarter, minutesToHours, SESSION_CAP_MINUTES } from '../../common/work-time';
import { serialize, timerKeyFor } from '../../common/db/serialize';
import { TimesheetsService } from '../timesheets/timesheets.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EventService } from '../audit-events/event.service';
import { TimeModeService, TIMESHEET_SOURCE } from '../time-mode/time-mode.module';
import { EVENTS } from '../../common/events/canonical-events';

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
/** Re-exported name for the shared cap; see common/work-time.ts. */
const MAX_SESSION_MINUTES = SESSION_CAP_MINUTES;

/**
 * Below this a completion measures nothing and is not counted as a sample. A task closed at
 * zero hours says nothing about how long that kind of work takes; letting it in would drag
 * every future expectation down while carrying no information.
 */
const MIN_SAMPLE_MINUTES = 1;

@Injectable()
export class TaskTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timesheets: TimesheetsService,
    private readonly access: ProjectAccessService,
    private readonly events: EventService,
    private readonly timeMode: TimeModeService,
  ) {}

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

  /**
   * The project a task belongs to. Carried on every lifecycle event as `metadata.projectId`,
   * because that is the field the activity feed filters a project's history on — an event
   * emitted without it is written, and then never shown to anybody.
   */
  private async projectIdOf(taskId: string): Promise<string | undefined> {
    const link = await this.prisma.projectTask.findFirst({ where: { taskId }, select: { projectId: true } });
    return link?.projectId;
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

  /**
   * Every session this person currently has running.
   *
   * A list, not one: people are allowed several clocks at once. Each records its own real
   * elapsed time, so an hour spent switching between three tasks reads as an hour on each —
   * which is what a stopwatch does, and what the person pressed. Nothing is silently divided.
   * The consequence, that a day can total more hours than were lived, is surfaced rather than
   * hidden: My Tasks says how many clocks are running, and the punch-out check compares tracked
   * hours against the hours actually attended.
   *
   * Each running clock carries what the person had already put into that task, so a resumed
   * timer counts on rather than restarting at zero.
   */
  async running(userId = this.actor()) {
    await this.reconcileStale(userId);
    const open = await this.prisma.taskWorkSession.findMany({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'asc' },
      select: { id: true, taskId: true, startedAt: true, task: { select: { id: true, title: true } } },
    });
    if (!open.length) return [];

    // Pausing ENDS a session and resuming opens a new one, so the running session on its own
    // says nothing about the work already done on that task. A clock resumed after two hours
    // read "0m", which looks like the two hours were thrown away — they were not, they are in
    // the sessions just closed. The earlier sittings are sent with the running one so the
    // screen can count on from where the person left off.
    const now = new Date();
    const earlier = await this.prisma.taskWorkSession.findMany({
      where: { userId, taskId: { in: open.map(s => s.taskId) }, endedAt: { not: null } },
      select: { taskId: true, startedAt: true, endedAt: true, minutes: true },
    });
    const prior = new Map<string, number>();
    for (const s of earlier) {
      prior.set(s.taskId, (prior.get(s.taskId) ?? 0) + sessionMinutes(s, now, MAX_SESSION_MINUTES));
    }
    return open.map(s => ({
      ...s,
      /** This person's finished sittings on the task — everything before the clock now running. */
      priorMinutes: prior.get(s.taskId) ?? 0,
    }));
  }

  /**
   * Start — or resume — work on a task.
   *
   * Idempotent: pressing Start on a task already running returns the session in progress rather
   * than opening a second one. Sessions on OTHER tasks are left alone; running several clocks is
   * allowed on purpose, and the only way to stop one is to pause or finish that task.
   *
   * Locked per person, because "already running?" is a question asked and then acted on. Two
   * devices pressing Start in the same instant both read no session and both opened one, which
   * doubled the day's tracked time from a single sitting.
   */
  async start(taskId: string) {
    const userId = this.actor();
    // There is no clock to start when the firm fills the day in by hand. Refused here rather than
    // merely hidden: the button going away is a UI change, and a stale tab is still a real client.
    await this.timeMode.assertTimerFlow(await this.orgOf(userId));
    await this.assertMine(taskId, userId);
    // A completed or closed matter takes no more work. The ledger would refuse the hours at
    // the end; better to refuse the clock at the start, with the same words the rest of the
    // app uses.
    await this.access.assertTaskWritable(taskId);
    await this.reconcileStale(userId);
    const now = new Date();

    const session = await serialize(this.prisma, timerKeyFor(userId), async tx => {
      const already = await tx.taskWorkSession.findFirst({ where: { userId, taskId, endedAt: null } });
      if (already) return { id: already.id, taskId, startedAt: already.startedAt, resumed: true };
      // startedAt records when the task was FIRST picked up, and is never overwritten.
      await tx.task.updateMany({ where: { id: taskId, startedAt: null }, data: { startedAt: now } });
      const created = await tx.taskWorkSession.create({
        data: { taskId, userId, startedAt: now },
        select: { id: true, taskId: true, startedAt: true },
      });
      return { ...created, resumed: false };
    });

    // Emitted OUTSIDE the lock and after it commits: the serialized block is the contended
    // section every Start on this person queues behind, and three inserts into the event spine
    // do not belong inside it. `resumed` is carried so picking a task back up reads as that
    // rather than as a second first-start.
    await this.events.emit({
      action: EVENTS.TASK_STARTED,
      entityType: 'TASK',
      entityId: taskId,
      metadata: { projectId: await this.projectIdOf(taskId), resumed: session.resumed },
    });
    return session;
  }

  /**
   * Pause the clock on a task. Resuming is simply Start again.
   *
   * Deliberately does NOT require the task still to be assigned to you. Being unassigned
   * while your timer runs would otherwise leave you holding a session you are not allowed to
   * close, accruing hours nobody can stop.
   */
  async pause(taskId: string) {
    const userId = this.actor();
    // Deliberately NOT guarded on the flow. Switching away from the stopwatch closes every
    // running clock, but a request already in flight when that happened must still be able to
    // put its own session down rather than be told the feature no longer exists.
    await this.reconcileStale(userId);
    const now = new Date();
    const open = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) {
      return {
        paused: false, minutes: 0,
        totalMinutes: await this.minutesOn(taskId),
        myMinutes: await this.minutesFor(taskId, userId),
        todayMinutes: await this.minutesToday(taskId, userId),
      };
    }
    const minutes = elapsedMinutes(open.startedAt, now);
    await this.prisma.taskWorkSession.update({
      where: { id: open.id },
      data: { endedAt: now, minutes },
    });
    // Only a clock that was actually running is a pause worth recording — the no-session case
    // returned above writes nothing, so pressing Pause twice does not litter the feed.
    await this.events.emit({
      action: EVENTS.TASK_PAUSED,
      entityType: 'TASK',
      entityId: taskId,
      metadata: { projectId: await this.projectIdOf(taskId), minutes },
    });
    // `minutes` is THIS sitting — what the person just did, and what the toast offers to log.
    // The cumulative figures are returned beside it; neither may be the one pre-filled, or a
    // second session of the day books the first one again.
    //
    // `myMinutes` is this person's own running total on the task and `totalMinutes` is
    // everybody's. Anything said TO a person about how long they have spent must use theirs:
    // quoting the task's total would tell an analyst they had worked their reviewer's hours too.
    return {
      paused: true, minutes,
      totalMinutes: await this.minutesOn(taskId),
      myMinutes: await this.minutesFor(taskId, userId),
      todayMinutes: await this.minutesToday(taskId, userId),
    };
  }

  /**
   * Stop every clock this person has running, and say what was stopped.
   *
   * Punching out calls this, and so does the 23:59 sweep that closes a forgotten day: a timer
   * that outlives the day it belongs to invents hours nobody worked, and until now the only
   * thing standing between that and the timesheet was a twelve-hour cap.
   */
  async pauseAll(userId: string): Promise<{ stopped: number; minutes: number }> {
    await this.reconcileStale(userId);
    const now = new Date();
    const open = await this.prisma.taskWorkSession.findMany({ where: { userId, endedAt: null } });
    let minutes = 0;
    for (const s of open) {
      const m = elapsedMinutes(s.startedAt, now);
      minutes += m;
      await this.prisma.taskWorkSession.update({ where: { id: s.id }, data: { endedAt: now, minutes: m } });
    }
    return { stopped: open.length, minutes };
  }

  /** Minutes this person recorded on a task on one IST day — a sitting across midnight splits. */
  async minutesToday(taskId: string, userId: string, dayMarker = startOfIstDay(new Date())): Promise<number> {
    const { from, to } = istDayWindow(dayMarker);
    const now = new Date();
    const sessions = await this.prisma.taskWorkSession.findMany({
      where: { taskId, userId, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
      select: { startedAt: true, endedAt: true, minutes: true },
    });
    return sessions.reduce((n, s) => n + overlapMinutes(s, from, to, now, MAX_SESSION_MINUTES), 0);
  }

  /** What this person has tracked today, per task, and how much of it is already filed. */
  async todayBoard(userId = this.actor()) {
    await this.reconcileStale(userId);
    return this.timesheets.dayStatus(userId, startOfIstDay(new Date()));
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
   * Everything that must happen for the person completing a task: the clock stops, what it
   * recorded becomes the sample the estimate learns from, and today's share of it goes to the
   * timesheet.
   *
   * There is no dialog and nothing to type. The figure a person used to confirm by hand is now
   * whatever their own clock recorded, which is both less work and harder to get wrong.
   *
   * Called by Finish AND by every status change that closes a task, so a task ticked complete in
   * a project list behaves exactly like one finished in My Tasks. Two doors with two different
   * outcomes was the largest inconsistency in this module.
   *
   * The estimate learns in the same three shapes as before, because a task does not always
   * contribute the same way twice:
   *
   *   never counted before     → add the minutes, and one sample
   *   counted, same title      → post only the DIFFERENCE, no new sample. One person's part
   *                              counts once at its final total however often it is reopened.
   *   counted, title CHANGED   → withdraw from the old standard entirely, add to the new.
   *
   * A task finished with the clock never started contributes NOTHING — it neither adds a sample
   * nor withdraws an earlier one. The old dialog recorded a zero in that case, which threw away
   * a real measurement and dragged the expectation down while measuring nothing at all.
   */
  async settleClose(taskId: string, opts: { requireMine?: boolean } = {}) {
    const userId = this.actor();
    const nothing = {
      settled: false, role: null as string | null, trackedMinutes: 0, todayMinutes: 0,
      counted: false, expectedHoursForMyRole: null as number | null, basedOnCompletions: 0,
      timesheetHours: 0, timesheetWarning: null as string | null,
    };

    // Finish demands a seat on the task. A status change made by somebody else settles nothing:
    // a manager closing an analyst's task has no clock of their own to stop and cannot file
    // hours into another person's timesheet.
    let found;
    if (opts.requireMine) {
      found = await this.assertMine(taskId, userId);
      await this.access.assertTaskWritable(taskId);
    } else {
      try { found = await this.assertMine(taskId, userId); } catch { return nothing; }
    }
    const { task, assignment, role } = found;

    const organizationId = await this.orgOf(userId);
    const timerFlow = await this.timeMode.isTimer(organizationId);
    const newKey = normaliseTitle(task.title);
    const now = new Date();
    const dayMarker = startOfIstDay(now);
    const { from: dayFrom, to: dayTo } = istDayWindow(dayMarker);

    const outcome = await this.prisma.$transaction(async tx => {
      // Stop this person's clock on THIS task. Their other tasks keep running: several clocks at
      // once is deliberate, and finishing one says nothing about the others.
      const open = await tx.taskWorkSession.findMany({ where: { taskId, userId, endedAt: null } });
      for (const s of open) {
        await tx.taskWorkSession.update({
          where: { id: s.id },
          data: { endedAt: now, minutes: elapsedMinutes(s.startedAt, now) },
        });
      }
      // Read the sessions AFTER closing them, so both figures include the sitting just ended.
      const sessions = await tx.taskWorkSession.findMany({
        where: { taskId, userId },
        select: { startedAt: true, endedAt: true, minutes: true },
      });
      const clocked = sessions.reduce((n, s) => n + sessionMinutes(s, now, MAX_SESSION_MINUTES), 0);
      const todayMinutes = timerFlow
        ? sessions.reduce((n, s) => n + overlapMinutes(s, dayFrom, dayTo, now, MAX_SESSION_MINUTES), 0)
        // Nothing to top up when the day was filled in by hand: the hours are already in the
        // ledger, and filing them again would book the same work twice.
        : 0;

      // WHAT WAS MEASURED, whichever flow measured it.
      //
      // With a stopwatch that is the clock. Without one it is what this person filed against this
      // task — the same quantity arrived at a different way, and the only honest one available.
      // Taking the clock regardless would read zero in the manual flow and quietly stop the firm
      // learning how long its work takes, which is what feeds every capacity estimate it makes.
      const filedMinutes = timerFlow ? 0 : Math.round(
        ((await tx.timesheet.aggregate({
          where: { taskId, userId, deletedAt: null },
          _sum: { hoursLogged: true },
        }))._sum.hoursLogged ?? 0) * 60,
      );
      const tracked = timerFlow ? clocked : filedMinutes;

      const counts = tracked >= MIN_SAMPLE_MINUTES && newKey.length > 0 && !!organizationId;
      const had = assignment.standardKey !== null && assignment.standardMinutes !== null;
      let result: any = null;
      // Nothing on the clock means nothing was measured, and a thing not measured must not be
      // allowed to change what this kind of task is expected to take — in EITHER direction. The
      // old dialog recorded a zero here, which withdrew a real earlier measurement and dragged
      // the expectation down on the strength of no information at all.
      if (counts) {
        if (had && assignment.standardKey === newKey) {
          // The same person's same task, measured again: post the DIFFERENCE, not a second
          // sample, however many times it is reopened and finished.
          result = await this.applyDelta(tx, organizationId!, newKey, role, task.title.trim(),
            tracked - (assignment.standardMinutes ?? 0), 0);
        } else {
          // Renamed since it was counted: the old standard keeps a sample for work that no
          // longer carries that name, so it is withdrawn and posted to the new one.
          if (had) {
            await this.applyDelta(tx, organizationId!, assignment.standardKey!, role, task.title.trim(),
              -(assignment.standardMinutes ?? 0), -1);
          }
          result = await this.applyDelta(tx, organizationId!, newKey, role, task.title.trim(), tracked, 1);
        }
      }

      await tx.taskAssignee.update({
        where: { id: assignment.id },
        data: {
          // Only a real measurement moves either figure. A finish with no clock leaves the seat's
          // confirmed hours and its sample exactly as they were.
          ...(counts ? { confirmedHours: minutesToHours(tracked), standardKey: newKey, standardMinutes: tracked } : {}),
        },
      });

      return {
        role, trackedMinutes: tracked, todayMinutes, counted: counts,
        expectedHoursForMyRole: result?.expectedHours ?? null,
        basedOnCompletions: result?.completions ?? 0,
      };
    });

    // Outside the transaction: the ledger has its own lock (per person per day) and its own
    // rules, and a refusal there must never undo a finish.
    const ledger = await this.fileDay(userId, taskId, outcome.todayMinutes, dayMarker);
    return { settled: true, ...outcome, ...ledger };
  }

  /**
   * File the part of today the clock recorded on this task and the timesheet has not got yet.
   *
   * TODAY only, and this task only. A task worked across several days is paused at the end of
   * each one and those days are filed by hand; finishing it on the last day must not sweep the
   * earlier days into today's entry, which would move real work onto the wrong date and bill it
   * there. The task's own total stays complete regardless — it is the sum of every session.
   *
   * A top-up, not an addition: somebody who already logged two of today's three tracked hours
   * gets one more, not three more. Somebody who logged more than the clock saw gets nothing —
   * their own figure stands, because they were there and the clock was not.
   *
   * The ledger can refuse — the 16h day cap, a closed matter, a backdating window. A refusal
   * comes back as a warning, never thrown: the task is finished and the estimate is learned;
   * only the timesheet needs a hand, and the screen says so.
   */
  private async fileDay(userId: string, taskId: string, todayMinutes: number, dayMarker: Date) {
    if (todayMinutes < 1) return { timesheetHours: 0, timesheetWarning: null as string | null };
    const agg = await this.prisma.timesheet.aggregate({
      where: { userId, taskId, deletedAt: null, date: dayMarker },
      _sum: { hoursLogged: true },
    });
    const already = agg._sum.hoursLogged ?? 0;
    // Quarter-hours, rounded UP so seven minutes of real work still becomes an entry.
    const shortfall = ceilQuarter(minutesToHours(todayMinutes) - already);
    if (shortfall < 0.25) {
      await this.timesheets.syncTaskActualHours(taskId);
      return { timesheetHours: 0, timesheetWarning: null as string | null };
    }
    const topUp = Math.min(16, shortfall);
    const leftover = Math.round((shortfall - topUp) * 100) / 100;
    const day = dayMarker.toISOString().slice(0, 10);
    try {
      await this.timesheets.create({
        taskId, date: day, hoursLogged: topUp, billable: true, notes: 'Tracked on My Tasks',
      } as any, { skipIdenticalCheck: true });
      return {
        timesheetHours: topUp,
        timesheetWarning: leftover > 0
          ? `${topUp}h was filed for today; the remaining ${leftover}h needs logging against the days it was worked.`
          : null as string | null,
      };
    } catch (e) {
      await this.timesheets.syncTaskActualHours(taskId);
      const msg = e instanceof Error ? e.message : 'The timesheet could not be written.';
      return { timesheetHours: 0, timesheetWarning: `Finished, but ${topUp}h could not be filed to your timesheet: ${msg}` };
    }
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
    // Reopening is a delivery decision, not a personal one: anyone staffed on the task OR a
    // member of its project may take it. Requiring a seat on the TASK meant a colleague who
    // spotted that finished work still needed doing could not say so — only whoever happened
    // to be assigned could, and only while they stayed assigned. assertTaskAccess is the same
    // project-membership rule the other reporting actions (status, progress) already use, so
    // reopening now matches finishing instead of being stricter than it.
    await this.access.assertTaskAccess(userId, taskId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, title: true, completedAt: true, currentStatus: { select: { type: true } } },
    });
    if (!task) throw new NotFoundException('Task not found.');
    // Closed by the dialog OR closed by status. Requiring completedAt alone meant every task
    // closed the ordinary way — which is all of them, including everything predating the
    // closing dialog — showed a Reopen button that answered "That task is not closed."
    const isClosed = !!task.completedAt || task.currentStatus?.type === 'CLOSED';
    if (!isClosed) throw new BadRequestException('That task is not closed.');
    // Resolve one when the caller did not name it, exactly as Finish resolves a closed status.
    // Without this the task came back with no completedAt but still in a CLOSED status, which
    // every screen reads as closed — so the reopen appeared to do nothing.
    const landing = openStatusId ?? await this.openStatusFor(taskId);
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        completedAt: null,
        reopenedCount: { increment: 1 },
        completionPercentage: 99,
        ...(landing ? { currentWorkflowStatusId: landing } : {}),
      },
      select: { id: true, reopenedCount: true, completedAt: true },
    });
    // This path writes the task row directly rather than going through setStatus, so without
    // this the reopen left no trace at all — the count went up and nothing said who did it.
    await this.events.emit({
      action: EVENTS.TASK_REOPENED,
      entityType: 'TASK',
      entityId: taskId,
      metadata: { projectId: await this.projectIdOf(taskId), title: task.title },
    });
    return updated;
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

  /** The CLOSED-type status of the workflow this task is in, or null if it has no status yet. */
  /**
   * The status a reopened task should land in, when the caller did not name one.
   *
   * The mirror of closedStatusFor, and it has to exist for the same reason. Reopening cleared
   * `completedAt` but left the task in whatever CLOSED status it was in, so it came back
   * finished-but-not-complete: every screen that asks the STATUS still read it as closed, the
   * Reopen button stayed where the task's own buttons should be, and pressing it again did
   * nothing visible. The earliest open status is the front of the workflow, which is where work
   * that has to be done again belongs.
   */
  async openStatusFor(taskId: string): Promise<string | undefined> {
    const workflowId = await this.workflowOf(taskId);
    if (!workflowId) return undefined;
    const open = await this.prisma.workflowStatus.findFirst({
      where: { workflowId, type: { not: 'CLOSED' } }, orderBy: { sequence: 'asc' }, select: { id: true },
    });
    return open?.id;
  }

  /**
   * The workflow a task follows.
   *
   * Its OWN column first, and only then the workflow of whatever status it currently sits in.
   * Reading the status alone looked equivalent and was not: a task that has a workflow but has
   * not been given a status yet — created through the API, imported, or made by any path that
   * does not name one — resolved to nothing. Finishing it then failed with "this task has no
   * completed status in its workflow", which is untrue and unactionable: the workflow has one,
   * the task simply was not pointing at it. That is a dead end in the manual flow, where
   * finishing is one of only two things a person can do to a task.
   */
  private async workflowOf(taskId: string): Promise<string | undefined> {
    const t = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { workflowId: true, currentStatus: { select: { workflowId: true } } },
    });
    return t?.workflowId ?? t?.currentStatus?.workflowId ?? undefined;
  }

  async closedStatusFor(taskId: string): Promise<string | undefined> {
    const workflowId = await this.workflowOf(taskId);
    if (!workflowId) return undefined;
    const closed = await this.prisma.workflowStatus.findFirst({
      where: { workflowId, type: 'CLOSED' }, orderBy: { sequence: 'desc' }, select: { id: true },
    });
    return closed?.id;
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
