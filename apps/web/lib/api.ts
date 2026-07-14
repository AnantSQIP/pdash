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

// ─── Step-up passcode interceptor ──────────────────────────────────────────────
// "Big change" routes (org/people/RBAC mutations) require the org passcode as a
// second factor. When one 403s with a PASSCODE_* code, the registered handler is
// invoked (a modal, wired up by PasscodeProvider) to collect the passcode; the
// request is then retried with the x-org-passcode header. Kept out of React so the
// api client stays framework-agnostic — the provider registers a callback here.
export type PasscodePrompt = { code: string; message: string; remaining?: number; lockedUntil?: string };
export type PasscodeHandler = (info: PasscodePrompt) => Promise<string | null>;
const PASSCODE_CODES = new Set(['PASSCODE_REQUIRED', 'PASSCODE_INVALID', 'PASSCODE_LOCKED']);
let passcodeHandler: PasscodeHandler | null = null;
export function setPasscodeHandler(fn: PasscodeHandler | null) { passcodeHandler = fn; }

async function req<T>(
  path: string,
  init?: RequestInit,
  opts: { retriedRefresh?: boolean; passcodeAttempt?: number } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    // Spread init FIRST, then set headers, so a caller/retry-supplied header (e.g.
    // x-org-passcode) merges with Content-Type instead of being clobbered by ...init.
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  // Access token expired → attempt ONE shared silent refresh, then retry the request once.
  if (res.status === 401 && !opts.retriedRefresh && !NO_REFRESH.has(path)) {
    const ok = await refreshOnce();
    if (ok) return req<T>(path, init, { ...opts, retriedRefresh: true });
  }

  // Step-up passcode required → prompt, then retry with the passcode header. Bounded
  // attempts so an unbreakable wrong/locked passcode can't loop forever.
  if (res.status === 403 && passcodeHandler && (opts.passcodeAttempt ?? 0) < 5) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code && PASSCODE_CODES.has(body.code)) {
      const passcode = await passcodeHandler({ code: body.code, message: body.message, remaining: body.remaining, lockedUntil: body.lockedUntil });
      if (passcode) {
        const headers = { ...(init?.headers as Record<string, string> | undefined), 'x-org-passcode': passcode };
        return req<T>(path, { ...init, headers }, { ...opts, passcodeAttempt: (opts.passcodeAttempt ?? 0) + 1 });
      }
    }
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

// Multipart upload variant of req(): no Content-Type header (the browser sets the
// multipart boundary itself) but the same cookie + single-shared-refresh handling.
async function uploadReq<T>(path: string, form: FormData, retried = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: form });
  if (res.status === 401 && !retried) {
    const ok = await refreshOnce();
    if (ok) return uploadReq<T>(path, form, true);
  }
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message ?? message; } catch { /* swallow */ }
    throw new Error(message);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgSummary = { id: string; name: string; code: string; status: string; timezone?: string; brandColor?: string };

export type UserSummary = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string; status: string; profilePhoto?: string;
};

export type AuthUser = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string | null; status: string; organizationId: string; mustResetPassword: boolean;
  /** False until they have filled in their joining details — AppShell blocks on this. */
  profileCompleted: boolean;
};

export type WorkflowStatus = {
  // L23: sequence/type are not always sent (e.g. the project-list currentStatus
  // projection omits them), so they are optional to match reality.
  id: string; name: string; colorHex: string; sequence?: number; type?: string;
};

// The assignee projection the API actually returns (see tasks.service taskInclude):
// a join-row userId plus a lightweight user (NOT a full UserSummary — no email/status).
export type AssigneeRef = {
  userId: string;
  user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'profilePhoto'>;
};

export type Subtask = {
  id: string; taskId: string; title: string; status: string; priority: string;
  dueDate?: string; deletedAt?: string;
  assignees?: AssigneeRef[];
};

export type ApiTask = {
  id: string; title: string; description?: string; priority: string;
  // `null` = no date set (what the server actually returns), and on an update `null` CLEARS
  // the date, while omitting the field leaves it alone. `undefined` on clientDueDate means
  // something different again: the server redacted it because this actor may not see it.
  startDate?: string | null;
  /** INTERNAL deadline — visible to everyone; drives "overdue". */
  dueDate?: string | null;
  /** CLIENT deadline — only present when the actor may see it (redacted server-side). */
  clientDueDate?: string | null;
  estimatedHours?: number | null; actualHours?: number;
  completionPercentage: number; workflowId?: string; currentWorkflowStatusId?: string;
  createdBy: string; createdAt: string; updatedAt: string;
  currentStatus?: WorkflowStatus;
  assignees?: AssigneeRef[];
  subtasks?: Subtask[];
  projectTasks?: { projectId: string; taskListId?: string; milestoneId?: string; sequence: number; project?: { id: string; title: string } }[];
  _count?: { subtasks: number; checklists?: number };
};

export type Milestone = {
  id: string; name: string; description?: string; ownerId?: string;
  completionPercentage: number; startDate?: string; endDate?: string; sequence: number;
};

export type ApiProject = {
  id: string; title: string; description?: string; projectPhase: string;
  // See ApiTask: `null` = unset (and clears on update); an ABSENT clientDueDate means the
  // server redacted it from this actor.
  priority: string; startDate?: string | null;
  /** INTERNAL deadline — visible to everyone. */
  dueDate?: string | null;
  /** CLIENT deadline — only present when the actor may see it (redacted server-side). */
  clientDueDate?: string | null;
  completionPercentage: number; workflowId?: string; currentWorkflowStatusId?: string;
  createdAt?: string; updatedAt?: string; // omitted by the list projection
  currentStatus?: WorkflowStatus;
  members?: { userId: string; projectRole?: string; isActive: boolean; user: UserSummary }[];
  taskLists?: { id: string; name: string; isDefault: boolean; sequence: number }[];
  milestones?: Milestone[];
  _count?: { members: number; projectTasks: number };
};

// ─── Files & attachments ─────────────────────────────────────────────────────
export type DocumentRef = {
  id: string; name: string; mimeType?: string | null; fileSize?: number | null;
  fileUrl: string; uploadedBy?: string; createdAt?: string;
};
export type AttachmentRef = { document: DocumentRef };
export type ProjectDocumentItem = {
  id: string; name: string; mimeType?: string | null; fileSize?: number | null;
  fileUrl: string; uploadedBy: string; createdAt: string;
  source: 'direct' | 'task' | 'discussion';
  task?: { id: string; title: string } | null;
  uploader?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'profilePhoto'> | null;
};

export type ApiComment = {
  id: string; entityType: string; entityId: string;
  userId: string; content: string; createdAt: string;
  user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName'>;
  attachments?: AttachmentRef[];
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
  attachments?: AttachmentRef[];
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
export type DepartmentSummary = {
  id: string; name: string; description?: string; status?: string; memberCount?: number;
  members?: (UserSummary & { roleInDepartment?: string })[];
  head?: UserSummary | null;
};

// ─── Team capacity / availability ────────────────────────────────────────────
export type DayState = 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'FREE' | 'LIGHT' | 'BUSY' | 'OVERLOADED';
export type CapacityDay = {
  date: string; state: DayState; load: number; capacity: number;
  utilization: number; free: number; note?: string;
};
export type CapacityOpenTask = {
  id: string; title: string; projectId?: string; project?: string;
  dueDate?: string | null; priority: string; completionPercentage: number;
  remainingHours: number; overdue: boolean;
};
export type CapacityRow = {
  userId: string; name: string; designation?: string; department?: string; profilePhoto?: string | null;
  days: CapacityDay[];
  openTasks: CapacityOpenTask[];
  freeHours: number; committedHours: number; capacityHours: number; utilization: number;
  nextFreeDate: string | null; freeRunDays: number; availableNow: boolean; overdueCount: number;
};
export type TeamCapacity = { from: string; to: string; capacityPerDay: number; rows: CapacityRow[] };

// ─── Project approval queue ──────────────────────────────────────────────────
export type PendingApproval = {
  id: string; title: string; priority: string; dueDate?: string | null; requestedAt: string;
  requester?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'profilePhoto'> | null;
};

/**
 * A person's profile. The DIRECTORY half always arrives; the PERSONAL half is present only
 * when the viewer may see it (Admin, Super Admin, HR — or you, looking at yourself). The
 * server does not blank these fields, it OMITS THE KEYS, so `undefined` genuinely means
 * "not permitted", and `null` means "permitted, but not filled in yet".
 */
export type UserProfile = {
  // directory
  id: string; firstName: string; lastName: string; email: string;
  phone?: string | null; designation?: string | null; employeeCode?: string | null;
  joiningDate?: string | null; profilePhoto?: string | null; status: string;
  department?: { id: string; name: string } | null;
  profileCompleted: boolean;
  canSeePersonal: boolean;
  canEdit: boolean;
  // personal — ABSENT unless permitted
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  personalEmail?: string | null;
  alternatePhone?: string | null;
  currentLine1?: string | null; currentLine2?: string | null; currentCity?: string | null;
  currentState?: string | null; currentPostalCode?: string | null; currentCountry?: string | null;
  permanentSameAsCurrent?: boolean;
  permanentLine1?: string | null; permanentLine2?: string | null; permanentCity?: string | null;
  permanentState?: string | null; permanentPostalCode?: string | null; permanentCountry?: string | null;
  emergencyName?: string | null; emergencyRelationship?: string | null; emergencyPhone?: string | null;
};

export type ProfileInput = Partial<Omit<UserProfile,
  'id' | 'firstName' | 'lastName' | 'email' | 'designation' | 'employeeCode' | 'joiningDate' |
  'profilePhoto' | 'status' | 'department' | 'profileCompleted' | 'canSeePersonal' | 'canEdit'>>;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;
export const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'] as const;

/** Someone who is locked out and has asked an admin to reset them. */
export type PendingPasswordReset = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string | null; profilePhoto?: string | null;
  passwordResetRequestedAt: string;
};

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
    /** "I can't sign in" — notifies the admins who can reset the account. Always succeeds. */
    requestPasswordReset: (email: string) =>
      req<{ ok: boolean; message: string }>('/auth/password/reset-request', { method: 'POST', body: JSON.stringify({ email }) }),
    // Org step-up "big change" passcode.
    passcodeStatus: () => req<{ configured: boolean }>('/auth/passcode/status'),
    changePasscode: (currentPasscode: string, newPasscode: string) =>
      req<{ ok: boolean }>('/auth/passcode', { method: 'POST', body: JSON.stringify({ currentPasscode, newPasscode }) }),
  },

  orgs: {
    list: () => req<OrgSummary[]>('/organizations'),
    update: (id: string, data: { name?: string; timezone?: string; brandColor?: string }) =>
      req<OrgSummary>(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  users: {
    list: (orgId: string, includeInactive?: boolean) =>
      req<UserSummary[]>(`/users?organizationId=${encodeURIComponent(orgId)}${includeInactive ? '&includeInactive=true' : ''}`),
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
    resetPassword: (id: string) =>
      req<{ email: string; tempPassword: string }>(`/users/${id}/reset-password`, { method: 'POST' }),
    /** People who asked for a reset from the login page and are waiting on an admin. */
    pendingPasswordResets: () =>
      req<PendingPasswordReset[]>('/users/password-reset-requests'),
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
    create: (data: {
      title: string; description?: string; priority?: string; startDate?: string;
      dueDate?: string; clientDueDate?: string; managerId?: string; createdBy: string;
    }) => req<ApiProject>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<ApiProject, 'title' | 'description' | 'priority' | 'projectPhase' | 'startDate' | 'dueDate' | 'clientDueDate' | 'completionPercentage'>>) =>
      req<ApiProject>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    /** Project requests routed to me as their manager (or, for admins, any pending). Org is
     *  taken from the session server-side. */
    pendingApprovals: () =>
      req<PendingApproval[]>('/projects/pending-approvals'),
    /** People who can be nominated as a project's manager (they can approve it). Session-scoped. */
    eligibleManagers: () =>
      req<Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'designation' | 'profilePhoto'>[]>(
        '/projects/eligible-managers'),
    delete: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
    // The approver is the verified cookie actor server-side; only an optional reason is sent.
    approve: (id: string, reason?: string) =>
      req<void>(`/projects/${id}/approve`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
    reject: (id: string, reason?: string) =>
      req<void>(`/projects/${id}/reject`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
    addMember: (id: string, userId: string, projectRole?: string) =>
      req<ApiProject>(`/projects/${id}/members`, { method: 'POST', body: JSON.stringify({ userId, projectRole }) }),
    removeMember: (id: string, userId: string) =>
      req<ApiProject>(`/projects/${id}/members/${userId}`, { method: 'DELETE' }),
  },

  taskLists: {
    list: (projectId: string) => req<any[]>(`/projects/${projectId}/tasklists`),
    create: (projectId: string, data: { name: string }) =>
      req<any>(`/projects/${projectId}/tasklists`, { method: 'POST', body: JSON.stringify(data) }),
    remove: (projectId: string, id: string) =>
      req<void>(`/projects/${projectId}/tasklists/${id}`, { method: 'DELETE' }),
  },

  milestones: {
    list: (projectId: string) => req<Milestone[]>(`/projects/${projectId}/milestones`),
    create: (projectId: string, data: { name: string; description?: string; startDate?: string; endDate?: string }) =>
      req<Milestone>(`/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(data) }),
    update: (projectId: string, id: string, data: Partial<Pick<Milestone, 'name' | 'description' | 'startDate' | 'endDate'>>) =>
      req<Milestone>(`/projects/${projectId}/milestones/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (projectId: string, id: string) =>
      req<void>(`/projects/${projectId}/milestones/${id}`, { method: 'DELETE' }),
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
      description?: string; priority?: string; startDate?: string; dueDate?: string; clientDueDate?: string;
      estimatedHours?: number; assigneeIds?: string[];
      milestoneId?: string; currentWorkflowStatusId?: string;
    }) => req<ApiTask>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<ApiTask, 'title' | 'description' | 'priority' | 'completionPercentage' | 'startDate' | 'dueDate' | 'clientDueDate' | 'estimatedHours'>>) =>
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
    reopenSubtask: (taskId: string, subtaskId: string) =>
      req<Subtask>(`/tasks/${taskId}/subtasks/${subtaskId}/reopen`, { method: 'POST' }),
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
    create: (data: { entityType: string; entityId: string; userId: string; content: string; documentIds?: string[] }) =>
      req<ApiComment>('/comments', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/comments/${id}`, { method: 'DELETE' }),
  },

  documents: {
    // Multipart upload. Composer attachments pass no context (linked on send);
    // the project Files tab passes projectId so the file is linked immediately.
    upload: (file: File, opts?: { projectId?: string; taskId?: string }) => {
      const form = new FormData();
      form.append('file', file, file.name);
      if (opts?.projectId) form.append('projectId', opts.projectId);
      if (opts?.taskId) form.append('taskId', opts.taskId);
      return uploadReq<DocumentRef>('/documents', form);
    },
    listForProject: (projectId: string) => req<ProjectDocumentItem[]>(`/projects/${projectId}/documents`),
    delete: (id: string) => req<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),
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
    sendMessage: (channelId: string, data: { content: string; documentIds?: string[] }) =>
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

  profile: {
    /** Your own profile — always fully visible to you. */
    me: () => req<UserProfile>('/profile/me'),
    /** Fill in / update your own details. This clears the first-sign-in gate. */
    updateMe: (data: ProfileInput) =>
      req<UserProfile>('/profile/me', { method: 'PUT', body: JSON.stringify(data) }),
    /** Someone else's profile. Personal fields are ABSENT unless you may see them. */
    get: (userId: string) => req<UserProfile>(`/profile/${userId}`),
    /** Correct someone's details — HR/Admin only (profile.update.any). */
    update: (userId: string, data: ProfileInput) =>
      req<UserProfile>(`/profile/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  capacity: {
    /** Who is busy, who is free, and when — across every project. Org from the session. */
    team: (days = 14) =>
      req<TeamCapacity>(`/capacity/team?days=${days}`),
    /** Availability of one project's members — the capacity view opened from a project. */
    forProject: (projectId: string, days = 14) =>
      req<TeamCapacity & { project: { id: string; title: string } }>(
        `/capacity/project/${projectId}?days=${days}`),
  },

  overdue: {
    /** Force an overdue sweep now (the hourly one still runs). */
    sweep: () => req<{ alerted: number; digests: number }>('/overdue/sweep', { method: 'POST' }),
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
