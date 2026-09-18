/**
 * When an open PID request is due a reminder — the rule the hourly sweep applies.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","experimentalDecorators":true}' tools/pid-reminder.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY: before the clients-flow PID rework a request sat with one named Super Admin until they
 * happened to look. The sweep reminds every authority once a day for as long as a request is open.
 * Two things must hold or it either nags or goes silent: a fresh request is left alone for its
 * first day, and a nudge from the client's page resets the clock exactly like a reminder does.
 */
import { dueForReminder, reminderDigest } from '../apps/api/src/modules/projects/pid-request-monitor.service';

let passed = 0; const failures: string[] = [];
const check = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else failures.push(`${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`);
};
const H = 3_600_000;
const t0 = new Date('2026-09-18T09:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * H);

check('a request raised an hour ago is left alone', dueForReminder({ createdAt: t0, remindedAt: null }, at(1)), false);
check('…and one raised 23h59m ago', dueForReminder({ createdAt: t0, remindedAt: null }, new Date(at(24).getTime() - 60_000)), false);
check('a day after it was raised, it is due', dueForReminder({ createdAt: t0, remindedAt: null }, at(24)), true);
check('reminded at hour 24, it is not due again at hour 30', dueForReminder({ createdAt: t0, remindedAt: at(24) }, at(30)), false);
check('…but is at hour 48', dueForReminder({ createdAt: t0, remindedAt: at(24) }, at(48)), true);
check('a nudge at hour 20 pushes the next reminder to hour 44', [
  dueForReminder({ createdAt: t0, remindedAt: at(20) }, at(24)),
  dueForReminder({ createdAt: t0, remindedAt: at(20) }, at(44)),
], [false, true]);
check('a request weeks old and never reminded is due at once', dueForReminder({ createdAt: t0, remindedAt: null }, at(24 * 21)), true);

// ── one reminder per organisation, not one per request ───────────────────────
const w = (title: string, daysAgo: number, kind = 'NEW', code: string | null = null) =>
  ({ kind, title, code, createdAt: new Date(at(24 * 30).getTime() - daysAgo * 24 * H) });
const now = at(24 * 30);
check('a single waiting client is named on its own',
  reminderDigest([w('Northwind', 2)], now),
  { title: 'PID still waiting', message: '"Northwind" has waited 2 days for a PID. Any PID authority can assign it.' });
check('a single change request says it is a change, with the current PID',
  reminderDigest([w('Voltix', 1, 'CHANGE', 'SQ_26_27_004')], now).message,
  '"Voltix" (SQ_26_27_004) has waited 1 day for a PID change.');
const many = reminderDigest([w('B', 1), w('A', 9), w('C', 3, 'CHANGE', 'SQ_1'), w('D', 2), w('E', 2)], now);
check('several are ONE notification, counted in the title', many.title, '5 clients waiting on a PID');
check('…longest-waiting first, three named, the rest counted',
  many.message, '"A" (9 days), "C" (3 days, a change), "D" (2 days) and 2 more. Any PID authority can act on them.');

if (failures.length) {
  console.log(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log('  ✗ ' + f + '\n');
  process.exit(1);
}
console.log(`\n✓ PID reminders: ${passed} passed, 0 failed`);
