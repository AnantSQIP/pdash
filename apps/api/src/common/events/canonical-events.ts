/**
 * Canonical event/action names emitted via EventService.
 * Format: <resource>.<verb>. Used as AuditLog.action, Activity.action, and
 * AnalyticsEvent.eventType so audit, activity feed, and analytics stay aligned.
 */
export const EVENTS = {
  // Tasks
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_STATUS_CHANGED: 'task.status_changed',
  TASK_DELETED: 'task.deleted',
  TASK_ASSIGNED: 'task.assigned',
  SUBTASK_CREATED: 'subtask.created',
  SUBTASK_CLOSED: 'subtask.closed',
  // Projects
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_APPROVED: 'project.approved',
  PROJECT_REJECTED: 'project.rejected',
  PROJECT_COMPLETED: 'project.completed',
  PROJECT_CLOSED: 'project.closed',
  PROJECT_REOPENED: 'project.reopened',
  PROJECT_DELETED: 'project.deleted',
  // Comments / discussion
  COMMENT_CREATED: 'comment.created',
  COMMENT_DELETED: 'comment.deleted',
  // Issues
  ISSUE_CREATED: 'issue.created',
  ISSUE_UPDATED: 'issue.updated',
  ISSUE_RESOLVED: 'issue.resolved',
  // Timesheets
  TIME_LOGGED: 'timesheet.logged',
  // Documents / attachments
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_DELETED: 'document.deleted',
  // Approvals
  APPROVAL_ACTION: 'approval.action',
  // RBAC
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  PERMISSION_CHANGED: 'permission.changed',
  GROUP_CHANGED: 'group.changed',
} as const;

export type CanonicalEvent = (typeof EVENTS)[keyof typeof EVENTS];

/** The three sinks an event can be written to. */
export type EventSink = 'audit' | 'activity' | 'analytics';
export const ALL_SINKS: EventSink[] = ['audit', 'activity', 'analytics'];
