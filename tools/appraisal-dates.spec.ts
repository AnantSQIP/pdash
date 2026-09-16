/**
 * Tests for the appraisal-cycle date rules — apps/web/lib/appraisal-dates.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/appraisal-dates.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because a cycle was created live with period start 2026-12-31, period end
 * 2026-01-01 and a due date of 2020-01-01, and then sat in the HR list with a working Launch
 * button beside it. Launching opens a self-assessment for every active employee, so those three
 * impossible dates were one click from being stamped on the whole firm's paperwork. Only the
 * cycle's NAME was ever checked.
 *
 * The cases below are the ones an HR administrator actually produces: a swapped pair, a year
 * typed wrong, a period still being filled in — and, importantly, the legitimate early deadline
 * that must NOT be refused.
 */
import { cycleDateProblem } from '../apps/web/lib/appraisal-dates';

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
  failures.push(`${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}
/** Most cases only care WHETHER the dates are refused, not which sentence comes back. */
const refused = (d: Parameters<typeof cycleDateProblem>[0]) => cycleDateProblem(d) !== null;

// ── the cycle that was actually created ─────────────────────────────────────
eq(
  refused({ periodStart: '2026-12-31', periodEnd: '2026-01-01', dueDate: '2020-01-01' }),
  true,
  'the cycle found live — period backwards, deadline six years gone — is refused',
);
eq(
  cycleDateProblem({ periodStart: '2026-12-31', periodEnd: '2026-01-01', dueDate: '2020-01-01' }),
  'The period ends before it starts — check the two dates.',
  'and the reason named first is the period, which is what the eye should go to',
);

// ── a period that ends before it starts ─────────────────────────────────────
// Always a typo or a swapped pair; there is no reading under which the cycle covers anything.
eq(refused({ periodStart: '2026-04-01', periodEnd: '2026-03-31' }), true, 'end one day before start');
eq(refused({ periodStart: '2026-04-01', periodEnd: '2025-09-30' }), true, 'end in the previous year — a mistyped year');
eq(refused({ periodStart: '2026-04-01', periodEnd: '2026-04-01' }), false, 'a single-day period is odd but not impossible');
eq(refused({ periodStart: '2026-04-01', periodEnd: '2026-09-30' }), false, 'an ordinary half-year is fine');

// ── the deliberate decision: an early due date is ALLOWED ───────────────────
// HR here runs half-yearly cycles and wants the paperwork in before the period formally closes.
// Asking for a self-assessment in the last fortnight of March, for a period ending 31 March, is
// how the firm works — refusing it would be refusing the practice, not catching an error.
eq(
  refused({ periodStart: '2026-10-01', periodEnd: '2027-03-31', dueDate: '2027-03-20' }),
  false,
  'a due date inside the period is legitimate — reviews are wanted before the half-year closes',
);
eq(refused({ periodStart: '2026-10-01', periodEnd: '2027-03-31', dueDate: '2027-03-31' }), false, 'on the last day of the period');
eq(refused({ periodStart: '2026-10-01', periodEnd: '2027-03-31', dueDate: '2027-04-15' }), false, 'and after it, the ordinary case');
eq(refused({ periodStart: '2026-10-01', periodEnd: '2027-03-31', dueDate: '2026-10-01' }), false, 'on the very first day of the period — the earliest defensible deadline');

// ── but not before the period has begun ─────────────────────────────────────
// A deadline that lands before the first day under review asks for a review of nothing.
eq(refused({ periodStart: '2026-10-01', periodEnd: '2027-03-31', dueDate: '2026-09-30' }), true, 'a due date the day before the period starts');
eq(
  cycleDateProblem({ periodStart: '2026-10-01', dueDate: '2020-01-01' }),
  'The due date falls before the period begins. Reviews are written about work that has already happened.',
  'and the message says why, rather than just refusing',
);
// The due-date rule is anchored to the START, not the end — that is the whole decision above.
eq(refused({ periodStart: '2026-10-01', periodEnd: '2027-03-31', dueDate: '2027-01-15' }), false, 'mid-period deadlines stay allowed');

// ── a form still being filled in ────────────────────────────────────────────
// All three dates are optional — a cycle may be opened before its window is settled — and a rule
// can only fire when both of the dates it compares are present. Complaining about a field that
// has not been reached yet trains people to ignore the message.
eq(refused({}), false, 'an empty form is not yet wrong');
eq(refused({ periodStart: '2026-10-01' }), false, 'a start with nothing to compare it to');
eq(refused({ periodEnd: '2026-03-31' }), false, 'an end with no start');
eq(refused({ dueDate: '2020-01-01' }), false, 'a due date with no period is unjudgeable, however odd it looks');
eq(refused({ periodStart: null, periodEnd: null, dueDate: null }), false, 'nulls are the same as absent');
eq(refused({ periodStart: '', periodEnd: '', dueDate: '' }), false, 'and so are the empty strings a cleared date input produces');

// ── a date field reports on every keystroke ─────────────────────────────────
// "2026-09-0" arrives before "2026-09-05" does. Judging it would flash an error at somebody
// halfway through typing a date that is about to be perfectly valid.
eq(refused({ periodStart: '2026-10-01', periodEnd: '2026-1' }), false, 'a half-typed end is not judged');
eq(refused({ periodStart: '2026-10-01', dueDate: '202' }), false, 'nor a half-typed due date');
eq(refused({ periodStart: '2026-10-0', periodEnd: '2026-01-01' }), false, 'nor anything compared against a half-typed start');

// ── both rules at once ──────────────────────────────────────────────────────
eq(refused({ periodStart: '2026-12-31', periodEnd: '2026-01-01', dueDate: '2026-06-01' }), true, 'a backwards period is refused whatever the due date does');

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${pass} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ appraisal dates: ${pass}/${pass} passed`);
