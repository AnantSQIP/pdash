/**
 * Tests for the three guards on the attendance module's leave and regularisation writes —
 * apps/api/src/modules/attendance/attendance.module.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","experimentalDecorators":true}' tools/attendance-guards.spec.ts
 *
 * Plain assertions, no framework — this repo has none. The decorator flag is here because the
 * functions under test live in the Nest module file beside the service that uses them, rather
 * than in a file of their own; nothing in this spec constructs a service.
 *
 * These exist because all three failures were silent, and two of them destroyed data:
 *
 *   · A leave already taken could be cancelled, and the days came back. Balances are the sum of
 *     the PENDING and APPROVED requests in the year, so flipping a June sick leave to CANCELLED
 *     in September refunded it — paid leave minted from nothing, from the ordinary Leaves screen,
 *     as often as anybody liked.
 *   · Cancelling a HALF-day leave deleted the employee's punch. One row per person per day, and a
 *     punch under four hours wears the same HALF_DAY marker a half-day leave does, so a delete by
 *     person + marker + date took the check-in, the check-out, the measured hours, the location
 *     and the regularisation history with it.
 *   · "I worked 10:00 to 19:00 on the 14th" was stored as 10:00Z–19:00Z and drawn, by screens
 *     that all format in Asia/Kolkata, as 15:30 on the 14th to 00:30 on the FIFTEENTH.
 *
 * Every case below is one somebody in this firm would actually hit. September 2026 runs:
 * Mon 14, Tue 15, Wed 16 (today, in the cases that need one), Thu 17, Fri 18.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  fallsOnDay,
  isLeaveWrittenRow,
  leaveCancelDecision,
  parseInstant,
} from '../apps/api/src/modules/attendance/attendance.module';

let passed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

/** A calendar day as the database holds one: UTC midnight. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const TODAY = day(2026, 9, 16); // Wednesday
const iso = (d: Date | null) => (d ? d.toISOString() : null);
/** The wall clock a screen would print for an instant — every renderer in the app uses this zone. */
const inIst = (d: Date | null) =>
  d ? d.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T') : null;

// ── cancelling a leave: which ones are still the employee's to give back ────────
const decide = (start: Date, today = TODAY) => {
  const r = leaveCancelDecision(start, today);
  return { allowed: r.allowed, refundFrom: r.refundFrom.toISOString().slice(0, 10) };
};

// The case the feature exists for: off on Thursday, and on Thursday morning decides to work.
check('a leave starting today can still be cancelled', decide(day(2026, 9, 16)), { allowed: true, refundFrom: '2026-09-16' });
check('a leave starting tomorrow can be cancelled', decide(day(2026, 9, 17)), { allowed: true, refundFrom: '2026-09-17' });
check('next month\'s holiday can be cancelled', decide(day(2026, 10, 12)), { allowed: true, refundFrom: '2026-10-12' });

// The exploit: a leave that has been taken cannot be handed back.
check('a leave that started yesterday can no longer be cancelled', decide(day(2026, 9, 15)).allowed, false);
check('June\'s sick leave cannot be cancelled in September', decide(day(2026, 6, 18)).allowed, false);

// A half day is a single date, so it is judged by that date and nothing else.
check('a half day today is still cancellable', decide(day(2026, 9, 16)).allowed, true);
check('yesterday\'s half day is not', decide(day(2026, 9, 15)).allowed, false);

// Where a PARTIAL refund would start, if the firm ever asks for one. Nothing reads it yet — a
// leave in progress refunds nothing at all — but it is the value that version turns on.
check('a leave in progress would refund from today, not from its own start', decide(day(2026, 9, 14)).refundFrom, '2026-09-16');
check('a leave not yet begun would refund from its start', decide(day(2026, 9, 18)).refundFrom, '2026-09-18');

// The caller passes istDay(now), which is already midnight; normalising both sides anyway means a
// mid-afternoon Date can never make today's leave look like yesterday's.
check(
  'the decision is about days, not about the time of day it is asked',
  decide(day(2026, 9, 16), new Date('2026-09-16T18:29:00.000Z')).allowed,
  true,
);

// ── which attendance row a cancellation may delete ──────────────────────────────
const row = (o: Partial<{ checkIn: Date | null; checkOut: Date | null; totalHours: number | null; isRegularized: boolean }> = {}) => ({
  checkIn: null, checkOut: null, totalHours: null, isRegularized: false, ...o,
});

check('the ON_LEAVE row an approval wrote is the leave\'s own', isLeaveWrittenRow(row(), false), true);
check('the HALF_DAY row an approval wrote carries the four hours it leaves behind', isLeaveWrittenRow(row({ totalHours: 4 }), true), true);

// The record that used to be destroyed: in at 9:12, out at 9:12, nought hours, HALF_DAY.
check(
  'a punched half day is the person\'s own record and survives',
  isLeaveWrittenRow(row({ checkIn: new Date('2026-09-16T09:12:55Z'), checkOut: new Date('2026-09-16T09:12:55Z'), totalHours: 0 }), true),
  false,
);
check(
  'somebody still clocked in is not a row to delete',
  isLeaveWrittenRow(row({ checkIn: new Date('2026-09-16T03:30:00Z') }), true),
  false,
);
check(
  'measured hours with no punch times are still measured hours',
  isLeaveWrittenRow(row({ totalHours: 6.5 }), true),
  false,
);
check(
  'a regularisation an approver signed is never collateral',
  isLeaveWrittenRow(row({ isRegularized: true }), false),
  false,
);
// A full day of leave writes no hours at all, so four hours on one did not come from this leave.
check('four hours on a FULL-day leave row are not the approval\'s', isLeaveWrittenRow(row({ totalHours: 4 }), false), false);
// Half-day rows written before the approval started stamping the allowance carry nothing; they
// are still the leave's, and leaving them behind would strand a day marked as leave that is gone.
check('a half-day leave row with no hours on it is still the leave\'s', isLeaveWrittenRow(row(), true), true);

// ── the clock a manual check-in/out is read on ─────────────────────────────────
// 10:00 to 19:00 on the 14th. The instants are IST; what a screen prints is the same 10:00–19:00.
check('a morning check-in is read as IST', iso(parseInstant('2026-09-14T10:00:00')), '2026-09-14T04:30:00.000Z');
check('an evening check-out stays on its own day', inIst(parseInstant('2026-09-14T19:00:00')), '2026-09-14T19:00:00');
check('a time input with no seconds parses', iso(parseInstant('2026-09-14T10:00')), '2026-09-14T04:30:00.000Z');

// The two ends of a day, which is where a five-and-a-half-hour error shows up as a wrong DATE.
check('midnight belongs to the day it was typed on', inIst(parseInstant('2026-09-14T00:00:00')), '2026-09-14T00:00:00');
check('midnight is stored as the previous evening in UTC', iso(parseInstant('2026-09-14T00:00:00')), '2026-09-13T18:30:00.000Z');
check('23:59 belongs to the day it was typed on', inIst(parseInstant('2026-09-14T23:59:00')), '2026-09-14T23:59:00');

// A string that names an instant already had the arithmetic done; doing it again would move it.
check('an explicit Z is taken as written', iso(parseInstant('2026-09-14T10:00:00Z')), '2026-09-14T10:00:00.000Z');
check('an explicit +05:30 is taken as written', iso(parseInstant('2026-09-14T10:00:00+05:30')), '2026-09-14T04:30:00.000Z');
check('an explicit offset without a colon is taken as written', iso(parseInstant('2026-09-14T10:00:00+0530')), '2026-09-14T04:30:00.000Z');

check('nothing to parse is nothing', parseInstant(null), null);
check('an empty string is nothing', parseInstant(''), null);
check('rubbish is an invalid date, not a silent zero', Number.isNaN(parseInstant('not-a-time')!.getTime()), true);

// ── and whether the times belong to the day being regularised ──────────────────
const sep14 = day(2026, 9, 14);
check('a morning shift falls on its day', fallsOnDay(parseInstant('2026-09-14T10:00:00')!, sep14), true);
check('a 7pm check-out falls on its day', fallsOnDay(parseInstant('2026-09-14T19:00:00')!, sep14), true);
// Both ends of the day, asked on the office clock. In UTC days the first would be the 13th.
check('a shift starting at midnight falls on its day', fallsOnDay(parseInstant('2026-09-14T00:00:00')!, sep14), true);
check('a shift ending at 23:59 falls on its day', fallsOnDay(parseInstant('2026-09-14T23:59:00')!, sep14), true);
check('the next morning does not', fallsOnDay(parseInstant('2026-09-15T09:00:00')!, sep14), false);
check('the previous evening does not', fallsOnDay(parseInstant('2026-09-13T22:00:00')!, sep14), false);
// An API client naming a true instant is judged on the office clock too: 20:00Z on the 14th is
// half past one on the morning of the 15th to everybody here.
check('an instant that is tomorrow in IST does not fall on today', fallsOnDay(parseInstant('2026-09-14T20:00:00Z')!, sep14), false);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ attendance guards: ${passed}/${passed} passed`);
