'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Flag, Calendar, MessageCircle,
  Clock, Plus, RefreshCw, User, ChevronDown, Loader, Check,
} from 'lucide-react';
import clsx from 'clsx';
import { api, type ApiTask, type ApiComment, type WorkflowStatus } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { userInitials } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { useToast } from '@/components/ui/Toast';

type ChecklistItem = { id: string; text: string; done: boolean };
type PanelTab = 'details' | 'subtasks' | 'comments' | 'activity';

const PRIORITY_FLAG_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-amber-600',
  LOW: 'text-gray-400',
};

interface TaskDetailPanelProps {
  task: ApiTask | null;
  projectId: string;
  onClose: () => void;
  onUpdated?: (task: ApiTask) => void;
  onDeleted?: () => void;
}

export function TaskDetailPanel({ task, projectId, onClose, onUpdated, onDeleted }: TaskDetailPanelProps) {
  if (!task) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <TaskDetailPanelInner
        task={task}
        projectId={projectId}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
      />
    </>
  );
}

function TaskDetailPanelInner({
  task, projectId, onClose, onUpdated, onDeleted,
}: {
  task: ApiTask;
  projectId: string;
  onClose: () => void;
  onUpdated?: (task: ApiTask) => void;
  onDeleted?: () => void;
}) {
  const { currentUser, users } = useOrg();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [panelTab, setPanelTab] = useState<PanelTab>('details');
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState(task.description ?? '');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>((task.assignees ?? []).map(a => a.user?.id ?? a.userId).filter(Boolean) as string[]);
  const [savingAssignees, setSavingAssignees] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  // Sync when task identity changes (different task selected)
  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description ?? '');
    setEditingTitle(false);
    setEditDesc(false);
    setShowStatusMenu(false);
    setPanelTab('details');
    setAssigneeIds((task.assignees ?? []).map(a => a.user?.id ?? a.userId).filter(Boolean) as string[]);
  }, [task.id]);

  // Workflow statuses
  const { data: statuses = [] } = useQuery<WorkflowStatus[]>({
    queryKey: ['workflow-statuses', 'workflow-default'],
    queryFn: () => api.workflows.statuses('workflow-default'),
    staleTime: 5 * 60 * 1000,
  });

  // Subtasks (live from API)
  const { data: subtasks = [], refetch: refetchSubtasks } = useQuery({
    queryKey: ['subtasks', task.id],
    queryFn: () => api.tasks.listSubtasks(task.id),
  });

  // Comments (live from API)
  const { data: comments = [], refetch: refetchComments } = useQuery<ApiComment[]>({
    queryKey: ['comments', 'task', task.id],
    queryFn: () => api.comments.list('task', task.id),
  });

  // ── Derived values ───────────────────────────────────────────────────────────

  const currentStatus = task.currentStatus;
  const isClosed = currentStatus?.type === 'CLOSED' || task.completionPercentage === 100;
  const statusName = currentStatus?.name ?? 'Open';
  const statusColor = currentStatus?.colorHex ?? '#64748b';
  const firstAssignee = task.assignees?.[0];
  const flagColor = PRIORITY_FLAG_COLOR[task.priority] ?? 'text-gray-400';
  const priorityLabel = task.priority
    ? task.priority.charAt(0) + task.priority.slice(1).toLowerCase()
    : '—';
  const formattedDue = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const subDone = subtasks.filter(s => s.status === 'CLOSED').length;
  const subPercent = subtasks.length > 0 ? (subDone / subtasks.length) * 100 : 0;

  // ── API handlers ─────────────────────────────────────────────────────────────

  async function saveTitle() {
    const trimmed = title.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === task.title) return;
    try {
      const updated = await api.tasks.update(task.id, { title: trimmed });
      onUpdated?.(updated);
    } catch (e) { setTitle(task.title); toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function saveDesc() {
    setEditDesc(false);
    if (desc === (task.description ?? '')) return;
    try {
      const updated = await api.tasks.update(task.id, { description: desc });
      onUpdated?.(updated);
    } catch (e) { setDesc(task.description ?? ''); toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function changeStatus(statusId: string) {
    setShowStatusMenu(false);
    try {
      const updated = await api.tasks.setStatus(task.id, statusId);
      onUpdated?.(updated);
      refetchSubtasks(); // moving to a CLOSED status closes subtasks server-side
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function markComplete() {
    const closedStatus = statuses.find(s => s.type === 'CLOSED');
    try {
      let updated: ApiTask;
      if (closedStatus) {
        updated = await api.tasks.setStatus(task.id, closedStatus.id);
      } else {
        updated = await api.tasks.update(task.id, { completionPercentage: 100 });
      }
      onUpdated?.(updated);
      refetchSubtasks();
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function toggleSubtask(subtaskId: string, currentStatus: string) {
    if (currentStatus === 'CLOSED') return;
    try {
      await api.tasks.closeSubtask(task.id, subtaskId);
      refetchSubtasks();
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function addSubtask() {
    const t = newSub.trim();
    if (!t) return;
    try {
      await api.tasks.createSubtask(task.id, { title: t });
      setNewSub('');
      refetchSubtasks();
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  async function postComment() {
    const text = newComment.trim();
    if (!text || !currentUser) return;
    setPosting(true);
    try {
      await api.comments.create({
        entityType: 'task',
        entityId: task.id,
        userId: currentUser.id,
        content: text,
      });
      setNewComment('');
      refetchComments();
    } catch {} finally { setPosting(false); }
  }

  async function deleteTask() {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    try {
      await api.tasks.delete(task.id);
      onDeleted?.();
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); }
  }

  // ── Assignees (persisted via the API) ─────────────────────────────────────────

  async function saveAssignees(ids: string[]) {
    setAssigneeIds(ids);
    setSavingAssignees(true);
    try {
      const updated = await api.tasks.setAssignees(task.id, ids);
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      onUpdated?.(updated);
    } catch (e) {
      setAssigneeIds((task.assignees ?? []).map(a => a.user?.id ?? a.userId).filter(Boolean) as string[]); // revert on failure
      alert(e instanceof Error ? e.message : 'Failed to update assignees');
    } finally {
      setSavingAssignees(false);
    }
  }

  const TABS: { key: PanelTab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'subtasks', label: `Subtasks${subtasks.length > 0 ? ` (${subtasks.length})` : ''}` },
    { key: 'comments', label: `Comments${comments.length > 0 ? ` (${comments.length})` : ''}` },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 px-4 sm:px-6 py-4">
        {/* Row 1: status pill + actions */}
        <div className="flex items-center justify-between">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(prev => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
              {statusName}
              <ChevronDown size={11} />
            </button>

            {showStatusMenu && statuses.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden py-1">
                {statuses.map(s => (
                  <button
                    key={s.id}
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
            <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
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
              className="text-xl font-bold text-gray-900 cursor-pointer hover:bg-gray-50 rounded-md px-2 py-0.5 -mx-2 transition-colors"
              onClick={() => setEditingTitle(true)}
              title="Click to edit"
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
          {firstAssignee ? (
            <div className="flex items-center gap-1.5">
              <Avatar user={firstAssignee.user} size={24} className="shrink-0" />
              <span className="text-sm text-gray-600">{firstAssignee.user.firstName} {firstAssignee.user.lastName}</span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">Unassigned</span>
          )}
          <div className="flex items-center gap-1 text-sm text-gray-500">
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

        {/* Tab bar */}
        <div className="sticky top-0 bg-white border-b flex px-4 sm:px-6 z-10 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPanelTab(key)}
              className={clsx(
                'px-3 py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors',
                panelTab === key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── DETAILS ─────────────────────────────────────────────── */}
        {panelTab === 'details' && (
          <div className="px-4 sm:px-6 py-5 space-y-5">

            {/* Description */}
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
                  className="min-h-[60px] text-sm rounded-lg p-3 cursor-pointer hover:bg-gray-50 border border-dashed border-transparent hover:border-gray-200 transition-colors"
                  onClick={() => setEditDesc(true)}
                >
                  {desc
                    ? <span className="text-gray-700 whitespace-pre-wrap">{desc}</span>
                    : <span className="italic text-gray-400">Click to add description...</span>}
                </div>
              )}
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100 text-sm">
              {[
                { label: 'Status', value: statusName },
                { label: 'Priority', value: priorityLabel },
                { label: 'Assignee', value: firstAssignee ? `${firstAssignee.user.firstName} ${firstAssignee.user.lastName}` : 'Unassigned' },
                { label: 'Due Date', value: formattedDue },
                { label: 'Est. Hours', value: task.estimatedHours ? `${task.estimatedHours}h` : 'Not set' },
                { label: 'Progress', value: `${task.completionPercentage}%` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-gray-700 font-medium">{value}</p>
                </div>
              ))}
            </div>

            {/* Assignees (persisted) */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                Assignees
                {savingAssignees && <span className="normal-case text-gray-300 flex items-center gap-1"><Loader size={11} className="animate-spin" /> saving</span>}
              </p>
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1.5 space-y-0.5 bg-gray-50">
                {users.length === 0 && <p className="text-xs text-gray-400 px-1.5 py-1">No team members</p>}
                {users.map(u => {
                  const on = assigneeIds.includes(u.id);
                  return (
                    <button key={u.id} type="button" disabled={savingAssignees}
                      onClick={() => saveAssignees(on ? assigneeIds.filter(x => x !== u.id) : [...assigneeIds, u.id])}
                      className={clsx('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors disabled:opacity-60',
                        on ? 'bg-brand-50 text-brand-700' : 'hover:bg-white text-gray-700')}
                    >
                      <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                        on ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white')}>
                        {on && <Check size={11} className="text-white" />}
                      </span>
                      {u.firstName} {u.lastName}
                    </button>
                  );
                })}
              </div>
            </div>
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

            <div>
              {subtasks.map(s => {
                const done = s.status === 'CLOSED';
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2.5 border-b last:border-0 group">
                    <button
                      onClick={() => toggleSubtask(s.id, s.status)}
                      disabled={done}
                      className={clsx(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        done ? 'bg-green-500 border-green-500 cursor-default' : 'border-gray-300 hover:border-green-400',
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

            <input
              className="mt-3 w-full text-sm border border-dashed border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
              placeholder="Add a subtask... (Enter to save)"
              value={newSub}
              onChange={e => setNewSub(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addSubtask(); }}
            />
          </div>
        )}

        {/* ── COMMENTS ─────────────────────────────────────────────── */}
        {panelTab === 'comments' && (
          <div className="px-4 sm:px-6 py-4">
            <div className="space-y-4 mb-4">
              {comments.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No comments yet. Be the first to comment.</p>
              )}
              {comments.map((c) => {
                const name = c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Unknown';
                const timeStr = new Date(c.createdAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                });
                return (
                  <div key={c.id} className="flex gap-3">
                    <Avatar user={c.user} size={32} className="shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-800">{name}</span>
                        <span className="text-xs text-gray-400">{timeStr}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{c.content}</p>
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
                  <div className="mt-2 flex justify-end">
                    <button
                      disabled={!newComment.trim() || posting}
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

        {/* ── ACTIVITY ─────────────────────────────────────────────── */}
        {panelTab === 'activity' && (
          <div className="px-4 sm:px-6 py-4">
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
              <div className="space-y-0">
                {[
                  { icon: <Plus size={14} />, color: 'bg-green-100 text-green-600', text: `Task created`, time: new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
                  { icon: <RefreshCw size={14} />, color: 'bg-orange-100 text-orange-600', text: `Status: ${statusName}`, time: new Date(task.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
                  ...comments.slice(-3).map(c => ({
                    icon: <MessageCircle size={14} />,
                    color: 'bg-purple-100 text-purple-600',
                    text: `${c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Someone'} commented`,
                    time: new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  })),
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-3 pl-2 pb-4 relative">
                    <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10', item.color)}>
                      {item.icon}
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm text-gray-700">{item.text}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-gray-100 px-4 sm:px-6 py-4 flex items-center gap-3">
        <button
          onClick={isClosed ? undefined : markComplete}
          className={clsx(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            isClosed
              ? 'bg-green-600 text-white cursor-default'
              : 'border border-green-400 text-green-600 hover:bg-green-50',
          )}
        >
          {isClosed ? 'Completed ✓' : 'Mark Complete'}
        </button>
        <div className="flex-1" />
        <button
          onClick={deleteTask}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
