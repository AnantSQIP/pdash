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
  // The task's own lifecycle, recorded as its own events rather than left to be inferred from
  // task.status_changed. Who finished a piece of work, who reopened it and who was clocked on
  // it are questions asked directly — of a person, on a date — and answering them by replaying
  // every status change and resolving each status id to a type is not an answer that survives a
  // workflow being edited afterwards. These four name the act itself.
  TASK_STARTED: 'task.started',
  TASK_PAUSED: 'task.paused',
  TASK_FINISHED: 'task.finished',
  TASK_REOPENED: 'task.reopened',
  // A task (or a whole task group) marked billable / non-billable. The metadata says from → to and
  // how many existing timesheet entries were re-marked to match.
  TASK_BILLABLE_CHANGED: 'task.billable_changed',
  TASKGROUP_BILLABLE_CHANGED: 'taskgroup.billable_changed',
  SUBTASK_CREATED: 'subtask.created',
  SUBTASK_UPDATED: 'subtask.updated',
  SUBTASK_CLOSED: 'subtask.closed',
  SUBTASK_REOPENED: 'subtask.reopened',
  SUBTASK_DELETED: 'subtask.deleted',
  // Projects
  PROJECT_CREATED: 'project.created',
  PROJECT_MEMBER_ADDED: 'project.member_added',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_APPROVED: 'project.approved',
  PROJECT_REJECTED: 'project.rejected',
  PROJECT_COMPLETED: 'project.completed',
  PROJECT_CLOSED: 'project.closed',
  PROJECT_REOPENED: 'project.reopened',
  PROJECT_DELETED: 'project.deleted',
  // A client changing its CID — reassigned to a fresh number, split out onto its own, or merged
  // under another client's. Its own event rather than a project.updated, because the CID is the
  // identifier the firm files work under: "which number was this matter under in March" is a
  // question asked of the audit log directly. The metadata carries both numbers and every round the
  // move renumbered. (The CID ledger, cid_event, records the same move with its own snapshot.)
  PROJECT_CID_MOVED: 'project.cid_moved',
  // The same event under its pre-CID name. No longer written; kept so feeds can still label the
  // rows written before the rename.
  PROJECT_PID_MOVED: 'project.pid_moved',
  // CLIENTS-FLOW. A task group is one piece of work for a client; creating, finishing and deleting
  // one are facts the client's activity feed must show, and none of them is a project.updated.
  // Every one carries metadata.projectId (the client), or the feed writes it and shows nobody.
  TASKGROUP_CREATED: 'taskgroup.created',
  TASKGROUP_UPDATED: 'taskgroup.updated',
  TASKGROUP_COMPLETED: 'taskgroup.completed',
  TASKGROUP_REOPENED: 'taskgroup.reopened',
  TASKGROUP_DELETED: 'taskgroup.deleted',
  TASK_MOVED: 'task.moved',
  CLIENT_GROUP_CREATED: 'clientgroup.created',
  CLIENT_GROUP_UPDATED: 'clientgroup.updated',
  CLIENT_GROUP_ARCHIVED: 'clientgroup.archived',
  PROJECT_CLIENT_GROUP_CHANGED: 'project.client_group_changed',
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
