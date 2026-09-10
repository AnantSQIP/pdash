/**
 * What is worth saying about a line somebody has typed into their day.
 *
 * Lives with the UI, not the API, and deliberately: these are ADVISORY. The server enforces what
 * is impossible — not being staffed on the task, a closed matter, the 16h day cap, the backdating
 * windows — and refuses those outright. Nothing here can be relied on for correctness, and
 * nothing here blocks a save. Its whole job is to be in front of the person's eyes while they
 * type, which is the only moment any of it can actually be acted on.
 *
 * THE PROBLEM THIS EXISTS FOR
 *
 * A day sheet lists the work and asks for hours. Nothing can tell whether a person actually did
 * a piece of work — only they know that — so the question is not "how do we stop a wrong entry",
 * which is unanswerable, but "how do we make the honest entry effortless and the mistaken one
 * visible". Three tiers, and everything below is about which tier a line falls into:
 *
 *   REFUSED    Impossible or forbidden. Enforced on the server, not here: not being staffed on
 *              the task, a closed matter, a future date, past the backdating window, over the
 *              16h day cap. A line like this cannot be saved at all.
 *   QUESTIONED Possible, allowed, and worth a second look before it goes in — hours against work
 *              that was not planned for that day, more hours than the task has left, a task that
 *              is already finished, one task swallowing a whole day.
 *   SILENT     Planned work, plausible hours. Says nothing, because saying something about
 *              ordinary entries is how people learn to click past warnings.
 *
 * The single most important decision is not in this file: hours are NEVER pre-filled. A row
 * carries time only because a person typed it. Pre-filling the planned hours would have everyone
 * saving their plan every evening whether they worked it or not, and a timesheet that records the
 * plan instead of the day is worse than no timesheet — it is confidently wrong.
 */

/** A day's worth of context about one task, as the sheet knows it. */
export interface DayPlanRow {
  taskId: string;
  /** Hours the plan puts on this task for the day being filled in. 0 = not planned for it. */
  plannedHours: number;
  /** Hours already filed against this task on this date, before whatever is being typed now. */
  loggedToday: number;
  /** What is left on the task for this person: their estimate minus what they have filed. */
  remainingHours: number;
  /** The task is already in a closed status. */
  closed: boolean;
  /** Which bucket the sheet listed it under. */
  when: 'TODAY' | 'TOMORROW' | 'OTHER';
}

export type WarningCode =
  | 'NOT_PLANNED'
  | 'OVER_REMAINING'
  | 'ALREADY_FINISHED'
  | 'MORE_THAN_A_DAY';

export interface LineWarning {
  code: WarningCode;
  message: string;
}

/** A full working day. More than this against ONE task in ONE day deserves a second look. */
export const FULL_DAY_HOURS = 8;
/** Below this, an overrun is rounding rather than a discrepancy worth mentioning. */
const OVERRUN_TOLERANCE = 0.25;

/**
 * What to say about one line. Empty means "nothing worth saying" — which is most lines, and
 * deliberately so.
 *
 * Order matters: the first reason is the one a person acts on, so the most specific and most
 * likely-to-be-a-mistake comes first. "This is not what you were meant to be doing today" is the
 * question actually worth asking; "that is a long day" is small talk next to it.
 */
export function warningsFor(row: DayPlanRow, hours: number): LineWarning[] {
  const out: LineWarning[] = [];
  if (!(hours > 0)) return out; // an untouched line is not a line

  if (row.closed) {
    out.push({
      code: 'ALREADY_FINISHED',
      message: 'This task is already finished — log here only if you really did more work on it.',
    });
  }

  // The case the whole design is for: hours against something the plan did not have them doing
  // that day. Normal — plans change hourly — but it is the shape a mistyped row takes, so it is
  // the one worth showing.
  if (row.plannedHours <= 0 && !row.closed) {
    out.push({
      code: 'NOT_PLANNED',
      message: row.when === 'TOMORROW'
        ? 'This was planned for tomorrow, not this day.'
        : 'This was not on your plan for this day.',
    });
  }

  // More than the task has left. Either the estimate was low, or this is the wrong row — and the
  // person can tell which instantly, where the server never could.
  const left = row.remainingHours - row.loggedToday;
  if (left > 0 && hours > left + OVERRUN_TOLERANCE) {
    out.push({
      code: 'OVER_REMAINING',
      message: `Only ${round(left)}h were left on this task — logging ${round(hours)}h.`,
    });
  }

  if (hours > FULL_DAY_HOURS) {
    out.push({
      code: 'MORE_THAN_A_DAY',
      message: `${round(hours)}h on one task in one day.`,
    });
  }
  return out;
}

/** Every line's warnings, keyed by task, for a whole sheet. */
export function warningsForSheet(
  rows: DayPlanRow[],
  hoursByTask: Record<string, number>,
): Record<string, LineWarning[]> {
  const out: Record<string, LineWarning[]> = {};
  for (const row of rows) {
    const w = warningsFor(row, hoursByTask[row.taskId] ?? 0);
    if (w.length) out[row.taskId] = w;
  }
  return out;
}

/**
 * One sentence for the whole sheet, or null when there is nothing to say.
 *
 * A per-line warning is where somebody fixes a mistake; this is what stops a sheet full of them
 * being saved without anybody reading one. Counted by LINE rather than by warning, because three
 * remarks about one row is still one row to look at.
 */
export function sheetSummary(warnings: Record<string, LineWarning[]>): string | null {
  const lines = Object.keys(warnings).length;
  if (!lines) return null;
  const codes = new Set(Object.values(warnings).flat().map(w => w.code));
  const parts: string[] = [];
  if (codes.has('NOT_PLANNED')) parts.push('work that was not on your plan');
  if (codes.has('OVER_REMAINING')) parts.push('more hours than a task had left');
  if (codes.has('ALREADY_FINISHED')) parts.push('a task already finished');
  if (codes.has('MORE_THAN_A_DAY')) parts.push('over eight hours on one task');
  const what = parts.length === 1 ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${lines} ${lines === 1 ? 'line needs' : 'lines need'} a look — ${what}.`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
