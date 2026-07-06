// Typed API client for the pdash NestJS backend.
// Requests go to the same origin under /api/v1 (Next.js rewrites proxy them to the
// API) so the httpOnly auth cookies are first-party. Identity is carried by the
// cookie — no x-actor-id header. Override the base with NEXT_PUBLIC_API_URL.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

// Endpoints that must NOT trigger the silent-refresh retry (would recurse / are the
// auth primitives themselves). /auth/me IS allowed to refresh so a session survives
// past the 15-minute access-token lifetime.
const NO_REFRESH = new Set(['/auth/refresh', '/auth/login', '/auth/logout']);

// SINGLE-FLIGHT refresh: when the access token expires, a page can fire many requests
// at once and they all 401 together. Without coordination they would each POST
// /auth/refresh with the same rotating refresh-token cookie — the first rotates it and
// the rest present a now-revoked token, tripping the backend's reuse-detection and
// nuking the whole session. So all concurrent 401s share ONE refresh promise.
let refreshInFlight: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(r => r.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function req<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  // Access token expired → attempt ONE shared silent refresh, then retry the request once.
  if (res.status === 401 && !retried && !NO_REFRESH.has(path)) {
    const ok = await refreshOnce();
    if (ok) return req<T>(path, init, true);
  }

  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message ?? message; } catch { /* swallow */ }
    throw new Error(message);
  }

  // A 204 or empty-body 200 (e.g. attendance "not clocked in" → null) must not be
  // fed to JSON.parse — return null (NOT undefined, which React Query rejects as
  // "Query data cannot be undefined") instead of throwing a SyntaxError.
  if (res.status === 204) return null as unknown as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgSummary = { id: string; name: string; code: string; status: string };

export type UserSummary = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string; status: string; profilePhoto?: string;
};

export type AuthUser = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string | null; status: string; organizationId: string; mustResetPassword: boolean;
};

export type WorkflowStatus = {
  id: string; name: string; colorHex: string; sequence: number; type: string;
};

export type Subtask = {
  id: string; taskId: string; title: string; status: string; priority: string;
  dueDate?: string; deletedAt?: string;
  assignees?: { userId: string; user: UserSummary }[];
};

export type ApiTask = {
  id: string; title: string; description?: string; priority: string;
  startDate?: string; dueDate?: string; estimatedHours?: number; actualHours?: number;
  completionPercentage: number; workflowId?: string; currentWorkflowStatusId?: string;
  createdBy: string; createdAt: string; updatedAt: string;
  currentStatus?: WorkflowStatus;
  assignees?: { userId: string; user: UserSummary }[];
  subtasks?: Subtask[];
  projectTasks?: { projectId: string; taskListId?: string; milestoneId?: string; sequence: number }[];
  _count?: { subtasks: number };
};

export type ApiProject = {
  id: string; title: string; description?: string; projectPhase: string;
  priority: string; startDate?: string; dueDate?: string;
  completionPercentage: number; workflowId?: string; currentWorkflowStatusId?: string;
  createdAt?: string; updatedAt?: string; // omitted by the list projection
  currentStatus?: WorkflowStatus;
  members?: { userId: string; projectRole?: string; isActive: boolean; user: UserSummary }[];
  taskLists?: { id: string; name: string; isDefault: boolean; sequence: number }[];
  _count?: { members: number; projectTasks: number };
};

export type ApiComment = {
  id: string; entityType: string; entityId: string;
  userId: string; content: string; createdAt: string;
  user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName'>;
};

export type Timesheet = {
  id: string; userId: string; taskId: string; date: string;
  hoursLogged: number; billable: boolean; notes?: string;
  user: { id: string; firstName: string; lastName: string };
  task: { id: string; title: string };
};

export type CalendarEvent = {
  id: string; organizationId: string; title: string; description?: string;
  type: string; startDate: string; endDate?: string; allDay: boolean;
  color: string; createdBy: string; projectId?: string; createdAt: string;
  attendees?: { userId: string; user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'> }[];
};

export type Channel = {
  id: string; organizationId: string; name: string; description?: string;
  type: string; createdBy: string; createdAt: string;
  _count?: { messages: number; members: number };
  messages?: Message[];
  members?: { userId: string; user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'> }[];
};
export type ChannelMembers = {
  ownerId: string;
  members: { userId: string; user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'> }[];
};

export type Message = {
  id: string; channelId: string; userId: string; content: string; createdAt: string;
  user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;
};

export type Issue = {
  id: string; projectId: string; title: string; description?: string;
  severity: string; status: string; reportedBy: string; assigneeId?: string;
  dueDate?: string; createdAt: string; updatedAt: string;
  reporter?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'>;
  assignee?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'> | null;
};

export type ActivityItem = {
  id: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
  actor?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'> | null;
};

export type DashboardStats = {
  totalProjects: number; activeProjects: number; avgCompletion: number;
  totalTasks: number; overdueCount: number; tasksDueToday: number;
  hoursLoggedThisWeek: number;
};

export type NotificationItem = {
  id: string; userId: string; title: string; message: string;
  type: string; isRead: boolean; createdAt: string;
};

// ─── RBAC types ─────────────────────────────────────────────────────────────
export type EffectivePermissions = {
  userId: string; isSuperAdmin: boolean; roles: string[]; codes: string[];
  deny?: string[]; sources: Record<string, string>;
};
export type PermissionDef = { id: string; code: string; name: string; description?: string };
export type RoleSummary = {
  id: string; name: string; description?: string;
  memberCount: number; permissionIds: string[]; permissionCodes: string[];
};
export type GroupSummary = {
  id: string; name: string; description?: string; isSystemGroup: boolean;
  memberCount: number; memberIds: string[]; permissionIds: string[];
};
export type AuditLogItem = {
  id: string; userId: string; organizationId?: string | null; entityType: string; entityId: string;
  action: string; oldValue?: any; newValue?: any; metadata?: any; ipAddress?: string | null; timestamp: string;
  user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'> | null;
};

// ─── Performance types ───────────────────────────────────────────────────────
export type PerformanceKpis = {
  tasksAssigned: number; tasksCompleted: number; tasksOpen: number; tasksOverdue: number;
  onTimeCompletionRate: number; completionRate: number;
  hoursLogged: number; billableHours: number; billablePct: number;
  issuesReported: number; issuesResolved: number;
  commentsPosted: number; activityVolume: number;
};
export type PerformanceTrendPoint = { date: string; completed: number; hours: number; activity: number };
export type PerformancePrevious = {
  hoursLogged: number; billableHours: number; tasksCompleted: number;
  activityVolume: number; issuesResolved: number; commentsPosted: number; onTimeCompletionRate: number;
};
export type UserPerformance = {
  userId: string; name: string; designation?: string;
  periodDays: number;
  kpis: PerformanceKpis;
  previous: PerformancePrevious;
  cycleTimeDays: number | null;
  periodTasksCompleted: number;
  trend: PerformanceTrendPoint[];
};
export type HeatmapDay = { date: string; value: number; level: number };
export type LeaderboardRow = {
  userId: string; name: string; designation?: string; department?: string;
  tasksCompleted: number; hoursLogged: number; onTimeRate: number; activityVolume: number; score: number;
};
export type OrgPerformance = {
  periodDays: number;
  totals: { users: number; tasksCompleted: number; hoursLogged: number; activeProjects: number; avgOnTimeRate: number };
  previousTotals: { tasksCompleted: number; hoursLogged: number };
  leaderboard: LeaderboardRow[];
};

export type NameValue = { name: string; value: number; color?: string };
export type UserBreakdowns = {
  userId: string;
  tasksByStatus: NameValue[];
  tasksByPriority: NameValue[];
  issuesBySeverity: NameValue[];
  hoursByProject: { projectId: string; name: string; hours: number; billable: number }[];
  estimatedVsActual: { taskId: string; name: string; target: number; actual: number }[];
};
export type OrgBreakdowns = {
  hoursByDesignation: NameValue[];
  hoursByDepartment: NameValue[];
  tasksByStatus: NameValue[];
  issuesBySeverity: NameValue[];
  projectProgress: { projectId: string; name: string; completionPercentage: number; phase: string }[];
  capacityVsLogged: { name: string; actual: number; target: number }[];
};
export type OrgTrendPoint = { date: string; hours: number; billableHours: number; completed: number; activity: number };
export type OrgTrend = {
  totals: OrgTrendPoint[];
  byDepartment: Record<string, number | string>[];
  departments: string[];
};
export type DepartmentSummary = { id: string; name: string; description?: string; memberCount?: number };

// ─── Attendance & Leave types ────────────────────────────────────────────────
export type Attendance = {
  id: string; userId: string; organizationId?: string; date: string;
  checkIn?: string | null; checkOut?: string | null; totalHours?: number | null;
  status: string; note?: string | null; isRegularized: boolean;
};
export type AttendanceDay = {
  date: string; status: string; checkIn?: string | null; checkOut?: string | null;
  totalHours?: number | null; isRegularized: boolean; note?: string | null;
};
export type AttendanceMonth = {
  userId: string; year: number; month: number;
  days: AttendanceDay[];
  summary: { present: number; absent: number; onLeave: number; holiday: number; weekend: number; workingDays: number; attendanceRate: number; hoursLogged: number };
};
export type OrgAttendanceSummary = {
  from: string; to: string;
  rows: { userId: string; name: string; designation?: string; present: number; absent: number; onLeave: number; holiday: number; hoursLogged: number; attendanceRate: number }[];
};
export type LeaveRequestItem = {
  id: string; userId: string; organizationId?: string; leaveType: string;
  startDate: string; endDate: string; numDays: number; reason?: string | null;
  status: string; reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null;
  createdAt: string; user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'>;
};
export type LeaveType = { id: string; organizationId: string; name: string; code: string; annualQuota: number; colorHex: string };
export type LeaveBalance = { code: string; name: string; quota: number; used: number; remaining: number; colorHex: string };
export type Holiday = { id: string; organizationId: string; name: string; date: string; type: string; recurring: boolean };

// ─── API Methods ──────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      req<{ user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    me: () => req<AuthUser>('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      req<{ ok: boolean }>('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  },

  orgs: {
    list: () => req<OrgSummary[]>('/organizations'),
    update: (id: string, data: { name?: string }) =>
      req<OrgSummary>(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  users: {
    list: (orgId: string) => req<UserSummary[]>(`/users?organizationId=${encodeURIComponent(orgId)}`),
    create: (data: { organizationId: string; firstName: string; lastName?: string; email: string; designation?: string; phone?: string; password?: string; roleIds?: string[] }) =>
      req<UserSummary & { tempPassword: string }>('/users', { method: 'POST', body: JSON.stringify(data) }),
    setRoles: (id: string, roleIds: string[]) =>
      req<{ ok: boolean }>(`/users/${id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds }) }),
    setPermissions: (id: string, permissionIds: string[]) =>
      req<{ ok: boolean }>(`/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionIds }) }),
    setOverrides: (id: string, overrides: { permissionId: string; effect: string }[]) =>
      req<{ ok: boolean }>(`/users/${id}/overrides`, { method: 'PUT', body: JSON.stringify({ overrides }) }),
    effectivePermissions: (id: string) => req<EffectivePermissions>(`/users/${id}/effective-permissions`),
    overrides: (id: string) => req<{ permissionId: string; effect: string }[]>(`/users/${id}/overrides`),
    setMyPhoto: (profilePhoto: string | null) =>
      req<{ ok: boolean }>('/users/me/photo', { method: 'PUT', body: JSON.stringify({ profilePhoto: profilePhoto ?? '' }) }),
    get: (id: string) => req<UserSummary>(`/users/${id}`),
    update: (id: string, data: Partial<Pick<UserSummary, 'firstName' | 'lastName' | 'designation' | 'status'>>) =>
      req<UserSummary>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  projects: {
    list: (orgId: string, phase?: string) => {
      const params = new URLSearchParams({ organizationId: orgId });
      if (phase && phase !== 'ALL') params.set('phase', phase);
      return req<ApiProject[]>(`/projects?${params}`);
    },
    get: (id: string) => req<ApiProject>(`/projects/${id}`),
    create: (data: { title: string; description?: string; priority?: string; dueDate?: string; createdBy: string }) =>
      req<ApiProject>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<ApiProject, 'title' | 'description' | 'priority' | 'projectPhase' | 'startDate' | 'dueDate' | 'completionPercentage'>>) =>
      req<ApiProject>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
    // The approver is the verified cookie actor server-side; only an optional reason is sent.
    approve: (id: string, reason?: string) =>
      req<void>(`/projects/${id}/approve`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
    reject: (id: string, reason?: string) =>
      req<void>(`/projects/${id}/reject`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
  },

  taskLists: {
    list: (projectId: string) => req<any[]>(`/projects/${projectId}/tasklists`),
  },

  tasks: {
    list: (projectId: string, opts?: { taskListId?: string; milestoneId?: string }) => {
      const params = new URLSearchParams({ projectId });
      if (opts?.taskListId) params.set('taskListId', opts.taskListId);
      if (opts?.milestoneId) params.set('milestoneId', opts.milestoneId);
      return req<ApiTask[]>(`/tasks?${params}`);
    },
    listForUser: (userId: string) => req<ApiTask[]>(`/tasks?userId=${encodeURIComponent(userId)}`),
    get: (id: string) => req<ApiTask>(`/tasks/${id}`),
    create: (data: {
      title: string; projectId: string; taskListId: string; createdBy: string;
      description?: string; priority?: string; dueDate?: string;
      estimatedHours?: number; assigneeIds?: string[];
      milestoneId?: string; currentWorkflowStatusId?: string;
    }) => req<ApiTask>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<ApiTask, 'title' | 'description' | 'priority' | 'completionPercentage' | 'startDate' | 'dueDate' | 'estimatedHours'>>) =>
      req<ApiTask>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    setStatus: (id: string, statusId: string) =>
      req<ApiTask>(`/tasks/${id}/status`, { method: 'PUT', body: JSON.stringify({ statusId }) }),
    setAssignees: (id: string, assigneeIds: string[]) =>
      req<ApiTask>(`/tasks/${id}/assignees`, { method: 'PUT', body: JSON.stringify({ assigneeIds }) }),
    delete: (id: string) => req<void>(`/tasks/${id}`, { method: 'DELETE' }),
    createSubtask: (taskId: string, data: { title: string; priority?: string; dueDate?: string; assigneeIds?: string[] }) =>
      req<Subtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify(data) }),
    listSubtasks: (taskId: string) => req<Subtask[]>(`/tasks/${taskId}/subtasks`),
    closeSubtask: (taskId: string, subtaskId: string) =>
      req<Subtask>(`/tasks/${taskId}/subtasks/${subtaskId}/close`, { method: 'POST' }),
    deleteSubtask: (taskId: string, subtaskId: string) =>
      req<void>(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' }),
  },

  workflows: {
    statuses: (workflowId: string) => req<WorkflowStatus[]>(`/workflows/${workflowId}/statuses`),
    defaultOpenStatus: (workflowId: string) => req<WorkflowStatus>(`/workflows/${workflowId}/statuses/default-open`),
  },

  comments: {
    list: (entityType: string, entityId: string) =>
      req<ApiComment[]>(`/comments?entityType=${entityType}&entityId=${entityId}`),
    create: (data: { entityType: string; entityId: string; userId: string; content: string }) =>
      req<ApiComment>('/comments', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/comments/${id}`, { method: 'DELETE' }),
  },

  timesheets: {
    forProject: (projectId: string) => req<Timesheet[]>(`/timesheets?projectId=${projectId}`),
    forUser: (userId: string) => req<Timesheet[]>(`/timesheets?userId=${userId}`),
    create: (data: { userId: string; taskId: string; date: string; hoursLogged: number; billable?: boolean; notes?: string }) =>
      req<Timesheet>('/timesheets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { hoursLogged?: number; billable?: boolean; notes?: string }) =>
      req<Timesheet>(`/timesheets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/timesheets/${id}`, { method: 'DELETE' }),
  },

  events: {
    list: (orgId: string, from?: string, to?: string) => {
      const params = new URLSearchParams({ organizationId: orgId });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return req<CalendarEvent[]>(`/calendar-events?${params}`);
    },
    get: (id: string) => req<CalendarEvent>(`/calendar-events/${id}`),
    create: (data: {
      organizationId: string; title: string; description?: string; type?: string;
      startDate: string; endDate?: string; allDay?: boolean; color?: string;
      createdBy: string; projectId?: string; attendeeIds?: string[];
    }) => req<CalendarEvent>('/calendar-events', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<CalendarEvent, 'title' | 'description' | 'type' | 'startDate' | 'endDate' | 'allDay' | 'color'>>) =>
      req<CalendarEvent>(`/calendar-events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/calendar-events/${id}`, { method: 'DELETE' }),
  },

  channels: {
    list: (orgId: string) => req<Channel[]>(`/channels?organizationId=${encodeURIComponent(orgId)}`),
    get: (id: string) => req<Channel>(`/channels/${id}`),
    create: (data: { organizationId: string; name: string; description?: string; memberIds?: string[] }) =>
      req<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      req<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/channels/${id}`, { method: 'DELETE' }),
    messages: (channelId: string, limit?: number) =>
      req<Message[]>(`/channels/${channelId}/messages${limit ? `?limit=${limit}` : ''}`),
    // Author is the verified cookie actor — no userId sent.
    sendMessage: (channelId: string, data: { content: string }) =>
      req<Message>(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
    deleteMessage: (channelId: string, messageId: string) =>
      req<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
    members: (channelId: string) => req<ChannelMembers>(`/channels/${channelId}/members`),
    addMembers: (channelId: string, userIds: string[]) =>
      req<{ ok: boolean }>(`/channels/${channelId}/members`, { method: 'PUT', body: JSON.stringify({ userIds }) }),
    removeMember: (channelId: string, userId: string) =>
      req<void>(`/channels/${channelId}/members/${userId}`, { method: 'DELETE' }),
  },

  issues: {
    list: (projectId: string, status?: string) => {
      const params = new URLSearchParams({ projectId });
      if (status) params.set('status', status);
      return req<Issue[]>(`/issues?${params}`);
    },
    get: (id: string) => req<Issue>(`/issues/${id}`),
    create: (data: { projectId: string; title: string; description?: string; severity?: string; reportedBy: string; assigneeId?: string; dueDate?: string }) =>
      req<Issue>('/issues', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<Issue, 'title' | 'description' | 'severity' | 'status' | 'assigneeId' | 'dueDate'>>) =>
      req<Issue>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/issues/${id}`, { method: 'DELETE' }),
  },

  analytics: {
    dashboard: (orgId: string) => req<DashboardStats>(`/analytics/dashboard?organizationId=${encodeURIComponent(orgId)}`),
    projects: (orgId: string) => req<ApiProject[]>(`/analytics/projects?organizationId=${encodeURIComponent(orgId)}`),
    timesheets: (orgId: string, from?: string, to?: string) => {
      const params = new URLSearchParams({ organizationId: orgId });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return req<{ totalHours: number; billableHours: number; byUser: any[]; entries: Timesheet[] }>(`/analytics/timesheets?${params}`);
    },
  },

  activity: {
    list: (params: { projectId?: string; entityType?: string; entityId?: string; organizationId?: string; limit?: number }) => {
      const p = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v != null) p.set(k, String(v)); });
      return req<ActivityItem[]>(`/activity?${p.toString()}`);
    },
  },

  me: {
    effectivePermissions: () => req<EffectivePermissions>('/me/effective-permissions'),
  },

  notifications: {
    list: (limit = 30) => req<NotificationItem[]>(`/notifications?limit=${limit}`),
    unreadCount: () => req<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) => req<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => req<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),
  },

  permissions: {
    list: () => req<PermissionDef[]>('/permissions'),
    create: (data: { code: string; name: string; description?: string }) =>
      req<PermissionDef>('/permissions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      req<PermissionDef>(`/permissions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/permissions/${id}`, { method: 'DELETE' }),
  },

  roles: {
    list: (orgId: string) => req<RoleSummary[]>(`/roles?organizationId=${encodeURIComponent(orgId)}`),
    create: (data: { organizationId: string; name: string; description?: string; permissionIds?: string[] }) =>
      req<{ id: string }>('/roles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      req<{ id: string }>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/roles/${id}`, { method: 'DELETE' }),
    setPermissions: (id: string, permissionIds: string[]) =>
      req<{ ok: boolean }>(`/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionIds }) }),
  },

  groups: {
    list: (orgId: string) => req<GroupSummary[]>(`/permission-groups?organizationId=${encodeURIComponent(orgId)}`),
    create: (data: { organizationId: string; name: string; description?: string }) =>
      req<{ id: string }>('/permission-groups', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      req<{ id: string }>(`/permission-groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/permission-groups/${id}`, { method: 'DELETE' }),
    setPermissions: (id: string, permissionIds: string[]) =>
      req<{ ok: boolean }>(`/permission-groups/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionIds }) }),
    setMembers: (id: string, userIds: string[]) =>
      req<{ ok: boolean }>(`/permission-groups/${id}/members`, { method: 'PUT', body: JSON.stringify({ userIds }) }),
  },

  auditLogs: {
    list: (params: { organizationId?: string; entityType?: string; action?: string; userId?: string; limit?: number; cursor?: string }) => {
      const p = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v != null) p.set(k, String(v)); });
      return req<{ items: AuditLogItem[]; nextCursor: string | null }>(`/audit-logs?${p.toString()}`);
    },
  },

  performance: {
    me: (days = 30) => req<UserPerformance>(`/performance/me?days=${days}`),
    user: (userId: string, days = 30) => req<UserPerformance>(`/performance/users/${userId}?days=${days}`),
    breakdowns: (userId: string, days = 30) => req<UserBreakdowns>(`/performance/users/${userId}/breakdowns?days=${days}`),
    org: (orgId: string, days = 30) => req<OrgPerformance>(`/performance/org?organizationId=${encodeURIComponent(orgId)}&days=${days}`),
    orgBreakdowns: (orgId: string, days = 30) => req<OrgBreakdowns>(`/performance/org/breakdowns?organizationId=${encodeURIComponent(orgId)}&days=${days}`),
    orgTrend: (orgId: string, days = 30) => req<OrgTrend>(`/performance/org/trend?organizationId=${encodeURIComponent(orgId)}&days=${days}`),
    heatmap: (userId: string, days = 365) => req<{ userId: string; days: HeatmapDay[] }>(`/performance/heatmap/${userId}?days=${days}`),
    orgHeatmap: (orgId: string, days = 365) => req<{ organizationId: string; days: HeatmapDay[] }>(`/performance/org-heatmap?organizationId=${encodeURIComponent(orgId)}&days=${days}`),
    rebuild: (orgId: string) => req<{ ok: boolean; days: number }>(`/performance/snapshots/rebuild?organizationId=${encodeURIComponent(orgId)}`, { method: 'POST' }),
  },

  departments: {
    list: (orgId: string) => req<DepartmentSummary[]>(`/departments?organizationId=${encodeURIComponent(orgId)}`),
  },

  attendance: {
    today: () => req<Attendance | null>('/attendance/me/today'),
    myMonth: (year: number, month: number) => req<AttendanceMonth>(`/attendance/me/month?year=${year}&month=${month}`),
    userMonth: (userId: string, year: number, month: number) => req<AttendanceMonth>(`/attendance/users/${userId}/month?year=${year}&month=${month}`),
    punch: () => req<Attendance>('/attendance/punch', { method: 'POST' }),
    regularize: (id: string, reason: string, newStatus?: string) =>
      req<Attendance>(`/attendance/${id}/regularize`, { method: 'POST', body: JSON.stringify({ reason, newStatus }) }),
    regularizeDay: (data: { date: string; reason: string; status?: string; checkIn?: string; checkOut?: string }) =>
      req<Attendance>('/attendance/me/regularize', { method: 'POST', body: JSON.stringify(data) }),
    mark: (data: { userId: string; date: string; status: string; note?: string }) =>
      req<Attendance>('/attendance/mark', { method: 'POST', body: JSON.stringify(data) }),
    orgSummary: (orgId: string, from: string, to: string) =>
      req<OrgAttendanceSummary>(`/attendance/org/summary?organizationId=${encodeURIComponent(orgId)}&from=${from}&to=${to}`),
  },

  leave: {
    myRequests: (status?: string) => req<LeaveRequestItem[]>(`/leave/requests/me${status ? `?status=${status}` : ''}`),
    orgRequests: (orgId: string, status?: string) => {
      const p = new URLSearchParams({ organizationId: orgId });
      if (status) p.set('status', status);
      return req<LeaveRequestItem[]>(`/leave/requests/org?${p}`);
    },
    create: (data: { leaveType: string; startDate: string; endDate: string; reason?: string }) =>
      req<LeaveRequestItem>('/leave/requests', { method: 'POST', body: JSON.stringify(data) }),
    approve: (id: string, note?: string) => req<LeaveRequestItem>(`/leave/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    reject: (id: string, note?: string) => req<LeaveRequestItem>(`/leave/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    cancel: (id: string) => req<LeaveRequestItem>(`/leave/requests/${id}/cancel`, { method: 'POST' }),
    balances: () => req<LeaveBalance[]>('/leave/balance/me'),
    types: (orgId: string) => req<LeaveType[]>(`/leave/types?organizationId=${encodeURIComponent(orgId)}`),
    holidays: (orgId: string, year?: number) => req<Holiday[]>(`/leave/holidays?organizationId=${encodeURIComponent(orgId)}${year ? `&year=${year}` : ''}`),
    createHoliday: (data: { organizationId: string; name: string; date: string; type?: string; recurring?: boolean }) =>
      req<Holiday>('/leave/holidays', { method: 'POST', body: JSON.stringify(data) }),
    removeHoliday: (id: string) => req<void>(`/leave/holidays/${id}`, { method: 'DELETE' }),
  },
};
