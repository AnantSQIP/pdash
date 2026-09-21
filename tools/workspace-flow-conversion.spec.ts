/**
 * The pure pieces of a workspace-flow conversion, pinned against the code they must agree with.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/workspace-flow-conversion.spec.ts
 *
 * The conversion lives in packages/db (workspace-flow-conversion.ts) so the API and the operator
 * CLI run the same SQL. Several of its answers are RESTATEMENTS of things decided elsewhere — who
 * holds Team Capacity in each flow, which registry states each flow knows, what the next serial
 * after a set of numbers is — and a restatement is a copy that can drift. When it drifts, a
 * conversion quietly moves a live database's grants to the wrong place and its own verification
 * agrees with it, because both read the same wrong copy. So the copy is checked here against the
 * original: packages/db/prisma/permissions-catalog.ts.
 *
 * No database, no network — every function here is pure.
 */
import {
  capacityCodesFor,
  capacityRolesFor,
  CAPACITY_MANAGE,
  CAPACITY_VIEW,
  CAPACITY_VIEWER_ROLES,
  DELIVERY_LADDER_ROLES,
  nextSerialAfter,
  parseLegacyNumber,
  REGISTRY_STATUSES_BY_FLOW,
  WORKSPACE_FLOW_NAMES,
} from '../packages/db/src/workspace-flow-conversion';
import { ROLE_PRESETS, rolePresetsFor } from '../packages/db/prisma/permissions-catalog';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

// ── the capacity codes a role holds, in each flow ───────────────────────────
// The catalog is the original; capacityCodesFor is the conversion's copy of it. Every role named
// in the presets has to get the same answer from both.
const capacityFromPresets = (flow: 'PROJECTS' | 'CLIENTS', role: string): string[] => {
  const preset = rolePresetsFor(flow)[role];
  if (preset === '*') return [CAPACITY_VIEW, CAPACITY_MANAGE];
  return [CAPACITY_VIEW, CAPACITY_MANAGE].filter(c => (preset as string[]).includes(c));
};
for (const flow of WORKSPACE_FLOW_NAMES) {
  for (const role of Object.keys(ROLE_PRESETS)) {
    check(`${flow}: ${role} holds the same capacity codes the presets give it`,
      capacityCodesFor(flow, role).slice().sort(), capacityFromPresets(flow, role).slice().sort());
  }
}

// A role no preset names — one the firm made itself. The conversion still has to answer, and the
// answer is the flow's default posture, not a crash and not "whatever it had".
check('CLIENTS: a custom role holds nothing', capacityCodesFor('CLIENTS', 'Paralegal (custom)'), []);
check('PROJECTS: a custom role sees the board', capacityCodesFor('PROJECTS', 'Paralegal (custom)'), [CAPACITY_VIEW]);

// ── who the board belongs to in the CLIENTS flow ────────────────────────────
check('the delivery ladder is the four roles the owner named',
  [...DELIVERY_LADDER_ROLES], ['Super Admin', 'Admin', 'Manager', 'Senior Consultant']);
check('…and every one of them manages the board',
  DELIVERY_LADDER_ROLES.map(r => capacityCodesFor('CLIENTS', r).includes(CAPACITY_MANAGE)),
  DELIVERY_LADDER_ROLES.map(() => true));
check('HR reads it and never manages it',
  CAPACITY_VIEWER_ROLES.map(r => capacityCodesFor('CLIENTS', r)), [[CAPACITY_VIEW]]);
// The exemption list the conversion uses when it clears stray direct grants: a grant on somebody
// whose role already carries the code is redundant, not a leak, and clearing it is noise in the
// report. It therefore has to be exactly the roles that hold something.
check('the roles a stray grant is redundant for are the ones that hold a code',
  [...capacityRolesFor('CLIENTS')].sort(),
  Object.keys(ROLE_PRESETS).filter(r => capacityCodesFor('CLIENTS', r).length).sort());
check('…and in PROJECTS every role holds capacity.view, so the list is empty and the rule is simply capacity.manage',
  [...capacityRolesFor('PROJECTS')], []);

// ── the registry states each flow knows ─────────────────────────────────────
// The database CHECK holds the UNION; each flow's screens know only its own half, which is why a
// CLIENTS → PROJECTS conversion has to map the states PROJECTS has never heard of.
check('PROJECTS knows the PID lifecycle',
  [...REGISTRY_STATUSES_BY_FLOW.PROJECTS], ['RESERVED', 'ATTACHED', 'RELEASED', 'EXPIRED', 'DISCONTINUED']);
check('CLIENTS knows the CID lifecycle',
  [...REGISTRY_STATUSES_BY_FLOW.CLIENTS], ['ATTACHED', 'DELETED', 'PURGED', 'MERGED', 'DISCONTINUED']);
check('the two share exactly ATTACHED and DISCONTINUED',
  REGISTRY_STATUSES_BY_FLOW.PROJECTS.filter(s => REGISTRY_STATUSES_BY_FLOW.CLIENTS.includes(s)),
  ['ATTACHED', 'DISCONTINUED']);

// ── numbers ─────────────────────────────────────────────────────────────────
// "Never re-issued" is one past the highest serial EVER seen, not one past the highest live one:
// a number that was discontinued has still been used, and re-using it would put two matters in the
// firm's history under one name.
check('the next serial is one past the highest ever seen', nextSerialAfter(3, 11, 7), 12);
check('…counting the ones that are gone', nextSerialAfter(11, null, undefined, 4), 12);
check('…and an empty registry starts at 1', nextSerialAfter(), 1);

check('a number is read as its financial year and its serial',
  parseLegacyNumber('SQ_26_27_013'), { fyLabel: '26_27', serial: 13 });
check('…and something that is not one is not invented', parseLegacyNumber('not-a-number'), null);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ workspace-flow conversion: ${passed}/${passed} passed`);
