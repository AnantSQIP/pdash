/**
 * Placing work on days.
 *
 * The capacity board used to have one load model: spread a task's remaining effort evenly from
 * today to its deadline. That treats a deadline as a plan, and it is not one — seven hours due in
 * ten days came out as 0.7h on each of ten days, so nobody ever looked genuinely free, no day
 * could be claimed for one piece of work, and an impossible fortnight read as a mildly full one.
 *
 * When a seat names its own start date the work is PLACED instead: filled forward from that day,
 * taking as much of each day as is free, until the hours are used up. That is what this file
 * does. It is kept separate from the module that queries the database because these two functions
 * carry all of the arithmetic anyone can get wrong, and both are pure — see
 * tools/capacity-placement.spec.ts.
 */

/** A seat whose person named when they start, ready to be laid onto days. */
export interface ScheduledSeat {
  userId: string;
  taskId: string;
  /** Effort still to do, in hours. */
  remaining: number;
  /** First day it may occupy (never before today — a past start plans what is LEFT from now). */
  startAt: Date;
  /** Ceiling on how much of one day this seat may take; null = as much as is free. */
  cap: number | null;
  priority: string;
  due: Date | null;
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Unknown or missing priority sorts as MEDIUM — the column's own default. */
export function priorityRank(p?: string | null): number {
  const hit = PRIORITY_RANK[(p ?? '').toUpperCase()];
  return hit === undefined ? PRIORITY_RANK.MEDIUM : hit;
}

/**
 * The order placed work claims days in.
 *
 * Placing rather than spreading makes tasks COMPETE for the same day, which the old model never
 * did — it gave every task a slice of every day. Competition needs an order, and the order has to
 * be TOTAL and STABLE: if two seats can ever compare equal, the board deals the days differently
 * on each refresh and nobody can trust what they saw a minute ago.
 *
 * Critical work takes the day first, then whatever is due soonest, then whatever starts soonest,
 * and the task id settles anything still tied so the result never depends on query order.
 * A seat with no deadline sorts after every seat that has one — an undated task is not urgent,
 * it is merely undated.
 */
export function compareScheduled(a: ScheduledSeat, b: ScheduledSeat): number {
  const at = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);
  return (
    priorityRank(a.priority) - priorityRank(b.priority) ||
    at(a.due) - at(b.due) ||
    a.startAt.getTime() - b.startAt.getTime() ||
    (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0)
  );
}

export interface Placement {
  date: Date;
  hours: number;
}

/**
 * Fill `remaining` hours forward across `days`, taking what each day still has room for.
 *
 * `days` must already be this person's WORKABLE days (no weekends, holidays or leave), in order,
 * and already filtered to start on or after the seat's start.
 *
 * `usedOn` reports how much of a day earlier placements have already claimed. Only PLACED work
 * counts there: the spread applied to unscheduled tasks is a guess about effort, not a claim on a
 * day, so it must never push placed work around.
 *
 * A day with no room is skipped and the work moves to the next one — that is how an absence or an
 * already-full day pushes a plan later, which is the behaviour the deadline check is built on.
 *
 * If the hours outlast the days, the remainder lands on the LAST day rather than being dropped.
 * Dropping it would hide exactly the overload that placing work exists to reveal; a day showing
 * 14h is the honest answer to a plan that does not fit.
 */
export function placeForward(opts: {
  remaining: number;
  days: Date[];
  perDayCap: number | null;
  dayCapacity: number;
  usedOn: (d: Date) => number;
}): Placement[] {
  const { remaining, days, perDayCap, dayCapacity, usedOn } = opts;
  // A hundredth of an hour is well below anything a person books, so treating it as nothing keeps
  // floating-point remainders from producing 0.0000001h slivers on a run of days.
  const EPS = 0.01;
  if (!(remaining > EPS) || !days.length) return [];

  const cap = perDayCap != null && perDayCap > 0 ? Math.min(perDayCap, dayCapacity) : dayCapacity;
  const out: Placement[] = [];
  let left = remaining;

  for (const d of days) {
    if (left <= EPS) break;
    const room = Math.min(cap, Math.max(0, dayCapacity - usedOn(d)));
    if (room <= EPS) continue; // spoken for — try the next day
    const take = Math.min(room, left);
    out.push({ date: d, hours: take });
    left -= take;
  }

  if (left > EPS) {
    const last = days[days.length - 1];
    const tail = out.length && out[out.length - 1].date === last ? out[out.length - 1] : null;
    if (tail) tail.hours += left;
    else out.push({ date: last, hours: left });
  }
  return out;
}
