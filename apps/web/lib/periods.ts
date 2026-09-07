/**
 * The four periods performance is reviewed over.
 *
 * Plain arithmetic, kept out of the component file so it can be read and tested on its own —
 * it decides what window every figure on the Performance page is measured across.
 */

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
 * Rolling rather than calendar periods — "the last quarter", not "Q2" — matching how the
 * module already works. Each is compared against the equally long period before it, which is
 * what makes a trend arrow mean anything.
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
