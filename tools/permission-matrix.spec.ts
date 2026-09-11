/**
 * Tests for the Access screen's arithmetic — apps/web/lib/permission-matrix.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/permission-matrix.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * These exist because the Access screen edits the thing every other check in the system depends
 * on, and it does it with a wholesale replace: PUT /roles/:id/permissions deletes every row for
 * the role and writes back exactly what the screen sent. Nothing bounces. A permission the screen
 * failed to render is a permission the next save silently deletes, and the first anyone hears of
 * it is somebody unable to log their time.
 *
 * So three things are pinned here. That the screen's copy of the taxonomy is the catalog's (a
 * drifted mirror is how a code goes missing). That grouping reports BOTH kinds of disagreement
 * with the database rather than quietly dropping either. And that the diff a Super Admin is shown
 * before saving is the diff that will actually be applied.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  ACTION_LABELS as WEB_ACTION_LABELS,
  CATALOG_CODES,
  CODE_NOTES,
  MODULES as WEB_MODULES,
  UNCATALOGUED_KEY,
  describeDiff,
  diffGrants,
  effectiveCodes,
  groupByModule,
  isDirty,
  isImplicitAllRole,
  labelForCode,
  planChanges,
} from '../apps/web/lib/permission-matrix';
import {
  ACTION_LABELS as CATALOG_ACTION_LABELS,
  ALL_PERMISSION_CODES,
  MODULES as CATALOG_MODULES,
  ROLE_PRESETS,
  SUPER_ADMIN_ONLY_CODES,
} from '../packages/db/prisma/permissions-catalog';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

/** A seeded permission row, as GET /permissions returns it. */
const perm = (code: string) => ({ id: `id_${code}`, code });
const seededFromCatalog = ALL_PERMISSION_CODES.map(perm);

// ── the mirror is the catalog ────────────────────────────────────────────────
// apps/web cannot import the catalog (its package entry point is the Prisma client), so the
// taxonomy is restated there. This is the guard that makes the restatement safe: add a module or
// an action to the catalog and forget the screen, and this fails here rather than in production.
check('the screen’s module taxonomy is exactly the catalog’s', WEB_MODULES, CATALOG_MODULES);
check('the screen’s action labels are exactly the catalog’s', WEB_ACTION_LABELS, CATALOG_ACTION_LABELS);
check('and so the codes it can draw are the codes the catalog defines', CATALOG_CODES, ALL_PERMISSION_CODES);

// The two codes the review added. They are the whole point of a screen that can grant anything:
// Super-Admin-only by preset, but grantable from here.
check('permanent project deletion is in the taxonomy', CATALOG_CODES.includes('project.delete.permanent'), true);
check('permanent task deletion is in the taxonomy', CATALOG_CODES.includes('task.delete.permanent'), true);
check('permanent deletion reads as what it is, not as another Delete',
  labelForCode('project.delete.permanent'), 'Projects — Delete Permanently');

// ── grouping ─────────────────────────────────────────────────────────────────
const full = groupByModule(seededFromCatalog);

check('modules come out in catalog order', full.groups.map(g => g.key).slice(0, 4),
  ['dashboard', 'project', 'task', 'tasklist']);
check('a module’s actions keep the order the catalog declares them in',
  full.groups.find(g => g.key === 'attendance')!.cells.map(c => c.action),
  ['view.own', 'view.organization', 'manage', 'regularize']);
check('every catalog code lands in exactly one group',
  full.groups.reduce((n, g) => n + g.cells.length, 0), ALL_PERMISSION_CODES.length);
check('a fully seeded database leaves nothing missing', full.missingFromDatabase, []);
check('…and nothing unrecognised', full.unknownToCatalog, []);
check('a seeded cell carries the id the save will send',
  full.groups.find(g => g.key === 'project')!.cells.find(c => c.action === 'create')!.id, 'id_project.create');

// A catalog code the seed has not written yet. It must render — greyed, unticked — rather than
// vanish, because a screen that hides it is a screen that cannot tell you why you can't grant it.
const notSeeded = groupByModule(seededFromCatalog.filter(p => p.code !== 'attendance.manage'));
check('a catalog code with no database row is reported, not hidden',
  notSeeded.missingFromDatabase, ['attendance.manage']);
check('…and it still has a cell, with no id to save',
  notSeeded.groups.find(g => g.key === 'attendance')!.cells.find(c => c.action === 'manage')!.id, null);

// The reverse: the database holds a code the catalog has forgotten. Roles may already hold it, so
// it MUST be visible — an invisible grant is one that can never be taken away from this screen.
const extra = groupByModule([...seededFromCatalog, perm('legacy.thing'), perm('zz.other')]);
check('a database code the catalog does not define is reported',
  extra.unknownToCatalog, ['legacy.thing', 'zz.other']);
check('…and is rendered in a trailing group so it can be revoked',
  extra.groups[extra.groups.length - 1].key, UNCATALOGUED_KEY);
check('…with its real id, so revoking it actually writes',
  extra.groups[extra.groups.length - 1].cells.map(c => c.id), ['id_legacy.thing', 'id_zz.other']);
check('an uncatalogued group is flagged as such',
  extra.groups[extra.groups.length - 1].uncatalogued, true);
check('the catalogued groups are untouched by the strays',
  extra.groups.length, full.groups.length + 1);

// ── the diff shown before saving ─────────────────────────────────────────────
check('nothing ticked, nothing untouched, nothing to say',
  diffGrants(['a.view'], ['a.view']), { added: [], removed: [], unchanged: 1 });
check('a grant is an addition', diffGrants([], ['a.view']), { added: ['a.view'], removed: [], unchanged: 0 });
check('an untick is a removal', diffGrants(['a.view'], []), { added: [], removed: ['a.view'], unchanged: 0 });
check('both at once, each side sorted',
  diffGrants(['b.view', 'keep.view'], ['keep.view', 'a.view', 'c.view']),
  { added: ['a.view', 'c.view'], removed: ['b.view'], unchanged: 1 });
check('duplicates in the proposal do not become phantom grants',
  diffGrants(['a.view'], ['a.view', 'a.view']), { added: [], removed: [], unchanged: 1 });
check('an unchanged set is not dirty', isDirty(diffGrants(['a.view'], ['a.view'])), false);
check('a removal alone is dirty', isDirty(diffGrants(['a.view'], [])), true);
check('the one-line form counts both directions',
  describeDiff(diffGrants(['b.view'], ['a.view', 'c.view'])), '2 granted, 1 removed');
check('and says so plainly when there is nothing',
  describeDiff(diffGrants(['a.view'], ['a.view'])), 'no changes');

// ── the implicit-all role ────────────────────────────────────────────────────
// The resolver short-circuits Super Admin: it returns every code no matter what is stored. Ticking
// boxes for it is theatre; UNTICKING them looks like it removed something and did not.
check('Super Admin is implicit-all', isImplicitAllRole('Super Admin'), true);
check('nobody else is', [isImplicitAllRole('Admin'), isImplicitAllRole('HR')], [false, false]);
check('an implicit-all role holds everything even with nothing stored against it',
  effectiveCodes('Super Admin', [], ['b.view', 'a.view']), ['a.view', 'b.view']);
check('…and holds everything even if someone stored a single code against it',
  effectiveCodes('Super Admin', ['a.view'], ['a.view', 'b.view']), ['a.view', 'b.view']);
check('an ordinary role holds exactly what it was given',
  effectiveCodes('Manager', ['b.view', 'a.view'], ['a.view', 'b.view', 'c.view']), ['a.view', 'b.view']);

const roles = [
  { id: 'r_sa', name: 'Super Admin', memberCount: 2, permissionCodes: [] as string[] },
  { id: 'r_mgr', name: 'Manager', memberCount: 5, permissionCodes: ['project.view', 'attendance.view.own'] },
  { id: 'r_hr', name: 'HR', memberCount: 1, permissionCodes: ['attendance.view.organization', 'attendance.manage'] },
];

check('a save plan skips the implicit-all role even when its boxes were changed',
  planChanges(roles, { r_sa: ['project.view'], r_mgr: ['project.view', 'attendance.view.own'] }).length, 0);
check('a role nobody touched is left out of the plan entirely',
  planChanges(roles, { r_hr: ['attendance.manage', 'attendance.view.organization'] }).length, 0);

// ── requirement 24, the owner's worked example ───────────────────────────────
// "HR holds all the attendance permissions today; it must be possible to grant those to a Manager
// or to a Senior Research Associate from that same screen."
check('the attendance permissions HR holds today are exactly the ones the example names',
  (ROLE_PRESETS.HR as string[]).filter(c => c.startsWith('attendance.')).sort(),
  ['attendance.manage', 'attendance.regularize', 'attendance.view.organization', 'attendance.view.own']);
check('a Manager does not hold them today',
  (ROLE_PRESETS.Manager as string[]).includes('attendance.manage'), false);
check('nor does a Senior Research Associate',
  (ROLE_PRESETS['Senior Research Associate'] as string[]).includes('attendance.view.organization'), false);

const grantAttendanceToManager = planChanges(roles, {
  r_mgr: ['project.view', 'attendance.view.own', 'attendance.view.organization', 'attendance.manage'],
});
check('granting them to a Manager is a two-code addition and nothing else',
  grantAttendanceToManager.map(c => c.diff),
  [{ added: ['attendance.manage', 'attendance.view.organization'], removed: [], unchanged: 2 }]);
check('…and the plan sends the WHOLE set, because the endpoint replaces rather than merges',
  grantAttendanceToManager[0].codes,
  ['attendance.manage', 'attendance.view.organization', 'attendance.view.own', 'project.view']);
check('…carrying how many people it lands on', grantAttendanceToManager[0].memberCount, 5);

// Taking them back off HR is the same operation in reverse — and is named as a removal, which is
// the case the confirmation step exists for.
check('revoking is reported as a removal against the role that holds them',
  planChanges(roles, { r_hr: [] }).map(c => [c.roleName, c.diff.removed]),
  [['HR', ['attendance.manage', 'attendance.view.organization']]]);

// ── requirement 25, project creation ─────────────────────────────────────────
check('project.create is a real, grantable code', ALL_PERMISSION_CODES.includes('project.create'), true);
check('everyone below Manager already has it as "request a project"',
  ['Employee', 'Consultant', 'Senior Research Associate'].map(r => (ROLE_PRESETS[r] as string[]).includes('project.create')),
  [true, true, true]);
check('…and only some of those can approve one, which is what makes it a request',
  ['Employee', 'Consultant', 'Manager'].map(r => (ROLE_PRESETS[r] as string[]).includes('project.approve')),
  [false, false, true]);
check('so the screen explains the difference rather than letting the name mislead',
  [CODE_NOTES['project.create'].includes('REQUEST'), !!CODE_NOTES['project.approve']], [true, true]);

// ── the Admin ceiling ────────────────────────────────────────────────────────
// ADMIN_CODES is a filter over every code, so a new Super-Admin-only code is handed to Admin the
// moment it is defined unless it is named in SUPER_ADMIN_ONLY_CODES. That is exactly how
// project.delete.permanent could have leaked.
const adminCodes = ROLE_PRESETS.Admin as string[];
check('no Super-Admin-only code reaches the Admin preset',
  SUPER_ADMIN_ONLY_CODES.filter(c => adminCodes.includes(c)), []);
check('the list is the one the review settled on',
  [...SUPER_ADMIN_ONLY_CODES].sort(),
  ['patent.manage', 'project.delete.permanent', 'task.delete.permanent']);
check('Admin is everything else bar deleting a role',
  ALL_PERMISSION_CODES.filter(c => !adminCodes.includes(c)).sort(),
  ['patent.manage', 'project.delete.permanent', 'role.delete', 'task.delete.permanent']);
check('Super Admin is stored as the implicit-all sentinel, not as a list',
  ROLE_PRESETS['Super Admin'], '*');

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ permission matrix: ${passed}/${passed} passed`);
