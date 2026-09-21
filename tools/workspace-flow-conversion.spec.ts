/**
 * The pure pieces of a workspace-flow conversion, pinned against the code they must agree with.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/workspace-flow-conversion.spec.ts
 *
 * The conversion lives in packages/db (workspace-flow-conversion.ts) so the API and the operator
 * CLI run the same SQL. Several of its answers are RESTATEMENTS of things decided elsewhere — who
 * holds Team Capacity in each flow, which registry states each flow knows — and a restatement is a
 * copy that can drift. When it drifts, a conversion quietly moves a live database's grants to the
 * wrong place and its own verification agrees with it, because both read the same wrong copy. So
 * the copy is checked here against the original: packages/db/prisma/permissions-catalog.ts.
 *
 * It also pins WHAT A CONVERSION IS ALLOWED TO DO. Since every project/client row carries the flow
 * it was made in, switching flow hides one flow's work and shows the other's rather than converting
 * anything, and the conversion is a settings change: the flow, the Team Capacity grants and the
 * time mode. The steps it takes are declared, the steps it used to take are named as retired, and
 * the run itself refuses to commit if what it did does not match the declaration.
 *
 * No database, no network — every function here is pure.
 */
import {
  capacityCodesFor,
  capacityRolesFor,
  CAPACITY_MANAGE,
  CAPACITY_VIEW,
  CAPACITY_VIEWER_ROLES,
  CONVERSION_STEPS,
  DELIVERY_LADDER_ROLES,
  REGISTRY_STATUSES_BY_FLOW,
  RETIRED_CONVERSION_STEPS,
  workDifferences,
  WORKSPACE_FLOW_NAMES,
  type WorkSnapshot,
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

// ── what a conversion is allowed to do ──────────────────────────────────────
// A settings change: the flow, who holds Team Capacity, and — entering CLIENTS, which is MANUAL
// only — the time mode and the clocks that are running. Nothing else.
check('entering CLIENTS: the clocks, the time mode, the grants, and the flow',
  [...CONVERSION_STEPS.CLIENTS], ['clocks', 'time_mode', 'capacity', 'work_kept', 'flow']);
check('entering PROJECTS: the grants and the flow (time stays as it is recorded now)',
  [...CONVERSION_STEPS.PROJECTS], ['capacity', 'time_mode', 'work_kept', 'flow']);
check('every conversion says out loud that the work it is leaving stays',
  WORKSPACE_FLOW_NAMES.map(f => CONVERSION_STEPS[f].includes('work_kept')), [true, true]);
// The steps that rewrote rows are gone, and none of them may quietly come back.
check('no step that rewrote work is left in either direction',
  WORKSPACE_FLOW_NAMES.flatMap(f => CONVERSION_STEPS[f].filter(k => RETIRED_CONVERSION_STEPS.includes(k))), []);
check('…and the retired list names every one of them',
  [...RETIRED_CONVERSION_STEPS].sort(),
  ['cid_backfill', 'kept', 'ledger_import', 'pid_requests', 'registry_map', 'registry_rederive',
    'registry_register', 'registry_retire']);

// ── the promise that nothing moved ──────────────────────────────────────────
// The conversion counts both flows' work before it starts and again before it commits; a single
// count that moved rolls the whole transaction back. This is the comparison that decides that.
const snapshot = (over: Partial<WorkSnapshot> = {}): WorkSnapshot => ({
  projects: { PROJECTS: 4, CLIENTS: 12 },
  liveProjects: { PROJECTS: 3, CLIENTS: 12 },
  tasks: { PROJECTS: 20, CLIENTS: 150 },
  timesheets: { PROJECTS: 60, CLIENTS: 1079 },
  staffing: { PROJECTS: 25, CLIENTS: 180 },
  shared: { tasks: 7, timesheets: 3 },
  withoutNumber: { PROJECTS: 1, CLIENTS: 0 },
  registryByStatus: { ATTACHED: 12, RESERVED: 1 },
  pidRequestsByStatus: { PENDING: 1 },
  cidEvents: 12,
  ...over,
});
check('two identical counts are no difference at all', workDifferences(snapshot(), snapshot()), []);
check('a client that lost its work is named',
  workDifferences(snapshot(), snapshot({ tasks: { PROJECTS: 20, CLIENTS: 149 } })), ['CLIENTS tasks: 150 → 149']);
check('a number issued to a project still waiting for one is named',
  workDifferences(snapshot(), snapshot({ withoutNumber: { PROJECTS: 0, CLIENTS: 0 } })),
  ['PROJECTS rows still without a number: 1 → 0']);
check('a held number retired behind the firm’s back is named',
  workDifferences(snapshot(), snapshot({ registryByStatus: { ATTACHED: 12, DISCONTINUED: 1 } })),
  ['registry numbers RESERVED: 1 → 0', 'registry numbers DISCONTINUED: 0 → 1']);
check('a request cancelled by a conversion is named',
  workDifferences(snapshot(), snapshot({ pidRequestsByStatus: { CANCELLED: 1 } })),
  ['PID requests PENDING: 1 → 0', 'PID requests CANCELLED: 0 → 1']);
check('and so is a ledger written into',
  workDifferences(snapshot(), snapshot({ cidEvents: 13 })), ['CID ledger events: 12 → 13']);
check('work belonging to no matter at all is counted too',
  workDifferences(snapshot(), snapshot({ shared: { tasks: 7, timesheets: 2 } })),
  ['time logged against no project: 3 → 2']);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ workspace-flow conversion: ${passed}/${passed} passed`);
