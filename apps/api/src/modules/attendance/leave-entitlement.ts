import { PrismaService } from '../../prisma/prisma.service';

/**
 * How many days of a leave type a person is entitled to in a given year.
 *
 * WHY THIS IS ONE FUNCTION
 *
 * Two places need this number: the check that refuses a request over quota, and the card that
 * tells somebody what they have left. They used to compute it separately — both simply read
 * `annualQuota` — and the moment entitlement stops being a flat number they would drift apart.
 * A card that says "7 remaining" while the save refuses the 6th is the worst kind of bug,
 * because the person doing the work has no way to tell which half is lying.
 *
 * WHAT MAKES UP AN ENTITLEMENT
 *
 *   accrued  — earned this year, by whichever rule the type is configured for
 *   opening  — carried in from last year, if the type carries forward
 *   ────────
 *   entitled = accrued + opening
 *
 * ACCRUAL, AND WHY IT IS CONFIGURABLE RATHER THAN DECIDED HERE
 *
 * The firm's written policy says "1.5 CL, 0.5 SL" — which reads as a monthly rate — while the
 * quotas stored against those types are 12 and 8, which is not what 1.5 and 0.5 a month come to.
 * Those describe different schemes. Encoding either one as "the" rule would be picking a number
 * for somebody's leave balance on the strength of a guess, so the mode is a property of the leave
 * type and HR sets it. The default reproduces exactly what the system did before: the whole
 * allowance, available from 1 January.
 *
 * PRO-RATING
 *
 * Off by default, because turning it on reduces what people already believe they have. When on,
 * a mid-year joiner earns for the months they were actually here. This is the setting that
 * matters most at this firm: a quarter of the roster is on an internship, and without it a
 * three-month intern receives a full year's allowance.
 *
 * WITHOUT A JOINING DATE, NOBODY IS PENALISED. All 28 joining dates were empty when this was
 * written. A missing date means we cannot say somebody joined late, so we do not assume it —
 * they get the full allowance and `assumedFullYear` says why, rather than the system quietly
 * docking days on the strength of an absent field.
 */

export type Entitlement = {
  /** Earned in this year by the type's accrual rule. */
  accrued: number;
  /** Carried in from the previous year. */
  opening: number;
  /** accrued + opening — the number to measure usage against. */
  entitled: number;
  /** How it was worked out, so a screen can explain the figure instead of just showing it. */
  basis: 'annual' | 'annual-prorated' | 'monthly';
  /** Completed months of service counted within this year, when that mattered. */
  monthsCounted?: number;
  /** True when a missing joining date meant we could not pro-rate, so we did not. */
  assumedFullYear?: boolean;
};

export type LeavePolicy = {
  id: string;
  code: string;
  annualQuota: number;
  accrualMode: string;
  monthlyRate: number | null;
  prorateOnJoin: boolean;
  carryForward: boolean;
  carryForwardCap: number | null;
};

/** Leave is taken in whole and half days, so an entitlement of 8.37 days is not a real thing. */
const toHalfDay = (n: number) => Math.round(n * 2) / 2;

/**
 * Completed months of service falling inside `year`.
 *
 * Counts the months a person was actually here: someone joining on 20 March has served March
 * through December, which is ten. Counting from the joining DAY rather than the month would make
 * entitlement depend on whether somebody started on the 2nd or the 27th, which is not how any
 * leave policy is written.
 */
export function monthsOfServiceInYear(joiningDate: Date | null, year: number): number {
  if (!joiningDate) return 12;
  const jy = joiningDate.getUTCFullYear();
  if (jy > year) return 0;          // not here yet
  if (jy < year) return 12;         // here for the whole of it
  return 12 - joiningDate.getUTCMonth();
}

/** What one person is entitled to, of one leave type, in one year. */
export function computeEntitlement(
  policy: LeavePolicy,
  joiningDate: Date | null,
  year: number,
  openingDays: number,
): Entitlement {
  const opening = policy.carryForward ? Math.max(0, openingDays) : 0;

  if (policy.accrualMode === 'MONTHLY') {
    const rate = policy.monthlyRate ?? 0;
    const months = monthsOfServiceInYear(joiningDate, year);
    const accrued = toHalfDay(rate * months);
    return {
      accrued, opening, entitled: toHalfDay(accrued + opening),
      basis: 'monthly', monthsCounted: months,
      ...(joiningDate ? {} : { assumedFullYear: true }),
    };
  }

  // ANNUAL — the whole allowance from 1 January, optionally reduced for a mid-year joiner.
  if (!policy.prorateOnJoin || !joiningDate) {
    return {
      accrued: policy.annualQuota, opening,
      entitled: toHalfDay(policy.annualQuota + opening),
      basis: 'annual',
      ...(policy.prorateOnJoin && !joiningDate ? { assumedFullYear: true } : {}),
    };
  }
  const months = monthsOfServiceInYear(joiningDate, year);
  const accrued = toHalfDay((policy.annualQuota * months) / 12);
  return {
    accrued, opening, entitled: toHalfDay(accrued + opening),
    basis: 'annual-prorated', monthsCounted: months,
  };
}

/**
 * Entitlements for every leave type a person has, in one round trip.
 *
 * Comp Off is excluded here on purpose — it is not an allowance at all. Its balance is what was
 * EARNED by working non-working days, which `compOffBalance` already answers, and folding it into
 * a quota calculation would invent an annual entitlement that does not exist.
 */
export async function entitlementsFor(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
  year: number,
): Promise<Map<string, Entitlement & { policy: LeavePolicy }>> {
  const [user, types, openings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { joiningDate: true } }),
    prisma.leaveType.findMany({
      where: { organizationId },
      select: {
        id: true, code: true, annualQuota: true, accrualMode: true,
        monthlyRate: true, prorateOnJoin: true, carryForward: true, carryForwardCap: true,
      },
    }),
    prisma.leaveOpeningBalance.findMany({ where: { userId, year }, select: { leaveTypeId: true, days: true } }),
  ]);
  const openingBy = new Map(openings.map(o => [o.leaveTypeId, o.days]));
  const out = new Map<string, Entitlement & { policy: LeavePolicy }>();
  for (const t of types) {
    if (t.code === 'CO') continue;
    out.set(t.code, {
      ...computeEntitlement(t, user?.joiningDate ?? null, year, openingBy.get(t.id) ?? 0),
      policy: t,
    });
  }
  return out;
}
