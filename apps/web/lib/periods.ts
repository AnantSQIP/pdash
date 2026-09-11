/**
 * The periods performance is reviewed over.
 *
 * Plain arithmetic, kept out of the component file so it can be read and tested on its own —
 * it decides what window every figure on the Performance page is measured across. See
 * tools/periods.spec.ts.
 *
 * There are two kinds of window here, and the difference is the whole reason this file grew.
 *
 * ROLLING windows always end today. That is what the module used to offer and nothing else, and
 * it is why "Tasks Completed" showed a half-finished week: measured "through today", the week on
 * screen was the one still being worked, so the figure was always short and never comparable with
 * the week before it. Rolling windows are still here — a five-working-day lookback is the right
 * shape for "how has the last few days gone" — but they are no longer the only choice.
 *
 * CALENDAR windows are whole, finished units: the previous Monday-to-Sunday week, the previous
 * calendar month, the previous quarter. A finished week does not change when you look at it, so
 * two people reading the same review see the same number, and this week's figure can be set
 * against last week's without comparing four days with seven.
 */

import { startOfWeekMonday } from './date';

export type PeriodKey = 'week' | 'quarter' | 'half' | 'year';

/**
 * Calendar days spanned by the last `n` working days, weekends excluded.
 *
 * Five working days is not seven calendar days. A seven-day lookback from a Wednesday counts
 * two weekend days as though somebody might have worked them; walking back five WORKING days
 * lands the boundary on a day the firm works. From a Monday it reaches the whole previous
 * week rather than half of it.
 */
export function workingDaysBack(n: number, today: Date = new Date()): number {
  // The window the caller ends up with is (today - result, today] — it EXCLUDES its own start
  // boundary and INCLUDES today. So the count has to start at today, not the day before it.
  //
  // Counting from the day before looked right every weekday and was wrong at the weekend:
  // from a Saturday it returned five calendar days, and Saturday itself contributes no work,
  // so the window covered only four working days. Anyone opening this on a Saturday would
  // have seen a short week with nothing to say so.
  let counted = 0;
  let calendar = 0;
  // Bounded so a bad argument cannot spin: 400 days is past any period offered.
  while (counted < n && calendar < 400) {
    const d = new Date(today);
    d.setDate(d.getDate() - calendar);
    const day = d.getDay();
    if (day !== 0 && day !== 6) counted++;
    calendar++;
  }
  return calendar;
}

/**
 * Rolling rather than calendar periods — "the last quarter", not "Q2". Each is compared against
 * the equally long period before it, which is what makes a trend arrow mean anything.
 *
 * Kept because the heatmap and the daily trend lines are genuinely rolling: they plot one point
 * per day and have no need of a week boundary. The KPI figures use CALENDAR_PERIODS below.
 */
export const PERIODS: { key: PeriodKey; label: string; days: () => number }[] = [
  { key: 'week',    label: '5 working days', days: () => workingDaysBack(5) },
  { key: 'quarter', label: 'Quarter',        days: () => 90 },
  { key: 'half',    label: 'Half-year',      days: () => 182 },
  { key: 'year',    label: 'Year',           days: () => 365 },
];

/** The label for a day count, so the page can describe the window it is showing. */
export function periodLabel(days: number): string {
  return PERIODS.find(p => p.days() === days)?.label ?? `last ${days} days`;
}

// ── Calendar periods ─────────────────────────────────────────────────────────────

export type CalendarPeriodKey = 'last-week' | 'last-month' | 'quarterly' | 'annually';

/**
 * A window and the window it should be compared against.
 *
 * Half-open: `from` is included, `to` is not. Every boundary in this module is a local midnight,
 * so a window never clips a day in half and no figure depends on the hour somebody opened the
 * page.
 */
export interface PeriodWindow {
  key: CalendarPeriodKey;
  label: string;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /**
   * True when the window has not finished yet.
   *
   * Every period offered today is a finished one, so this is always false — but the field stays,
   * and the page still honours it. A partial window under-reports every count in it by
   * construction, and a reader who does not know that reads a short month as a bad one. Keeping
   * the flag means a running period can be offered again later without the page quietly
   * reporting it as complete.
   */
  partial: boolean;
}

/**
 * The periods offered, in the order the picker shows them: shortest first, so the four read as
 * one scale from a week to a year.
 *
 * Every one of them is a window that has ENDED. That is the rule the module is built on — a
 * running period under-reports every count in it, which is how "tasks completed" came to show a
 * fifth of the truth each Monday. Month-to-date and the five-week window were dropped from this
 * list on the owner's instruction (11 Sep 2026); the machinery for a running window is still
 * here, so one can be added back without the page reporting it as finished.
 */
export const CALENDAR_PERIODS: { key: CalendarPeriodKey; label: string }[] = [
  { key: 'last-week',  label: 'Last week' },
  { key: 'last-month', label: 'Last month' },
  { key: 'quarterly',  label: 'Quarterly' },
  { key: 'annually',   label: 'Annually' },
];

export const DEFAULT_PERIOD: CalendarPeriodKey = 'last-week';

/** Local midnight on the day `d` falls in. */
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfMonth(year: number, monthIndex0: number): Date {
  // `new Date(y, m, 1)` normalises a month index outside 0–11 on its own, so December of the
  // previous year is month -1 and needs no special case. Every year-boundary case in this file
  // rests on that, which is why none of them is written out by hand.
  return new Date(year, monthIndex0, 1, 0, 0, 0, 0);
}

/**
 * The window for a period, and the comparable window before it.
 *
 * Weeks run MONDAY to SUNDAY, matching every other calendar in the dashboard (lib/date.ts is the
 * single source of that convention). The whole seven days are taken rather than Mon–Fri: weekend
 * work is rare here but it is real, and a window that silently drops it would leave hours logged
 * on a Saturday out of every figure on the page while the timesheet still showed them.
 *
 * `today` is injectable so the boundary cases — a Monday, a Sunday, the 1st of January — can be
 * tested rather than waited for.
 */
export function periodWindow(key: CalendarPeriodKey, today: Date = new Date()): PeriodWindow {
  const label = CALENDAR_PERIODS.find(p => p.key === key)?.label ?? key;
  const day = startOfDay(today);

  switch (key) {
    case 'last-week': {
      // The week that has FINISHED. Asked on a Monday that is the seven days ending yesterday;
      // asked on a Sunday it is the week before the one that Sunday closes, because under a
      // Monday-first convention Sunday is still the current week and the current week is not
      // over. Anything else would let the answer change halfway through a Sunday.
      const thisMonday = startOfWeekMonday(day);
      const from = addDays(thisMonday, -7);
      return { key, label, from, to: thisMonday, prevFrom: addDays(from, -7), prevTo: from, partial: false };
    }
    case 'last-month': {
      const firstOfThis = startOfMonth(day.getFullYear(), day.getMonth());
      const from = startOfMonth(day.getFullYear(), day.getMonth() - 1);
      const prevFrom = startOfMonth(day.getFullYear(), day.getMonth() - 2);
      return { key, label, from, to: firstOfThis, prevFrom, prevTo: from, partial: false };
    }
    case 'quarterly': {
      // The last FINISHED calendar quarter: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. Asked in
      // September, that is April to June — not the quarter still being worked.
      const thisQuarterStartMonth = Math.floor(day.getMonth() / 3) * 3;
      const to = startOfMonth(day.getFullYear(), thisQuarterStartMonth);
      const from = startOfMonth(day.getFullYear(), thisQuarterStartMonth - 3);
      const prevFrom = startOfMonth(day.getFullYear(), thisQuarterStartMonth - 6);
      return { key, label, from, to, prevFrom, prevTo: from, partial: false };
    }
    case 'annually':
    default: {
      // The last twelve FINISHED months, ending at the start of this one — not the last finished
      // calendar year.
      //
      // Both readings are defensible and they give very different answers. Asked in September,
      // the calendar-year reading shows January to December of the year before: eight months
      // stale, and useless at the appraisal it exists for. This reading always ends last month,
      // so an annual figure is never more than a few weeks behind the person it describes, and it
      // is still a whole number of finished months rather than a part-year.
      //
      // Note it is NOT the Indian financial year (April–March) that the appraisal module uses.
      // If the firm wants performance cut that way too, that is a fifth period, not a change to
      // this one — the two answer different questions and both are worth having.
      const firstOfThis = startOfMonth(day.getFullYear(), day.getMonth());
      const from = startOfMonth(day.getFullYear(), day.getMonth() - 12);
      const prevFrom = startOfMonth(day.getFullYear(), day.getMonth() - 24);
      return { key: 'annually', label, from, to: firstOfThis, prevFrom, prevTo: from, partial: false };
    }
  }
}

/**
 * A window as the four day strings the KPI endpoints take.
 *
 * Days rather than instants: the server reads each as IST midnight, so the window lines up with
 * the office's own calendar instead of starting at half past five in the morning.
 */
export function apiRange(w: PeriodWindow): { from: string; to: string; prevFrom: string; prevTo: string } {
  return { from: isoDay(w.from), to: isoDay(w.to), prevFrom: isoDay(w.prevFrom), prevTo: isoDay(w.prevTo) };
}

/** A local date as `YYYY-MM-DD` — what the API takes for a window boundary. */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A window written out for a reader: "1–7 Sep", "Aug 2026", "1–11 Sep (so far)".
 *
 * `to` is exclusive, so the last day shown is the day BEFORE it. Printing the exclusive boundary
 * is the classic off-by-one here, and it is the kind that goes unnoticed: a week labelled "1–8"
 * when it means "1–7" looks like a perfectly ordinary label.
 */
export function describeWindow(w: PeriodWindow): string {
  const last = addDays(w.to, -1);
  const sameMonth = w.from.getMonth() === last.getMonth() && w.from.getFullYear() === last.getFullYear();
  // Spelled out rather than taken from toLocaleDateString: en-IN abbreviates September as
  // "Sept", which is four characters where every other month is three and wrecks the alignment
  // of a column of windows. It also makes the label depend on which ICU data the runtime shipped.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = (d: Date) => MONTHS[d.getMonth()];
  const year = (d: Date) => d.getFullYear();

  const whole = w.from.getDate() === 1 && sameMonth && addDays(last, 1).getDate() === 1;
  if (whole) return `${month(w.from)} ${year(w.from)}`;

  // A run of whole months a year or longer is named by its months and YEARS, not by its days.
  //
  // The annual window forced this. It begins on the 1st and ends on the last day of a month, so
  // the day-range form rendered it "1 Sep – 31 Aug" — which reads as a backwards five-day range
  // and omits the only thing a reader needs from a twelve-month window: which September. The
  // calendar-year case was worse still, coming out as "1 Jan – 31 Dec" with no year at all on a
  // figure whose entire purpose is to say which year.
  //
  // The threshold is the span, not whether it crosses a year boundary — "1 Jan – 31 Dec" needs
  // the year quite as much as "1 Sep – 31 Aug" does. Twelve months is where days stop carrying
  // information; a quarter is still read as dates, and keeps its day ends.
  const wholeMonths = w.from.getDate() === 1 && addDays(last, 1).getDate() === 1;
  const monthsSpanned = (last.getFullYear() - w.from.getFullYear()) * 12 + (last.getMonth() - w.from.getMonth()) + 1;
  if (wholeMonths && monthsSpanned >= 12) {
    return `${month(w.from)} ${year(w.from)} – ${month(last)} ${year(last)}`;
  }

  // The opening month is dropped when both ends share one — "1 – 7 Sep" rather than the
  // "1 Sep – 7 Sep" that makes a single week look like a range across two.
  const from = sameMonth ? String(w.from.getDate()) : `${w.from.getDate()} ${month(w.from)}`;
  return `${from} – ${last.getDate()} ${month(last)}${w.partial ? ' (so far)' : ''}`;
}
