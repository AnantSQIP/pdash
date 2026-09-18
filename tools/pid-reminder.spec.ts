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
import { dueForReminder } from '../apps/api/src/modules/projects/pid-request-monitor.service';

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

if (failures.length) {
  console.log(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log('  ✗ ' + f + '\n');
  process.exit(1);
}
console.log(`\n✓ PID reminders: ${passed} passed, 0 failed`);
