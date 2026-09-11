/**
 * Every table in the schema is either cleared by the workspace reset or deliberately kept.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/reset-coverage.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY THIS TEST EXISTS
 *
 * packages/db/prisma/reset-operational-data.ts is the script that clears the workspace without
 * losing the people. It is a hand-written list of tables, and a hand-written list of tables goes
 * quietly wrong: by the time anybody looked, the schema had 117 models and the script named 66.
 * The other fifty-one were not decisions. They were tables somebody added months after the script
 * was written, and nothing anywhere asked the question.
 *
 * The failure that causes is the worst kind. The reset runs, reports success, and the "clean"
 * workspace still holds the demo firm's deals, appraisal scores, PID reservations and deadline
 * history — invisible until somebody opens a report that counts them.
 *
 * So: this parses the REAL schema, reads the reset script's own delete calls, and requires that
 * every single model appears in one list or the other. A new table is unclassified by default and
 * fails here, by name, the moment it is added — which is the only point at which the person who
 * added it still knows whether it is operational or configuration.
 *
 * It also checks the deletion ORDER, because a clear that violates a foreign key aborts halfway
 * and leaves the workspace in a state that is neither the old one nor a clean one.
 */
process.env.TZ = 'Asia/Kolkata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

const ROOT = join(__dirname, '..');
const SCHEMA = join(ROOT, 'packages', 'db', 'prisma', 'schema.prisma');
const RESET = join(ROOT, 'packages', 'db', 'prisma', 'reset-operational-data.ts');

// ── the schema ──────────────────────────────────────────────────────────────
const schemaSrc = readFileSync(SCHEMA, 'utf8');

/** model name → its body lines. */
const models = new Map<string, string[]>();
{
  let current: string | null = null;
  for (const line of schemaSrc.split('\n')) {
    const open = line.match(/^model\s+(\w+)\s*\{/);
    if (open) { current = open[1]; models.set(current, []); continue; }
    if (line.trim() === '}') { current = null; continue; }
    if (current) models.get(current)!.push(line);
  }
}

/** Prisma client property name for a model: first letter lower-cased. */
const prop = (model: string) => model[0].toLowerCase() + model.slice(1);

check('the schema parsed and holds a plausible number of models',
  models.size > 100 && models.has('User') && models.has('Project'), true);

// ── what the RESET SCRIPT actually clears ───────────────────────────────────
//
// Read from the script's own delete calls rather than from a list kept beside it. A second list
// that has to be updated in step with the first is the same failure this test exists to prevent.
const resetSrc = readFileSync(RESET, 'utf8');
const clearedOrder: string[] = [...resetSrc.matchAll(/prisma\.(\w+)\.deleteMany\(/g)].map(m => m[1]);
const cleared = new Set(clearedOrder);

check('the reset script parsed and clears a plausible number of tables', cleared.size > 60, true);

// ── what is KEPT, and why ───────────────────────────────────────────────────
//
// A reason per entry, because "we forgot it" and "we decided to keep it" look identical in a bare
// list. Anything here is a statement that this table is configuration, identity or access — not
// a record of work done.
const KEEP: Record<string, string> = {
  // ── the firm itself ──
  organization: 'the one Organization row IS the workspace; deleting it deletes everything',

  // ── people, and their way back in ──
  user: 'the entire point of this script: the reset keeps the people',
  // (UserProfile is NOT here: the PII inside a profile is operational content and the script
  //  clears it — at the end, rather than in the steps array, which the completeness check below
  //  picks up all the same because it reads the delete calls themselves.)
  authToken: 'clearing it signs everybody out mid-sentence; a reset is not a security event',
  refreshToken: 'same — a deploy on this system must not cause a logout blip',
  userManager: 'reporting lines are org structure; rebuilding them by hand is a day of work',

  // ── access control, all four layers ──
  role: 'RBAC',
  permission: 'RBAC — the catalogue itself',
  rolePermission: 'RBAC',
  userRole: 'RBAC — who holds which role',
  userPermission: 'RBAC — direct grants',
  permissionOverride: 'RBAC — per-user exceptions',
  permissionGroup: 'RBAC',
  permissionGroupMember: 'RBAC',
  permissionGroupPermission: 'RBAC',

  // ── org structure ──
  department: 'org structure',
  departmentMember: 'org structure',
  team: 'org structure',
  teamMember: 'org structure',

  // ── the company calendar and leave policy ──
  holiday: 'the company holiday calendar is configuration, not activity',
  optionalHoliday: 'the LIST of optional holidays is the calendar; a person ELECTING one is a request, and that is cleared',
  leaveType: 'leave policy',
  leaveOpeningBalance: 'the balances people start the year with — policy, and irreplaceable if lost',

  // ── how work is shaped ──
  workflow: 'workflow configuration',
  workflowStatus: 'workflow configuration',
  workflowTransition: 'workflow configuration',
  projectTemplate: 'the standard task list for each project type',
  taskStandard: 'the standard tasks inside a template',
  technologyDomain: 'the domain taxonomy projects are filed under',
  tag: 'the tag vocabulary; the tagging of individual work goes with the work',
  customField: 'field DEFINITIONS; the VALUES people entered are cleared',
  appraisalParameter: 'what appraisals score against — name, weight, which designations it applies to. Configuration, exactly like a custom-field definition; the SCORES are cleared',

  // ── per-user and per-install settings ──
  dashboard: 'a saved dashboard layout is a preference',
  dashboardWidget: 'part of that layout',
  notificationPreference: 'a preference',
  integration: 'installed integrations and their credentials',
  automationRule: 'configured automations',
};

// ── 1. THE CHECK THAT MATTERS: nothing unclassified ─────────────────────────
//
// If this fails it names the model. Whoever added it has to say which it is: put it in the reset
// script's delete list if it records something that HAPPENED, or in KEEP above, with a reason, if
// it is configuration, identity or access.
const unclassified = [...models.keys()]
  .map(prop)
  .filter(p => !cleared.has(p) && !(p in KEEP))
  .sort();
check(
  'every model in schema.prisma is either cleared by the reset or explicitly kept\n' +
  '     → add it to the delete list in packages/db/prisma/reset-operational-data.ts (it records work),\n' +
  '       or to KEEP in this file with a reason (it is configuration / identity / access)',
  unclassified,
  [],
);

// ── 2. no model can be in both lists ────────────────────────────────────────
const bothWays = [...models.keys()].map(prop).filter(p => cleared.has(p) && p in KEEP).sort();
check('no model is both cleared and kept', bothWays, []);

// ── 3. neither list may name a table that no longer exists ──────────────────
const known = new Set([...models.keys()].map(prop));
check('every table the reset script deletes still exists in the schema',
  clearedOrder.filter(m => !known.has(m)).sort(), []);
check('every table in KEEP still exists in the schema (a renamed model leaves a stale entry)',
  Object.keys(KEEP).filter(m => !known.has(m)).sort(), []);

// ── 4. each table is deleted once, and deleted whole ────────────────────────
const duplicates = clearedOrder.filter((m, i) => clearedOrder.indexOf(m) !== i);
check('the reset script deletes each table exactly once', [...new Set(duplicates)].sort(), []);

// A `deleteMany({ where: … })` inside this script would be a PARTIAL clear — the kind of thing
// that leaves half a demo workspace behind and reports success.
check('every delete is unconditional — no filtered deleteMany hiding a partial clear',
  /deleteMany\(\s*\{/.test(resetSrc), false);

// ── 5. the order has to be foreign-key safe ─────────────────────────────────
//
// Only the side of a relation carrying `fields: [...]` holds the foreign key, so only that side
// constrains order. A constraint exists only when BOTH ends are being deleted: a child of User
// can go in any order, because User is not going anywhere.
const edges: [string, string][] = [];
for (const [name, body] of models) {
  for (const line of body) {
    const rel = line.match(/@relation\(([^)]*)\)/);
    if (!rel || !/fields:\s*\[/.test(rel[1])) continue;
    const field = line.trim().match(/^(\w+)\s+(\w+)(\?|\[\])?/);
    if (!field) continue;
    const parent = field[2];
    // A nullable foreign key is SetNull-able and does not block a delete in Prisma's default, but
    // the schema here sets the behaviour explicitly; treat every named FK as ordering-relevant
    // unless it is declared SetNull, which by definition survives its parent going away.
    if (models.has(parent) && !/onDelete:\s*SetNull/.test(rel[1])) edges.push([name, parent]);
  }
}
check('relation edges were found in the schema', edges.length > 50, true);

const index = new Map(clearedOrder.map((m, i) => [m, i]));
const outOfOrder: string[] = [];
for (const [child, parent] of edges) {
  if (child === parent) continue;                       // self-relation: a parent task's children
  const c = index.get(prop(child));
  const p = index.get(prop(parent));
  if (c === undefined || p === undefined) continue;     // one end is kept — no constraint
  if (c > p) outOfOrder.push(`${prop(child)} (step ${c}) must be deleted before ${prop(parent)} (step ${p})`);
}
check('the reset deletes every child before its parent', [...new Set(outOfOrder)].sort(), []);

// ── 6. the decisions worth pinning down ─────────────────────────────────────
//
// These are not covered by the completeness check above: a future edit could move any of them to
// the other list and the totals would still add up. Each one is a decision somebody made, with a
// consequence, and it should take a deliberate edit here to reverse it.

check('sessions survive a reset — nobody is signed out by it',
  [cleared.has('authToken'), cleared.has('refreshToken')], [false, false]);

check('the people, their roles and their reporting lines survive',
  ['user', 'userRole', 'role', 'permission', 'userManager', 'organization'].filter(m => cleared.has(m)), []);

check('the collected PII is cleared even though the people are kept', cleared.has('userProfile'), true);

// The first-login profile gate was removed from the product. Setting profileCompletedAt back to
// null would arm a gate that no longer exists — a flag nothing reads, and a future reader
// believing there is still a screen there.
check('the reset does not re-arm the profile gate that no longer exists',
  /profileCompletedAt:\s*null/.test(resetSrc), false);

// Demo patents and their demo clients (packages/db/prisma/seed-patents-demo.ts) must go: the
// owner asked for a system with nothing demo-shaped left in it.
check('demo patents and demo clients are cleared',
  ['patent', 'client', 'projectPatent', 'clientLedgerOverride'].filter(m => !cleared.has(m)), []);

// The PID serial counter is reset, so PID RESERVATIONS must go with it. Leaving reservations
// behind while restarting the counter at 1 means the first real project mints a PID that a
// leftover reservation already holds — and the unique index on (organizationId, pid) turns that
// into a failed project creation. (This is the opposite of the per-project PURGE, where a
// reservation is retired rather than deleted so a live serial is never reissued. Different
// operation: here the whole numbering series starts again.)
check('clearing the PID counter also clears the PID reservations',
  [cleared.has('sequenceCounter'), cleared.has('pidReservation')], [true, true]);

// Everything the two time-tracking flows write. Both, because the firm can be in either mode.
check('every trace of recorded time is cleared',
  ['timesheet', 'taskWorkSession', 'timesheetBackdateRequest', 'attendance', 'regularizationRequest']
    .filter(m => !cleared.has(m)),
  []);

// The current mode is Organization.timeTrackingMode and is configuration; only the history of
// switching goes.
check('the log of time-tracking mode switches is cleared but the mode itself is not',
  [cleared.has('timeTrackingModeChange'), cleared.has('organization')], [true, false]);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ reset coverage: ${passed}/${passed} passed — ${cleared.size} tables cleared, ${Object.keys(KEEP).length} kept, ${models.size} in the schema`);
