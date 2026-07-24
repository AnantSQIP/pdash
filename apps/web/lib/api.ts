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
// Remember the passcode for the session (sliding TTL) so a burst of "big change" actions
// doesn't prompt for every single one. Dropped when the server rejects it (changed/expired)
// or on a full page reload. Held only in memory, never persisted.
let cachedPasscode: { value: string; at: number } | null = null;
const PASSCODE_TTL_MS = 15 * 60_000;
export function clearPasscodeCache() { cachedPasscode = null; }

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

  // Step-up passcode required → reuse the cached passcode silently, otherwise prompt, then
  // retry with the x-org-passcode header. Bounded attempts so a wrong/locked passcode can't loop.
  if (res.status === 403 && (opts.passcodeAttempt ?? 0) < 5) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code && PASSCODE_CODES.has(body.code)) {
      // A rejected/locked passcode means the cached one is stale — drop it and re-prompt.
      if (body.code !== 'PASSCODE_REQUIRED') cachedPasscode = null;
      const fresh = cachedPasscode && Date.now() - cachedPasscode.at < PASSCODE_TTL_MS ? cachedPasscode.value : null;
      const passcode = fresh
        ?? (passcodeHandler ? await passcodeHandler({ code: body.code, message: body.message, remaining: body.remaining, lockedUntil: body.lockedUntil }) : null);
      if (passcode) {
        cachedPasscode = { value: passcode, at: Date.now() };
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

// Blob download variant of req(): same cookie/refresh + step-up passcode handling, so a
// passcode-gated file can be fetched with the x-org-passcode header (a plain <a> link can't
// send one). Returns the raw Blob for the caller to open or save.
async function blobReq(
  path: string,
  opts: { retriedRefresh?: boolean; passcodeAttempt?: number } = {},
  headers: Record<string, string> = {},
): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', headers });
  if (res.status === 401 && !opts.retriedRefresh && !NO_REFRESH.has(path)) {
    const ok = await refreshOnce();
    if (ok) return blobReq(path, { ...opts, retriedRefresh: true }, headers);
  }
  if (res.status === 403 && (opts.passcodeAttempt ?? 0) < 5) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code && PASSCODE_CODES.has(body.code)) {
      if (body.code !== 'PASSCODE_REQUIRED') cachedPasscode = null;
      const fresh = cachedPasscode && Date.now() - cachedPasscode.at < PASSCODE_TTL_MS ? cachedPasscode.value : null;
      const passcode = fresh
        ?? (passcodeHandler ? await passcodeHandler({ code: body.code, message: body.message, remaining: body.remaining, lockedUntil: body.lockedUntil }) : null);
      if (passcode) {
        cachedPasscode = { value: passcode, at: Date.now() };
        return blobReq(path, { ...opts, passcodeAttempt: (opts.passcodeAttempt ?? 0) + 1 }, { ...headers, 'x-org-passcode': passcode });
      }
    }
  }
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message ?? message; } catch { /* swallow */ }
    throw new Error(message);
  }
  return res.blob();
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
  /** The task's single deadline; drives "overdue". Tasks have no client deadline. */
  dueDate?: string | null;
  estimatedHours?: number | null; actualHours?: number;
  completionPercentage: number; workflowId?: string; currentWorkflowStatusId?: string;
  createdBy: string; createdAt: string; updatedAt: string;
  currentStatus?: WorkflowStatus;
  /** Who delegated the task — distinct from the assignees who do it. Null when unassigned. */
  assignedById?: string | null;
  assignedBy?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'profilePhoto'> | null;
  assignees?: AssigneeRef[];
  subtasks?: Subtask[];
  projectTasks?: { projectId: string; taskListId?: string; sequence: number; project?: { id: string; title: string } }[];
  _count?: { subtasks: number; checklists?: number };
};

/** A selectable project type + its auto-created task template (from GET /projects/types). */
export type ProjectTypeDef = {
  value: string; label: string; description: string;
  comingSoon?: boolean; taskListName?: string; tasks?: string[];
};

export type PidRequestItem = {
  id: string; projectId: string; projectTitle: string; projectType: string | null;
  requestedBy: string; note: string | null; createdAt: string;
};

export type ApiProject = {
  id: string; title: string; description?: string; projectPhase: string;
  /** The kind of patent-analysis matter (HML, CC_NEW, FTO, …); null for a general project. */
  projectType?: string | null;
  /** The PID, e.g. SQ_26_27_001 (globally unique; also searchable). */
  code?: string | null;
  /** The client/matter this project is for. */
  client?: { id: string; name: string; code: string } | null;
  /** Linked patent handles — confidential real numbers are never included here. */
  patents?: { patent: PatentOption }[];
  // See ApiTask: `null` = unset (and clears on update); an ABSENT clientDueDate means the
  // server redacted it from this actor.
  priority: string; startDate?: string | null;
  /** INTERNAL deadline — visible to everyone. */
  dueDate?: string | null;
  /** CLIENT deadline — only present when the actor may see it (redacted server-side). */
  clientDueDate?: string | null;
  completionPercentage: number; workflowId?: string; currentWorkflowStatusId?: string;
  /** Projects are billable by default; per-time-entry billability is chosen by each logger. */
  billable?: boolean | null;
  /** Set when the project reaches its lifecycle end-states (COMPLETED / CLOSED). */
  completedAt?: string | null; closedAt?: string | null;
  createdAt?: string; updatedAt?: string; // omitted by the list projection
  currentStatus?: WorkflowStatus;
  members?: { userId: string; projectRole?: string; isActive: boolean; user: UserSummary }[];
  taskLists?: { id: string; name: string; isDefault: boolean; sequence: number }[];
  _count?: { members: number; projectTasks: number };
};

// ─── Patent-analysis client codes + confidential coded patents ────────────────
export type ClientSummary = { id: string; name?: string | null; code: string; _count?: { patents: number } };
/** Non-secret patent handle (for the project picker + project detail). */
export type PatentOption = { id: string; handle: string; serial: number; clientId?: string };
/** Portal OVERVIEW — patent IDs + serials, NO real number. */
export type PatentOverview = { id: string; handle: string; serial: number; clientId: string; documentId?: string | null; documentName?: string | null; client?: { id: string; name?: string | null; code: string } };
/** Portal REVEAL — includes the confidential real number (passcode-gated). */
export type PatentFull = PatentOverview & { realNumber: string; createdAt?: string };

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
  id: string; userId: string; taskId?: string | null; issueId?: string | null;
  projectId?: string | null; projectType?: string | null; date: string; createdAt?: string;
  hoursLogged: number; billable: boolean; notes?: string;
  user: { id: string; firstName: string; lastName: string };
  task?: { id: string; title: string } | null;
  issue?: { id: string; title: string } | null;
  project?: { id: string; code: string | null; projectType: string | null } | null;
};

export type CalendarEvent = {
  id: string; organizationId: string; title: string; description?: string;
  type: string; startDate: string; endDate?: string; allDay: boolean;
  color: string; createdBy: string; projectId?: string; createdAt: string;
  location?: string | null; joinUrl?: string | null; reminderMinutes?: number | null;
  recurrence?: string | null; recurrenceUntil?: string | null; recurrenceParentId?: string | null; notes?: string | null;
  attendees?: { userId: string; response?: string; user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'> }[];
};
export type FreeBusy = { userId: string; busy: { start: string; end: string; title: string; allDay: boolean }[] };
// A bookmarked message, carrying its channel and when it was saved.
export type SavedMessage = Message & { channel: { id: string; name: string }; savedAt: string };

export type Channel = {
  id: string; organizationId: string; name: string; description?: string;
  type: string; createdBy: string; createdAt: string;
  archivedAt?: string | null; retentionDays?: number | null;
  unreadCount?: number;
  _count?: { messages: number; members: number };
  messages?: Message[];
  members?: { userId: string; user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'> }[];
};
// Per-member read position in a channel (drives "seen by" on own messages).
export type ChannelRead = { userId: string; lastReadAt: string };
// A named, @mentionable group of people.
export type Tag = { id: string; name: string; memberIds: string[]; memberCount: number };

// ── Company comms & knowledge (announcements / policies / celebrations / org chart) ──
type PersonLite = Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto' | 'designation'>;
export type Announcement = {
  id: string; organizationId: string; authorId: string; title: string; body: string;
  pinnedAt?: string | null; createdAt: string; updatedAt: string; author?: PersonLite | null;
};
export type Celebration = { user: PersonLite; inDays: number; month: number; day: number; years?: number };
export type Celebrations = { anniversaries: (Celebration & { years: number })[]; birthdays: Celebration[] };
export type DirectoryEntry = PersonLite & { phone?: string | null };
// Recognition / rewards given to employees.
export type Reward = {
  id: string; recipientId: string; givenById: string; category: string;
  message?: string | null; awardedAt: string; recipient?: PersonLite; giver?: PersonLite;
};
export type RewardsView = {
  financialYear: string; period: string; total: number;
  leaderboard: { user: PersonLite; count: number }[];
  rewards: Reward[];
};
export type PolicyDoc = { id: string; name: string; fileUrl: string; mimeType?: string | null; fileSize?: number | null };
export type Policy = {
  id: string; organizationId: string; title: string; description?: string | null; category?: string | null;
  body?: string | null; documentId?: string | null; requiresAck: boolean; publishedBy: string;
  createdAt: string; updatedAt: string; document?: PolicyDoc | null; ackCount: number; acknowledgedByMe: boolean;
};
export type PolicyAckStatus = { user: PersonLite; acknowledgedAt: string | null };

// ── Appraisal review cycles ────────────────────────────────────────────────────
export type AppraisalGoal = {
  id: string; appraisalId: string; title: string; description?: string | null; weight?: number | null;
  selfRating?: number | null; selfComment?: string | null; managerRating?: number | null; managerComment?: string | null; sequence: number;
};
export type AppraisalCycleRef = { id: string; name: string; status: string; dueDate?: string | null; periodStart?: string | null; periodEnd?: string | null };
export type Appraisal = {
  id: string; cycleId: string; organizationId: string; employeeId: string; reviewerId?: string | null; status: string;
  selfRating?: number | null; selfComments?: string | null; managerRating?: number | null; managerComments?: string | null; overallRating?: number | null;
  submittedSelfAt?: string | null; submittedManagerAt?: string | null; acknowledgedAt?: string | null; createdAt: string; updatedAt: string;
  cycle?: AppraisalCycleRef; employee?: PersonLite; reviewer?: PersonLite | null; goals?: AppraisalGoal[];
};
export type AppraisalCycle = {
  id: string; organizationId: string; name: string; periodStart?: string | null; periodEnd?: string | null; dueDate?: string | null;
  status: string; createdBy: string; createdAt: string; updatedAt: string;
  progress?: { total: number; completed: number; pendingSelf: number; pendingManager: number };
  appraisals?: Appraisal[];
};
export type ChannelMembers = {
  ownerId: string;
  members: { userId: string; user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'> }[];
};

// Global-search results, each set permission-scoped server-side.
export type SearchResults = {
  people: { id: string; firstName: string; lastName?: string | null; email: string; profilePhoto?: string | null; designation?: string | null }[];
  projects: { id: string; title: string; code?: string | null; projectPhase: string }[];
  tasks: { id: string; title: string; status: string | null; projectId: string | null }[];
  channels: { id: string; name: string }[];
  messages: { id: string; channelId: string; channelName: string; author: string; content: string; createdAt: string }[];
};
// Per-user notification preferences. `types` maps a category → enabled.
export type NotificationPrefs = {
  types: Record<string, boolean>;
  mutedChannels: string[];
  quietStart: number | null;
  quietEnd: number | null;
  soundEnabled: boolean;
};
// Effective presence for one person (computed server-side).
export type PresenceEntry = { userId: string; status: string; workMode: string; statusMessage?: string | null };
// The signed-in user's own presence (manual choice + resolved effective).
export type MyPresence = { status: string | null; statusMessage: string | null; statusExpiresAt: string | null; effective: string; workMode: string };
export type MessageReaction = { emoji: string; userId: string };
// A poll carried on its own message (message.content is the question).
export type MessagePoll = {
  id: string; question: string; multiple: boolean; closedAt?: string | null; createdBy: string;
  options: { id: string; text: string; sequence: number }[];
  votes: { optionId: string; userId: string }[];
};
export type Message = {
  id: string; channelId: string; userId: string; content: string; createdAt: string;
  editedAt?: string | null; deletedAt?: string | null;
  pinnedAt?: string | null; pinnedBy?: string | null;
  user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;
  attachments?: AttachmentRef[];
  // Emoji reactions on this message (raw rows; the UI groups them).
  reactions?: MessageReaction[];
  // User ids this message @mentioned (resolved server-side from channel members).
  mentions?: string[];
  // Present when this message IS a poll.
  poll?: MessagePoll | null;
};

// A technical issue / glitch — raising it logs the time it cost as non-billable.
export type Issue = {
  id: string; projectId: string; title: string; description?: string;
  reportedBy: string; hours: number; createdAt: string; updatedAt: string;
  reporter?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;
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
  /** Optional in-app destination — clicking the notification navigates here. */
  link?: string | null;
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
export type DayState =
  | 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'LEAVE_PENDING' | 'FREE' | 'LIGHT' | 'BUSY'
  | 'PRESENT' | 'ABSENT' | 'COMPOFF';
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
  userId: string; name: string; designation?: string; department?: string; office?: string; profilePhoto?: string | null;
  days: CapacityDay[];
  openTasks: CapacityOpenTask[];
  freeHours: number; committedHours: number; capacityHours: number; utilization: number;
  nextFreeDate: string | null; freeRunDays: number; availableNow: boolean; overdueCount: number;
};
export type TeamCapacity = { from: string; to: string; capacityPerDay: number; rows: CapacityRow[] };

// Retrospective (past-window) view — actual attendance, not projected load.
export type HistoryRow = {
  userId: string; name: string; designation?: string; department?: string; profilePhoto?: string | null;
  days: CapacityDay[];
  present: number; absent: number; onLeave: number; compoff: number;
};
export type TeamHistory = { from: string; to: string; mode: 'history'; rows: HistoryRow[] };

// Emergency-leave coverage board.
export type CoverageRiskTask = {
  id: string; title: string; priority: string; dueDate: string;
  projectId?: string; project?: string; projectPriority?: string;
  remainingHours: number; overdue: boolean;
};
export type CoverageRisk = {
  leaveId: string; userId: string; name: string; profilePhoto?: string | null;
  leaveType: string; startDate: string; endDate: string; noticeDays: number;
  tasks: CoverageRiskTask[];
};
export type CoverageSuggestion = {
  userId: string; name: string; profilePhoto?: string | null;
  freeHours: number; availableNow: boolean; nextFreeDate: string | null;
};
export type CoverageRisks = { from: string; to: string; risks: CoverageRisk[]; suggestions: CoverageSuggestion[] };

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
  status: string; workMode?: string; note?: string | null; isRegularized: boolean;
};
export type AttendanceDay = {
  date: string; status: string; workMode?: string; checkIn?: string | null; checkOut?: string | null;
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
export type RegularizationRequest = {
  id: string; userId: string; organizationId?: string | null; date: string; reason: string;
  requestType: string; requestedStatus: string;
  requestedCheckIn?: string | null; requestedCheckOut?: string | null;
  status: string; reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null;
  createdAt: string;
  user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;
};
export type CompOffEvidence = {
  id: string;
  timesheets: { task: string; hours: number; notes?: string }[];
  attendance: { checkIn?: string | null; checkOut?: string | null; totalHours?: number | null } | null;
};
// WFH is agreed in advance: request a date range → HR/Admin (attendance.manage) approves →
// punching on a covered day records workMode WFH automatically. No WFH button on punch.
export type WfhRequestItem = {
  id: string; userId: string; organizationId?: string | null;
  startDate: string; endDate: string; reason: string;
  status: string; reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email: string; profilePhoto?: string | null };
};
export type CompOffRequest = {
  id: string; userId: string; organizationId?: string | null; workDate: string; reason: string;
  projectRef?: string | null; hoursWorked?: number | null; status: string;
  reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null; createdAt: string;
  user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;
  evidence?: CompOffEvidence | null;
};
export type LeaveType = { id: string; organizationId: string; name: string; code: string; annualQuota: number; colorHex: string };
export type LeaveBalance = { code: string; name: string; quota: number; used: number; remaining: number; colorHex: string };
export type Holiday = { id: string; organizationId: string; name: string; date: string; type: string; recurring: boolean };

export type Expense = {
  id: string; userId: string; organizationId?: string | null;
  category: string; amount: number; currency: string; spentOn: string; description: string;
  receiptDocumentId?: string | null; status: string;
  reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null; reimbursedAt?: string | null;
  createdAt: string;
  user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;
};

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
    // Recover a forgotten passcode: reset it using the admin's own account password.
    resetPasscode: (password: string, newPasscode: string) =>
      req<{ ok: boolean }>('/auth/passcode/reset', { method: 'POST', body: JSON.stringify({ password, newPasscode }) }),
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
    /** The catalog of project types + their auto-created task templates (for the create form). */
    types: () => req<ProjectTypeDef[]>('/projects/types'),
    /** Non-binding preview of the PID the next created project would get. */
    nextPid: () => req<{ pid: string | null }>('/projects/next-pid'),
    create: (data: {
      title: string; projectType?: string; clientId?: string; patentIds?: string[];
      description?: string; priority?: string; startDate?: string;
      dueDate?: string; clientDueDate?: string; managerId?: string; createdBy: string;
      pid?: string; pidAssigneeId?: string;
    }) => req<ApiProject>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    /** Mint a Project ID on demand (Generate PID). Authority only. */
    generatePid: () => req<{ pid: string }>('/projects/generate-pid', { method: 'POST' }),
    /** People who can assign a PID — the request dropdown for non-authorities. */
    pidAuthorities: () =>
      req<Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'designation' | 'profilePhoto'>[]>(
        '/projects/pid-authorities'),
    /** My incoming PID requests, as an authority. */
    pidRequests: () => req<PidRequestItem[]>('/projects/pid-requests'),
    /** Assign a PID to a pending-request project. */
    fulfillPidRequest: (id: string, pid: string) =>
      req<{ pid: string; projectId: string }>(`/projects/pid-requests/${id}/fulfill`,
        { method: 'POST', body: JSON.stringify({ pid }) }),
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
    // Lifecycle: Complete → Close → Reopen (distinct from delete).
    complete: (id: string) => req<ApiProject>(`/projects/${id}/complete`, { method: 'POST' }),
    close: (id: string) => req<ApiProject>(`/projects/${id}/close`, { method: 'POST' }),
    reopen: (id: string) => req<ApiProject>(`/projects/${id}/reopen`, { method: 'POST' }),
    addMember: (id: string, userId: string, projectRole?: string) =>
      req<ApiProject>(`/projects/${id}/members`, { method: 'POST', body: JSON.stringify({ userId, projectRole }) }),
    removeMember: (id: string, userId: string) =>
      req<ApiProject>(`/projects/${id}/members/${userId}`, { method: 'DELETE' }),
  },

  // Client codes (the "MLK" grouping). Create/remove need patent.manage + the org passcode.
  clients: {
    list: () => req<ClientSummary[]>('/clients'),
    create: (data: { code: string; name?: string }) =>
      req<ClientSummary>('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { code?: string; name?: string }) =>
      req<ClientSummary>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => req<{ ok: boolean }>(`/clients/${id}`, { method: 'DELETE' }),
  },

  // Confidential coded patents. `list` is the passcode-free OVERVIEW (patent IDs, no real
  // numbers); `reveal` returns the real numbers and triggers the org passcode; every mutation
  // needs patent.manage + the passcode. `options` returns handles only (patent.view).
  patents: {
    list: (clientId?: string) =>
      req<PatentOverview[]>(`/patents${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
    reveal: (clientId?: string) =>
      req<PatentFull[]>(`/patents/reveal${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
    options: (clientId?: string) =>
      req<PatentOption[]>(`/patents/options${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
    register: (data: { clientId: string; realNumbers: string[] }) =>
      req<PatentOverview[]>('/patents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, realNumber: string) =>
      req<PatentOverview>(`/patents/${id}`, { method: 'PATCH', body: JSON.stringify({ realNumber }) }),
    remove: (id: string) => req<{ ok: boolean }>(`/patents/${id}`, { method: 'DELETE' }),
    // Attach a PDF/media document to a patent (stored in the DB); documentUrl opens it.
    uploadDocument: (id: string, file: File) => {
      const form = new FormData(); form.append('file', file);
      return uploadReq<{ documentId: string; documentName: string }>(`/patents/${id}/document`, form);
    },
    // Upload a document → creates a patent (ID auto-generated, real number from the file name).
    createFromDocument: (clientId: string, file: File) => {
      const form = new FormData(); form.append('file', file); form.append('clientId', clientId);
      return uploadReq<PatentOverview>('/patents/from-document', form);
    },
    // Passcode-gated blob (opened via an object URL); a plain link can't carry the passcode.
    downloadDocument: (id: string) => blobReq(`/patents/${id}/document/content`),
  },

  taskLists: {
    list: (projectId: string) => req<any[]>(`/projects/${projectId}/tasklists`),
    create: (projectId: string, data: { name: string }) =>
      req<any>(`/projects/${projectId}/tasklists`, { method: 'POST', body: JSON.stringify(data) }),
    remove: (projectId: string, id: string) =>
      req<void>(`/projects/${projectId}/tasklists/${id}`, { method: 'DELETE' }),
  },


  tasks: {
    list: (projectId: string, opts?: { taskListId?: string }) => {
      const params = new URLSearchParams({ projectId });
      if (opts?.taskListId) params.set('taskListId', opts.taskListId);
      return req<ApiTask[]>(`/tasks?${params}`);
    },
    listForUser: (userId: string) => req<ApiTask[]>(`/tasks?userId=${encodeURIComponent(userId)}`),
    get: (id: string) => req<ApiTask>(`/tasks/${id}`),
    create: (data: {
      title: string; projectId: string; taskListId: string; createdBy: string;
      description?: string; priority?: string; startDate?: string; dueDate?: string;
      estimatedHours?: number; assigneeIds?: string[];
      currentWorkflowStatusId?: string;
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
    // taskId is optional: omit it to log a "buffer" entry whose PID (task) is assigned later.
    create: (data: { userId?: string; taskId?: string; date: string; hoursLogged: number; billable?: boolean; notes?: string }) =>
      req<Timesheet>('/timesheets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { hoursLogged?: number; billable?: boolean; notes?: string }) =>
      req<Timesheet>(`/timesheets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    /** Assign a PID (task) to a buffer entry logged without one. */
    assign: (id: string, taskId: string) =>
      req<Timesheet>(`/timesheets/${id}/assign`, { method: 'POST', body: JSON.stringify({ taskId }) }),
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
      location?: string; joinUrl?: string; reminderMinutes?: number;
      recurrence?: string; recurrenceUntil?: string; notes?: string;
    }) => req<CalendarEvent>('/calendar-events', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<CalendarEvent, 'title' | 'description' | 'type' | 'startDate' | 'endDate' | 'allDay' | 'color' | 'location' | 'joinUrl' | 'reminderMinutes'>>) =>
      req<CalendarEvent>(`/calendar-events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string, series?: boolean) => req<void>(`/calendar-events/${id}${series ? '?series=true' : ''}`, { method: 'DELETE' }),
    respond: (id: string, response: string) =>
      req<CalendarEvent>(`/calendar-events/${id}/respond`, { method: 'POST', body: JSON.stringify({ response }) }),
    updateNotes: (id: string, notes: string) =>
      req<CalendarEvent>(`/calendar-events/${id}/notes`, { method: 'PUT', body: JSON.stringify({ notes }) }),
    freeBusy: (userIds: string[], from: string, to: string) =>
      req<FreeBusy[]>(`/calendar-events/free-busy?userIds=${userIds.join(',')}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    icsHref: () => `${BASE}/calendar-events/export.ics`,
  },

  channels: {
    list: (orgId: string) => req<Channel[]>(`/channels?organizationId=${encodeURIComponent(orgId)}`),
    get: (id: string) => req<Channel>(`/channels/${id}`),
    create: (data: { organizationId: string; name: string; description?: string; memberIds?: string[] }) =>
      req<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string; retentionDays?: number | null }) =>
      req<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/channels/${id}`, { method: 'DELETE' }),
    archive: (id: string) => req<{ ok: boolean; archived: boolean }>(`/channels/${id}/archive`, { method: 'POST' }),
    unarchive: (id: string) => req<{ ok: boolean; archived: boolean }>(`/channels/${id}/unarchive`, { method: 'POST' }),
    messages: (channelId: string, limit?: number) =>
      req<Message[]>(`/channels/${channelId}/messages${limit ? `?limit=${limit}` : ''}`),
    // Author is the verified cookie actor — no userId sent.
    sendMessage: (channelId: string, data: { content: string; documentIds?: string[] }) =>
      req<Message>(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
    editMessage: (channelId: string, messageId: string, content: string) =>
      req<Message>(`/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
    deleteMessage: (channelId: string, messageId: string) =>
      req<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
    toggleReaction: (channelId: string, messageId: string, emoji: string) =>
      req<MessageReaction[]>(`/channels/${channelId}/messages/${messageId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
    pinMessage: (channelId: string, messageId: string) =>
      req<Message>(`/channels/${channelId}/messages/${messageId}/pin`, { method: 'POST' }),
    unpinMessage: (channelId: string, messageId: string) =>
      req<Message>(`/channels/${channelId}/messages/${messageId}/unpin`, { method: 'POST' }),
    pinned: (channelId: string) => req<Message[]>(`/channels/${channelId}/pinned`),
    createPoll: (channelId: string, data: { question: string; options: string[]; multiple?: boolean }) =>
      req<Message>(`/channels/${channelId}/polls`, { method: 'POST', body: JSON.stringify(data) }),
    votePoll: (channelId: string, pollId: string, optionIds: string[]) =>
      req<Message>(`/channels/${channelId}/polls/${pollId}/vote`, { method: 'POST', body: JSON.stringify({ optionIds }) }),
    closePoll: (channelId: string, pollId: string) =>
      req<Message>(`/channels/${channelId}/polls/${pollId}/close`, { method: 'POST' }),
    saveMessage: (channelId: string, messageId: string) =>
      req<{ saved: boolean }>(`/channels/${channelId}/messages/${messageId}/save`, { method: 'POST' }),
    unsaveMessage: (channelId: string, messageId: string) =>
      req<{ saved: boolean }>(`/channels/${channelId}/messages/${messageId}/unsave`, { method: 'POST' }),
    saved: () => req<SavedMessage[]>('/channels/me/saved'),
    markRead: (channelId: string) => req<{ ok: boolean }>(`/channels/${channelId}/read`, { method: 'POST' }),
    reads: (channelId: string) => req<ChannelRead[]>(`/channels/${channelId}/reads`),
    members: (channelId: string) => req<ChannelMembers>(`/channels/${channelId}/members`),
    addMembers: (channelId: string, userIds: string[]) =>
      req<{ ok: boolean }>(`/channels/${channelId}/members`, { method: 'PUT', body: JSON.stringify({ userIds }) }),
    removeMember: (channelId: string, userId: string) =>
      req<void>(`/channels/${channelId}/members/${userId}`, { method: 'DELETE' }),
  },
  search: (q: string) => req<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
  tags: {
    list: () => req<Tag[]>('/tags'),
    create: (name: string) => req<Tag>('/tags', { method: 'POST', body: JSON.stringify({ name }) }),
    rename: (id: string, name: string) => req<Tag>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    remove: (id: string) => req<void>(`/tags/${id}`, { method: 'DELETE' }),
    setMembers: (id: string, userIds: string[]) =>
      req<{ ok: boolean; count: number }>(`/tags/${id}/members`, { method: 'PUT', body: JSON.stringify({ userIds }) }),
  },
  company: {
    announcements: () => req<Announcement[]>('/company/announcements'),
    createAnnouncement: (data: { title: string; body: string; pinned?: boolean }) =>
      req<Announcement>('/company/announcements', { method: 'POST', body: JSON.stringify(data) }),
    updateAnnouncement: (id: string, data: { title: string; body: string; pinned?: boolean }) =>
      req<Announcement>(`/company/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    pinAnnouncement: (id: string) => req<Announcement>(`/company/announcements/${id}/pin`, { method: 'POST' }),
    deleteAnnouncement: (id: string) => req<void>(`/company/announcements/${id}`, { method: 'DELETE' }),
    celebrations: () => req<Celebrations>('/company/celebrations'),
    directory: () => req<DirectoryEntry[]>('/company/directory'),
    rewards: (period?: 'current' | 'last') => req<RewardsView>(`/company/rewards${period === 'last' ? '?period=last' : ''}`),
    giveReward: (data: { recipientId: string; category: string; message?: string }) =>
      req<Reward>('/company/rewards', { method: 'POST', body: JSON.stringify(data) }),
    deleteReward: (id: string) => req<{ ok: boolean }>(`/company/rewards/${id}`, { method: 'DELETE' }),
    policies: () => req<Policy[]>('/company/policies'),
    createPolicy: (data: { title: string; description?: string; category?: string; body?: string; documentId?: string; requiresAck?: boolean }) =>
      req<Policy>('/company/policies', { method: 'POST', body: JSON.stringify(data) }),
    updatePolicy: (id: string, data: { title: string; description?: string; category?: string; body?: string; documentId?: string; requiresAck?: boolean }) =>
      req<Policy>(`/company/policies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deletePolicy: (id: string) => req<void>(`/company/policies/${id}`, { method: 'DELETE' }),
    acknowledgePolicy: (id: string) => req<{ ok: boolean }>(`/company/policies/${id}/acknowledge`, { method: 'POST' }),
    policyAckStatus: (id: string) => req<PolicyAckStatus[]>(`/company/policies/${id}/acknowledgements`),
  },
  appraisals: {
    mine: () => req<Appraisal[]>('/appraisals/me'),
    toReview: () => req<Appraisal[]>('/appraisals/review'),
    get: (id: string) => req<Appraisal>(`/appraisals/${id}`),
    addGoal: (id: string, data: { title: string; description?: string; weight?: number }) =>
      req<Appraisal>(`/appraisals/${id}/goals`, { method: 'POST', body: JSON.stringify(data) }),
    updateGoal: (id: string, goalId: string, data: Partial<Pick<AppraisalGoal, 'title' | 'description' | 'selfRating' | 'selfComment' | 'managerRating' | 'managerComment'>>) =>
      req<Appraisal>(`/appraisals/${id}/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteGoal: (id: string, goalId: string) => req<Appraisal>(`/appraisals/${id}/goals/${goalId}`, { method: 'DELETE' }),
    submitSelf: (id: string, data: { selfRating?: number; selfComments?: string }) =>
      req<Appraisal>(`/appraisals/${id}/submit-self`, { method: 'POST', body: JSON.stringify(data) }),
    submitManager: (id: string, data: { managerRating?: number; overallRating?: number; managerComments?: string }) =>
      req<Appraisal>(`/appraisals/${id}/submit-manager`, { method: 'POST', body: JSON.stringify(data) }),
    acknowledge: (id: string) => req<Appraisal>(`/appraisals/${id}/acknowledge`, { method: 'POST' }),
    // cycles (HR)
    cycles: () => req<AppraisalCycle[]>('/appraisals/cycles'),
    getCycle: (id: string) => req<AppraisalCycle>(`/appraisals/cycles/${id}`),
    createCycle: (data: { name: string; periodStart?: string; periodEnd?: string; dueDate?: string }) =>
      req<AppraisalCycle>('/appraisals/cycles', { method: 'POST', body: JSON.stringify(data) }),
    updateCycle: (id: string, data: { name: string; periodStart?: string; periodEnd?: string; dueDate?: string }) =>
      req<AppraisalCycle>(`/appraisals/cycles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    launch: (id: string, employeeIds?: string[]) =>
      req<{ ok: boolean; created: number }>(`/appraisals/cycles/${id}/launch`, { method: 'POST', body: JSON.stringify({ employeeIds }) }),
    closeCycle: (id: string) => req<AppraisalCycle>(`/appraisals/cycles/${id}/close`, { method: 'POST' }),
    deleteCycle: (id: string) => req<void>(`/appraisals/cycles/${id}`, { method: 'DELETE' }),
  },
  presence: {
    org: () => req<PresenceEntry[]>('/presence/org'),
    me: () => req<MyPresence>('/presence/me'),
    heartbeat: () => req<{ ok: boolean }>('/presence/heartbeat', { method: 'POST', body: JSON.stringify({}) }),
    setStatus: (data: { status: string; message?: string; expiryMinutes?: number }) =>
      req<MyPresence>('/presence', { method: 'POST', body: JSON.stringify(data) }),
    clearStatus: () => req<MyPresence>('/presence/clear', { method: 'POST' }),
  },

  issues: {
    list: (projectId: string) => req<Issue[]>(`/issues?projectId=${encodeURIComponent(projectId)}`),
    get: (id: string) => req<Issue>(`/issues/${id}`),
    create: (data: { projectId: string; title: string; description?: string; hours?: number; date?: string }) =>
      req<Issue>('/issues', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<Issue, 'title' | 'description'>>) =>
      req<Issue>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/issues/${id}`, { method: 'DELETE' }),
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
    preferences: () => req<NotificationPrefs>('/notifications/preferences'),
    setPreferences: (data: Partial<Pick<NotificationPrefs, 'types' | 'quietStart' | 'quietEnd' | 'soundEnabled'>>) =>
      req<NotificationPrefs>('/notifications/preferences', { method: 'PUT', body: JSON.stringify(data) }),
    muteChannel: (channelId: string, muted: boolean) =>
      req<{ muted: boolean; mutedChannels: string[] }>(`/notifications/channels/${channelId}/${muted ? 'mute' : 'unmute'}`, { method: 'POST' }),
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
    /** Emergency-leave coverage risks: short-notice absences over HIGH/CRITICAL work. */
    coverageRisks: (days = 14) =>
      req<CoverageRisks>(`/capacity/coverage-risks?days=${days}`),
    /** Retrospective: actual attendance over the past `days` (ending today). */
    history: (days = 30) =>
      req<TeamHistory>(`/capacity/history?days=${days}`),
  },

  overdue: {
    /** Force an overdue sweep now (the hourly one still runs). */
    sweep: () => req<{ alerted: number; digests: number }>('/overdue/sweep', { method: 'POST' }),
  },

  attendance: {
    today: () => req<Attendance | null>('/attendance/me/today'),
    myMonth: (year: number, month: number) => req<AttendanceMonth>(`/attendance/me/month?year=${year}&month=${month}`),
    userMonth: (userId: string, year: number, month: number) => req<AttendanceMonth>(`/attendance/users/${userId}/month?year=${year}&month=${month}`),
    // workMode is derived server-side (approved WFH request ⇒ WFH, else OFFICE).
    punch: () => req<Attendance>('/attendance/punch', { method: 'POST', body: JSON.stringify({}) }),
    // WFH requests: raised from the Leaves tab, reviewed by HR/Admin (attendance.manage).
    requestWfh: (data: { startDate: string; endDate: string; reason: string }) =>
      req<WfhRequestItem>('/attendance/wfh', { method: 'POST', body: JSON.stringify(data) }),
    myWfhRequests: () => req<WfhRequestItem[]>('/attendance/wfh/me'),
    pendingWfhRequests: () => req<WfhRequestItem[]>('/attendance/wfh/pending'),
    approveWfh: (id: string, note?: string) =>
      req<WfhRequestItem>(`/attendance/wfh/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    rejectWfh: (id: string, note?: string) =>
      req<WfhRequestItem>(`/attendance/wfh/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    cancelWfh: (id: string) =>
      req<WfhRequestItem>(`/attendance/wfh/${id}/cancel`, { method: 'POST' }),
    regularize: (id: string, reason: string, newStatus?: string) =>
      req<Attendance>(`/attendance/${id}/regularize`, { method: 'POST', body: JSON.stringify({ reason, newStatus }) }),
    mark: (data: { userId: string; date: string; status: string; note?: string }) =>
      req<Attendance>('/attendance/mark', { method: 'POST', body: JSON.stringify(data) }),
    orgSummary: (orgId: string, from: string, to: string) =>
      req<OrgAttendanceSummary>(`/attendance/org/summary?organizationId=${encodeURIComponent(orgId)}&from=${from}&to=${to}`),

    // ── Regularisation: employee requests, HR approves/rejects ──
    /** Raise a regularisation request for a day (missed/late/forgot punch). Goes to HR. */
    requestRegularization: (data: { date: string; reason: string; requestType?: string; status?: string; checkIn?: string; checkOut?: string }) =>
      req<RegularizationRequest>('/attendance/me/regularize', { method: 'POST', body: JSON.stringify(data) }),
    myRegularizations: () => req<RegularizationRequest[]>('/attendance/regularizations/me'),
    pendingRegularizations: () => req<RegularizationRequest[]>('/attendance/regularizations/pending'),
    approveRegularization: (id: string, note?: string) =>
      req<RegularizationRequest>(`/attendance/regularizations/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    rejectRegularization: (id: string, note?: string) =>
      req<RegularizationRequest>(`/attendance/regularizations/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    cancelRegularization: (id: string) =>
      req<RegularizationRequest>(`/attendance/regularizations/${id}/cancel`, { method: 'POST' }),
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
    // Comp-off: worked a non-working day → claim → HR approves → CO leave credit.
    requestCompOff: (data: { workDate: string; reason: string; hoursWorked?: number; projectRef?: string }) =>
      req<CompOffRequest>('/leave/compoff', { method: 'POST', body: JSON.stringify(data) }),
    myCompOffs: () => req<CompOffRequest[]>('/leave/compoff/me'),
    pendingCompOffs: () => req<CompOffRequest[]>('/leave/compoff/pending'),
    approveCompOff: (id: string, note?: string) => req<CompOffRequest>(`/leave/compoff/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    rejectCompOff: (id: string, note?: string) => req<CompOffRequest>(`/leave/compoff/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    cancelCompOff: (id: string) => req<CompOffRequest>(`/leave/compoff/${id}/cancel`, { method: 'POST' }),
    types: (orgId: string) => req<LeaveType[]>(`/leave/types?organizationId=${encodeURIComponent(orgId)}`),
    holidays: (orgId: string, year?: number) => req<Holiday[]>(`/leave/holidays?organizationId=${encodeURIComponent(orgId)}${year ? `&year=${year}` : ''}`),
    createHoliday: (data: { organizationId: string; name: string; date: string; type?: string; recurring?: boolean }) =>
      req<Holiday>('/leave/holidays', { method: 'POST', body: JSON.stringify(data) }),
    removeHoliday: (id: string) => req<void>(`/leave/holidays/${id}`, { method: 'DELETE' }),
  },

  expenses: {
    submit: (data: { category: string; amount: number; currency?: string; spentOn: string; description: string; receiptDocumentId?: string }) =>
      req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
    mine: () => req<Expense[]>('/expenses/me'),
    forOrg: (status?: string) => req<Expense[]>(`/expenses/org${status ? `?status=${status}` : ''}`),
    approve: (id: string, note?: string) => req<Expense>(`/expenses/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    reject: (id: string, note?: string) => req<Expense>(`/expenses/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    reimburse: (id: string) => req<Expense>(`/expenses/${id}/reimburse`, { method: 'POST' }),
    cancel: (id: string) => req<Expense>(`/expenses/${id}/cancel`, { method: 'POST' }),
  },
};
