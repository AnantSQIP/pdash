/**
 * What makes an appraisal cycle's three dates impossible.
 *
 * A cycle was created live with period start 2026-12-31, period end 2026-01-01 and a due date of
 * 2020-01-01, and sat in the list with a working Launch button beside it. Launching it would have
 * opened a self-assessment for every active employee, dated six years past its deadline, over a
 * period that ran backwards. Only the name was ever checked.
 *
 * The rules, and what each one is protecting:
 *
 *  · The period may not END BEFORE IT STARTS. There is no reading of that under which the cycle
 *    covers anything — it is a typo or a swapped pair, always.
 *
 *  · The due date may not fall BEFORE THE PERIOD STARTS. Reviews are written about work that has
 *    happened; a deadline that lands before the first day under review asks for them about
 *    nothing.
 *
 *  · A due date INSIDE the period is allowed, deliberately. HR here runs half-yearly cycles and
 *    wants the paperwork in before the period formally closes — asking for a self-assessment in
 *    the last fortnight of March for a period ending 31 March is normal practice, not an error.
 *    Refusing it would be refusing the way the firm actually works.
 *
 * All three dates are optional: a cycle may be opened before its window is decided, and a rule
 * can only fire when both of the dates it compares are present.
 *
 * Dates are the `YYYY-MM-DD` strings a `<input type="date">` produces, which compare correctly as
 * plain strings — no parsing, and so no timezone to get wrong. A half-typed value ("2026-09-0")
 * is not judged at all: a date input reports on every keystroke, and a field still being filled
 * in is not yet a mistake.
 */

/** A complete `YYYY-MM-DD` day. Anything else is treated as "not decided yet". */
const isDay = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export type CycleDates = {
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate?: string | null;
};

/**
 * The reason these dates cannot be saved, phrased for the person who typed them — or null when
 * there is nothing wrong with them.
 */
export function cycleDateProblem({ periodStart, periodEnd, dueDate }: CycleDates): string | null {
  if (isDay(periodStart) && isDay(periodEnd) && periodEnd < periodStart) {
    return 'The period ends before it starts — check the two dates.';
  }
  if (isDay(periodStart) && isDay(dueDate) && dueDate < periodStart) {
    return 'The due date falls before the period begins. Reviews are written about work that has already happened.';
  }
  return null;
}
