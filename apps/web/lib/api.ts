// Typed API client for the pdash NestJS backend.
// Base URL is configurable via NEXT_PUBLIC_API_URL (defaults to localhost:4000).

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message ?? message; } catch { /* swallow */ }
    throw new Error(message);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgSummary = { id: string; name: string; code: string; status: string };

export type UserSummary = {
  id: string; firstName: string; lastName: string; email: string;
  designation?: string; status: string; profilePhoto?: string;
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
  createdAt: string; updatedAt: string;
  currentStatus?: WorkflowStatus;
  members?: { userId: string; projectRole?: string; isActive: boolean; user: UserSummary }[];
  taskLists?: { id: string; name: string; isDefault: boolean; sequence: number }[];
  _count?: { members: number; projectTasks: number };
};

export type ApiComment = {
  id: string; entityType: string; entityId: string;
  userId: string; content: string; createdAt: string;
  user?: UserSummary;
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

export type DashboardStats = {
  totalProjects: number; activeProjects: number; avgCompletion: number;
  totalTasks: number; overdueCount: number; tasksDueToday: number;
  hoursLoggedThisWeek: number;
};

// ─── API Methods ──────────────────────────────────────────────────────────────

export const api = {
  orgs: {
    list: () => req<OrgSummary[]>('/organizations'),
  },

  users: {
    list: (orgId: string) => req<UserSummary[]>(`/users?organizationId=${encodeURIComponent(orgId)}`),
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
    approve: (id: string, actorId: string) =>
      req<void>(`/projects/${id}/approve`, { method: 'POST', body: JSON.stringify({ actorId }) }),
    reject: (id: string, actorId: string) =>
      req<void>(`/projects/${id}/reject`, { method: 'POST', body: JSON.stringify({ actorId }) }),
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
    create: (data: { organizationId: string; name: string; description?: string; type?: string; createdBy: string }) =>
      req<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      req<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/channels/${id}`, { method: 'DELETE' }),
    messages: (channelId: string, limit?: number) =>
      req<Message[]>(`/channels/${channelId}/messages${limit ? `?limit=${limit}` : ''}`),
    sendMessage: (channelId: string, data: { userId: string; content: string }) =>
      req<Message>(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
    deleteMessage: (channelId: string, messageId: string) =>
      req<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
    join: (channelId: string, userId: string) =>
      req<void>(`/channels/${channelId}/join`, { method: 'POST', body: JSON.stringify({ userId }) }),
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
};
