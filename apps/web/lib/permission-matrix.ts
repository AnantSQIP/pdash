/**
 * The shape of the Access screen: which permission codes exist, how they group into modules,
 * and what changes when a Super Admin ticks a box.
 *
 * WHY THE TAXONOMY IS MIRRORED HERE
 * ---------------------------------
 * packages/db/prisma/permissions-catalog.ts is the canonical list — it is what the seed and
 * regrant scripts write into the `permission` table, and its own comment says the frontend
 * matrix mirrors it. We cannot import it: @pdash/db's entry point re-exports the Prisma client,
 * which has no business in a browser bundle, and a deep relative import out of apps/web is not
 * something the Next build is set up to resolve. So the taxonomy is restated below and
 * tools/permission-matrix.spec.ts asserts, against the real catalog, that the two are identical.
 * Drift is a failing test rather than a screen that quietly stops showing a permission.
 *
 * The database is still the source of truth for what is GRANTABLE: an id only exists for a code
 * the seed has actually written. groupByModule() reports both directions of disagreement rather
 * than hiding either — a catalog code nobody has seeded cannot be ticked, and a code the
 * database has but the catalog forgot must still be visible, or a role could hold a permission
 * no screen can show or take away.
 */

export interface ModuleDef {
  key: string;
  label: string;
  actions: string[]; // action or action.scope (e.g. 'view.organization')
}

/** Mirrors ACTION_LABELS in the catalog. */
export const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  update: 'Edit / Update',
  delete: 'Delete',
  approve: 'Approve',
  generate_pid: 'Generate PID',
  assign: 'Assign',
  export: 'Export',
  manage: 'Manage',
  manage_access: 'Manage Access',
  manage_members: 'Manage Members',
  request: 'Request',
  regularize: 'Regularize',
  'view.own': 'View Own',
  'view.organization': 'View Org-wide',
  'view.client': 'View Client Deadline',
  'view.personal': 'View Personal Details',
  'update.any': 'Edit Anyone\'s',
  'delete.permanent': 'Delete Permanently',
};

/** Mirrors MODULES in the catalog — same keys, same labels, same action order. */
export const MODULES: ModuleDef[] = [
  { key: 'dashboard',   label: 'Dashboard',    actions: ['view'] },
  { key: 'project',     label: 'Projects',     actions: ['view', 'create', 'update', 'delete', 'delete.permanent', 'approve', 'generate_pid'] },
  { key: 'task',        label: 'Tasks',        actions: ['view', 'create', 'update', 'delete', 'delete.permanent', 'assign'] },
  { key: 'tasklist',    label: 'Task Lists',   actions: ['view', 'create', 'update', 'delete'] },
  { key: 'timesheet',   label: 'Timesheets',   actions: ['view', 'create', 'update', 'delete'] },
  { key: 'issue',       label: 'Issues',       actions: ['view', 'create', 'update', 'delete'] },
  { key: 'comment',     label: 'Discussion',   actions: ['view', 'create', 'delete'] },
  { key: 'document',    label: 'Files & Media', actions: ['view', 'create', 'delete'] },
  { key: 'calendar',    label: 'Calendar',     actions: ['view', 'create', 'update', 'delete'] },
  { key: 'channel',     label: 'Channels',     actions: ['view', 'create', 'update', 'delete'] },
  { key: 'report',      label: 'Reports',      actions: ['view', 'export'] },
  { key: 'analytics',   label: 'Analytics',    actions: ['view.own', 'view.organization'] },
  { key: 'performance', label: 'Performance',  actions: ['view.own', 'view.organization'] },
  { key: 'capacity',    label: 'Team Capacity', actions: ['view'] },
  { key: 'deadline',    label: 'Client Deadlines', actions: ['view.client'] },
  { key: 'attendance',  label: 'Attendance',   actions: ['view.own', 'view.organization', 'manage', 'regularize'] },
  { key: 'leave',       label: 'Leave',        actions: ['view.own', 'view.organization', 'request', 'approve'] },
  { key: 'expense',     label: 'Expenses',     actions: ['view.own', 'view.organization', 'submit', 'approve'] },
  { key: 'holiday',     label: 'Holidays',     actions: ['view', 'manage'] },
  { key: 'department',  label: 'Departments',  actions: ['view', 'create', 'update', 'delete'] },
  { key: 'user',        label: 'Users',        actions: ['view', 'create', 'update', 'delete', 'manage_access'] },
  { key: 'profile',     label: 'User Profiles', actions: ['view', 'view.personal', 'update.any'] },
  { key: 'announcement', label: 'Announcements', actions: ['manage'] },
  { key: 'policy',       label: 'HR Policies',   actions: ['manage'] },
  { key: 'appraisal',    label: 'Appraisals',    actions: ['manage'] },
  { key: 'reward',       label: 'Recognition',   actions: ['give'] },
  { key: 'role',        label: 'Roles',        actions: ['view', 'create', 'update', 'delete'] },
  { key: 'group',       label: 'Permission Groups', actions: ['view', 'create', 'update', 'delete', 'manage_members'] },
  { key: 'permission',  label: 'Permissions',  actions: ['view'] },
  { key: 'audit',       label: 'Audit Log',    actions: ['view', 'export'] },
  { key: 'settings',    label: 'Settings',     actions: ['view', 'update'] },
  { key: 'patent',      label: 'Clients & Patents', actions: ['view', 'manage'] },
  { key: 'team',        label: 'Team Spaces',  actions: ['view', 'manage'] },
  { key: 'deal',        label: 'BD Pipeline',  actions: ['view', 'manage'] },
];

export const SUPER_ADMIN_ROLE = 'Super Admin';

/**
 * Roles the permission resolver short-circuits: PermissionService.getEffectivePermissions()
 * returns every code for a Super Admin no matter what the role_permission rows say. Ticking
 * boxes for such a role is theatre, and UNTICKING them is worse — it looks like it removed
 * something and did not. The screen renders these rows as locked.
 */
export function isImplicitAllRole(roleName: string): boolean {
  return roleName === SUPER_ADMIN_ROLE;
}

export function moduleOf(code: string): string { return code.split('.')[0]; }
export function actionOf(code: string): string { return code.split('.').slice(1).join('.'); }

/** "Attendance — View Org-wide", the label a person reads in the row header. */
export function labelForCode(code: string): string {
  const mod = MODULES.find(m => m.key === moduleOf(code));
  const action = actionOf(code);
  const actionLabel = ACTION_LABELS[action] ?? action;
  return mod ? `${mod.label} — ${actionLabel}` : code;
}

/** Every code the catalog defines, in catalog order. */
export const CATALOG_CODES: string[] = MODULES.flatMap(m => m.actions.map(a => `${m.key}.${a}`));

/**
 * Prose shown beside particular cells. These are the places where the code's NAME does not
 * say what the code does, and an admin ticking the box on its name alone would get a surprise.
 * Kept as data (not JSX) so the spec can assert a note exists for the ones the owner asked about.
 */
export const CODE_NOTES: Record<string, string> = {
  // The catalog's EMPLOYEE_CODES comment: for a role without project.approve this is
  // "request a project" — the project starts PENDING and the nominated manager approves it.
  // Removing it stops that role starting projects at all (the server enforces it on POST /projects).
  'project.create': 'Lets the role START a project. A role that also has Projects — Approve creates it outright; a role without it can only REQUEST one, which a manager must approve. It also covers adding a later round to an existing project, so taking it away stops both.',
  'project.approve': 'Approves a project someone else requested. Not the same as minting a PID — that is Generate PID.',
  'project.generate_pid': 'Mints the Project ID (SQ_26_27_nnn). Kept narrow deliberately: running a project is not the same authority as issuing its number.',
  'project.delete.permanent': 'Removes the row itself, not the “deleted” flag every other Delete sets. There is no undo and nothing left to restore.',
  'task.delete.permanent': 'Removes the row itself, not the “deleted” flag every other Delete sets. There is no undo and nothing left to restore.',
  'attendance.view.organization': 'Sees everyone’s attendance, not just their own. This plus Manage is what HR holds today.',
  'attendance.manage': 'Edits attendance records and decides regularisation requests.',
  'performance.view.organization': 'Who may see the whole firm’s performance, and anyone else’s. The Organisation tab and every org-wide performance route check this exact code on the server — it is the “only whoever is chosen” switch.',
  'analytics.view.organization': 'Org-wide analytics and reporting. A SEPARATE permission from Performance — View Org-wide: granting one does not grant the other.',
  'patent.manage': 'The confidential portal: real patent numbers and client identities.',
  'profile.view.personal': 'Home addresses, dates of birth and emergency contacts. The server strips these keys for everyone else.',
};

// ── grouping ─────────────────────────────────────────────────────────────────

/** One permission as the matrix renders it. `id` is null when the catalog has it but the seed has not. */
export interface MatrixCell {
  code: string;
  id: string | null;
  action: string;
  label: string;
  note?: string;
}

export interface MatrixGroup {
  key: string;
  label: string;
  cells: MatrixCell[];
  /** True for the trailing group holding codes the database has and the catalog does not. */
  uncatalogued?: boolean;
}

export interface GroupedMatrix {
  groups: MatrixGroup[];
  /** Catalog codes with no row in the `permission` table — the seed has not been run for them. */
  missingFromDatabase: string[];
  /** Codes the database has that the catalog does not define — shown anyway, so they can be revoked. */
  unknownToCatalog: string[];
}

export const UNCATALOGUED_KEY = '_uncatalogued';

/**
 * Lay the permission catalog out as the screen draws it: modules in catalog order, actions in
 * the order the module declares them, and a trailing group for anything the database knows and
 * the catalog does not.
 *
 * Grouping by the code's prefix rather than by a column on the table is deliberate — `permission`
 * stores only code/name/description, so the prefix IS the module.
 */
export function groupByModule(
  permissions: { id: string; code: string }[],
  modules: ModuleDef[] = MODULES,
): GroupedMatrix {
  const idByCode = new Map(permissions.map(p => [p.code, p.id]));
  const catalogued = new Set<string>();
  const missingFromDatabase: string[] = [];

  const groups: MatrixGroup[] = modules.map(m => ({
    key: m.key,
    label: m.label,
    cells: m.actions.map(action => {
      const code = `${m.key}.${action}`;
      catalogued.add(code);
      const id = idByCode.get(code) ?? null;
      if (id === null) missingFromDatabase.push(code);
      return {
        code,
        id,
        action,
        label: ACTION_LABELS[action] ?? action,
        note: CODE_NOTES[code],
      };
    }),
  }));

  const unknownToCatalog = permissions
    .map(p => p.code)
    .filter(c => !catalogued.has(c))
    .sort();

  if (unknownToCatalog.length) {
    groups.push({
      key: UNCATALOGUED_KEY,
      label: 'Not in the catalog',
      uncatalogued: true,
      cells: unknownToCatalog.map(code => ({
        code,
        id: idByCode.get(code) ?? null,
        action: actionOf(code),
        label: code,
        note: CODE_NOTES[code],
      })),
    });
  }

  return { groups, missingFromDatabase, unknownToCatalog };
}

// ── diffing ──────────────────────────────────────────────────────────────────

export interface GrantDiff {
  added: string[];
  removed: string[];
  /** How many codes the role holds both before and after — context for "is this edit big?". */
  unchanged: number;
}

/**
 * What ticking boxes actually did, in codes rather than ids.
 *
 * The screen shows this BEFORE saving. PUT /roles/:id/permissions is a wholesale replace, so a
 * mis-click does not fail loudly — it silently takes a capability away from everyone holding the
 * role. Naming the removals in advance is the only thing standing between a stray click and a
 * team that cannot log time tomorrow morning.
 */
export function diffGrants(current: Iterable<string>, next: Iterable<string>): GrantDiff {
  const before = new Set(current);
  const after = new Set(next);
  const added = [...after].filter(c => !before.has(c)).sort();
  const removed = [...before].filter(c => !after.has(c)).sort();
  const unchanged = [...after].filter(c => before.has(c)).length;
  return { added, removed, unchanged };
}

export function isDirty(diff: GrantDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0;
}

/** "2 granted, 1 removed" — the one-line form used on buttons and row badges. */
export function describeDiff(diff: GrantDiff): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} granted`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  return parts.join(', ') || 'no changes';
}

/**
 * What the role will hold once saved. An implicit-all role holds every code regardless of what
 * is stored against it, so the matrix must answer this question through here rather than by
 * reading the tick boxes — otherwise the Super Admin row would read as empty on a fresh seed.
 */
export function effectiveCodes(roleName: string, granted: Iterable<string>, allCodes: string[]): string[] {
  if (isImplicitAllRole(roleName)) return [...allCodes].sort();
  return [...new Set(granted)].sort();
}

/**
 * The save plan: only the roles whose grants actually changed, each with its diff.
 *
 * Roles that did not change are left out entirely — PUT /roles/:id/permissions rewrites every
 * row for the role, so re-sending an unchanged role would churn the audit log (and the
 * role_permission table) for nothing. Implicit-all roles are never in the plan.
 */
export interface RoleGrantChange {
  roleId: string;
  roleName: string;
  memberCount: number;
  diff: GrantDiff;
  /** The full code set to send — a replace, not a delta. */
  codes: string[];
}

export function planChanges(
  roles: { id: string; name: string; memberCount?: number; permissionCodes?: string[] }[],
  proposed: Record<string, Set<string> | string[]>,
): RoleGrantChange[] {
  const out: RoleGrantChange[] = [];
  for (const role of roles) {
    if (isImplicitAllRole(role.name)) continue;
    const next = proposed[role.id];
    if (!next) continue;
    const codes = [...new Set(next)].sort();
    const diff = diffGrants(role.permissionCodes ?? [], codes);
    if (isDirty(diff)) {
      out.push({ roleId: role.id, roleName: role.name, memberCount: role.memberCount ?? 0, diff, codes });
    }
  }
  return out;
}
