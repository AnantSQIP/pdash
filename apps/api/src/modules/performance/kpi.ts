/**
 * The arithmetic behind the two performance KPIs.
 *
 * Performance used to be a second task list with a score bolted on: a backlog count, an activity
 * volume, an issue-severity pie, a leaderboard built from analytics events. None of it answered
 * the question the firm actually asks at an appraisal, which is only ever two questions —
 *
 *   1. Does this person's work cost what it was supposed to cost?
 *   2. Can we rely on them to deliver on the day, on the budget, again and again?
 *
 * Everything here serves those two and nothing else. It is kept pure and free of Prisma so the
 * numbers that land on somebody's appraisal can be read, argued with and tested without a
 * database — see tools/performance-kpi.spec.ts. The module that queries the database shapes rows
 * into `Delivery` and asks these functions what they mean.
 */

/**
 * A finished piece of work, reduced to the five facts the two KPIs are built from.
 *
 * `allocatedHours` is what THIS person was given, not what the task cost everybody: a task with
 * an analyst and a reviewer carries a per-seat allocation each, and judging the analyst against
 * the pair of them would mark them over budget for somebody else's review. Null means nobody set
 * an allocation, which is different from setting one of zero — see `hoursVerdict`.
 */
export interface Delivery {
  taskId: string;
  title?: string;
  projectId: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  roundSeq?: number | null;
  /** CRITICAL | HIGH | MEDIUM | LOW — the task's own column, uppercased by the caller. */
  priority: string;
  /** Hours this person was given for their part. Null when nobody set one. */
  allocatedHours: number | null;
  /** Hours this person actually booked against it. Null when nothing was booked. */
  spentHours: number | null;
  /** The deadline this person was working to (their seat's date, or the task's). */
  dueDate: Date | null;
  completedAt: Date | null;
}

/**
 * How far past its allocation an over-run has to go before it counts as a breach.
 *
 * Not 1.0. Time is booked in quarter- and half-hour blocks, so an eight-hour allocation
 * routinely closes at 8.25h with nothing at all having gone wrong; counting that as a breach
 * would fill the report with rounding and teach everyone to ignore it. Ten percent is 48 minutes
 * on an eight-hour job — inside the noise of how time is recorded, and outside it the over-run is
 * a decision somebody made rather than an artefact of the stopwatch.
 */
export const HOURS_BREACH_RATIO = 1.1;

/**
 * The red flag, in the owner's own words: "eight hours allocated and sixteen taken".
 *
 * That is exactly 2.0, and it is the right place to draw the second line. A job that takes a
 * quarter longer than planned is an estimate that was a little optimistic; a job that takes
 * TWICE as long was estimated against the wrong piece of work, or ran into something nobody
 * scoped. The first is worth a column, the second is worth a conversation, and the report has to
 * be able to tell them apart or the conversation never happens.
 */
export const RED_FLAG_RATIO = 2;

// SquarkIP runs on IST (Asia/Kolkata, no DST). Due dates are stored at UTC midnight and carry no
// time of day, so "on time" must be judged on the DATE in the org timezone rather than on a raw
// instant comparison — otherwise any same-day close after 05:30 IST (i.e. essentially every
// on-time close during 9–6 office hours) reads as late.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDayKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Delivered on or before the day it was due.
 *
 * Takes the COMPLETION date, not `updatedAt`. It used to take updatedAt, which meant a task
 * delivered on time turned retroactively late the moment anybody edited it afterwards — fixing a
 * typo in a closed task could damage somebody's on-time rate, and that rate feeds their appraisal.
 *
 * The boundary is inclusive on purpose: finishing ON the deadline is meeting it, not missing it.
 */
export function isOnTime(completedAt: Date, dueDate: Date): boolean {
  return istDayKey(completedAt) <= utcDayKey(dueDate);
}

// ── KPI 1 — time spent against time allocated ──────────────────────────────────

/**
 * WITHIN / OVER / RED_FLAG, or UNMEASURED when there is nothing to measure against.
 *
 * A task with no allocation cannot breach an allocation. It is UNMEASURED rather than a pass:
 * counting it as within budget would let a team improve its score by not estimating anything,
 * which is precisely backwards. Every total below therefore excludes it from the denominator and
 * reports the count separately, so the figure on screen can be honest about what it left out.
 *
 * An allocation of zero is treated the same way. Zero is what a reviewer's seat carries when they
 * were never given hours of their own, and dividing by it produces an infinite over-run that
 * would dominate every average it touches.
 */
export type HoursVerdict = 'WITHIN' | 'OVER' | 'RED_FLAG' | 'UNMEASURED';

export function hoursVerdict(d: Delivery): HoursVerdict {
  const allocated = d.allocatedHours;
  if (allocated == null || !(allocated > 0)) return 'UNMEASURED';
  // No time booked at all is not an over-run — it is a job that cost nothing on paper, which is
  // a timesheet problem rather than a budget one, and KPI 1 is not the place to raise it.
  const spent = d.spentHours ?? 0;
  const ratio = spent / allocated;
  if (ratio >= RED_FLAG_RATIO) return 'RED_FLAG';
  return ratio > HOURS_BREACH_RATIO ? 'OVER' : 'WITHIN';
}

/** How many times over its allocation a delivery ran; null when there was no allocation. */
export function overrunRatio(d: Delivery): number | null {
  const allocated = d.allocatedHours;
  if (allocated == null || !(allocated > 0)) return null;
  return round2((d.spentHours ?? 0) / allocated);
}

/** True for the deliveries KPI 1 counts as a breach — OVER and RED_FLAG alike. */
export function breachedHours(d: Delivery): boolean {
  const v = hoursVerdict(d);
  return v === 'OVER' || v === 'RED_FLAG';
}

export interface HoursKpi {
  /** Deliveries that had an allocation, and so could be judged at all. */
  measured: number;
  within: number;
  over: number;
  redFlag: number;
  /** Had no allocation. Excluded from every rate above; shown so the rate can be trusted. */
  unmeasured: number;
  allocatedHours: number;
  spentHours: number;
  /** Hours beyond the allocation, summed over the breaches only. */
  overHours: number;
  /** Share of measured deliveries that stayed within budget. Null when nothing was measurable. */
  withinRate: number | null;
  /** The worst single over-run in the set — the one worth asking about. */
  worstRatio: number | null;
}

export function summariseHours(deliveries: Delivery[]): HoursKpi {
  const out: HoursKpi = {
    measured: 0, within: 0, over: 0, redFlag: 0, unmeasured: 0,
    allocatedHours: 0, spentHours: 0, overHours: 0, withinRate: null, worstRatio: null,
  };
  for (const d of deliveries) {
    const verdict = hoursVerdict(d);
    if (verdict === 'UNMEASURED') { out.unmeasured++; continue; }
    const allocated = d.allocatedHours ?? 0;
    const spent = d.spentHours ?? 0;
    out.measured++;
    out.allocatedHours += allocated;
    out.spentHours += spent;
    if (verdict === 'WITHIN') out.within++;
    else {
      if (verdict === 'RED_FLAG') out.redFlag++; else out.over++;
      out.overHours += spent - allocated;
    }
    const ratio = spent / allocated;
    if (out.worstRatio == null || ratio > out.worstRatio) out.worstRatio = ratio;
  }
  out.allocatedHours = round1(out.allocatedHours);
  out.spentHours = round1(out.spentHours);
  out.overHours = round1(out.overHours);
  out.worstRatio = out.worstRatio == null ? null : round2(out.worstRatio);
  out.withinRate = out.measured > 0 ? pct(out.within, out.measured) : null;
  return out;
}

// ── KPI 1b / requirement 8 — deadline breaches ─────────────────────────────────

/**
 * ON_TIME / LATE, or UNDATED when nobody set a deadline.
 *
 * UNDATED is kept apart from ON_TIME for the same reason UNMEASURED is kept apart from WITHIN:
 * a task nobody gave a date to was not delivered punctually, it was delivered to no date at all,
 * and a rate that quietly counts those as successes is a rate that improves when people stop
 * setting deadlines.
 */
export type DeadlineVerdict = 'ON_TIME' | 'LATE' | 'UNDATED';

export function deadlineVerdict(d: Delivery): DeadlineVerdict {
  if (!d.dueDate || !d.completedAt) return 'UNDATED';
  return isOnTime(d.completedAt, d.dueDate) ? 'ON_TIME' : 'LATE';
}

export interface DeadlineKpi {
  /** Deliveries that had a deadline, and so could be judged at all. */
  dated: number;
  onTime: number;
  late: number;
  undated: number;
  onTimeRate: number | null;
  /** Calendar days late, summed over the late deliveries only. */
  lateDays: number;
  /** The worst single slip in the set, in days. */
  worstLateDays: number | null;
}

export function summariseDeadlines(deliveries: Delivery[]): DeadlineKpi {
  const out: DeadlineKpi = { dated: 0, onTime: 0, late: 0, undated: 0, onTimeRate: null, lateDays: 0, worstLateDays: null };
  for (const d of deliveries) {
    const verdict = deadlineVerdict(d);
    if (verdict === 'UNDATED') { out.undated++; continue; }
    out.dated++;
    if (verdict === 'ON_TIME') { out.onTime++; continue; }
    out.late++;
    const slip = daysLate(d.completedAt!, d.dueDate!);
    out.lateDays += slip;
    if (out.worstLateDays == null || slip > out.worstLateDays) out.worstLateDays = slip;
  }
  out.onTimeRate = out.dated > 0 ? pct(out.onTime, out.dated) : null;
  return out;
}

/** Whole calendar days between the deadline and the delivery, measured on IST days. */
export function daysLate(completedAt: Date, dueDate: Date): number {
  const done = Date.parse(`${istDayKey(completedAt)}T00:00:00.000Z`);
  const due = Date.parse(`${utcDayKey(dueDate)}T00:00:00.000Z`);
  return Math.max(0, Math.round((done - due) / 86_400_000));
}

// ── Requirement 10 — "how many TIMES, and for how many THINGS" ─────────────────

/**
 * The owner asked for exactly two numbers per kind of breach, and they are not the same number.
 *
 * A deadline can be pushed five times on one project; a task reopened and re-closed can blow its
 * budget twice. "Five times across one project" and "five different projects slipping once each"
 * are two completely different problems that a single count cannot tell apart, which is why both
 * travel together everywhere in this module.
 */
export interface BreachCount {
  /** How many times the limit was crossed. */
  times: number;
  /** How many distinct things crossed it. */
  things: number;
}

export function countBreaches(events: { entityId: string }[]): BreachCount {
  return { times: events.length, things: new Set(events.map(e => e.entityId)).size };
}

// ── Requirements 5 & 11 — which projects the breaches happened in ──────────────

export interface ProjectBreachRow {
  projectId: string | null;
  projectName: string;
  projectCode: string | null;
  roundSeq: number | null;
  /** Deliveries in this project inside the window. */
  deliveries: number;
  hoursBreaches: BreachCount;
  deadlineBreaches: BreachCount;
  allocatedHours: number;
  spentHours: number;
  /** Spent ÷ allocated across the whole project. Null when nothing here had an allocation. */
  overrun: number | null;
  /** Deliveries here with no allocation at all — the part of the row nothing could judge. */
  unmeasured: number;
}

/**
 * Breaches grouped by project, worst first.
 *
 * This is the screen requirement 5 describes: somebody consistently over across ten projects has
 * to be visible at a glance, which means one row per project ordered by how bad it is, not a
 * chronological list of tasks the reader has to add up themselves. Work with no project (team
 * space, an internal job) is grouped under a single row rather than dropped, so the rows still
 * add up to the totals shown above them.
 */
export function breachesByProject(deliveries: Delivery[]): ProjectBreachRow[] {
  const rows = new Map<string, ProjectBreachRow & { hoursEvents: { entityId: string }[]; dateEvents: { entityId: string }[] }>();
  for (const d of deliveries) {
    const key = d.projectId ?? '';
    let row = rows.get(key);
    if (!row) {
      row = {
        projectId: d.projectId ?? null,
        projectName: d.projectName ?? (d.projectId ? 'Unknown project' : 'No project'),
        projectCode: d.projectCode ?? null,
        roundSeq: d.roundSeq ?? null,
        deliveries: 0,
        hoursBreaches: { times: 0, things: 0 },
        deadlineBreaches: { times: 0, things: 0 },
        allocatedHours: 0, spentHours: 0, overrun: null, unmeasured: 0,
        hoursEvents: [], dateEvents: [],
      };
      rows.set(key, row);
    }
    row.deliveries++;
    if (hoursVerdict(d) === 'UNMEASURED') row.unmeasured++;
    else {
      row.allocatedHours += d.allocatedHours ?? 0;
      row.spentHours += d.spentHours ?? 0;
      if (breachedHours(d)) row.hoursEvents.push({ entityId: d.taskId });
    }
    if (deadlineVerdict(d) === 'LATE') row.dateEvents.push({ entityId: d.taskId });
  }

  const out: ProjectBreachRow[] = [];
  for (const row of rows.values()) {
    const { hoursEvents, dateEvents, ...rest } = row;
    out.push({
      ...rest,
      hoursBreaches: countBreaches(hoursEvents),
      deadlineBreaches: countBreaches(dateEvents),
      allocatedHours: round1(rest.allocatedHours),
      spentHours: round1(rest.spentHours),
      overrun: rest.allocatedHours > 0 ? round2(rest.spentHours / rest.allocatedHours) : null,
    });
  }
  // Worst first: most breaches, then the biggest over-run, then the name so the order never
  // depends on which row the database happened to return first.
  return out.sort((a, b) =>
    (b.hoursBreaches.times + b.deadlineBreaches.times) - (a.hoursBreaches.times + a.deadlineBreaches.times) ||
    (b.overrun ?? 0) - (a.overrun ?? 0) ||
    a.projectName.localeCompare(b.projectName));
}

// ── KPI 2 — the streak ─────────────────────────────────────────────────────────

/**
 * CLEAN, BROKEN, or SKIPPED.
 *
 * The owner's words were "the streak of consistently delivering on time and within allocated
 * time", and the AND is the whole point — the two KPIs are supposed to correlate, so a run that
 * counted only punctuality would hide exactly the case he is worried about (delivered on the day,
 * at twice the cost).
 *
 * SKIPPED is the case where neither axis exists: no deadline AND no allocation. Such a delivery
 * is passed over entirely rather than counted good — it neither extends a run nor ends one,
 * because there is nothing about it to be reliable at. A delivery judged on ONE axis counts
 * normally: missing an allocation does not excuse missing the deadline.
 */
export type StreakVerdict = 'CLEAN' | 'BROKEN' | 'SKIPPED';

export function streakVerdict(d: Delivery): StreakVerdict {
  const hours = hoursVerdict(d);
  const date = deadlineVerdict(d);
  if (hours === 'UNMEASURED' && date === 'UNDATED') return 'SKIPPED';
  if (date === 'LATE' || hours === 'OVER' || hours === 'RED_FLAG') return 'BROKEN';
  return 'CLEAN';
}

export interface Streak {
  /** The run still standing at the end of the window. */
  current: number;
  /** The best run anywhere in the window. */
  longest: number;
  /** Deliveries the streak could judge at all. */
  judged: number;
  /** Deliveries with neither a deadline nor an allocation — passed over, and said so. */
  skipped: number;
  /** What ended the current run, when something did. */
  brokenBy: { taskId: string; title?: string; reason: 'LATE' | 'OVER_HOURS' | 'BOTH'; at: string } | null;
}

/**
 * The run of clean deliveries, in the order the work was finished.
 *
 * Ties on the completion instant are settled by task id so two tasks closed in the same second
 * cannot produce a different streak on each page load — the same reason the capacity board's
 * ordering is total rather than merely mostly-total.
 */
export function computeStreak(deliveries: Delivery[]): Streak {
  const ordered = [...deliveries].sort((a, b) => {
    const at = a.completedAt ? a.completedAt.getTime() : 0;
    const bt = b.completedAt ? b.completedAt.getTime() : 0;
    return at - bt || (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0);
  });

  const out: Streak = { current: 0, longest: 0, judged: 0, skipped: 0, brokenBy: null };
  let run = 0;
  for (const d of ordered) {
    const verdict = streakVerdict(d);
    if (verdict === 'SKIPPED') { out.skipped++; continue; }
    out.judged++;
    if (verdict === 'CLEAN') {
      run++;
      if (run > out.longest) out.longest = run;
      continue;
    }
    run = 0;
    const late = deadlineVerdict(d) === 'LATE';
    const over = breachedHours(d);
    out.brokenBy = {
      taskId: d.taskId,
      title: d.title,
      reason: late && over ? 'BOTH' : late ? 'LATE' : 'OVER_HOURS',
      at: d.completedAt ? istDayKey(d.completedAt) : '',
    };
  }
  out.current = run;
  // A run still standing at the end of the window was never broken inside it, so there is nothing
  // to name. Reporting the last break from earlier in the window alongside a live streak reads as
  // "your streak of 4 was broken by…", which is the opposite of what happened.
  if (run > 0) out.brokenBy = null;
  return out;
}

// ── Requirements 18–20 — the project, and its manager ──────────────────────────

/** What a project contributes to its manager's performance. */
export interface ProjectInput {
  projectId: string;
  name: string;
  code: string | null;
  roundSeq: number | null;
  /** Whoever holds the MANAGER seat on the project — usually one person, occasionally more. */
  managerIds: string[];
  /** Times the PROJECT's own deadline moved, from the recorded deadline changes. */
  projectShifts: number;
  /** Times a deadline moved on one of its TASKS. */
  taskShifts: number;
  /** The project's completed tasks in the window, judged on the TASK's budget and date. */
  tasks: Delivery[];
}

export interface ProjectPerformance {
  projectId: string;
  name: string;
  code: string | null;
  roundSeq: number | null;
  managerIds: string[];
  /** Requirement 18: how many times the allocated deadline had to be shifted. */
  deadlineShifts: BreachCount;
  hours: HoursKpi;
  deadlines: DeadlineKpi;
  /** Requirement 19: the same over-run arithmetic, over the HIGH and CRITICAL tasks only. */
  importantHours: HoursKpi;
  /** Spent ÷ allocated across every measurable task. Null when none had an allocation. */
  overrun: number | null;
  tasksCompleted: number;
}

/** The task priorities requirement 19 calls "important". */
const IMPORTANT_PRIORITIES = new Set(['CRITICAL', 'HIGH']);

/**
 * One project's contribution, ready to be attributed to whoever runs it.
 *
 * `deadlineShifts` counts the project's own moves and its tasks' moves together as TIMES, and
 * counts the project as ONE thing — a project whose dates were pushed six times is one project in
 * trouble, not six. Where no shift was ever recorded the count is zero, which is the honest
 * answer for a project that predates the deadline ledger as well as for one that never slipped:
 * the panel says "no recorded shifts" rather than pretending to know they never happened.
 */
export function summariseProject(p: ProjectInput): ProjectPerformance {
  const important = p.tasks.filter(t => IMPORTANT_PRIORITIES.has((t.priority ?? '').toUpperCase()));
  const hours = summariseHours(p.tasks);
  const shiftTimes = p.projectShifts + p.taskShifts;
  return {
    projectId: p.projectId,
    name: p.name,
    code: p.code,
    roundSeq: p.roundSeq,
    managerIds: p.managerIds,
    deadlineShifts: { times: shiftTimes, things: shiftTimes > 0 ? 1 : 0 },
    hours,
    deadlines: summariseDeadlines(p.tasks),
    importantHours: summariseHours(important),
    overrun: hours.allocatedHours > 0 ? round2(hours.spentHours / hours.allocatedHours) : null,
    tasksCompleted: p.tasks.length,
  };
}

export interface ManagerPerformance {
  userId: string;
  projects: number;
  /** Requirement 18, rolled up: times any of their deadlines moved, across how many projects. */
  deadlineShifts: BreachCount;
  /** Requirement 20: the aggregate overshoot of everything they run. */
  overrun: number | null;
  importantOverrun: number | null;
  allocatedHours: number;
  spentHours: number;
  tasksCompleted: number;
  hoursBreaches: BreachCount;
  deadlineBreaches: BreachCount;
  onTimeRate: number | null;
  unmeasured: number;
}

/**
 * Requirement 20: a project's aggregated overshoot, set against its aggregated delivery, IS the
 * project manager's performance.
 *
 * Rolled up per manager rather than per project because that is the claim being made — a PM is
 * answerable for the portfolio they run, and a PM with one runaway project among six looks very
 * different from one whose six are all a third over. Co-managed projects count in full for each
 * manager: splitting a project's over-run between two people would make each of them look half
 * as responsible for a thing they are each wholly responsible for.
 */
export function rollUpManagers(projects: ProjectPerformance[]): ManagerPerformance[] {
  const byManager = new Map<string, ManagerPerformance & { shiftProjects: Set<string>; overTasks: Set<string>; lateTasks: Set<string>; importantAllocated: number; importantSpent: number; dated: number; onTime: number }>();
  for (const p of projects) {
    for (const userId of p.managerIds) {
      let m = byManager.get(userId);
      if (!m) {
        m = {
          userId, projects: 0,
          deadlineShifts: { times: 0, things: 0 },
          overrun: null, importantOverrun: null,
          allocatedHours: 0, spentHours: 0, tasksCompleted: 0,
          hoursBreaches: { times: 0, things: 0 },
          deadlineBreaches: { times: 0, things: 0 },
          onTimeRate: null, unmeasured: 0,
          shiftProjects: new Set(), overTasks: new Set(), lateTasks: new Set(),
          importantAllocated: 0, importantSpent: 0, dated: 0, onTime: 0,
        };
        byManager.set(userId, m);
      }
      m.projects++;
      m.deadlineShifts.times += p.deadlineShifts.times;
      if (p.deadlineShifts.times > 0) m.shiftProjects.add(p.projectId);
      m.allocatedHours += p.hours.allocatedHours;
      m.spentHours += p.hours.spentHours;
      m.importantAllocated += p.importantHours.allocatedHours;
      m.importantSpent += p.importantHours.spentHours;
      m.tasksCompleted += p.tasksCompleted;
      m.unmeasured += p.hours.unmeasured;
      // TIMES counts the tasks that went over; THINGS counts the PROJECTS those tasks sit in.
      // The two halves are deliberately at different grains here, because that is the question
      // asked of a portfolio: "eleven tasks over, spread across two of your six projects" says
      // something "eleven over" alone does not. Every task already has its own row on the project
      // panel, so nothing is lost by rolling the second half up.
      m.hoursBreaches.times += p.hours.over + p.hours.redFlag;
      if (p.hours.over + p.hours.redFlag > 0) m.overTasks.add(p.projectId);
      m.deadlineBreaches.times += p.deadlines.late;
      if (p.deadlines.late > 0) m.lateTasks.add(p.projectId);
      m.dated += p.deadlines.dated;
      m.onTime += p.deadlines.onTime;
    }
  }

  const out: ManagerPerformance[] = [];
  for (const m of byManager.values()) {
    const { shiftProjects, overTasks, lateTasks, importantAllocated, importantSpent, dated, onTime, ...rest } = m;
    out.push({
      ...rest,
      deadlineShifts: { times: m.deadlineShifts.times, things: shiftProjects.size },
      hoursBreaches: { times: m.hoursBreaches.times, things: overTasks.size },
      deadlineBreaches: { times: m.deadlineBreaches.times, things: lateTasks.size },
      allocatedHours: round1(m.allocatedHours),
      spentHours: round1(m.spentHours),
      overrun: m.allocatedHours > 0 ? round2(m.spentHours / m.allocatedHours) : null,
      importantOverrun: importantAllocated > 0 ? round2(importantSpent / importantAllocated) : null,
      onTimeRate: dated > 0 ? pct(onTime, dated) : null,
    });
  }
  // Worst overshoot first — the point of the panel is to find the portfolio that is running hot.
  return out.sort((a, b) => (b.overrun ?? 0) - (a.overrun ?? 0) || b.deadlineShifts.times - a.deadlineShifts.times);
}

// ── small shared arithmetic ────────────────────────────────────────────────────

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
function round1(n: number): number {
  return Math.round((n ?? 0) * 10) / 10;
}
function round2(n: number): number {
  return Math.round((n ?? 0) * 100) / 100;
}
