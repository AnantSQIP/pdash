// Canonical permission taxonomy for the whole system.
// Permission code format: "<module>.<action>[.<scope>]".
// Consumed by seed.ts (to populate the Permission catalog + role presets) and
// mirrored by the frontend Admin matrix (which groups by module via the code).

export interface ModuleDef {
  key: string;
  label: string;
  actions: string[]; // action or action.scope (e.g. 'view.organization')
}

// Action labels for the matrix UI.
export const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  update: 'Edit / Update',
  delete: 'Delete',
  approve: 'Approve',
  assign: 'Assign',
  export: 'Export',
  manage: 'Manage',
  manage_access: 'Manage Access',
  manage_members: 'Manage Members',
  request: 'Request',
  regularize: 'Regularize',
  'view.own': 'View Own',
  'view.organization': 'View Org-wide',
};

export const MODULES: ModuleDef[] = [
  { key: 'dashboard',   label: 'Dashboard',    actions: ['view'] },
  { key: 'project',     label: 'Projects',     actions: ['view', 'create', 'update', 'delete', 'approve'] },
  { key: 'task',        label: 'Tasks',        actions: ['view', 'create', 'update', 'delete', 'assign'] },
  { key: 'milestone',   label: 'Milestones',   actions: ['view', 'create', 'update', 'delete'] },
  { key: 'tasklist',    label: 'Task Lists',   actions: ['view', 'create', 'update', 'delete'] },
  { key: 'timesheet',   label: 'Timesheets',   actions: ['view', 'create', 'update', 'delete'] },
  { key: 'issue',       label: 'Issues',       actions: ['view', 'create', 'update', 'delete'] },
  { key: 'comment',     label: 'Discussion',   actions: ['view', 'create', 'delete'] },
  { key: 'calendar',    label: 'Calendar',     actions: ['view', 'create', 'update', 'delete'] },
  { key: 'channel',     label: 'Channels',     actions: ['view', 'create', 'update', 'delete'] },
  { key: 'report',      label: 'Reports',      actions: ['view', 'export'] },
  { key: 'analytics',   label: 'Analytics',    actions: ['view.own', 'view.organization'] },
  { key: 'performance', label: 'Performance',  actions: ['view.own', 'view.organization'] },
  { key: 'attendance',  label: 'Attendance',   actions: ['view.own', 'view.organization', 'manage', 'regularize'] },
  { key: 'leave',       label: 'Leave',        actions: ['view.own', 'view.organization', 'request', 'approve'] },
  { key: 'holiday',     label: 'Holidays',     actions: ['view', 'manage'] },
  { key: 'department',  label: 'Departments',  actions: ['view', 'create', 'update', 'delete'] },
  { key: 'user',        label: 'Users',        actions: ['view', 'create', 'update', 'delete', 'manage_access'] },
  { key: 'role',        label: 'Roles',        actions: ['view', 'create', 'update', 'delete'] },
  { key: 'group',       label: 'Permission Groups', actions: ['view', 'create', 'update', 'delete', 'manage_members'] },
  { key: 'permission',  label: 'Permissions',  actions: ['view'] },
  { key: 'audit',       label: 'Audit Log',    actions: ['view', 'export'] },
  { key: 'settings',    label: 'Settings',     actions: ['view', 'update'] },
];

export interface PermissionDef {
  code: string;
  name: string;
  module: string;
  description: string;
}

export const PERMISSIONS: PermissionDef[] = MODULES.flatMap(m =>
  m.actions.map(action => ({
    code: `${m.key}.${action}`,
    name: `${m.label} — ${ACTION_LABELS[action] ?? action}`,
    module: m.key,
    description: `${ACTION_LABELS[action] ?? action} on ${m.label}`,
  })),
);

export const ALL_PERMISSION_CODES: string[] = PERMISSIONS.map(p => p.code);

const code = (k: string, a: string) => `${k}.${a}`;

// Read-only "view" of the operational modules a normal user touches.
const VIEW_BASICS = [
  code('dashboard', 'view'), code('project', 'view'), code('task', 'view'),
  code('milestone', 'view'), code('tasklist', 'view'), code('timesheet', 'view'),
  code('issue', 'view'), code('comment', 'view'), code('calendar', 'view'),
  code('channel', 'view'), code('report', 'view'),
  code('attendance', 'view.own'), code('leave', 'view.own'), code('holiday', 'view'),
];

// Manager: full operational control over delivery work + org analytics, no system admin.
const MANAGER_CODES = [
  ...VIEW_BASICS,
  code('project', 'create'), code('project', 'update'), code('project', 'approve'),
  code('task', 'create'), code('task', 'update'), code('task', 'delete'), code('task', 'assign'),
  code('milestone', 'create'), code('milestone', 'update'), code('milestone', 'delete'),
  code('tasklist', 'create'), code('tasklist', 'update'), code('tasklist', 'delete'),
  code('timesheet', 'create'), code('timesheet', 'update'),
  code('issue', 'create'), code('issue', 'update'),
  code('comment', 'create'),
  code('calendar', 'create'), code('calendar', 'update'),
  code('channel', 'create'),
  code('report', 'export'),
  code('analytics', 'view.organization'),
  code('performance', 'view.own'), code('performance', 'view.organization'),
  code('attendance', 'view.organization'), code('attendance', 'regularize'),
  code('leave', 'view.organization'), code('leave', 'approve'), code('leave', 'request'),
  code('holiday', 'manage'),
  code('user', 'view'), code('department', 'view'),
];

// Employee: see work, manage own contributions.
const EMPLOYEE_CODES = [
  ...VIEW_BASICS,
  code('task', 'create'), code('task', 'update'),
  code('timesheet', 'create'), code('timesheet', 'update'),
  code('issue', 'create'),
  code('comment', 'create'),
  code('channel', 'create'),
  code('analytics', 'view.own'),
  code('performance', 'view.own'),
  code('leave', 'request'),
];

// Senior Consultant: strong delivery lead — full operational control over
// projects/tasks (incl. approve + assign) and org-wide visibility, but no
// people-ops admin (leave approval, holidays, user management stay with
// Manager/HR/Admin).
const SENIOR_CONSULTANT_CODES = [
  ...VIEW_BASICS,
  code('project', 'create'), code('project', 'update'), code('project', 'approve'),
  code('task', 'create'), code('task', 'update'), code('task', 'delete'), code('task', 'assign'),
  code('milestone', 'create'), code('milestone', 'update'), code('milestone', 'delete'),
  code('tasklist', 'create'), code('tasklist', 'update'), code('tasklist', 'delete'),
  code('timesheet', 'create'), code('timesheet', 'update'),
  code('issue', 'create'), code('issue', 'update'),
  code('comment', 'create'),
  code('calendar', 'create'), code('calendar', 'update'),
  code('channel', 'create'),
  code('report', 'export'),
  code('analytics', 'view.organization'),
  code('performance', 'view.own'), code('performance', 'view.organization'),
  code('leave', 'request'),
  code('user', 'view'), code('department', 'view'),
];

// Consultant: senior contributor — more than an Employee (can assign tasks and
// shape milestones/issues) but cannot create or approve projects.
const CONSULTANT_CODES = [
  ...VIEW_BASICS,
  code('task', 'create'), code('task', 'update'), code('task', 'assign'),
  code('milestone', 'create'), code('milestone', 'update'),
  code('tasklist', 'create'), code('tasklist', 'update'),
  code('timesheet', 'create'), code('timesheet', 'update'),
  code('issue', 'create'), code('issue', 'update'),
  code('comment', 'create'),
  code('calendar', 'create'),
  code('channel', 'create'),
  code('report', 'export'),
  code('analytics', 'view.own'),
  code('performance', 'view.own'),
  code('leave', 'request'),
];

// HR: people operations — attendance, leave, holidays, user & department
// management and org-wide performance visibility, but no delivery (project/task)
// authoring.
const HR_CODES = [
  ...VIEW_BASICS,
  code('comment', 'create'),
  code('report', 'export'),
  code('analytics', 'view.own'),
  code('performance', 'view.own'), code('performance', 'view.organization'),
  code('attendance', 'view.own'), code('attendance', 'view.organization'),
  code('attendance', 'manage'), code('attendance', 'regularize'),
  code('leave', 'view.own'), code('leave', 'view.organization'),
  code('leave', 'request'), code('leave', 'approve'),
  code('holiday', 'view'), code('holiday', 'manage'),
  code('department', 'view'), code('department', 'create'), code('department', 'update'),
  code('user', 'view'), code('user', 'create'), code('user', 'update'), code('user', 'manage_access'),
];

// Admin: everything except the most destructive RBAC delete (kept for Super Admin).
const ADMIN_CODES = ALL_PERMISSION_CODES.filter(c => c !== code('role', 'delete'));

/**
 * Role → permission-code presets. The '*' sentinel means "all permissions"
 * (Super Admin) and is expanded by the seed; the PermissionService also
 * short-circuits Super Admin regardless.
 */
export const ROLE_PRESETS: Record<string, string[] | '*'> = {
  'Super Admin': '*',
  Admin: ADMIN_CODES,
  Manager: MANAGER_CODES,
  'Senior Consultant': SENIOR_CONSULTANT_CODES,
  Consultant: CONSULTANT_CODES,
  HR: HR_CODES,
  Employee: EMPLOYEE_CODES,
};

export const SUPER_ADMIN_ROLE = 'Super Admin';
