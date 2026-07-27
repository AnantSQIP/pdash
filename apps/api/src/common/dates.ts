/**
 * Date semantics shared across the API.
 *
 * Deadlines and other date-only values are stored at UTC midnight, so every comparison has
 * to happen on that boundary — compare in local time and a task is "overdue" in one
 * timezone but not another.
 */

/** Truncate a timestamp to UTC midnight. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** SquarkIP runs on IST — the org's operating timezone. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The start of the IST calendar day, encoded as UTC midnight (the same encoding used for
 * date-only fields like deadlines). Use this — NOT `startOfUtcDay(new Date())` — whenever
 * "today" is derived from the current instant, so the server's notion of the current day
 * matches the client's (`todayIST()` in the web app). Using the UTC day instead lagged IST
 * by up to 5.5h: during 00:00–05:30 IST a task the UI already flagged overdue was still
 * "today or later" to the server, so the overdue alert + capacity flag stayed silent.
 */
export function startOfIstDay(d: Date): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/**
 * Resolve an optional date field on a PATCH.
 *   `undefined` — caller didn't mention the field, so keep `current`
 *   `null`      — caller is explicitly CLEARING it
 *
 * Collapsing the two (`dto.x ? new Date(dto.x) : undefined`) hands Prisma `undefined`, which
 * it treats as "no change" — so the date can never be removed once set, and the API reports
 * success while doing nothing.
 */
export function resolveDate(incoming: string | null | undefined, current: Date | null): Date | null {
  if (incoming === undefined) return current;
  if (incoming === null) return null;
  return new Date(incoming);
}
