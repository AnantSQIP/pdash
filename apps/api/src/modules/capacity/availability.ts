/**
 * How free a person really is — one answer, for every screen that asks.
 *
 * The board has always computed a person's committed and free hours from ALL of their open work,
 * across every client. The screens then did their own arithmetic on top of it, and each of them
 * did it a little differently: a client's Capacity tab faded everybody else's work to a quarter
 * of its opacity so a fully-booked day read as an empty one; the staffing form, the board's own
 * task editor, the add-task dialog and "assign the N tasks" offered hours with no idea of the
 * person's week at all. Somebody looking at one client saw free hours that were not free, and
 * handed out work on the strength of it.
 *
 * So the number lives here, once:
 *
 *   · `apply()` takes the board CapacityService already computes and, per person per day, splits
 *     the committed hours into THIS client's share and everything else — never hiding the rest.
 *   · `preview()` answers "what would this assignment do?" for a proposed seat, over the exact
 *     days being assigned, against the person's whole load.
 *   · `visibility()` + `redact()` keep confidentiality: a viewer who may not open a client never
 *     learns its name from this board. Its hours still count — they are simply "Other work".
 *
 * BOTH WORKSPACE FLOWS (docs/WORKSPACE_FLOWS.md). How loaded somebody is, and how much of their
 * week belongs to some other matter, is the same question whether the firm calls the work a
 * project or a client, so nothing here carries @RequireFlow and every capacity route goes through
 * it in either flow. The PROJECTS board needs the redaction most of all: it is open to the whole
 * firm, so a viewer who may not open a matter is the ordinary case there, not the exception. The
 * names below are this repository's clients vocabulary (ClientShare, otherClients); nothing a
 * person reads is — the sentences say "other work" and "all their work", and the screens ask the
 * flow for the word.
 *
 * Nothing about the work-week is re-derived here. Weekends, company holidays, a person's approved
 * optional holiday, full-day and half-day leave are all already baked into each day's `capacity`
 * by CapacityService.team(); this file only ever reads it. The placement of a proposed seat goes
 * through the same placeForward() the board itself plans with.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { WorkspaceFlowService } from '../workspace-flow/workspace-flow.service';
// Types only — erased at compile time, so this file never imports the capacity module at runtime
// and the two cannot form a cycle.
import type { CapacityDay, CapacityRow } from './capacity.module';
import { placeForward } from './placement';

/** Below this, an hour figure is floating-point dust rather than a real difference. */
const EPS = 0.05;
/** Free hours left after an assignment below which it is worth saying "that is the last of it". */
const TIGHT_HOURS = 2;

function r1(n: number): number { return Math.round((n ?? 0) * 10) / 10; }
function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function asDate(key: string): Date { return new Date(`${key}T00:00:00.000Z`); }

/** What a person may be told about the firm's clients. */
export interface Visibility {
  /** Delivery oversight: every client of their own organisation. */
  all: boolean;
  /** Otherwise, the clients they are an active member of. */
  ids: Set<string>;
}

export function canName(vis: Visibility, projectId: string | null | undefined): boolean {
  if (!projectId) return true; // team-space work and unlinked tasks name no client
  return vis.all || vis.ids.has(projectId);
}

/** One client's share of a person's window. `projectId: null` is the restricted work, rolled up. */
export interface ClientShare {
  projectId: string | null;
  /** The client's title, or "Other work" for the ones this viewer may not name. */
  label: string;
  code: string | null;
  round?: number;
  hours: number;
  restricted: boolean;
  /** Internal team-space work rather than a client matter. */
  isTeamWork: boolean;
}

/**
 * Strip the name of every client this viewer may not open, leaving its HOURS exactly where they
 * are. The load is the whole point — a day that is full has to look full — but "Acme Corp" is a
 * fact about the firm's business, and the board is open to people (HR, for one) who hold
 * capacity.view without holding access to a single matter.
 *
 * The task's own title goes too: patent work is routinely titled after the client.
 */
export function redact(rows: CapacityRow[], vis: Visibility): CapacityRow[] {
  if (vis.all) return rows;
  for (const row of rows) {
    for (const t of row.openTasks) {
      if (t.isTeamWork || canName(vis, t.projectId)) continue;
      t.restricted = true;
      t.title = 'Other work';
      t.project = 'Other work';
      t.projectId = undefined;
      t.projectPid = null;
      t.projectRound = undefined;
      t.taskGroup = null;
      t.taskGroupId = null;
      t.taskGroupDueDate = null;
    }
  }
  return rows;
}

/**
 * Split every day of every row into "this client" and "everything else", and total the window the
 * same way. `focusProjectId` is the client being looked at — the per-client Capacity tab, or the
 * board filtered to one client. Without one, everything is "other": the full board still gets the
 * breakdown, which is what lets a hover card say where a day's hours actually went.
 *
 * The rows are annotated in place and returned: these fields travel with the board rather than in
 * a parallel payload, so a screen cannot draw the days from one and the totals from another.
 */
export function apply(rows: CapacityRow[], focusProjectId?: string | null): CapacityRow[] {
  for (const row of rows) {
    const byId = new Map(row.openTasks.map(t => [t.id, t]));
    const shares = new Map<string, ClientShare>();
    let focusHours = 0;
    let otherHours = 0;
    let restrictedHours = 0;

    for (const day of row.days) {
      let focus = 0;
      let other = 0;
      let restricted = 0;
      for (const entry of day.tasks ?? []) {
        const task = byId.get(entry.taskId);
        if (!task) continue;
        const onFocus = !!focusProjectId && task.projectId === focusProjectId;
        if (onFocus) focus += entry.hours;
        else other += entry.hours;
        if (task.restricted) restricted += entry.hours;

        // The window's breakdown by client, built from the same day entries as the day totals —
        // so "18h on Acme" and the segments drawn on the days can never tell different stories.
        const key = task.restricted ? '~restricted' : task.isTeamWork ? `team:${task.projectId ?? ''}` : (task.projectId ?? '~none');
        const share = shares.get(key) ?? {
          projectId: task.restricted ? null : task.projectId ?? null,
          label: task.restricted ? 'Other work' : task.project ?? 'Unassigned work',
          code: task.restricted ? null : task.projectPid ?? null,
          round: task.restricted ? undefined : task.projectRound,
          hours: 0,
          restricted: !!task.restricted,
          isTeamWork: !!task.isTeamWork,
        };
        share.hours += entry.hours;
        shares.set(key, share);
      }
      if (day.capacity > 0) {
        focusHours += focus;
        otherHours += other;
        restrictedHours += restricted;
      }
      day.focusHours = r1(focus);
      day.otherHours = r1(other);
      day.restrictedHours = r1(restricted);
    }

    row.focusHours = r1(focusHours);
    row.otherHours = r1(otherHours);
    row.restrictedHours = r1(restrictedHours);
    row.byClient = [...shares.values()]
      .map(s => ({ ...s, hours: r1(s.hours) }))
      .filter(s => s.hours > 0)
      .sort((a, b) => b.hours - a.hours);
  }
  return rows;
}

// ── what an assignment would do ──────────────────────────────────────────────────────────────

/** A seat somebody is about to be given, as an assignment dialog has it so far. */
export interface ProposedSeat {
  userId: string;
  /** Hours being given to this person. 0 or absent = they are being named but not costed yet. */
  hours?: number | null;
  /** When they start. Absent = as soon as they can — the first day still open to planning. */
  startDate?: string | null;
  /** Their deadline. Absent = the end of the window being looked at. */
  dueDate?: string | null;
  /** Ceiling on how much of a day this work may take. */
  hoursPerDay?: number | null;
}

export type Verdict = 'FITS' | 'TIGHT' | 'OVER' | 'NO_ROOM';

export interface SeatPreviewDay {
  date: string;
  capacity: number;
  /** Already committed across ALL their work (minus the task being edited, if one was named). */
  committed: number;
  /** What this assignment would add. */
  add: number;
  /** Hours over the day's capacity afterwards. */
  over: number;
}

export interface SeatPreview {
  userId: string;
  name: string;
  /** The days the assignment actually covers. */
  from: string;
  to: string;
  requestedHours: number;
  /** Over those days, across ALL of this person's work. */
  capacityHours: number;
  committedHours: number;
  freeHours: number;
  /** Of `committedHours`, the part that is NOT on the client this assignment belongs to. */
  otherHours: number;
  /** Of `otherHours`, the part whose client this viewer may not be told. */
  restrictedHours: number;
  /** Where those other hours are — named where the viewer may see them. */
  otherClients: ClientShare[];
  /**
   * Hours THIS ASSIGNMENT pushes beyond capacity, and the days it happens on.
   *
   * Strictly the increase. A person who is already an hour over on Thursday is already an hour
   * over whether or not this seat is saved, and reporting that as something the assignment did
   * would block a save that adds nothing — which is how a warning stops being read.
   */
  overHours: number;
  overDays: string[];
  /** Hours they were ALREADY over on those days before this assignment. Said, never blamed. */
  alreadyOverHours: number;
  days: SeatPreviewDay[];
  verdict: Verdict;
  /** One sentence, ready to print. */
  message: string;
}

/**
 * What giving this seat these hours would do to the person's days.
 *
 * The hours are PLACED, through the same placeForward() the board plans placed work with: filled
 * forward from the start, taking what each day still has room for. That is the demanding reading
 * and it is the right one here — spreading the hours evenly to the deadline would dilute them to
 * a fraction of an hour a day and report that everything fits, which is the exact illusion this
 * whole change exists to end.
 *
 * `excludeTaskId` takes the seat being EDITED back out of the committed hours first. Without it,
 * re-saving an existing assignment would count its hours twice and warn about an overload the
 * person does not have.
 */
export function previewSeat(
  row: CapacityRow,
  seat: ProposedSeat,
  opts: { planFrom: string; windowEnd: string; focusProjectId?: string | null; excludeTaskId?: string | null },
): SeatPreview {
  const excluded = opts.excludeTaskId ?? null;
  const focus = opts.focusProjectId ?? null;
  const byId = new Map(row.openTasks.map(t => [t.id, t]));

  const startKey = maxKey(seat.startDate?.slice(0, 10) || opts.planFrom, opts.planFrom);
  const endKey = minKey(seat.dueDate?.slice(0, 10) || opts.windowEnd, opts.windowEnd);

  // The days the assignment lands on, with the edited task's own hours removed from each.
  const inRange = row.days.filter(d => d.date >= startKey && d.date <= endKey);
  const committedOn = (d: CapacityDay): number => {
    if (!excluded) return d.load;
    const mine = (d.tasks ?? []).find(t => t.taskId === excluded)?.hours ?? 0;
    return Math.max(0, d.load - mine);
  };
  const workable = inRange.filter(d => d.capacity > 0);
  const byDate = new Map(workable.map(d => [d.date, d]));

  const requested = Math.max(0, seat.hours ?? 0);
  const placements = requested > EPS
    ? placeForward({
      remaining: requested,
      days: workable.map(d => asDate(d.date)),
      perDayCap: seat.hoursPerDay != null && seat.hoursPerDay > 0 ? seat.hoursPerDay : null,
      capacityOn: d => byDate.get(dayKey(d))?.capacity ?? 0,
      usedOn: d => { const hit = byDate.get(dayKey(d)); return hit ? committedOn(hit) : 0; },
    })
    : [];
  const addByDate = new Map(placements.map(p => [dayKey(p.date), p.hours]));

  let capacityHours = 0;
  let committedHours = 0;
  let freeHours = 0;
  let otherHours = 0;
  let restrictedHours = 0;
  let overHours = 0;
  let alreadyOverHours = 0;
  const overDays: string[] = [];
  const shares = new Map<string, ClientShare>();
  const days: SeatPreviewDay[] = workable.map(d => {
    const committed = committedOn(d);
    const add = addByDate.get(d.date) ?? 0;
    // The overload this assignment CAUSES: what the day would be over by afterwards, less what it
    // was already over by. See `overHours`.
    const already = Math.max(0, committed - d.capacity);
    const over = Math.max(0, Math.max(0, committed + add - d.capacity) - already);
    capacityHours += d.capacity;
    committedHours += committed;
    freeHours += Math.max(0, d.capacity - committed);
    alreadyOverHours += already;
    if (over > EPS) { overHours += over; overDays.push(d.date); }
    for (const entry of d.tasks ?? []) {
      if (entry.taskId === excluded) continue;
      const task = byId.get(entry.taskId);
      if (!task) continue;
      if (focus && task.projectId === focus) continue; // this client's own hours are not "other"
      otherHours += entry.hours;
      if (task.restricted) restrictedHours += entry.hours;
      const key = task.restricted ? '~restricted' : task.isTeamWork ? `team:${task.projectId ?? ''}` : (task.projectId ?? '~none');
      const share = shares.get(key) ?? {
        projectId: task.restricted ? null : task.projectId ?? null,
        label: task.restricted ? 'Other work' : task.project ?? 'Unassigned work',
        code: task.restricted ? null : task.projectPid ?? null,
        round: task.restricted ? undefined : task.projectRound,
        hours: 0,
        restricted: !!task.restricted,
        isTeamWork: !!task.isTeamWork,
      };
      share.hours += entry.hours;
      shares.set(key, share);
    }
    return { date: d.date, capacity: d.capacity, committed: r1(committed), add: r1(add), over: r1(over) };
  });

  const free = r1(freeHours);
  const over = r1(overHours);
  const verdict: Verdict =
    !workable.length ? 'NO_ROOM'
      : over > EPS ? 'OVER'
        // Nothing is being asked for yet — somebody has been named and not costed. That is not
        // "tight", it is a form half filled in, and calling it tight would cry wolf on every one.
        : requested > EPS && free - requested <= TIGHT_HOURS ? 'TIGHT'
          : 'FITS';

  const first = row.name.split(' ')[0];
  const span = workable.length
    ? `${workable[0].date} to ${workable[workable.length - 1].date}`
    : `${startKey} to ${endKey}`;
  const otherWords = otherHours > EPS ? ` ${r1(otherHours)}h of that is other work.` : '';
  const alreadyWords = alreadyOverHours > EPS ? ` They are already ${r1(alreadyOverHours)}h over on some of those days.` : '';
  const message =
    verdict === 'NO_ROOM'
      ? `${first} has no working days between ${startKey} and ${endKey} — weekend, holiday or leave.`
      : verdict === 'OVER'
        ? `${first} has ${free}h free over ${span} across all their work, so ${requested ? `${r1(requested)}h` : 'this'} puts ${over}h beyond their day${overDays.length === 1 ? '' : 's'} on ${overDays.length} ${overDays.length === 1 ? 'day' : 'days'}.${otherWords}${alreadyWords}`
        : verdict === 'TIGHT'
          ? `${first} has ${free}h free over ${span} across all their work — this takes nearly all of it.${otherWords}${alreadyWords}`
          : `${first} has ${free}h free over ${span} across all their work.${otherWords}${alreadyWords}`;

  return {
    userId: row.userId,
    name: row.name,
    from: workable[0]?.date ?? startKey,
    to: workable[workable.length - 1]?.date ?? endKey,
    requestedHours: r1(requested),
    capacityHours: r1(capacityHours),
    committedHours: r1(committedHours),
    freeHours: free,
    otherHours: r1(otherHours),
    restrictedHours: r1(restrictedHours),
    otherClients: [...shares.values()].map(s => ({ ...s, hours: r1(s.hours) })).filter(s => s.hours > 0).sort((a, b) => b.hours - a.hours),
    overHours: over,
    overDays,
    alreadyOverHours: r1(alreadyOverHours),
    days,
    verdict,
    message,
  };
}

function maxKey(a: string, b: string): string { return a > b ? a : b; }
function minKey(a: string, b: string): string { return a < b ? a : b; }

/**
 * The service half: who may be told what, and the two entry points every capacity route goes
 * through. It takes a board rather than computing one, so CapacityService stays the single owner
 * of the projection and this file stays the single owner of what is DONE with it.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly flows: WorkspaceFlowService,
  ) {}

  /**
   * Which clients this viewer may be told the name of — the same rule the clients list itself
   * uses (ProjectAccessService), so the board can never name a matter the list would hide.
   *
   * Membership of a matter in the OTHER flow grants nothing here. It could name nothing today —
   * the board is flow-filtered before it reaches this file — but a permit for work this flow does
   * not show is a permit waiting to be honoured by whatever reads this set next.
   */
  async visibility(actorId: string, organizationId: string): Promise<Visibility> {
    if (await this.access.hasOversight(actorId)) return { all: true, ids: new Set() };
    const flow = await this.flows.flowOf(organizationId);
    const mine = await this.prisma.projectMember.findMany({
      where: { userId: actorId, isActive: true, project: { deletedAt: null, workspaceFlow: flow } },
      select: { projectId: true },
    });
    return { all: false, ids: new Set(mine.map(m => m.projectId)) };
  }

  /** A board, made safe to show this viewer and split into this client's share and the rest. */
  async forBoard<T extends { rows: CapacityRow[] }>(
    board: T, actorId: string, organizationId: string, focusProjectId?: string | null,
  ): Promise<T> {
    const vis = await this.visibility(actorId, organizationId);
    apply(redact(board.rows, vis), focusProjectId ?? null);
    return board;
  }

  /** What these proposed seats would do to the people in them. */
  async preview(
    board: { from: string; to: string; rows: CapacityRow[] },
    actorId: string,
    organizationId: string,
    seats: ProposedSeat[],
    opts: { planFrom: string; focusProjectId?: string | null; excludeTaskId?: string | null },
  ): Promise<SeatPreview[]> {
    const vis = await this.visibility(actorId, organizationId);
    apply(redact(board.rows, vis), opts.focusProjectId ?? null);
    const byUser = new Map(board.rows.map(r => [r.userId, r]));
    const out: SeatPreview[] = [];
    for (const seat of seats) {
      const row = byUser.get(seat.userId);
      if (!row) continue;
      out.push(previewSeat(row, seat, {
        planFrom: maxKey(opts.planFrom, board.from),
        windowEnd: board.to,
        focusProjectId: opts.focusProjectId ?? null,
        excludeTaskId: opts.excludeTaskId ?? null,
      }));
    }
    return out;
  }
}
