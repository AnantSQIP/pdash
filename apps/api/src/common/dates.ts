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
