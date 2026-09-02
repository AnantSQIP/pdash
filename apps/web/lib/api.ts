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

export type OrgSummary = {
  id: string; name: string; code: string; status: string;
  timezone?: string; brandColor?: string;
  /** The firm's logo as an image data URL. Null/absent when none has been set. */
  logo?: string | null;
};

export type UserSummary = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string; status: string; profilePhoto?: string;
};

export type AuthUser = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string | null; status: string; organizationId: string; mustResetPassword: boolean;
  /** GURGAON | JAIPUR — defaults the office on a new project. */
  office?: string | null;
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
export type TaskRole = 'PM' | 'REVIEWER' | 'ANALYST';
export type AssigneeRef = {
  userId: string;
  role?: TaskRole | null;
  estimatedHours?: number | null;
  dueDate?: string | null;
  user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'profilePhoto'>;
};
export type StaffingEntry = { userId: string; role: TaskRole; estimatedHours?: number; dueDate?: string | null };

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
  /** Which project(s) and task GROUP this task sits in — drives the grouped task list. */
  projectTasks?: { projectId: string; taskListId?: string | null; sequence: number; project?: { id: string; title: string } }[];
  _count?: { subtasks: number; checklists?: number };
};

/** A selectable project type + its auto-created task template (from GET /projects/types). */
/** A technology domain — the FIELD a project is in (Medical, Automobile …), not its type. */
export type TechnologyDomainDef = { value: string; label: string; custom?: boolean };

export type ProjectTypeDef = {
  value: string; label: string; description: string;
  comingSoon?: boolean; taskListName?: string; tasks?: string[]; custom?: boolean;
};

export type DigestReport = {
  date: string;
  projectsCreated: { title: string; code: string | null }[];
  projectsCompleted: { title: string; code: string | null }[];
  tasksCompleted: number;
  deadlinesMetToday: number;
  overdueCount: number;
  overdueSample: { title: string; dueDate: string | null }[];
  activeProjects: number;
};

// ── Daily Digest module (Super Admin) ─────────────────────────────────────────
// Everything the digest screen shows carries the ids it needs to link straight through to the
// project, the task and the person — the whole point of the module is that no number is a
// dead end.
export type DigestPerson = { id: string; name: string };
export type DigestProject = {
  id: string; pid: string | null; roundSeq?: number; title: string; type: string | null;
  phase: string; priority: string; client: string | null;
  startDate: string | null; dueDate: string | null; clientDueDate: string | null;
  clientDeliveryDate: string | null; workingHours: number | null; actualHours: number | null;
  completedAt: string | null; progress: number; taskCount: number;
  managers: DigestPerson[];
  members: (DigestPerson & { role: string })[];
};
export type DigestTask = {
  id: string; title: string; dueDate: string | null; priority: string; status: string | null;
  estimatedHours: number | null; actualHours: number | null; daysOverdue: number;
  project: { id: string; pid: string | null; roundSeq?: number; title: string; type: string | null; progress: number } | null;
  assignees: (DigestPerson & { role: string; estimatedHours: number | null; dueDate: string | null })[];
};
export type DigestHoursEntry = {
  hours: number; billable: boolean; notes: string | null;
  project: { id: string; pid: string | null; roundSeq?: number; title: string } | null;
  task: { id: string; title: string } | null;
};
export type DigestPersonHours = {
  id: string; name: string; designation: string | null;
  hours: number; billableHours: number; entries: DigestHoursEntry[];
};
export type DigestDetail = {
  date: string;
  /** The next 5 WORKING days (weekends + holidays skipped), from today. */
  lookaheadDays: string[];
  projectsCreated: DigestProject[];
  projectsCompleted: DigestProject[];
  tasksCompleted: DigestTask[];
  deadlinesMet: DigestTask[];
  overdue: DigestTask[];
  upcoming: { date: string; tasks: DigestTask[]; projects: DigestProject[] }[];
  upcomingTotal: number;
  hoursByPerson: DigestPersonHours[];
  totals: { hoursLogged: number; billableHours: number; peopleWhoLogged: number; activeProjects: number };
};


/** The complete per-project dataset behind the Reports module (table AND export are this shape). */
export type ReportTaskAssignee = {
  id: string; name: string; role: string; estimatedHours: number | null; dueDate: string | null;
};
export type ReportTask = {
  id: string; title: string; status: string | null; isClosed: boolean; priority: string;
  dueDate: string | null; estimatedHours: number | null; actualHours: number | null;
  assignees: ReportTaskAssignee[];
};
export type ReportProject = {
  id: string; pid: string | null; roundSeq: number; office: string | null;
  title: string; description: string | null;
  type: string | null; phase: string; priority: string; status: string | null;
  client: string | null; billable: boolean; progress: number;
  startDate: string | null; dueDate: string | null; clientDueDate: string | null;
  completedAt: string | null; closedAt: string | null;
  clientDeliveryDate: string | null; workingHours: number | null; actualHours: number | null;
  /** Hours actually logged on timesheets — not the same as the workingHours snapshot at completion. */
  loggedHours: number; estimatedHours: number;
  taskCount: number; tasksClosed: number; tasksOpen: number; memberCount: number;
  createdBy: string | null; createdAt: string | null;
  patents: string[];
  managers: { id: string; name: string }[];
  members: { id: string; name: string; role: string; designation: string | null }[];
  tasks: ReportTask[];
};

/** One project under a PID — the "card" the PID page stacks. */
export type PidRound = {
  id: string; code: string | null; roundSeq: number; office: string | null;
  title: string; description: string | null;
  projectType: string | null;
  /** Technology domain slug — the FIELD the work is in (Medical, Automobile …). */
  technologyDomain?: string | null;
  projectPhase: string; priority: string;
  completionPercentage: number;
  startDate: string | null; dueDate: string | null; clientDueDate: string | null;
  completedAt: string | null; closedAt: string | null;
  clientDeliveryDate: string | null; workingHours: number | null; actualHours: number | null;
  createdBy: string | null; createdAt: string | null;
  client: { id: string; name: string | null; code: string } | null;
  /** The round's own task lists — its card adds tasks into its default one. */
  taskLists?: { id: string; name: string; isDefault: boolean; sequence: number }[];
  workflowId?: string | null;
  members: { projectRole: string | null; user: UserSummary }[];
  _count?: { projectTasks: number; members: number };
};
/** Every project sharing a PID. `multiRound` is false for a normal single-project PID. */
export type PidRounds = { pid: string | null; multiRound: boolean; rounds: PidRound[] };

/** A single project under a PID, as the ledger reports it. */
export type PidLedgerRound = {
  id: string; round: number; title: string; description?: string | null;
  phase: string | null; type?: string | null; priority?: string | null; office?: string | null;
  /** Technology domain: the stored slug plus its human label. */
  domain?: string | null; domainLabel?: string | null;
  startDate?: string | null; dueDate?: string | null; clientDueDate?: string | null;
  completedAt?: string | null; closedAt?: string | null; clientDeliveryDate?: string | null;
  workingHours?: number | null; actualHours?: number | null;
  /** Hours logged on THIS round — reconciles against timesheets. */
  loggedHours?: number;
  /** Hours ALLOTTED to this round — the sum of its tasks' estimates. */
  allottedHours?: number;
  progress?: number | null; client?: string | null;
  createdBy?: string | null; createdAt?: string | null;
  patents?: string[]; members?: { name: string; role: string }[];
};

export type PidLedgerState = 'WORKING' | 'COMPLETED' | 'RESERVED' | 'DISCONTINUED';
export type PidLedgerEntry = {
  id: string; pid: string; fyLabel: string; serial: number;
  status: 'RESERVED' | 'ATTACHED' | 'DISCONTINUED';
  /** The PID's real lifecycle, derived from the attached project's phase (drives the badge/filter). */
  state: PidLedgerState;
  generatedBy: string;
  /** Every project under this PID, oldest first. One entry for a single-project PID. */
  rounds?: PidLedgerRound[];
  roundCount?: number;
  /** Every hour logged across every round of this PID. */
  totalLoggedHours?: number;
  totalAllottedHours?: number;
  multiRound?: boolean;
  /** The LATEST round — kept so single-project consumers keep working unchanged. */
  project: {
    id: string; title: string; phase: string | null;
    description?: string | null; type?: string | null; priority?: string | null;
    startDate?: string | null; dueDate?: string | null; clientDueDate?: string | null;
    /** Completion record: when it was signed off, when it reached the client, and the hours. */
    completedAt?: string | null; closedAt?: string | null; clientDeliveryDate?: string | null;
    workingHours?: number | null; actualHours?: number | null;
    progress?: number | null; client?: string | null;
    createdBy?: string | null; createdAt?: string | null;
    patents?: string[];
    members?: { name: string; role: string }[];
  } | null;
  createdAt: string; expiresAt: string; resolvedAt: string | null;
};

export type PidRequestItem = {
  id: string; projectId: string; projectTitle: string;
  description?: string | null; priority?: string | null;
  projectType?: string | null; managerId?: string | null;
  startDate?: string | null; dueDate?: string | null;
  requestedBy: string; note: string | null; createdAt: string;
};

export type ApiProject = {
  id: string; title: string; description?: string; projectPhase: string;
  /** The kind of patent-analysis matter (HML, CC_NEW, FTO, …); null for a general project. */
  projectType?: string | null;
  /** The FIELD the work is in (Medical, Automobile, Source Code …) — separate from the type. */
  technologyDomain?: string | null;
  /** The PID, e.g. SQ_26_27_001 (globally unique; also searchable). */
  code?: string | null;
  /** The client/matter this project is for. */
  client?: { id: string; name: string; code: string } | null;
  /**
   * True when the client is INFERRED from the tagged patents (and so cannot be edited on its
   * own); false when it was named directly. Only present for actors who may see clients.
   */
  clientFromPatents?: boolean;
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
  /** Captured at completion: when the work reached the CLIENT (distinct from completedAt, which is
   *  when someone pressed the button), the hours on paper, and the hand-typed real cost. */
  clientDeliveryDate?: string | null; workingHours?: number | null; actualHours?: number | null;
  /** Which project this is under its PID (1 for the first). A PID can hold several. */
  roundSeq?: number;
  /** GURGAON | JAIPUR — the owning office. Jaipur PIDs may hold multiple projects. */
  office?: string | null;
  createdAt?: string; updatedAt?: string; // omitted by the list projection
  currentStatus?: WorkflowStatus;
  members?: { userId: string; projectRole?: string; isActive: boolean; user: UserSummary }[];
  taskLists?: { id: string; name: string; isDefault: boolean; sequence: number }[];
  _count?: { members: number; projectTasks: number };
};

// ─── Patent-analysis client codes + confidential coded patents ────────────────
export type ClientSummary = {
  id: string; name?: string | null; code: string;
  /** Set = retired from day-to-day work. Reversible; nothing about the data changes. */
  archivedAt?: string | null;
  _count?: { patents: number; projects: number };
  /** Projects still running (ACTIVE/ON_HOLD) — what archiving would leave orphaned. */
  activeProjects?: number;
};
// ─── Team spaces (Phase 3) ───────────────────────────────────────────────────
/** A space for work that is not client delivery: no PID, no client, no billability. */
export type TeamSpace = {
  id: string; name: string; description?: string | null;
  archivedAt?: string | null; createdAt: string; createdBy?: string | null;
  members: { userId: string; roleInTeam?: string | null; joinedAt?: string;
    user: { id: string; firstName: string; lastName: string; email?: string; profilePhoto?: string | null; designation?: string | null } }[];
  taskLists?: { id: string; name: string; isDefault: boolean; sequence: number }[];
  _count?: { teamTasks: number };
  /** Tasks not in a CLOSED status — what a wound-down space should not look busy with. */
  openTasks?: number;
};
export type TeamTask = {
  id: string; title: string; description?: string | null; priority: string;
  startDate?: string | null; dueDate?: string | null;
  estimatedHours?: number | null; actualHours?: number | null;
  completionPercentage?: number; createdBy?: string; createdAt?: string;
  currentStatus?: { id: string; name: string; colorHex?: string | null; type?: string | null } | null;
  assignees: { userId: string; role?: string | null;
    user: { id: string; firstName: string; lastName: string; profilePhoto?: string | null } }[];
  _count?: { subtasks: number };
  taskListId?: string | null; sequence?: number;
};

// ─── BD pipeline (Phase 3) ───────────────────────────────────────────────────
export type DealStageDef = { value: string; label: string; probability: number; terminal?: boolean };
export type DealActivity = {
  id: string; type: string; note?: string | null;
  fromStage?: string | null; toStage?: string | null;
  occurredAt: string; createdBy: string; byName?: string | null;
};
/** One thing wrong with a deal, computed rather than typed. */
export type DealFlag = {
  kind: 'STALE' | 'NEXT_ACTION_DUE' | 'NO_NEXT_ACTION' | 'CLOSE_DATE_PASSED' | 'STUCK_IN_STAGE' | 'AWAITING_CLIENT';
  severity: 'warn' | 'urgent';
  message: string;
};
export type Deal = {
  id: string; company: string; title?: string | null; stage: string;
  value?: number | null; currency: string;
  ownerId: string; source?: string | null;
  expectedCloseDate?: string | null; wonAt?: string | null; lostAt?: string | null;
  lostReason?: string | null; clientId?: string | null; notes?: string | null; teamId?: string | null;
  nextActionAt?: string | null; nextActionNote?: string | null; expectedProjectType?: string | null;
  createdAt: string; updatedAt: string;
  owner: { id: string; firstName: string; lastName: string; profilePhoto?: string | null };
  client?: { id: string; code: string; name?: string | null } | null;
  activities?: DealActivity[];
  /** Computed by the server — what is wrong with this deal, most pressing first. */
  flags?: DealFlag[];
  daysInStage?: number;
  lastTouchedAt?: string;
  /** Already a client of ours, matched by name even when the deal is not yet linked. */
  existingClient?: { id: string; code: string; name?: string | null } | null;
};
export type DeliveryOutlook = {
  horizonDays: number; from: string; to: string; atRisk: number;
  items: {
    dealId: string; company: string; title?: string | null; stage: string;
    value?: number | null; currency: string; expectedCloseDate: string;
    expectedProjectType?: string | null;
    beyondHorizon: boolean; closeDatePassed: boolean;
    freeHoursInWindow: number | null;
    verdict: 'comfortable' | 'tight' | 'committed' | null;
  }[];
};
export type PipelineSummary = {
  byStage: { stage: string; label: string; probability: number; count: number; value: number; weighted: number }[];
  openCount: number; openValue: number;
  needsAttention?: number;
  awaitingClientRecord?: number;
  stageDurations?: { stage: string; medianDays: number | null; openNow: number; longestOpenDays: number | null }[];
  byProjectType?: { projectType: string; won: number; lost: number; open: number; wonValue: number; winRate: number | null }[];
  /** Open pipeline weighted by each stage's probability. */
  weightedForecast: number;
  wonCount: number; wonValue: number; lostCount: number;
  /** Share of CLOSED deals that were won. Null until something has closed. */
  winRate: number | null;
  avgCycleDays: number | null;
  lostReasons: { reason: string; count: number }[];
  /** More than one means the totals above mix currencies and cannot be summed honestly. */
  currencies: string[];
};

// ─── Client ledger ───────────────────────────────────────────────────────────
/** Recomputed from live projects and timesheets on every read — never stored. */
export type LedgerDerived = {
  projectCount: number; activeProjectCount: number; patentCount: number;
  billableHours: number; nonBillableHours: number; totalHours: number;
  contributorCount: number; firstLoggedAt?: string | null; lastLoggedAt?: string | null;
};
/** A Super Admin's stated figures. Null fields fall back to the derived ones. */
export type LedgerOverride = {
  billableHours: number | null; amount: number | null; currency: string;
  note: string | null; updatedBy: string; updatedByName?: string | null; updatedAt: string;
  /** The derived figure when the statement was made — the baseline drift is measured from. */
  derivedHoursWhenSet?: number | null;
};
/** What to show: the override where one exists, the derived figure otherwise. */
export type LedgerEffective = {
  billableHours: number;
  billableHoursSource: 'derived' | 'override';
  amount: number | null;
  /** Where the value came from, so an estimate is never shown as an agreed sum. */
  amountSource?: 'stated' | 'derived' | 'none';
  /** The rate the derivation used. Null when the client has no rate on file. */
  rate?: number | null;
  currency: string;
  /** How far the derived figure has moved since the statement. Null = nothing stated. */
  driftHours?: number | null;
  /** The statement is far enough behind the data to be worth revisiting. */
  stale?: boolean;
};
/** Hours the ledger cannot attribute to any client, split by the reason. */
/** Where the client → patent → PID → hours chain was never joined up. */
export type ChainGaps = {
  unusedPatents: {
    count: number; total: number;
    items: { id: string; handle: string; createdAt: string; client?: { id: string; code: string; name?: string | null } | null }[];
  };
  clientsWithoutWork: {
    count: number; total: number;
    items: { id: string; code: string; name?: string | null; patentCount: number }[];
  };
  projectsWithoutClient: {
    count: number;
    /** Hours that will never reach a client ledger while the project has no client. */
    strandedHours: number;
    items: { id: string; code: string | null; roundSeq: number; title: string; projectPhase: string }[];
  };
};
export type LedgerUnattributed = {
  totalHours: number; billableHours: number;
  awaitingPid: number; onClientlessProjects: number; projectCount: number;
};
/** The facts a person maintains about a client, as opposed to the ones the ledger derives. */
export type ClientProfile = {
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null;
  website?: string | null; country?: string | null; address?: string | null;
  industry?: string | null; notes?: string | null;
  /** Hourly rate. The one field that turns hours into money. */
  billingRate?: number | null;
  billingCurrency?: string;
  /** When the relationship began — not when the row was created. */
  engagementStart?: string | null;
  accountManagerId?: string | null;
  accountManager?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'designation'> | null;
};
export type LedgerRow = ClientProfile & {
  id: string; code: string; name?: string | null; archivedAt?: string | null; createdAt: string;
  derived: LedgerDerived; override: LedgerOverride | null; effective: LedgerEffective;
};
export type LedgerProject = {
  id: string; code?: string | null; title: string; projectPhase: string; projectType?: string | null;
  startDate?: string | null; dueDate?: string | null; completedAt?: string | null;
  workingHours?: number | null; actualHours?: number | null;
  /** Which round this project is under its PID — one PID can group several. */
  roundSeq?: number;
  /**
   * Why there is no PID, so the screen can say something better than a dash:
   * 'assigned' it has one · 'requested' an authority has been asked · 'missing' nobody has asked.
   */
  pidStatus?: 'assigned' | 'requested' | 'missing';
  pidRequestedAt?: string | null;
  billableHours: number; nonBillableHours: number; totalHours: number;
};
export type LedgerDetail = LedgerRow & { patentCount: number; projects: LedgerProject[] };

// ─── Employment lifecycle ───────────────────────────────────────────────────
export type ProbationStatus = 'confirmed' | 'on-probation' | 'due' | 'overdue' | 'unknown';
export type LifecyclePerson = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string | null; profilePhoto?: string | null; office?: string | null; status: string;
  joiningDate?: string | null; probationMonths?: number | null;
  /** Derived from joiningDate + probationMonths — never stored, so it cannot go stale. */
  probationEndsOn?: string | null;
  probationStatus: ProbationStatus;
  daysToProbationEnd?: number | null;
  confirmedAt?: string | null; confirmedBy?: string | null; confirmationNote?: string | null;
  resignationDate?: string | null; noticeDays?: number | null; lastWorkingDay?: string | null;
  exitReason?: string | null; exitCompletedAt?: string | null;
  onNotice: boolean; daysToLastWorkingDay?: number | null;
};
export type LifecycleBoard = {
  probation: LifecyclePerson[];
  leaving: LifecyclePerson[];
  /** Nothing tenure-based works without a joining date, so the gap is surfaced. */
  missingJoiningDate: { id: string; firstName: string; lastName: string; designation?: string | null }[];
  counts: {
    total: number; confirmed: number; onProbation: number; due: number;
    overdue: number; onNotice: number; noJoiningDate: number;
  };
};
export type Handover = {
  person: LifecyclePerson;
  summary: {
    items: { key: string; label: string; count: number; blocking: boolean }[];
    clearToRelease: boolean; blockingCount: number;
  };
  openTasks: { id: string; title: string; dueDate?: string | null; priority?: string | null;
               status?: string | null; project?: { id: string; code: string | null; title: string } | null }[];
  projectsManaged: { id: string; code: string | null; title: string; projectPhase: string; dueDate?: string | null }[];
  projectsMember: { id: string; code: string | null; title: string; projectPhase: string }[];
  clientsOwned: { id: string; code: string; name?: string | null }[];
  unsubmittedTime: { id: string; date: string; hoursLogged: number; notes?: string | null }[];
  pendingLeave: { id: string; leaveType: string; startDate: string; endDate: string; numDays: number }[];
};

// ─── Feedback ────────────────────────────────────────────────────────────────
export type FeedbackKind = 'PRAISE' | 'CONCERN' | 'OBSERVATION';
type FeedbackPerson = Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'designation' | 'profilePhoto'>;
export type FeedbackItem = {
  id: string; kind: FeedbackKind; body: string; rating?: number | null;
  about: FeedbackPerson; author: FeedbackPerson;
  acknowledgedAt?: string | null; acknowledgedBy?: string | null;
  createdAt: string; updatedAt: string;
  authorId: string; aboutUserId: string;
};
export type FeedbackSummary = {
  total: number; open: number;
  byKind: { kind: FeedbackKind; count: number }[];
};

// ─── Patent numbers, for the people doing the work ───────────────────────────
/**
 * A patent WITH its real number, for somebody staffed on a project it is tagged to. The client is
 * deliberately absent: knowing which patent you are searching is what the work needs; knowing
 * whose it is, is commercial information and a separate grant.
 */
export type PatentNumberForMember = {
  id: string; handle: string; serial: number; realNumber: string; formerHandles: string[];
  clientVisible: false;
};
export type PatentNumberLookup = {
  results: PatentNumberForMember[];
  searchedFor: string;
  /** True when the result cap was reached — the screen should say "narrow your search". */
  truncated?: boolean;
  clientVisible: false;
};
/** One patent resolved from a handle or an id. `current` is false for a retired handle. */
export type PatentResolved = PatentNumberForMember & { current: boolean; searchedFor: string };
export type ProjectPatentNumbers = {
  project: { id: string; code: string | null; title: string };
  patents: PatentNumberForMember[];
  clientVisible: false;
};

/** Non-secret patent handle (for the project picker + project detail).
 *  `formerHandles` = IDs this patent used to have, kept so an ID quoted from an old email
 *  still finds it after a client-code rename. */
export type PatentOption = { id: string; handle: string; serial: number; clientId?: string; formerHandles?: string[] };
/** Portal OVERVIEW — patent IDs + serials, NO real number. */
export type PatentOverview = {
  id: string; handle: string; serial: number; clientId: string;
  documentId?: string | null; documentName?: string | null; formerHandles?: string[];
  client?: { id: string; name?: string | null; code: string };
  /** The work this patent is tagged to — what turns a handle into a history. */
  projects?: { id: string; code: string | null; roundSeq: number; title: string; projectPhase: string; completedAt?: string | null }[];
  /** Minted but tagged to nothing. */
  unused?: boolean;
};
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

/**
 * A window onto a thread: the newest `COMMENT_PAGE_SIZE` comments, oldest-first, plus whether
 * older ones exist. Threads are read from the bottom, so the recent end is what loads first.
 */
export type ApiCommentPage = { items: ApiComment[]; total: number; hasMore: boolean };

/** How many comments a thread loads at a time. Widening asks for one more window's worth. */
export const COMMENT_PAGE_SIZE = 100;

export type Timesheet = {
  id: string; userId: string; taskId?: string | null; issueId?: string | null;
  projectId?: string | null; projectType?: string | null; category?: string | null; title?: string | null;
  date: string; createdAt?: string;
  hoursLogged: number; billable: boolean; notes?: string;
  user: { id: string; firstName: string; lastName: string };
  task?: { id: string; title: string } | null;
  issue?: { id: string; title: string } | null;
  project?: { id: string; code: string | null; projectType: string | null } | null;
};
export type TimesheetCalendarDay = {
  date: string; target: number; logged: number;
  status: 'COMPLETE' | 'PARTIAL' | 'LOW' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'FUTURE';
  /** Set when the day has a comp-off claim — APPROVED makes it a required working day; PENDING shows an asterisk. */
  compOff?: 'APPROVED' | 'PENDING';
  /** An undecided leave/WFH/comp-off request covering this day. The target is unchanged — the
   *  hours are still owed until the request is actually approved. */
  pending?: { kind: string; label: string } | null;
};
export type TimesheetCalendar = { year: number; month: number; days: TimesheetCalendarDay[] };

export type TimesheetBackdateRequest = {
  id: string; userId: string; organizationId?: string | null;
  fromDate: string; toDate: string; reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null;
  createdAt: string; updatedAt: string;
  user?: { id: string; firstName: string; lastName: string };
};

export type CalendarEvent = {
  id: string; organizationId: string; title: string; description?: string;
  type: string; startDate: string; endDate?: string; allDay: boolean;
  color: string; createdBy: string; projectId?: string; createdAt: string;
  location?: string | null; joinUrl?: string | null; reminderMinutes?: number | null;
  recurrence?: string | null; recurrenceUntil?: string | null; recurrenceParentId?: string | null; notes?: string | null;
  attendees?: { userId: string; response?: string; user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'> }[];
  /** True for a leave/WFH/comp-off request that has been raised but NOT yet approved. These are
   *  derived server-side (id is `pending:<kind>:<requestId>`) and cannot be edited or deleted. */
  pending?: boolean;
};
/** Availability blocks for the team calendar / scheduling assistant. The server deliberately
 *  omits private detail (leave type, reason, meeting title) — `kind` is enough to colour and
 *  label the block, and `pending` marks a request that hasn't been approved yet. */
export type FreeBusy = {
  userId: string;
  busy: { start: string; end: string; title: string; allDay: boolean; kind?: string; pending?: boolean }[];
};
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
export type Celebrations = { anniversaries: (Celebration & { years: number })[]; birthdays: Celebration[]; weddingAnniversaries?: Celebration[] };
export type DirectoryEntry = PersonLite & {
  phone?: string | null;
  office?: string | null;
  departments?: { id: string; name: string }[];
  manager?: PersonLite | null;
};
/** Flat edges, not a nested tree — the chart has more than one root while lines are still missing. */
export type OrgChartPerson = PersonLite & {
  office?: string | null;
  departments?: { id: string; name: string }[];
  managerId: string | null;
};
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
  /** Bumped when the BODY or attached document changes — not on a rename. */
  version: number;
  /** True when you agreed to an EARLIER version: read it again, the terms moved. */
  supersededForMe?: boolean;
};
export type PolicyAckStatus = {
  user: PersonLite; acknowledgedAt: string | null;
  acknowledgedVersion: number | null;
  currentVersion: number;
  /** Agreed to something, but not to what the policy says now. */
  outdated: boolean;
};

// ── Appraisal review cycles ────────────────────────────────────────────────────
export type AppraisalGoal = {
  id: string; appraisalId: string; title: string; description?: string | null; weight?: number | null;
  selfRating?: number | null; selfComment?: string | null; managerRating?: number | null; managerComment?: string | null; sequence: number;
};
export type AppraisalCycleRef = { id: string; name: string; status: string; dueDate?: string | null; periodStart?: string | null; periodEnd?: string | null };
/** One criterion on an appraisal, with what each side scored it. 1-5, 5 highest. */
export type AppraisalScore = {
  id: string;
  selfScore?: number | null;
  managerScore?: number | null;
  comment?: string | null;
  parameter: { id: string; name: string; description?: string | null; weight: number; sequence: number };
};
/** A criterion HR maintains. Scoped to a team, a designation, or neither (= everyone). */
export type AppraisalParameter = {
  id: string; name: string; description?: string | null;
  teamId?: string | null; designation?: string | null;
  weight: number; sequence: number; active: boolean;
  team?: { id: string; name: string } | null;
};
export type Appraisal = {
  id: string; cycleId: string; organizationId: string; employeeId: string; reviewerId?: string | null; status: string;
  selfRating?: number | null; selfComments?: string | null; managerRating?: number | null; managerComments?: string | null; overallRating?: number | null;
  submittedSelfAt?: string | null; submittedManagerAt?: string | null; acknowledgedAt?: string | null; createdAt: string; updatedAt: string;
  cycle?: AppraisalCycleRef; employee?: PersonLite; reviewer?: PersonLite | null; goals?: AppraisalGoal[];
  /** The criteria this person was rated on — fixed at launch, so it is the form as it was. */
  scores?: AppraisalScore[];
  /** Step three: the review call, held as a real calendar event. */
  reviewCallAt?: string | null; reviewCallEventId?: string | null;
  /** The document the review was actually held over. */
  sheetDocumentId?: string | null; sheetDocumentName?: string | null;
};
/** A person's completed reviews, plus a figure per financial year. */
export type AppraisalHistory = {
  reviews: {
    id: string; overallRating?: number | null; selfRating?: number | null; managerRating?: number | null;
    acknowledgedAt?: string | null;
    cycle: { id: string; name: string; cycleType: string; fyLabel?: string | null; periodStart?: string | null; periodEnd?: string | null };
  }[];
  byFinancialYear: { fyLabel: string; reviews: number; rating: number }[];
};
export type AppraisalCycle = {
  id: string; organizationId: string; name: string; periodStart?: string | null; periodEnd?: string | null; dueDate?: string | null;
  status: string; createdBy: string; createdAt: string; updatedAt: string;
  /** HALF_YEARLY | ANNUAL — the two the firm runs. */
  cycleType?: string; fyLabel?: string | null;
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
  projects: { id: string; title: string; code?: string | null; projectPhase: string; technologyDomain?: string | null }[];
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
  hoursLogged: number; billableHours: number;
  /** null when the person did no client work at all — team-space hours can never be billable,
   *  so a percentage would be 0 by construction rather than by performance. */
  billablePct: number | null;
  /** Hours on client matters — the denominator billablePct is measured against. */
  clientHours?: number;
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
  /** pid + roundSeq travel with the name: two rounds of one PID share a code. */
  hoursByProject: { projectId: string; name: string; pid?: string | null; roundSeq?: number | null; hours: number; billable: number }[];
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
export type DepartmentMemberEntry = UserSummary & { roleInDepartment?: string | null; joinedAt?: string };
export type DepartmentSummary = {
  id: string; name: string; description?: string | null; status?: string; memberCount?: number;
  members?: DepartmentMemberEntry[];
  /** From Department.headUserId — an explicit choice, not a guess at a job title. */
  headUserId?: string | null;
  head?: UserSummary | null;
};

// ─── Team capacity / availability ────────────────────────────────────────────
export type DayState =
  | 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'LEAVE_PENDING' | 'FREE' | 'LIGHT' | 'BUSY'
  | 'PRESENT' | 'ABSENT' | 'COMPOFF' | 'NOT_MARKED';
export type CapacityDay = {
  date: string; state: DayState; load: number; capacity: number;
  utilization: number; free: number; note?: string;
};
export type CapacityOpenTask = {
  id: string; title: string; projectId?: string; project?: string;
  /** The project's PID and which round it is — two rounds of one PID share a code. */
  projectPid?: string | null; projectRound?: number;
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
  weddingAnniversary?: string | null;
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
  checkInLat?: number | null; checkInLng?: number | null; checkInAcc?: number | null;
  checkOutLat?: number | null; checkOutLng?: number | null; checkOutAcc?: number | null;
};
export type AttendanceDay = {
  date: string; status: string; workMode?: string; checkIn?: string | null; checkOut?: string | null;
  totalHours?: number | null; isRegularized: boolean; note?: string | null;
  /** A leave/WFH/comp-off request covering this day that has NOT been decided yet. The day's
   *  `status` is unaffected — nothing is agreed until it's approved. */
  pending?: { kind: string; label: string } | null;
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
export type OrgPunchLocations = {
  date: string;
  rows: {
    userId: string; name: string; designation?: string; office?: string; area: string;
    checkIn: string | null; checkOut: string | null; status: string | null;
    checkInLat: number | null; checkInLng: number | null; checkInArea?: string | null;
    checkOutLat: number | null; checkOutLng: number | null; checkOutArea?: string | null;
  }[];
};
export type OrgAttendanceReport = {
  from: string; to: string;
  rows: {
    date: string; userId: string; name: string; office?: string; area: string;
    status: string | null; workMode?: string;
    checkIn: string | null; checkOut: string | null; totalHours: number | null;
    checkInLat: number | null; checkInLng: number | null;
    checkOutLat: number | null; checkOutLng: number | null;
  }[];
};
export type LeaveRequestItem = {
  id: string; userId: string; organizationId?: string; leaveType: string;
  startDate: string; endDate: string; numDays: number; reason?: string | null;
  /** FULL or HALF; halfPeriod is FIRST (morning) / SECOND (afternoon) on a HALF request.
   *  numDays is always a multiple of 0.5 — leave is counted in whole and half days only. */
  dayType?: string; halfPeriod?: string | null;
  alternateEmployeeId?: string | null; alternateNumber?: string | null; alternateAddress?: string | null;
  supportingDocId?: string | null;
  status: string; reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null;
  createdAt: string; user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'>;
  alternateEmployee?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  supportingDoc?: { id: string; name: string; fileUrl: string; mimeType?: string | null; fileSize?: number | null } | null;
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
// punching on a covered day records workMode WFH automatically; a person can also choose WFH
// at punch time for a single day, without raising a request first.
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
  /** FULL or HALF — a HALF claim earns half a day of comp-off credit. */
  dayType?: string;
  reviewedBy?: string | null; reviewedAt?: string | null; reviewNote?: string | null; createdAt: string;
  user?: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;
  evidence?: CompOffEvidence | null;
};
export type LeaveType = { id: string; organizationId: string; name: string; code: string; annualQuota: number; colorHex: string };
export type LeaveBalance = {
  code: string; name: string; quota: number; used: number; remaining: number; colorHex: string;
  /** Days on requests still awaiting a decision. They are already deducted from `remaining`,
   *  because the server refuses anything that would exceed approved + pending. */
  pending?: number;
  /** Comp-off is not an annual quota: `quota` is what has been EARNED, and `credits` is how many
   *  approved claims that came from (a half-day claim earns 0.5). */
  isCompOff?: boolean; credits?: number;
};
export type Holiday = { id: string; organizationId: string; name: string; date: string; type: string; recurring: boolean };

/** WFH-vs-office across a window. `mode` is only WFH/OFFICE on a day actually worked — leave,
 *  holidays, weekends and no-shows report as themselves rather than counting as "office". */
export type WorkModeCell = {
  date: string; mode: 'WFH' | 'OFFICE' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'ABSENT' | 'NOT_MARKED';
  wfhStatus?: string | null; checkIn?: string | null; area?: string | null;
};
export type OrgWorkModes = {
  from: string; to: string; dates: string[];
  rows: { userId: string; name: string; designation?: string; office?: string; profilePhoto?: string;
          days: WorkModeCell[]; wfhDays: number; officeDays: number }[];
  today: { wfh: number; office: number; leave: number; notMarked: number; absent: number };
};

export type Expense = {
  id: string; userId: string; organizationId?: string | null;
  category: string; amount: number; currency: string; spentOn: string; description: string;
  receiptDocumentId?: string | null; status: string;
  receipt?: { id: string; name: string; fileUrl: string; mimeType?: string | null; fileSize?: number | null } | null;
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
    // An empty string for `logo` REMOVES it; omitting the key leaves it alone.
    update: (id: string, data: { name?: string; timezone?: string; brandColor?: string; logo?: string }) =>
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
    list: (orgId: string, phase?: string, opts?: { technologyDomain?: string; sort?: string }) => {
      const params = new URLSearchParams({ organizationId: orgId });
      if (phase && phase !== 'ALL') params.set('phase', phase);
      if (opts?.technologyDomain) params.set('technologyDomain', opts.technologyDomain);
      if (opts?.sort) params.set('sort', opts.sort);
      return req<ApiProject[]>(`/projects?${params}`);
    },
    get: (id: string) => req<ApiProject>(`/projects/${id}`),
    /** The catalog of project types + their auto-created task templates (for the create form). */
    types: () => req<ProjectTypeDef[]>('/projects/types'),
    /** Built-in technology domains + the org's saved custom ones, alphabetical. */
    technologyDomains: () => req<TechnologyDomainDef[]>('/projects/technology-domains'),
    /** Non-binding preview of the PID the next created project would get. */
    nextPid: () => req<{ pid: string | null }>('/projects/next-pid'),
    create: (data: {
      title: string; projectType?: string; clientId?: string; patentIds?: string[];
      description?: string; priority?: string; startDate?: string;
      dueDate?: string; clientDueDate?: string; managerId?: string; createdBy: string;
      pid?: string; pidAssigneeId?: string;
      /** GURGAON | JAIPUR — decides whether this project's PID may later hold more projects. */
      office?: string;
      customType?: { label: string; tasks: string[]; save?: boolean };
      /** Technology domain slug — a built-in or one the org saved. */
      technologyDomain?: string;
      /** A domain somebody typed; `save` adds it to the org's list for next time. */
      customDomain?: { label: string; save?: boolean };
    }) => req<ApiProject>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    /** Reserve a Project ID (Generate PID) for 5 minutes. Authority only. */
    generatePid: () => req<{ pid: string; reservationId: string; createdAt?: string; expiresAt?: string }>('/projects/generate-pid', { method: 'POST' }),
    /** My current un-attached PID (countdown), or null. */
    myPidReservation: () => req<{ reservation: { pid: string; createdAt: string; expiresAt: string } | null }>('/projects/pid-reservation'),
    /** The full PID ledger (working / discontinued / history). Admin + Super Admin only. */
    pidLedger: () => req<PidLedgerEntry[]>('/projects/pid-ledger'),
    /** Every project with its full detail — the Reports module's table and CSV share this. */
    fullReport: () => req<ReportProject[]>('/projects/full-report'),
    /** Every project sharing this one's PID — the PID page's stack of cards. */
    rounds: (id: string) => req<PidRounds>(`/projects/${id}/rounds`),
    /** Start ANOTHER project under this one's PID (returning client, Jaipur only). */
    addRound: (id: string, body: {
      title: string; projectType?: string; description?: string; priority?: string;
      projectPhase?: string;
      startDate?: string | null; endDate?: string | null; clientDueDate?: string | null;
      members?: { userId: string; projectRole?: string }[];
      customType?: { label: string; tasks: string[]; save?: boolean };
      /** Technology domain slug — a built-in or one the org saved. */
      technologyDomain?: string;
      /** A domain somebody typed; `save` adds it to the org's list for next time. */
      customDomain?: { label: string; save?: boolean };
    }) => req<ApiProject>(`/projects/${id}/rounds`, { method: 'POST', body: JSON.stringify(body) }),
    /** Attach a fresh PID to a project that has none (e.g. reopened). Authority only. */
    attachPid: (id: string, pid?: string) =>
      req<{ pid: string; projectId: string }>(`/projects/${id}/attach-pid`, { method: 'POST', body: JSON.stringify(pid ? { pid } : {}) }),
    /** People who can assign a PID — the request dropdown for non-authorities. */
    pidAuthorities: () =>
      req<Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'designation' | 'profilePhoto'>[]>(
        '/projects/pid-authorities'),
    /** My incoming PID requests, as an authority. */
    pidRequests: () => req<PidRequestItem[]>('/projects/pid-requests'),
    /** Verify/edit a pending-request project's details (incl. type + manager) before assigning its PID. */
    editPidRequestProject: (id: string, data: { title?: string; description?: string; priority?: string; projectType?: string | null; managerId?: string; startDate?: string | null; dueDate?: string | null }) =>
      req<ApiProject>(`/projects/pid-requests/${id}/project`, { method: 'PATCH', body: JSON.stringify(data) }),
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
      req<{
        /** True when the caller may name THEMSELVES as the manager — the "I'll manage it" option. */
        canManageOwn: boolean;
        /**
         * True when the caller mints the PID themselves. When false the form must still ask who
         * will: running a project and issuing its number are separate jobs held by different
         * people, and naming yourself as manager does not conjure a PID.
         */
        canIssuePid: boolean;
        managers: (Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'designation' | 'profilePhoto'>
          & { isSelf: boolean; youAreDefault: boolean })[];
      }>('/projects/eligible-managers'),
    delete: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
    // The approver is the verified cookie actor server-side; only an optional reason is sent.
    approve: (id: string, reason?: string) =>
      req<void>(`/projects/${id}/approve`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
    reject: (id: string, reason?: string) =>
      req<void>(`/projects/${id}/reject`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
    // Lifecycle: Complete → Close → Reopen (distinct from delete).
    complete: (id: string, body?: { clientDeliveryDate?: string; workingHours?: number; actualHours?: number }) =>
      req<ApiProject>(`/projects/${id}/complete`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    reopen: (id: string) => req<ApiProject>(`/projects/${id}/reopen`, { method: 'POST' }),
    /** Re-initialize a COMPLETED project (returning client) — same PID, existing data reused. */
    reinitialize: (id: string) => req<ApiProject>(`/projects/${id}/reinitialize`, { method: 'POST' }),
    /** What the completion form should prefill "working hours" with (logged time, else estimates). */
    completionHours: (id: string) =>
      req<{ loggedHours: number; estimatedHours: number; suggested: number }>(`/projects/${id}/completion-hours`),
    /**
     * Replace the project's tagged patents — the COMPLETE set, not a delta, so an empty array
     * clears them. Open to anyone who can edit the project; the server derives the client from
     * whatever is left and refuses a mix of two clients.
     */
    setPatents: (id: string, patentIds: string[]) =>
      req<ApiProject>(`/projects/${id}/patents`, { method: 'PUT', body: JSON.stringify({ patentIds }) }),
    /**
     * Name the project's client directly — only accepted while it has NO tagged patents, since
     * patents decide the client whenever there are any. `null` detaches it. Needs patent.manage.
     */
    setClient: (id: string, clientId: string | null) =>
      req<ApiProject>(`/projects/${id}/client`, { method: 'PUT', body: JSON.stringify({ clientId }) }),
    addMember: (id: string, userId: string, projectRole?: string) =>
      req<ApiProject>(`/projects/${id}/members`, { method: 'POST', body: JSON.stringify({ userId, projectRole }) }),
    removeMember: (id: string, userId: string) =>
      req<ApiProject>(`/projects/${id}/members/${userId}`, { method: 'DELETE' }),
  },

  /**
   * Team spaces — HR, BD, operations. `team.view` only opens the module; which spaces you can
   * read is decided by membership server-side, exactly as it is for projects.
   */
  teams: {
    list: () => req<TeamSpace[]>('/teams'),
    get: (id: string) => req<TeamSpace>(`/teams/${id}`),
    create: (data: { name: string; description?: string; memberIds?: string[] }) =>
      req<TeamSpace>('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      req<TeamSpace>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archive: (id: string) => req<TeamSpace>(`/teams/${id}/archive`, { method: 'POST' }),
    restore: (id: string) => req<TeamSpace>(`/teams/${id}/restore`, { method: 'POST' }),
    remove: (id: string) => req<{ ok: boolean }>(`/teams/${id}`, { method: 'DELETE' }),
    /** Replace the whole membership — idempotent, not a delta. */
    setMembers: (id: string, userIds: string[]) =>
      req<TeamSpace>(`/teams/${id}/members`, { method: 'PUT', body: JSON.stringify({ userIds }) }),
    removeMember: (id: string, userId: string) =>
      req<TeamSpace>(`/teams/${id}/members/${userId}`, { method: 'DELETE' }),
    /** Returns the created list itself — the screen refetches the team separately. */
    createList: (id: string, name: string) =>
      req<{ id: string; name: string; sequence: number; teamId: string | null }>(
        `/teams/${id}/lists`, { method: 'POST', body: JSON.stringify({ name }) }),
    updateList: (id: string, listId: string, data: { name?: string; sequence?: number }) =>
      req<TeamSpace>(`/teams/${id}/lists/${listId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    removeList: (id: string, listId: string) =>
      req<TeamSpace>(`/teams/${id}/lists/${listId}`, { method: 'DELETE' }),
    tasks: (id: string) => req<TeamTask[]>(`/teams/${id}/tasks`),
    /** The statuses a team task can take — the same GLOBAL workflow projects use. */
    taskStatuses: () => req<{ id: string; name: string; type: string; colorHex?: string | null }[]>('/teams/meta/statuses'),
    /** Edit a task. `currentWorkflowStatusId` is how a task gets CLOSED — until it is, it keeps
     *  consuming its owner's capacity. */
    updateTask: (id: string, taskId: string, data: {
      title?: string; description?: string; priority?: string; dueDate?: string | null;
      estimatedHours?: number; completionPercentage?: number;
      currentWorkflowStatusId?: string; assigneeIds?: string[];
    }) => req<TeamTask[]>(`/teams/${id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    createTask: (id: string, data: {
      title: string; taskListId: string; description?: string; priority?: string;
      startDate?: string; dueDate?: string; estimatedHours?: number; assigneeIds?: string[];
    }) => req<TeamTask[]>(`/teams/${id}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    moveTask: (id: string, taskId: string, taskListId: string, sequence?: number) =>
      req<TeamTask[]>(`/teams/${id}/tasks/${taskId}/move`, { method: 'PUT', body: JSON.stringify({ taskListId, sequence }) }),
    removeTask: (id: string, taskId: string) =>
      req<TeamTask[]>(`/teams/${id}/tasks/${taskId}`, { method: 'DELETE' }),
  },

  /**
   * The BD pipeline. Commercial information, so behind deal.view / deal.manage rather than the
   * basics — but deliberately not scoped to your own deals, since a pipeline you see a slice of
   * cannot be forecast.
   */
  deals: {
    stages: () => req<DealStageDef[]>('/deals/stages'),
    summary: () => req<PipelineSummary>('/deals/summary'),
    deliveryOutlook: (days?: number) =>
      req<DeliveryOutlook>(`/deals/delivery-outlook${days ? `?days=${days}` : ''}`),
    list: (opts: { stage?: string; ownerId?: string } = {}) => {
      const q = new URLSearchParams();
      if (opts.stage) q.set('stage', opts.stage);
      if (opts.ownerId) q.set('ownerId', opts.ownerId);
      const s = q.toString();
      return req<Deal[]>(`/deals${s ? `?${s}` : ''}`);
    },
    get: (id: string) => req<Deal>(`/deals/${id}`),
    create: (data: {
      company: string; title?: string; stage?: string; value?: number; currency?: string;
      ownerId?: string; source?: string; expectedCloseDate?: string; notes?: string;
      nextActionAt?: string; nextActionNote?: string; expectedProjectType?: string;
    }) => req<Deal>('/deals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      req<Deal>(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    /** Move along the pipeline. LOST requires a reason; WON may mint or link a client. */
    move: (id: string, data: { stage: string; lostReason?: string; clientId?: string; newClientCode?: string }) =>
      req<Deal>(`/deals/${id}/stage`, { method: 'PUT', body: JSON.stringify(data) }),
    logActivity: (id: string, data: { type: string; note?: string; occurredAt?: string }) =>
      req<Deal>(`/deals/${id}/activities`, { method: 'POST', body: JSON.stringify(data) }),
    remove: (id: string) => req<{ ok: boolean }>(`/deals/${id}`, { method: 'DELETE' }),
    /** A suggested client code for a company name, used when winning. */
    codeSuggestion: (company: string) =>
      req<{ code: string }>(`/deals/client-code-suggestion?company=${encodeURIComponent(company)}`),
  },

  // Client codes (the "MLK" grouping). Create/edit/remove need patent.manage + the org passcode;
  // archive and restore need neither passcode nor any data change — they are reversible.
  clients: {
    list: () => req<ClientSummary[]>('/clients'),
    /** Advisory code suggestion + look-alike clients for a typed name. Creates nothing. */
    codeSuggestion: (name: string, typed?: string) =>
      req<{
        /** The recommended opaque code — says nothing about the client. */
        code: string;
        /** More opaque candidates, so picking another does not mean reloading the form. */
        options: string[];
        /** Derived from the name: readable, and therefore a hint. Offered, not recommended. */
        mnemonic: string;
        similar: { id: string; name?: string | null; code: string }[];
        /** A verdict on what has been typed so far — the SAME check the save runs. */
        typed: { code: string; ok: boolean; reason: string | null; readable: boolean } | null;
      }>(`/clients/code-suggestion?name=${encodeURIComponent(name)}${typed ? `&typed=${encodeURIComponent(typed)}` : ''}`),
    create: (data: { code: string; name?: string } & ClientProfile) =>
      req<ClientSummary>('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { code?: string; name?: string }) =>
      req<ClientSummary>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    /** Retire a client: no new patents, gone from the project picker, everything kept. */
    archive: (id: string) => req<ClientSummary>(`/clients/${id}/archive`, { method: 'POST' }),
    restore: (id: string) => req<ClientSummary>(`/clients/${id}/restore`, { method: 'POST' }),
    /** A REAL delete — the server refuses while any patent or project still points at it. */
    remove: (id: string) => req<{ ok: boolean }>(`/clients/${id}`, { method: 'DELETE' }),
  },

  /**
   * The client ledger — what each client's work amounts to. A separate screen from the patent
   * portal: this one never touches real patent numbers, so it needs no passcode, but it is keyed
   * by client and so stays behind patent.manage (Super Admin).
   */
  /**
   * Feedback about a colleague. Anyone may write it; who may READ it is decided server-side —
   * the author, HR, and the subject's reporting manager, and deliberately not the subject.
   */
  feedback: {
    list: (params?: { aboutUserId?: string; mine?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.aboutUserId) q.set('aboutUserId', params.aboutUserId);
      if (params?.mine) q.set('mine', 'true');
      const qs = q.toString();
      return req<FeedbackItem[]>(`/feedback${qs ? `?${qs}` : ''}`);
    },
    summary: () => req<FeedbackSummary>('/feedback/summary'),
    create: (data: { aboutUserId: string; kind?: FeedbackKind; body: string; rating?: number }) =>
      req<FeedbackItem>('/feedback', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { kind?: FeedbackKind; body?: string; rating?: number }) =>
      req<FeedbackItem>(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    acknowledge: (id: string) => req<FeedbackItem>(`/feedback/${id}/acknowledge`, { method: 'POST' }),
    remove: (id: string) => req<{ ok: boolean }>(`/feedback/${id}`, { method: 'DELETE' }),
  },

  /**
   * Patent numbers for the people doing the work — the tier between "handle only" and the
   * Super-Admin portal. Membership of the project is the gate, and every read is audited.
   */
  patentNumbers: {
    forProject: (projectId: string) =>
      req<ProjectPatentNumbers>(`/projects/${projectId}/patent-numbers`),
    forPatent: (patentId: string) =>
      req<PatentResolved>(`/patents/${patentId}/number`),
    /** Resolve a handle — including one a client-code rename has since retired. */
    byHandle: (handle: string) =>
      req<PatentResolved>(`/patents/resolve-number?handle=${encodeURIComponent(handle)}`),
    /**
     * "I have the patent number — which ID do I quote?" Scoped the same way: a match comes back
     * only when you share a project with that patent.
     */
    findByNumber: (q: string) =>
      req<PatentNumberLookup>(`/patents/find-by-number?q=${encodeURIComponent(q)}`),
  },

  /**
   * Employment lifecycle — probation, confirmation and leaving.
   * Gated on user.update, the same permission the rest of people-operations sits behind.
   */
  lifecycle: {
    board: (all?: boolean) => req<LifecycleBoard>(`/lifecycle/board${all ? '?all=true' : ''}`),
    person: (userId: string) => req<LifecyclePerson>(`/lifecycle/${userId}`),
    setProbation: (userId: string, data: { joiningDate?: string; probationMonths?: number }) =>
      req<LifecyclePerson>(`/lifecycle/${userId}/probation`, { method: 'POST', body: JSON.stringify(data) }),
    confirm: (userId: string, data: { note?: string; confirmedAt?: string }) =>
      req<LifecyclePerson>(`/lifecycle/${userId}/confirm`, { method: 'POST', body: JSON.stringify(data) }),
    resign: (userId: string, data: { resignationDate: string; noticeDays?: number; lastWorkingDay?: string; reason?: string }) =>
      req<LifecyclePerson>(`/lifecycle/${userId}/resign`, { method: 'POST', body: JSON.stringify(data) }),
    handover: (userId: string) => req<Handover>(`/lifecycle/${userId}/handover`),
    completeExit: (userId: string) =>
      req<LifecyclePerson>(`/lifecycle/${userId}/exit-complete`, { method: 'POST' }),
  },

  clientLedger: {
    list: (includeArchived = true) =>
      req<LedgerRow[]>(`/client-ledger?includeArchived=${includeArchived}`),
    detail: (clientId: string) => req<LedgerDetail>(`/client-ledger/${clientId}`),
    /** Hours that reach no client — the PID buffer, and projects with no client set. */
    gaps: () => req<ChainGaps>('/client-ledger/gaps'),
    unattributed: () => req<LedgerUnattributed>('/client-ledger/unattributed'),
    /**
     * State or clear the figures. An OMITTED field keeps its stored value; an explicit `null`
     * clears it and hands the figure back to the derived calculation.
     */
    setOverride: (clientId: string, data: {
      billableHours?: number | null; amount?: number | null; currency?: string; note?: string | null;
    }) => req<LedgerDetail>(`/client-ledger/${clientId}/override`, { method: 'PATCH', body: JSON.stringify(data) }),
    /**
     * Edit the client's own details. No passcode — nothing here can change the CODE, which is the
     * only client field whose change rewrites identifiers already sent outside the firm.
     * An omitted key is left alone; an explicit `null` clears the field.
     */
    setProfile: (clientId: string, data: ClientProfile) =>
      req<LedgerDetail>(`/client-ledger/${clientId}/profile`, { method: 'PATCH', body: JSON.stringify(data) }),
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
    /**
     * Look up a patent ID that may be out of date — what a client quotes back from an email sent
     * before their code was renamed. `current: false` means the ID asked for has been retired.
     */
    resolve: (handle: string) =>
      req<{
        id: string; handle: string; serial: number; formerHandles: string[];
        current: boolean;
        /** The ID is live for one patent and retired from another — genuinely ambiguous. */
        ambiguous?: boolean;
        searchedFor: string;
      }>(`/patents/resolve?handle=${encodeURIComponent(handle)}`),
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
    /** Rename a task group (the "General" tag on a card). */
    update: (projectId: string, id: string, data: { name?: string; sequence?: number }) =>
      req<{ id: string; name: string; isDefault: boolean; sequence: number }>(
        `/projects/${projectId}/tasklists/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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
    /** Progress-only — needs task.view, not task.update (reporting your own work). */
    setProgress: (id: string, completionPercentage: number) =>
      req<ApiTask>(`/tasks/${id}/progress`, { method: 'PUT', body: JSON.stringify({ completionPercentage }) }),
    setStatus: (id: string, statusId: string) =>
      req<ApiTask>(`/tasks/${id}/status`, { method: 'PUT', body: JSON.stringify({ statusId }) }),
    setAssignees: (id: string, assigneeIds: string[]) =>
      req<ApiTask>(`/tasks/${id}/assignees`, { method: 'PUT', body: JSON.stringify({ assigneeIds }) }),
    /** Role-based staffing (PM/Reviewer/Analyst + per-person hours). */
    setStaffing: (id: string, assignees: StaffingEntry[]) =>
      req<ApiTask>(`/tasks/${id}/staffing`, { method: 'PUT', body: JSON.stringify({ assignees }) }),
    delete: (id: string) => req<void>(`/tasks/${id}`, { method: 'DELETE' }),
    createSubtask: (taskId: string, data: { title: string; priority?: string; dueDate?: string; assigneeIds?: string[] }) =>
      req<Subtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify(data) }),
    listSubtasks: (taskId: string) => req<Subtask[]>(`/tasks/${taskId}/subtasks`),
    closeSubtask: (taskId: string, subtaskId: string) =>
      req<Subtask>(`/tasks/${taskId}/subtasks/${subtaskId}/close`, { method: 'POST' }),
    reopenSubtask: (taskId: string, subtaskId: string) =>
      req<Subtask>(`/tasks/${taskId}/subtasks/${subtaskId}/reopen`, { method: 'POST' }),
    updateSubtask: (taskId: string, subtaskId: string, data: { title?: string; description?: string; priority?: string; dueDate?: string | null }) =>
      req<Subtask>(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteSubtask: (taskId: string, subtaskId: string) =>
      req<void>(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' }),
  },

  workflows: {
    statuses: (workflowId: string) => req<WorkflowStatus[]>(`/workflows/${workflowId}/statuses`),
    defaultOpenStatus: (workflowId: string) => req<WorkflowStatus>(`/workflows/${workflowId}/statuses/default-open`),
  },

  comments: {
    list: (entityType: string, entityId: string, limit: number = COMMENT_PAGE_SIZE) =>
      req<ApiCommentPage>(`/comments?entityType=${entityType}&entityId=${entityId}&limit=${limit}`),
    create: (data: { entityType: string; entityId: string; userId: string; content: string; documentIds?: string[]; mentionedUserIds?: string[] }) =>
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
    /** Per-day fill calendar for a month (color-coded: complete/incomplete/leave/holiday/weekend/future). */
    calendar: (year: number, month: number) =>
      req<TimesheetCalendar>(`/timesheets/calendar?year=${year}&month=${month}`),
    // taskId is optional: omit it to log a "buffer" entry whose PID (task) is assigned later.
    create: (data: {
      userId?: string; taskId?: string;
      /** OTHER = non-project time. CLIENT_CALL = a call booked to a PID, no task needed and
       *  allowed whether the matter is open or finished. */
      category?: 'OTHER' | 'CLIENT_CALL';
      /** Required for CLIENT_CALL — which PID the call was about. */
      projectId?: string;
      title?: string; date: string; hoursLogged: number; billable?: boolean; notes?: string;
    }) =>
      req<Timesheet>('/timesheets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { hoursLogged?: number; billable?: boolean; notes?: string }) =>
      req<Timesheet>(`/timesheets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    /** Assign a PID (task) to a buffer entry logged without one. */
    assign: (id: string, taskId: string) =>
      req<Timesheet>(`/timesheets/${id}/assign`, { method: 'POST', body: JSON.stringify({ taskId }) }),
    delete: (id: string) => req<void>(`/timesheets/${id}`, { method: 'DELETE' }),
    // ── Backdate (backfill) approval: 1–3-month-old days need Super-Admin sign-off ──
    backdates: () => req<TimesheetBackdateRequest[]>('/timesheets/backdate'),
    pendingBackdates: () => req<TimesheetBackdateRequest[]>('/timesheets/backdate/pending'),
    requestBackdate: (data: { fromDate: string; toDate: string; reason: string }) =>
      req<TimesheetBackdateRequest>('/timesheets/backdate', { method: 'POST', body: JSON.stringify(data) }),
    approveBackdate: (id: string, note?: string) =>
      req<TimesheetBackdateRequest>(`/timesheets/backdate/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    rejectBackdate: (id: string, note?: string) =>
      req<TimesheetBackdateRequest>(`/timesheets/backdate/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    cancelBackdate: (id: string) =>
      req<TimesheetBackdateRequest>(`/timesheets/backdate/${id}/cancel`, { method: 'POST' }),
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
  dailyDigest: {
    report: (date?: string) => req<DigestReport>(`/daily-digest/report${date ? `?date=${date}` : ''}`),
    /** The deep, fully-linked report behind the Daily Digest module. */
    detail: (date?: string) => req<DigestDetail>(`/daily-digest/detail${date ? `?date=${date}` : ''}`),
    getSchedule: () => req<{ hourIst: number }>('/daily-digest/schedule'),
    setSchedule: (hourIst: number) => req<{ hourIst: number }>('/daily-digest/schedule', { method: 'PATCH', body: JSON.stringify({ hourIst }) }),
    /** `admins` = how many qualify to receive it at all — lets the UI explain a zero. */
    send: () => req<{ sent: number; admins: number; alreadySentToday: number }>('/daily-digest/send', { method: 'POST' }),
  },

  company: {
    announcements: () => req<Announcement[]>('/company/announcements'),
    createAnnouncement: (data: { title: string; body: string; pinned?: boolean }) =>
      req<Announcement>('/company/announcements', { method: 'POST', body: JSON.stringify(data) }),
    updateAnnouncement: (id: string, data: { title: string; body: string; pinned?: boolean }) =>
      req<Announcement>(`/company/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    pinAnnouncement: (id: string) => req<Announcement>(`/company/announcements/${id}/pin`, { method: 'POST' }),
    deleteAnnouncement: (id: string) => req<void>(`/company/announcements/${id}`, { method: 'DELETE' }),
    celebrations: (days?: number) => req<Celebrations>(`/company/celebrations${days ? `?days=${days}` : ''}`),
    directory: () => req<DirectoryEntry[]>('/company/directory'),
    orgChart: () => req<{ people: OrgChartPerson[] }>('/company/org-chart'),
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
    /** `scores` is what actually counts — the headline rating is their weighted mean. */
    submitSelf: (id: string, data: {
      selfRating?: number; selfComments?: string;
      scores?: { parameterId: string; score?: number; comment?: string }[];
    }) => req<Appraisal>(`/appraisals/${id}/submit-self`, { method: 'POST', body: JSON.stringify(data) }),
    submitManager: (id: string, data: {
      managerRating?: number; overallRating?: number; managerComments?: string;
      scores?: { parameterId: string; score?: number; comment?: string }[];
      /** Books the review call as a real calendar event for both parties. */
      reviewCallAt?: string;
    }) => req<Appraisal>(`/appraisals/${id}/submit-manager`, { method: 'POST', body: JSON.stringify(data) }),
    /** Book or move the review call on its own. Reviewer or HR. */
    scheduleReviewCall: (id: string, reviewCallAt: string) =>
      req<Appraisal>(`/appraisals/${id}/review-call`, { method: 'POST', body: JSON.stringify({ reviewCallAt }) }),
    /** Every completed review for a person, plus a figure per financial year. */
    history: (userId: string) => req<AppraisalHistory>(`/appraisals/history/${userId}`),

    // Performance sheet — the document the review is actually held over.
    uploadSheet: (id: string, file: File) => {
      const form = new FormData(); form.append('file', file);
      return uploadReq<Appraisal>(`/appraisals/${id}/sheet`, form);
    },
    downloadSheet: (id: string) => blobReq(`/appraisals/${id}/sheet/content`),
    removeSheet: (id: string) => req<Appraisal>(`/appraisals/${id}/sheet`, { method: 'DELETE' }),

    // Rating parameters (HR) — different per team and per position.
    parameters: () => req<AppraisalParameter[]>('/appraisals/parameters'),
    parametersFor: (userId: string) => req<AppraisalParameter[]>(`/appraisals/parameters/for/${userId}`),
    createParameter: (data: {
      name: string; description?: string; teamId?: string | null; designation?: string | null;
      weight?: number; sequence?: number; active?: boolean;
    }) => req<AppraisalParameter>('/appraisals/parameters', { method: 'POST', body: JSON.stringify(data) }),
    updateParameter: (id: string, data: Record<string, unknown>) =>
      req<AppraisalParameter>(`/appraisals/parameters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    removeParameter: (id: string) => req<{ ok: boolean }>(`/appraisals/parameters/${id}`, { method: 'DELETE' }),
    acknowledge: (id: string) => req<Appraisal>(`/appraisals/${id}/acknowledge`, { method: 'POST' }),
    // cycles (HR)
    cycles: () => req<AppraisalCycle[]>('/appraisals/cycles'),
    getCycle: (id: string) => req<AppraisalCycle>(`/appraisals/cycles/${id}`),
    createCycle: (data: { name: string; periodStart?: string; periodEnd?: string; dueDate?: string; cycleType?: string; fyLabel?: string }) =>
      req<AppraisalCycle>('/appraisals/cycles', { method: 'POST', body: JSON.stringify(data) }),
    updateCycle: (id: string, data: { name: string; periodStart?: string; periodEnd?: string; dueDate?: string; cycleType?: string; fyLabel?: string }) =>
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
    create: (data: { name: string; description?: string }) =>
      req<DepartmentSummary>('/departments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      req<DepartmentSummary>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => req<{ ok: boolean }>(`/departments/${id}`, { method: 'DELETE' }),
    members: (id: string) => req<{ userId: string; roleInDepartment?: string | null; user: UserSummary }[]>(`/departments/${id}/members`),
    addMember: (id: string, userId: string, roleInDepartment?: string) =>
      req<DepartmentMemberEntry>(`/departments/${id}/members`, { method: 'POST', body: JSON.stringify({ userId, roleInDepartment }) }),
    updateMember: (id: string, userId: string, roleInDepartment?: string) =>
      req<DepartmentMemberEntry>(`/departments/${id}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ userId, roleInDepartment }) }),
    removeMember: (id: string, userId: string) =>
      req<{ ok: boolean; headCleared: boolean }>(`/departments/${id}/members/${userId}`, { method: 'DELETE' }),
    /** Pass null to clear. The head must already be a member — the server refuses otherwise. */
    setHead: (id: string, userId: string | null) =>
      req<DepartmentSummary>(`/departments/${id}/head`, { method: 'PATCH', body: JSON.stringify({ userId }) }),
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
    /** `workMode: 'WFH'` records the day as work-from-home without a prior request. */
    punch: (coords: { lat: number; lng: number; accuracy?: number; area?: string; workMode?: 'WFH' | 'OFFICE' }) =>
      req<Attendance>('/attendance/punch', { method: 'POST', body: JSON.stringify(coords) }),
    // WFH requests: raised from the Leaves tab, reviewed by HR/Admin (attendance.manage).
    requestWfh: (data: { startDate: string; endDate: string; reason: string }) =>
      req<WfhRequestItem>('/attendance/wfh', { method: 'POST', body: JSON.stringify(data) }),
    myWfhRequests: () => req<WfhRequestItem[]>('/attendance/wfh/me'),
    /** Who is working from home vs the office — today plus the preceding days. HR/Admin only. */
    orgWorkModes: (days = 7) => req<OrgWorkModes>(`/attendance/org/work-modes?days=${days}`),
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
    /** Every member's punch-in/out location for a day (default today). HR/Admin only. */
    orgPunchLocations: (date?: string) =>
      req<OrgPunchLocations>(`/attendance/org/punch-locations${date ? `?date=${date}` : ''}`),
    orgReport: (from: string, to: string) =>
      req<OrgAttendanceReport>(`/attendance/org/report?from=${from}&to=${to}`),

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
    create: (data: {
      leaveType: string; startDate: string; endDate: string; reason?: string;
      dayType?: 'FULL' | 'HALF'; halfPeriod?: 'FIRST' | 'SECOND';
      alternateEmployeeId?: string | null; alternateNumber?: string; alternateAddress?: string;
      supportingDocId?: string | null;
      /** Pencil it in for later instead of submitting it — shows on the Leave Planner. */
      plan?: boolean;
    }) =>
      req<LeaveRequestItem>('/leave/requests', { method: 'POST', body: JSON.stringify(data) }),
    /** Turn a planned leave into a real application (re-checks balance and clashes). */
    submitPlan: (id: string) => req<LeaveRequestItem>(`/leave/requests/${id}/submit`, { method: 'POST' }),
    approve: (id: string, note?: string) => req<LeaveRequestItem>(`/leave/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
    reject: (id: string, note?: string) => req<LeaveRequestItem>(`/leave/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    cancel: (id: string) => req<LeaveRequestItem>(`/leave/requests/${id}/cancel`, { method: 'POST' }),
    balances: () => req<LeaveBalance[]>('/leave/balance/me'),
    // Comp-off: worked a non-working day → claim → HR approves → CO leave credit.
    requestCompOff: (data: { workDate: string; reason: string; hoursWorked?: number; projectRef?: string; dayType?: 'FULL' | 'HALF' }) =>
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
