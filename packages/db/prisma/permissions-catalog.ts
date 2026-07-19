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
  'view.client': 'View Client Deadline',
  'view.personal': 'View Personal Details',
  'update.any': 'Edit Anyone\'s',
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
  { key: 'document',    label: 'Files & Media', actions: ['view', 'create', 'delete'] },
  { key: 'calendar',    label: 'Calendar',     actions: ['view', 'create', 'update', 'delete'] },
  { key: 'channel',     label: 'Channels',     actions: ['view', 'create', 'update', 'delete'] },
  { key: 'report',      label: 'Reports',      actions: ['view', 'export'] },
  { key: 'analytics',   label: 'Analytics',    actions: ['view.own', 'view.organization'] },
  { key: 'performance', label: 'Performance',  actions: ['view.own', 'view.organization'] },
  // Team availability / workload board — who is busy, who is free, who is overloaded.
  { key: 'capacity',    label: 'Team Capacity', actions: ['view'] },
  // The client-facing deadline is restricted: only these holders (plus a project's own
  // manager, for that project) ever receive it from the API.
  { key: 'deadline',    label: 'Client Deadlines', actions: ['view.client'] },
  { key: 'attendance',  label: 'Attendance',   actions: ['view.own', 'view.organization', 'manage', 'regularize'] },
  { key: 'leave',       label: 'Leave',        actions: ['view.own', 'view.organization', 'request', 'approve'] },
  { key: 'expense',     label: 'Expenses',     actions: ['view.own', 'view.organization', 'submit', 'approve'] },
  { key: 'holiday',     label: 'Holidays',     actions: ['view', 'manage'] },
  { key: 'department',  label: 'Departments',  actions: ['view', 'create', 'update', 'delete'] },
  { key: 'user',        label: 'Users',        actions: ['view', 'create', 'update', 'delete', 'manage_access'] },
  // A person's joining details. TWO TIERS, enforced by stripping keys server-side:
  //   profile.view          → the directory card (managers/seniors)
  //   profile.view.personal → home addresses, DOB, emergency contact (Admin/Super Admin/HR)
  // Everyone can always see and edit their OWN profile — that needs no permission.
  { key: 'profile',     label: 'User Profiles', actions: ['view', 'view.personal', 'update.any'] },
  // Employee lifecycle: onboarding + offboarding processes, checklists, and HR letters.
  // `manage` = HR/Admin run the processes and issue letters; `view` sees the boards.
  // (A person always sees their OWN onboarding tasks + letters without any permission.)
  { key: 'lifecycle',   label: 'Employee Lifecycle', actions: ['view', 'manage'] },
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
  code('issue', 'view'), code('comment', 'view'), code('document', 'view'),
  code('calendar', 'view'),
  code('channel', 'view'), code('report', 'view'),
  code('attendance', 'view.own'), code('leave', 'view.own'), code('holiday', 'view'),
  // Everyone can record their own business expenses and see them.
  code('expense', 'view.own'), code('expense', 'submit'),
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
  code('document', 'create'), code('document', 'delete'),
  code('calendar', 'create'), code('calendar', 'update'),
  code('channel', 'create'),
  code('report', 'export'),
  code('analytics', 'view.organization'),
  code('performance', 'view.own'), code('performance', 'view.organization'),
  // Delivery oversight: see who is free/overloaded, and the client-facing dates.
  code('capacity', 'view'), code('deadline', 'view.client'),
  code('attendance', 'view.organization'), code('attendance', 'regularize'),
  code('leave', 'view.organization'), code('leave', 'approve'), code('leave', 'request'),
  code('expense', 'view.organization'), code('expense', 'approve'),
  code('holiday', 'manage'),
  code('user', 'view'), code('department', 'view'),
  // Directory tier only — a manager never receives someone's home address or DOB.
  code('profile', 'view'),
  // See onboarding/offboarding status of the team (HR still owns running them).
  code('lifecycle', 'view'),
];

// Employee: see work, manage own contributions.
// project.create here means "REQUEST a project": a new project always starts PENDING
// approval (D2), and an Employee cannot approve one (no project.approve) — so an intern
// can submit a project that the manager they nominate must approve.
const EMPLOYEE_CODES = [
  ...VIEW_BASICS,
  code('project', 'create'),
  code('task', 'create'), code('task', 'update'),
  code('timesheet', 'create'), code('timesheet', 'update'),
  code('issue', 'create'),
  code('comment', 'create'),
  code('document', 'create'),
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
  code('document', 'create'), code('document', 'delete'),
  code('calendar', 'create'), code('calendar', 'update'),
  code('channel', 'create'),
  code('report', 'export'),
  code('analytics', 'view.organization'),
  code('performance', 'view.own'), code('performance', 'view.organization'),
  // Delivery oversight: see who is free/overloaded, and the client-facing dates.
  code('capacity', 'view'), code('deadline', 'view.client'),
  code('leave', 'request'),
  code('user', 'view'), code('department', 'view'),
  // Directory tier only — a manager never receives someone's home address or DOB.
  code('profile', 'view'),
];

// Consultant: senior contributor — can assign tasks and shape milestones/issues, and
// REQUEST a project (approval-gated), but cannot approve projects.
const CONSULTANT_CODES = [
  ...VIEW_BASICS,
  code('project', 'create'),
  code('task', 'create'), code('task', 'update'), code('task', 'assign'),
  code('milestone', 'create'), code('milestone', 'update'),
  code('tasklist', 'create'), code('tasklist', 'update'),
  code('timesheet', 'create'), code('timesheet', 'update'),
  code('issue', 'create'), code('issue', 'update'),
  code('comment', 'create'),
  code('document', 'create'),
  code('calendar', 'create'),
  code('channel', 'create'),
  code('report', 'export'),
  code('analytics', 'view.own'),
  code('performance', 'view.own'),
  code('leave', 'request'),
];

// HR: people operations — attendance, leave, holidays, user & department
// management and org-wide performance visibility. Deliberately does NOT include
// the delivery surfaces (projects/tasks/milestones/issues), so HR's dashboard and
// nav are people-ops focused rather than delivery. Keeps the common surfaces
// (calendar, channels, reports) + its own attendance/leave.
const HR_CODES = [
  code('dashboard', 'view'),
  code('comment', 'view'), code('comment', 'create'),
  code('document', 'view'), code('document', 'create'),
  code('calendar', 'view'), code('channel', 'view'),
  code('report', 'view'), code('report', 'export'),
  code('analytics', 'view.own'),
  code('performance', 'view.own'), code('performance', 'view.organization'),
  code('attendance', 'view.own'), code('attendance', 'view.organization'),
  code('attendance', 'manage'), code('attendance', 'regularize'),
  code('leave', 'view.own'), code('leave', 'view.organization'),
  code('leave', 'request'), code('leave', 'approve'),
  code('expense', 'view.own'), code('expense', 'submit'),
  code('expense', 'view.organization'), code('expense', 'approve'),
  code('holiday', 'view'), code('holiday', 'manage'),
  code('department', 'view'), code('department', 'create'), code('department', 'update'),
  code('user', 'view'), code('user', 'create'), code('user', 'update'), code('user', 'manage_access'),
  // People-ops: HR is one of the three roles trusted with personal details.
  code('profile', 'view'), code('profile', 'view.personal'), code('profile', 'update.any'),
  // People-ops owns onboarding/offboarding and issues HR letters.
  code('lifecycle', 'view'), code('lifecycle', 'manage'),
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
