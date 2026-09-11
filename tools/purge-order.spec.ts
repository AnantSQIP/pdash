/**
 * Proves the permanent-delete order is foreign-key safe — against the REAL schema, not a copy.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/purge-order.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY THIS TEST IS THE IMPORTANT ONE
 *
 * A permanent delete has no undo and nothing to restore from. The order in
 * apps/api/src/modules/admin-data/purge-order.ts is correct today because somebody read every
 * model in the schema once. It will stop being correct the first time a table is added — and it
 * will not stop LOUDLY. A missing table either leaves orphan rows behind (a timesheet whose
 * project silently became null, chased forever for a PID that no longer exists) or throws at the
 * worst possible moment against a production database.
 *
 * So this parses packages/db/prisma/schema.prisma itself and asserts two things:
 *
 *   1. COMPLETENESS — every model with a foreign key into Task appears in TASK_PURGE_ORDER, and
 *      every model with a foreign key into Project appears in PROJECT_PURGE_ORDER. A new table
 *      nobody wired up fails here, by name.
 *   2. ORDERING — wherever a list contains both ends of a foreign key, the CHILD comes first.
 *
 * Deliberately excluded from completeness, each for a stated reason (see EXPECTED_ABSENT).
 */
process.env.TZ = 'Asia/Kolkata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_PURGE_ORDER, TASK_PURGE_ORDER } from '../apps/api/src/modules/admin-data/purge-order';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

// ── read the schema ─────────────────────────────────────────────────────────
const SCHEMA = join(__dirname, '..', 'packages', 'db', 'prisma', 'schema.prisma');
const src = readFileSync(SCHEMA, 'utf8');

/** model name → its body lines. */
const models = new Map<string, string[]>();
{
  let current: string | null = null;
  for (const line of src.split('\n')) {
    const open = line.match(/^model\s+(\w+)\s*\{/);
    if (open) { current = open[1]; models.set(current, []); continue; }
    if (line.trim() === '}') { current = null; continue; }
    if (current) models.get(current)!.push(line);
  }
}
check('the schema parsed and has a sensible number of models', models.size > 100 && models.has('Task') && models.has('Project'), true);

/** Prisma client property name for a model: first letter lower-cased. */
const prop = (model: string) => model[0].toLowerCase() + model.slice(1);

/**
 * Every OWNING side of a relation: [childModel, parentModel]. Only the side carrying
 * `fields: [...]` holds the foreign key, so only that side constrains deletion order.
 */
const edges: [string, string][] = [];
for (const [name, body] of models) {
  for (const line of body) {
    const rel = line.match(/@relation\(([^)]*)\)/);
    if (!rel || !/fields:\s*\[/.test(rel[1])) continue;
    const field = line.trim().match(/^(\w+)\s+(\w+)(\?|\[\])?/);
    if (!field) continue;
    const parent = field[2];
    if (models.has(parent)) edges.push([name, parent]);
  }
}
check('relation edges were found', edges.length > 50, true);

const childrenOf = (parent: string) => [...new Set(edges.filter(([, p]) => p === parent).map(([c]) => c))].sort();

// ── 1. completeness ─────────────────────────────────────────────────────────
/**
 * Models that hold a foreign key into Task or Project and are STILL not purged. Each needs a
 * reason, because "we forgot" and "we decided" look identical in a list.
 */
const EXPECTED_ABSENT: Record<string, string> = {
  // (none today — every child of Task and Project is purged)
};

for (const [parent, order] of [['Task', TASK_PURGE_ORDER], ['Project', PROJECT_PURGE_ORDER]] as const) {
  const listed = new Set<string>(order as readonly string[]);
  const missing = childrenOf(parent)
    .map(prop)
    .filter(p => !listed.has(p) && !(p in EXPECTED_ABSENT));
  check(
    `every model with a foreign key into ${parent} is in the purge order (add it to purge-order.ts, or to EXPECTED_ABSENT with a reason)`,
    missing,
    [],
  );
  // The parent itself must be last — anything after it would be deleting rows that are gone.
  check(`${parent} itself is the final step of its purge`, order[order.length - 1], prop(parent));
}

// ── 2. ordering ─────────────────────────────────────────────────────────────
for (const [label, order] of [['task', TASK_PURGE_ORDER], ['project', PROJECT_PURGE_ORDER]] as const) {
  const index = new Map((order as readonly string[]).map((m, i) => [m, i]));
  const violations: string[] = [];
  for (const [child, parent] of edges) {
    const c = index.get(prop(child));
    const p = index.get(prop(parent));
    if (c === undefined || p === undefined) continue; // one end isn't purged here — no constraint
    if (c > p) violations.push(`${prop(child)} (${c}) must come before ${prop(parent)} (${p})`);
  }
  check(`the ${label} purge deletes every child before its parent`, [...new Set(violations)].sort(), []);
}

// ── 3. no duplicates, nothing invented ──────────────────────────────────────
for (const [label, order] of [['task', TASK_PURGE_ORDER], ['project', PROJECT_PURGE_ORDER]] as const) {
  check(`the ${label} purge names each table once`, order.length, new Set(order as readonly string[]).size);
  const known = new Set([...models.keys()].map(prop));
  check(`every table named in the ${label} purge exists in the schema`,
    (order as readonly string[]).filter(m => !known.has(m)), []);
}

// ── 4. the tombstone must survive ───────────────────────────────────────────
// The whole design rests on AuditLog outliving its subject. If somebody ever gives
// AuditLog.entityId a foreign key, the purge would cascade away the only record that a
// destruction happened — so assert the two properties that make it a tombstone.
const auditBody = (models.get('AuditLog') ?? []).join('\n');
check('AuditLog.entityId is a plain String with no foreign key',
  /^\s*entityId\s+String\s*$/m.test(auditBody) && !/@relation\([^)]*fields:\s*\[entityId\]/.test(auditBody), true);
check('AuditLog is never itself purged',
  [...TASK_PURGE_ORDER, ...PROJECT_PURGE_ORDER].includes('auditLog' as never), false);

// ── 5. the tables the purge deliberately does not touch ─────────────────────
// PidReservation is the PID ledger — a purged project's serial is RETIRED, never freed for
// reuse, so the row is updated rather than deleted. If it ever appears in a purge list, the
// firm has silently started reissuing project IDs.
check('the PID ledger is never deleted by a purge',
  [...TASK_PURGE_ORDER, ...PROJECT_PURGE_ORDER].includes('pidReservation' as never), false);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ purge order: ${passed}/${passed} passed`);
