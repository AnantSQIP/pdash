'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Flag, Calendar, MessageCircle, Lock,
  Clock, Plus, RefreshCw, ChevronDown, Loader, Check, Search, UserPlus, Trash2, Pencil,
} from 'lucide-react';
import clsx from 'clsx';
import { api, type ApiTask, type ApiComment, type WorkflowStatus, type ActivityItem } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { userInitials } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { useToast } from '@/components/ui/Toast';
import { isTaskClosed, taskAssigneeIds, taskAssigneeUsers, OPEN_TYPE, CLOSED_TYPE } from '@/lib/tasks';
import { formatDate, toUtcDay, isPastDue, formatDateTimeIST } from '@/lib/date';
import { AttachButton, AttachmentList, PendingAttachmentChips, useAttachmentUploads } from '@/components/files/Attachments';
import { TaskStaffing } from './TaskStaffing';

// 'staffing' replaces the old 'assignees' tab. 'subtasks' | 'comments' | 'activity' remain in the
// type (their code below is preserved) but are hidden from the tab bar per the new task flow.
type PanelTab = 'details' | 'staffing' | 'assignees' | 'subtasks' | 'comments' | 'activity';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const planInput =
  'w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-400';

/** The task's plan as form values. `<input type="date">` wants YYYY-MM-DD, not an ISO instant. */
function planOf(t: ApiTask) {
  const day = (v?: string | null) => (v ? toUtcDay(v) : '');
  return {
    priority: t.priority ?? 'MEDIUM',
    startDate: day(t.startDate),
    dueDate: day(t.dueDate),
    estimatedHours: t.estimatedHours != null ? String(t.estimatedHours) : '',
  };
}

function Field({ label, hint, restricted, children }: {
  label: string; hint?: string; restricted?: boolean; children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {/* The hint line is ALWAYS rendered (blank when absent) so every field's label block
          is the same height — otherwise inputs in a 2-column row don't line up. */}
      <div className={clsx('mb-1', restricted ? 'text-amber-600' : 'text-gray-400')}>
        <label className="text-xs uppercase tracking-wide flex items-center gap-1">
          {restricted && <Lock size={9} />}{label}
        </label>
        <p className="text-[10px] leading-tight text-gray-300 truncate">{hint || ' '}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

const PRIORITY_FLAG_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-amber-600',
  LOW: 'text-gray-400',
};

// Real activity feed rendering (replaces the previously fabricated timeline).
const ACTIVITY_META: Record<string, { icon: ReactNode; color: string; verb: string }> = {
  'task.created':        { icon: <Plus size={13} />,      color: 'bg-green-100 text-green-600',  verb: 'created this task' },
  'task.updated':        { icon: <RefreshCw size={13} />, color: 'bg-blue-100 text-blue-600',    verb: 'updated this task' },
  'task.status_changed': { icon: <RefreshCw size={13} />, color: 'bg-orange-100 text-orange-600', verb: 'changed the status' },
  'task.assigned':       { icon: <UserPlus size={13} />,  color: 'bg-brand-100 text-brand-600',  verb: 'updated assignees' },
  'task.deleted':        { icon: <Trash2 size={13} />,    color: 'bg-red-100 text-red-600',      verb: 'deleted this task' },
  'comment.created':     { icon: <MessageCircle size={13} />, color: 'bg-purple-100 text-purple-600', verb: 'commented' },
};
function activityMeta(action: string) {
  return ACTIVITY_META[action] ?? { icon: <RefreshCw size={13} />, color: 'bg-gray-100 text-gray-500', verb: action.replace(/[._]/g, ' ') };
}

interface TaskDetailPanelProps {
  task: ApiTask | null;
  projectId: string;
  /** True when the parent matter is COMPLETED/CLOSED — its tasks are read-only (server 403s
   *  on any write). The panel greys out its edit controls instead of failing on click. */
  projectClosed?: boolean;
  /** The project's manager — pre-fills a task's PM so every task inherits the project PM. */
  defaultManagerId?: string | null;
  onClose: () => void;
  onUpdated?: (task: ApiTask) => void;
  onDeleted?: () => void;
}

export function TaskDetailPanel({ task, projectId, projectClosed, defaultManagerId, onClose, onUpdated, onDeleted }: TaskDetailPanelProps) {
  if (!task) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <TaskDetailPanelInner
        task={task}
        projectId={projectId}
        projectClosed={projectClosed}
        defaultManagerId={defaultManagerId}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
      />
    </>
  );
}

function TaskDetailPanelInner({
  task, projectId, projectClosed, defaultManagerId, onClose, onUpdated, onDeleted,
}: {
  task: ApiTask;
  projectId: string;
  projectClosed?: boolean;
  defaultManagerId?: string | null;
  onClose: () => void;
  onUpdated?: (task: ApiTask) => void;
  onDeleted?: () => void;
}) {
  const { currentUser, users } = useOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [panelTab, setPanelTab] = useState<PanelTab>('details');
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState(task.description ?? '');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(taskAssigneeIds(task));
  const [savingAssignees, setSavingAssignees] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [progress, setProgress] = useState(task.completionPercentage);
  const [newSub, setNewSub] = useState('');
  const [editingSub, setEditingSub] = useState<{ id: string; title: string } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  // The task's PLAN. These were display-only, which froze a task's schedule at creation:
  // a manager could be told a task was overdue and have no way to reschedule it, and the
  // capacity board — which is driven entirely by estimatedHours + these dates — could
  // never be corrected.
  const [plan, setPlan] = useState(() => planOf(task));
  const [savingPlan, setSavingPlan] = useState(false);
  const commentFiles = useAttachmentUploads();

  const panelRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);                 // an assignee PUT is in flight
  const dirtyRef = useRef<string[] | null>(null);  // latest unsaved assignee ids (coalesced)
  const addingSubRef = useRef(false);              // a subtask POST is in flight (dupe guard)
  const deletingRef = useRef(false);               // a delete is in flight (dupe guard)
  const mountedRef = useRef(true);
  const currentTaskId = useRef(task.id);
  currentTaskId.current = task.id;                 // always the task currently shown

  // Sync when task identity changes (different task selected)
  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description ?? '');
    setEditingTitle(false);
    setEditDesc(false);
    setShowStatusMenu(false);
    setPanelTab('details');
    setAssigneeSearch('');
    setProgress(task.completionPercentage);
    setAssigneeIds(taskAssigneeIds(task));
    setNewComment('');
    setPlan(planOf(task));
    commentFiles.clear(); // discard staged attachments from the previously-shown task
    dirtyRef.current = null; // discard any queued edits from the previously-shown task
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  // Dialog a11y: focus the panel on open, close on Escape, flush any pending
  // assignee save on unmount so a quick edit-then-close still persists.
  useEffect(() => {
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Workflow statuses. If this fails, the status menu + "Mark Complete" have no data to work
  // with — surface it (statusesError) rather than silently offering a broken control.
  const { data: statuses = [], isError: statusesError } = useQuery<WorkflowStatus[]>({
    queryKey: ['workflow-statuses', task.workflowId ?? 'default'],
    queryFn: () => api.workflows.statuses(task.workflowId ?? 'default'),
    staleTime: 5 * 60 * 1000,
  });

  // Subtasks (live from API)
  const { data: subtasks = [], refetch: refetchSubtasks, isLoading: subtasksLoading, isError: subtasksError } = useQuery({
    queryKey: ['subtasks', task.id],
    queryFn: () => api.tasks.listSubtasks(task.id),
  });

  // Comments (live from API)
  const { data: comments = [], refetch: refetchComments, isLoading: commentsLoading, isError: commentsError } = useQuery<ApiComment[]>({
    queryKey: ['comments', 'task', task.id],
    queryFn: () => api.comments.list('task', task.id),
  });

  // Real activity for this task (only fetched when the Activity tab is open)
  const { data: activity = [], isLoading: activityLoading, isError: activityError } = useQuery<ActivityItem[]>({
    queryKey: ['activity', 'TASK', task.id],
    queryFn: () => api.activity.list({ entityType: 'TASK', entityId: task.id, limit: 50 }),
    enabled: panelTab === 'activity',
    staleTime: 15_000,
  });

  // ── Derived values ───────────────────────────────────────────────────────────

  const currentStatus = task.currentStatus;
  const closed = isTaskClosed(task);
  // A task inside a COMPLETED/CLOSED matter is read-only server-side (every write 403s).
  // Grey the controls out rather than letting each click fail with a generic error toast.
  const readOnly = !!projectClosed;
  const canAssign = can('task.assign');
  const canDelete = can('task.delete');
  const statusName = currentStatus?.name ?? 'Open';
  const statusColor = currentStatus?.colorHex ?? '#64748b';
  const flagColor = PRIORITY_FLAG_COLOR[task.priority] ?? 'text-gray-400';
  const priorityLabel = task.priority
    ? task.priority.charAt(0) + task.priority.slice(1).toLowerCase()
    : '—';
  const formattedDue = formatDate(task.dueDate, { month: 'short', day: 'numeric', year: 'numeric' });

  const assigneeUsers = assigneeIds
    .map(id => users.find(u => u.id === id))
    .filter(Boolean) as typeof users;
  // Fall back to the task's embedded assignee snapshot if the org list hasn't loaded.
  const stackUsers = assigneeUsers.length ? assigneeUsers : taskAssigneeUsers(task);

  const subDone = subtasks.filter(s => s.status === CLOSED_TYPE).length;
  const subPercent = subtasks.length > 0 ? (subDone / subtasks.length) * 100 : 0;

  const filteredUsers = users.filter(u => {
    if (!assigneeSearch.trim()) return true;
    const q = assigneeSearch.toLowerCase();
    return `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q);
  });

  // ── API handlers ─────────────────────────────────────────────────────────────

  // Only propagate a save's result to the parent if THIS task is still the one shown. A
  // save that returns AFTER the user closed or switched the panel must not call onUpdated —
  // the parent's setSelectedTask(updated) would re-open the panel the user just closed. Only
  // flushAssignees was guarded before; every other on-blur/auto-save path shared the bug.
  function emitUpdated(forTaskId: string, updated: ApiTask) {
    if (mountedRef.current && currentTaskId.current === forTaskId) onUpdated?.(updated);
  }

  async function saveTitle() {
    const trimmed = title.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === task.title) { setTitle(task.title); return; }
    const forId = task.id;
    try {
      const updated = await api.tasks.update(forId, { title: trimmed });
      emitUpdated(forId, updated);
    } catch (e) { setTitle(task.title); toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function saveDesc() {
    setEditDesc(false);
    if (desc === (task.description ?? '')) return;
    const forId = task.id;
    try {
      const updated = await api.tasks.update(forId, { description: desc });
      emitUpdated(forId, updated);
    } catch (e) { setDesc(task.description ?? ''); toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function changeStatus(statusId: string) {
    setShowStatusMenu(false);
    if (statusId === task.currentWorkflowStatusId) return;
    const forId = task.id;
    try {
      const updated = await api.tasks.setStatus(forId, statusId);
      if (mountedRef.current && currentTaskId.current === forId) setProgress(updated.completionPercentage);
      emitUpdated(forId, updated);
      refetchSubtasks(); // moving to a CLOSED status closes subtasks server-side
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  // Toggle completion via the workflow (single source of truth = status), so every
  // view agrees. Reopening moves back to the first OPEN status.
  async function toggleComplete() {
    // Don't misreport a failed statuses load as "no closed status configured".
    if (statusesError || statuses.length === 0) {
      toast('Couldn’t load the workflow statuses — please try again.', 'error');
      return;
    }
    const target = closed
      ? statuses.find(s => s.type === OPEN_TYPE)
      : statuses.find(s => s.type === CLOSED_TYPE);
    if (!target) {
      toast(closed ? 'No open status configured for this workflow' : 'No closed status configured for this workflow', 'error');
      return;
    }
    await changeStatus(target.id);
  }


  /**
   * Persist one field of the plan. An emptied date is sent as `null`, which CLEARS it —
   * omitting the field would leave the old value in place.
   *
   * Moving the deadline forward re-arms the overdue alert, server-side.
   */
  async function savePlan(patch: Partial<Pick<ApiTask, 'priority' | 'startDate' | 'dueDate' | 'estimatedHours'>>) {
    const forId = task.id;
    setSavingPlan(true);
    try {
      const updated = await api.tasks.update(forId, patch);
      emitUpdated(forId, updated);
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['capacity'] }); // the board is computed from these
    } catch (e) {
      setPlan(planOf(task)); // snap back to what the server still believes
      toast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      if (mountedRef.current && currentTaskId.current === forId) setSavingPlan(false);
    }
  }

  async function toggleSubtask(subtaskId: string, subtaskStatus: string) {
    // Toggle both ways — a subtask ticked off by mistake can be reopened.
    const done = subtaskStatus === CLOSED_TYPE;
    try {
      await (done ? api.tasks.reopenSubtask(task.id, subtaskId) : api.tasks.closeSubtask(task.id, subtaskId));
      refetchSubtasks();
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function addSubtask() {
    const t = newSub.trim();
    if (!t || addingSubRef.current) return; // guard held-Enter / double-fire → duplicate subtasks
    addingSubRef.current = true;
    setNewSub(''); // clear immediately so a second Enter has nothing to resubmit
    try {
      await api.tasks.createSubtask(task.id, { title: t });
      refetchSubtasks();
    } catch (e) {
      setNewSub(t); // restore the text so the edit isn't lost on failure
      toast(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally { addingSubRef.current = false; }
  }

  async function deleteSubtask(subtaskId: string) {
    if (!window.confirm('Delete this subtask?')) return;
    try {
      await api.tasks.deleteSubtask(task.id, subtaskId);
      refetchSubtasks();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not delete the subtask', 'error'); }
  }

  async function renameSubtask(subtaskId: string, title: string) {
    const t = title.trim();
    setEditingSub(null);
    if (!t) return;
    try {
      await api.tasks.updateSubtask(task.id, subtaskId, { title: t });
      refetchSubtasks();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not rename the subtask', 'error'); }
  }

  async function postComment() {
    const text = newComment.trim();
    const hasFiles = commentFiles.documentIds.length > 0;
    if ((!text && !hasFiles) || commentFiles.uploading || !currentUser || posting) return; // held-Enter dupe guard
    setPosting(true);
    try {
      await api.comments.create({
        entityType: 'task', entityId: task.id, userId: currentUser.id, content: text,
        documentIds: hasFiles ? commentFiles.documentIds : undefined,
      });
      setNewComment('');
      commentFiles.clear();
      refetchComments();
      // Task attachments also surface in the project's Files tab.
      qc.invalidateQueries({ queryKey: ['project-documents', projectId] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to post comment', 'error');
    } finally { setPosting(false); }
  }

  async function deleteTask() {
    if (deletingRef.current) return; // a double-click used to fire a second delete → spurious 404
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    deletingRef.current = true;
    try {
      await api.tasks.delete(task.id);
      onDeleted?.();
    } catch (e) {
      deletingRef.current = false; // only re-arm on failure; success unmounts the panel
      toast(e instanceof Error ? e.message : 'Action failed', 'error');
    }
  }

  // ── Assignees: optimistic UI, debounced single PUT (no per-click churn) ────────

  // Persist with at most ONE request in flight; rapid toggles coalesce into the next
  // flush. Fixes the per-click PUT churn, global disable, and out-of-order races of
  // the old code — every change still persists, in order, with no lost edit.
  async function flushAssignees() {
    if (savingRef.current || dirtyRef.current == null) return;
    const ids = dirtyRef.current;
    dirtyRef.current = null;
    const savingTaskId = task.id;
    savingRef.current = true;
    setSavingAssignees(true);
    try {
      const updated = await api.tasks.setAssignees(savingTaskId, ids);
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      if (mountedRef.current && currentTaskId.current === savingTaskId) onUpdated?.(updated);
    } catch (e) {
      if (mountedRef.current && currentTaskId.current === savingTaskId) setAssigneeIds(taskAssigneeIds(task));
      toast(e instanceof Error ? e.message : 'Failed to update assignees', 'error');
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSavingAssignees(false);
      if (dirtyRef.current != null) void flushAssignees(); // drain edits queued mid-request
    }
  }

  function commitAssignees(ids: string[]) {
    setAssigneeIds(ids);        // optimistic
    dirtyRef.current = ids;
    void flushAssignees();
  }

  const toggleAssignee = (userId: string) =>
    commitAssignees(assigneeIds.includes(userId) ? assigneeIds.filter(x => x !== userId) : [...assigneeIds, userId]);


  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Task: ${title}`}
      tabIndex={-1}
      className="fixed inset-0 bg-white z-50 flex flex-col focus:outline-none"
    >

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 px-4 sm:px-6 py-4">
        {/* Row 1: status pill + actions */}
        <div className="flex items-center justify-between">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(prev => !prev)}
              disabled={readOnly}
              aria-haspopup="menu"
              aria-expanded={showStatusMenu}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
              {statusName}
              <ChevronDown size={11} />
            </button>

            {showStatusMenu && statuses.length === 0 && (
              <div role="menu" className="absolute top-full left-0 mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-30 py-2 px-3 text-xs text-gray-500">
                {statusesError ? 'Couldn’t load statuses.' : 'No statuses configured.'}
              </div>
            )}
            {showStatusMenu && statuses.length > 0 && (
              // z-30 so it sits above the sticky tab bar below it (which is z-10) — otherwise
              // the menu is painted UNDER the tabs and reads as "disappearing behind them".
              <div role="menu" className="absolute top-full left-0 mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-30 overflow-hidden py-1">
                {statuses.map(s => (
                  <button
                    key={s.id}
                    role="menuitem"
                    onClick={() => changeStatus(s.id)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors',
                      s.id === task.currentWorkflowStatusId && 'bg-brand-50 text-brand-700',
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.colorHex }} />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Row 2: editable title */}
        <div className="mt-2">
          {editingTitle ? (
            <input
              autoFocus
              className="w-full text-xl font-bold text-gray-900 border border-blue-300 rounded-md px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(task.title); setEditingTitle(false); } }}
            />
          ) : (
            <h2
              className={clsx(
                'text-xl font-bold text-gray-900 rounded-md px-2 py-0.5 -mx-2 transition-colors',
                readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50',
              )}
              onClick={() => { if (!readOnly) setEditingTitle(true); }}
              title={readOnly ? undefined : 'Click to edit'}
            >
              {title}
            </h2>
          )}
        </div>

        {/* Row 3: meta row */}
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <div className={clsx('flex items-center gap-1 text-sm font-medium', flagColor)}>
            <Flag size={13} />
            {priorityLabel}
          </div>
          {/* Assignees are shown here and edited in the Staffing section on this same page. */}
          <div className="flex items-center gap-1.5 px-1 py-0.5" title="Staffing">
            {stackUsers.length > 0
              ? <AvatarStack users={stackUsers} size={24} />
              : <span className="text-sm text-gray-400 italic">Unassigned</span>}
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-500" title="Deadline">
            <Calendar size={13} />
            {formattedDue}
          </div>
          {task.estimatedHours && (
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Clock size={13} />
              {task.estimatedHours}h est.
            </div>
          )}
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Single page — Details + Staffing together, no tabs. Centered, two columns so the
            inputs don't stretch across the whole screen and the space isn't left half-empty. */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {readOnly && (
            <div className="mb-6 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Lock size={12} className="shrink-0" />
              This project is completed or closed. Its tasks are read-only — reopen the project to make changes.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">

            {/* ── Left / main: Description + Staffing ───────────────── */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</p>
                {editDesc ? (
                  <textarea
                    autoFocus rows={4}
                    className="w-full text-sm border border-brand-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none"
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    onBlur={saveDesc}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDesc(); } if (e.key === 'Escape') { setDesc(task.description ?? ''); setEditDesc(false); } }}
                  />
                ) : (
                  <div
                    className={clsx(
                      'min-h-[60px] text-sm rounded-lg p-3 border border-dashed border-transparent transition-colors',
                      readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50 hover:border-gray-200',
                    )}
                    onClick={() => { if (!readOnly) setEditDesc(true); }}
                  >
                    {desc
                      ? <span className="text-gray-700 whitespace-pre-wrap">{desc}</span>
                      : <span className="italic text-gray-400">{readOnly ? 'No description.' : 'Click to add description...'}</span>}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Staffing</p>
                <TaskStaffing task={task} readOnly={readOnly} canAssign={canAssign} defaultManagerId={defaultManagerId} onSaved={u => emitUpdated(task.id, u)} />
              </div>

              {/* ── Subtasks: break the task into steps (Project → Task → Subtask) ─────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Subtasks</p>
                  {subtasks.length > 0 && (
                    <div className="flex items-center gap-2 w-40">
                      <span className="text-[11px] text-gray-500 shrink-0">{subDone}/{subtasks.length}</span>
                      <div className="flex-1 h-1 bg-gray-200 rounded overflow-hidden">
                        <div className="h-full bg-brand-600 rounded transition-all" style={{ width: `${subPercent}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {subtasksError ? (
                  <div className="text-sm text-gray-500 py-3">
                    <span className="text-red-500">Couldn’t load subtasks.</span>
                    <button onClick={() => refetchSubtasks()} className="ml-2 text-brand-600 hover:underline">Retry</button>
                  </div>
                ) : subtasksLoading ? (
                  <p className="text-sm text-gray-400 py-3 flex items-center gap-2"><Loader size={14} className="animate-spin" /> Loading subtasks…</p>
                ) : subtasks.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No subtasks yet. Break this task into steps below.</p>
                ) : (
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {subtasks.map(s => {
                      const done = s.status === CLOSED_TYPE;
                      const isEditing = editingSub?.id === s.id;
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5">
                          <button
                            onClick={() => toggleSubtask(s.id, s.status)}
                            disabled={readOnly}
                            role="checkbox" aria-checked={done}
                            aria-label={done ? `Reopen ${s.title}` : `Mark ${s.title} done`}
                            title={done ? 'Completed — click to reopen' : 'Mark done'}
                            className={clsx(
                              'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                              readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                              done ? 'bg-green-500 border-green-500 hover:bg-green-600' : 'border-gray-300 hover:border-green-400',
                            )}
                          >
                            {done && (
                              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          {isEditing ? (
                            <input
                              autoFocus
                              className="flex-1 text-sm border border-brand-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400"
                              value={editingSub!.title}
                              onChange={e => setEditingSub({ id: s.id, title: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') renameSubtask(s.id, editingSub!.title); if (e.key === 'Escape') setEditingSub(null); }}
                              onBlur={() => renameSubtask(s.id, editingSub!.title)}
                            />
                          ) : (
                            <span className={clsx('text-sm flex-1', done ? 'line-through text-gray-400' : 'text-gray-700')}>{s.title}</span>
                          )}
                          {s.assignees?.[0] && !isEditing && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 rounded-full py-0.5 shrink-0">
                              {userInitials(s.assignees[0].user)}
                            </span>
                          )}
                          {!closed && !readOnly && !isEditing && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={() => setEditingSub({ id: s.id, title: s.title })} title="Rename subtask"
                                className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Pencil size={13} /></button>
                              <button onClick={() => deleteSubtask(s.id)} title="Delete subtask"
                                className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!closed && !readOnly && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <input
                      className="flex-1 text-sm border border-dashed border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
                      placeholder="Add a subtask..."
                      value={newSub}
                      onChange={e => setNewSub(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addSubtask(); }}
                    />
                    <button onClick={addSubtask} disabled={!newSub.trim()}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 shrink-0">
                      <Plus size={14} /> Add
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right / sidebar: the task's details ───────────────── */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</p>
                {savingPlan && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader size={11} className="animate-spin" /> saving</span>}
              </div>

              <Field label="Priority">
                <select
                  value={plan.priority} disabled={readOnly}
                  onChange={e => { const priority = e.target.value; setPlan(p => ({ ...p, priority })); savePlan({ priority }); }}
                  className={clsx(planInput, 'disabled:opacity-60 disabled:cursor-not-allowed')}
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                </select>
              </Field>

              {/* No cross-field min/max — coupling them silently blocks valid picks. Ordering is
                  validated server-side on save. */}
              <Field label="Start Date">
                <input
                  type="date" value={plan.startDate} disabled={readOnly}
                  onChange={e => { const startDate = e.target.value; setPlan(p => ({ ...p, startDate })); savePlan({ startDate: startDate || null }); }}
                  className={clsx(planInput, 'disabled:opacity-60 disabled:cursor-not-allowed')}
                />
              </Field>

              <Field label="Deadline" hint="what the team works to">
                <input
                  type="date" value={plan.dueDate} disabled={readOnly}
                  onChange={e => { const dueDate = e.target.value; setPlan(p => ({ ...p, dueDate })); savePlan({ dueDate: dueDate || null }); }}
                  className={clsx(planInput, 'disabled:opacity-60 disabled:cursor-not-allowed')}
                />
              </Field>

              {/* Estimated hours — auto-summed from the staffing hours (read-only). */}
              <div>
                <div className="mb-1 text-gray-400">
                  <span className="text-xs uppercase tracking-wide">Estimated Hours</span>
                  <p className="text-[10px] leading-tight text-gray-300">auto-summed from staffing</p>
                </div>
                <div className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium">
                  {task.estimatedHours != null ? `${task.estimatedHours}h` : '0h'}
                </div>
              </div>

              {isPastDue(task.dueDate) && !closed && (
                <p className="text-xs text-red-600">Past its deadline — move the date forward to re-arm the overdue alert.</p>
              )}
            </div>

          </div>
        </div>

        {/* ── ASSIGNEES (legacy — hidden; preserved) ─────────────────── */}
        {panelTab === 'assignees' && (
          <div className="px-4 sm:px-6 py-5 space-y-4">
            {/* Assigned by — who delegated the task (distinct from the assignees below). */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Assigned by</p>
              <p className="text-[11px] text-gray-400 mb-2">The person who gave out this task</p>
              {task.assignedBy ? (
                <span className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-sm">
                  <Avatar user={task.assignedBy} size={20} />
                  {task.assignedBy.firstName} {task.assignedBy.lastName}
                </span>
              ) : (
                <p className="text-sm text-gray-400 italic">Not recorded.</p>
              )}
            </div>

            {/* Assigned to — the people who do the work. */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                Assigned to
                {savingAssignees && <span className="normal-case text-gray-300 flex items-center gap-1"><Loader size={11} className="animate-spin" /> saving</span>}
              </p>
              <p className="text-[11px] text-gray-400 mb-2">Who&apos;s doing the work</p>
              {stackUsers.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No one is assigned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assigneeUsers.map(u => (
                    <span key={u.id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-brand-50 text-brand-700 text-sm">
                      <Avatar user={u} size={20} />
                      {u.firstName} {u.lastName}
                      {canAssign && !readOnly && (
                        <button
                          onClick={() => toggleAssignee(u.id)}
                          aria-label={`Remove ${u.firstName} ${u.lastName}`}
                          className="ml-0.5 rounded-full hover:bg-brand-100 p-0.5 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Search + add — only shown to roles that hold task.assign (Employees/HR don't; the
                editor used to render for them and 403 on save) and only while the matter is open. */}
            {canAssign && !readOnly ? (
              <div>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={assigneeSearch}
                    onChange={e => setAssigneeSearch(e.target.value)}
                    placeholder="Search people to assign…"
                    aria-label="Search people to assign"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {filteredUsers.length === 0 && (
                    <p className="text-sm text-gray-400 px-3 py-3 text-center">No people match “{assigneeSearch}”.</p>
                  )}
                  {filteredUsers.map(u => {
                    const on = assigneeIds.includes(u.id);
                    return (
                      <button
                        key={u.id} type="button" role="checkbox" aria-checked={on}
                        onClick={() => toggleAssignee(u.id)}
                        className={clsx('w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                          on ? 'bg-brand-50/60 text-brand-800' : 'hover:bg-gray-50 text-gray-700')}
                      >
                        <Avatar user={u} size={26} />
                        <span className="flex-1 min-w-0 truncate">
                          {u.firstName} {u.lastName}
                          {u.designation && <span className="text-gray-400"> · {u.designation}</span>}
                        </span>
                        <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                          on ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white')}>
                          {on && <Check size={11} className="text-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                {readOnly ? 'This project is completed or closed — assignees can’t be changed.' : 'You don’t have permission to change assignees.'}
              </p>
            )}
          </div>
        )}

        {/* ── SUBTASKS ─────────────────────────────────────────────── */}
        {panelTab === 'subtasks' && (
          <div className="px-4 sm:px-6 py-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500">{subDone}/{subtasks.length} completed</span>
              <div className="flex-1 h-1 bg-gray-200 rounded overflow-hidden">
                <div className="h-full bg-brand-600 rounded transition-all" style={{ width: `${subPercent}%` }} />
              </div>
            </div>

            {/* Distinguish a failed load from a genuinely empty checklist — otherwise an error
                reads as "no subtasks" and a checklist item could be silently re-added. */}
            {subtasksError ? (
              <div className="text-sm text-gray-500 text-center py-6">
                <p className="text-red-500">Couldn’t load subtasks.</p>
                <button onClick={() => refetchSubtasks()} className="mt-2 text-brand-600 hover:underline">Retry</button>
              </div>
            ) : subtasksLoading ? (
              <p className="text-sm text-gray-400 text-center py-6 flex items-center justify-center gap-2">
                <Loader size={14} className="animate-spin" /> Loading subtasks…
              </p>
            ) : subtasks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No subtasks yet. Break this task into steps below.</p>
            ) : (
            <div>
              {subtasks.map(s => {
                const done = s.status === CLOSED_TYPE;
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2.5 border-b last:border-0 group">
                    <button
                      onClick={() => toggleSubtask(s.id, s.status)}
                      disabled={readOnly}
                      role="checkbox" aria-checked={done}
                      aria-label={done ? `Reopen ${s.title}` : `Mark ${s.title} done`}
                      title={done ? 'Completed — click to reopen' : 'Mark done'}
                      className={clsx(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                        done ? 'bg-green-500 border-green-500 hover:bg-green-600' : 'border-gray-300 hover:border-green-400',
                      )}
                    >
                      {done && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span className={clsx('text-sm flex-1', done ? 'line-through text-gray-400' : 'text-gray-700')}>{s.title}</span>
                    {s.assignees?.[0] && (
                      <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 rounded-full py-0.5">
                        {userInitials(s.assignees[0].user)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            )}

            {!closed && !readOnly && (
              <input
                className="mt-3 w-full text-sm border border-dashed border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
                placeholder="Add a subtask... (Enter to save)"
                value={newSub}
                onChange={e => setNewSub(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSubtask(); }}
              />
            )}
          </div>
        )}

        {/* ── COMMENTS ─────────────────────────────────────────────── */}
        {panelTab === 'comments' && (
          <div className="px-4 sm:px-6 py-4">
            <div className="space-y-4 mb-4">
              {/* A failed load must NOT read as "no comments" — that invites a duplicate re-post. */}
              {commentsError ? (
                <div className="text-sm text-gray-500 text-center py-6">
                  <p className="text-red-500">Couldn’t load comments.</p>
                  <button onClick={() => refetchComments()} className="mt-2 text-brand-600 hover:underline">Retry</button>
                </div>
              ) : commentsLoading ? (
                <p className="text-sm text-gray-400 text-center py-6 flex items-center justify-center gap-2">
                  <Loader size={14} className="animate-spin" /> Loading comments…
                </p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No comments yet. Be the first to comment.</p>
              ) : null}
              {comments.map((c) => {
                const name = c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Unknown';
                const timeStr = formatDateTimeIST(c.createdAt);
                return (
                  <div key={c.id} className="flex gap-3">
                    <Avatar user={c.user} size={32} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-800">{name}</span>
                        <span className="text-xs text-gray-400">{timeStr}</span>
                      </div>
                      {c.content && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{c.content}</p>}
                      <AttachmentList attachments={c.attachments} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-4">
              <div className="flex gap-3">
                <Avatar user={currentUser} size={32} className="shrink-0" />
                <div className="flex-1">
                  <textarea
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none"
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                  />
                  {commentFiles.error && <p className="text-xs text-red-600 mt-1">{commentFiles.error}</p>}
                  {commentFiles.pending.length > 0 && (
                    <div className="mt-2"><PendingAttachmentChips items={commentFiles.pending} onRemove={commentFiles.remove} /></div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <AttachButton onPick={commentFiles.add} disabled={posting} />
                    <button
                      disabled={(!newComment.trim() && commentFiles.documentIds.length === 0) || commentFiles.uploading || posting}
                      onClick={postComment}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {posting && <Loader size={12} className="animate-spin" />}
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVITY (real feed) ─────────────────────────────────── */}
        {panelTab === 'activity' && (
          <div className="px-4 sm:px-6 py-4">
            {activityLoading && (
              <p className="text-sm text-gray-400 text-center py-8 flex items-center justify-center gap-2">
                <Loader size={14} className="animate-spin" /> Loading activity…
              </p>
            )}
            {!activityLoading && activityError && (
              <p className="text-sm text-red-500 text-center py-8">Couldn’t load activity.</p>
            )}
            {!activityLoading && !activityError && activity.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No activity recorded yet.</p>
            )}
            {!activityLoading && !activityError && activity.length > 0 && (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                <div className="space-y-0">
                  {activity.map(item => {
                    const meta = activityMeta(item.action);
                    const who = item.actor ? `${item.actor.firstName} ${item.actor.lastName}` : 'Someone';
                    const when = formatDateTimeIST(item.createdAt);
                    return (
                      <div key={item.id} className="flex gap-3 pl-2 pb-4 relative">
                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10', meta.color)}>
                          {meta.icon}
                        </div>
                        <div className="flex-1 pt-1">
                          <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">{who}</span> {meta.verb}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{when}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-gray-100 px-4 sm:px-6 py-3.5 flex items-center gap-2 flex-wrap">
        <button
          onClick={toggleComplete}
          disabled={readOnly}
          title={readOnly ? 'This project is completed or closed — reopen it to make changes' : closed ? 'Click to reopen' : 'Mark this task complete'}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            closed
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'border border-green-400 text-green-600 hover:bg-green-50',
          )}
        >
          <Check size={14} />{closed ? 'Completed' : 'Mark Complete'}
        </button>
        {/* Only roles that actually hold task.delete see Delete — it used to render for everyone
            (Consultant/SRA/Employee/HR) and 403 on click. */}
        {canDelete && (
          <button
            onClick={deleteTask}
            disabled={readOnly}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-gray-400 hidden sm:inline">Changes save automatically</span>
        <button
          onClick={async () => { await flushAssignees(); onClose(); }}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          Save &amp; close
        </button>
      </div>
    </div>
  );
}
