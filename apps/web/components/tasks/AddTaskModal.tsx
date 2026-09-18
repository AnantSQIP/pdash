'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Check, Search, X as XIcon } from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api, type TaskGroup, type WorkflowStatus } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';
import { OPEN_TYPE } from '@/lib/tasks';
import { formatDate } from '@/lib/date';

interface AddTaskModalProps {
  projectId: string;
  taskListId: string;
  initialStatusId?: string;
  workflowId?: string;
  onClose: () => void;
  onSuccess?: () => void;
  /** Prefills — used by the Capacity board to assign into someone's free window. */
  initialAssigneeIds?: string[];
  initialStartDate?: string;
  initialDueDate?: string;
  /** Capacity assign: put the single assignee into a ROLE with hours + a deadline on the new task. */
  assignRole?: 'PM' | 'REVIEWER' | 'ANALYST';
  assignHours?: string;
  assignDue?: string;
}

export function AddTaskModal({
  projectId, taskListId, initialStatusId, workflowId, onClose, onSuccess,
  initialAssigneeIds, initialStartDate, initialDueDate, assignRole, assignHours, assignDue,
}: AddTaskModalProps) {
  const { currentUser, users } = useOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [statusId, setStatusId] = useState<string>(initialStatusId ?? '');
  const [startDate, setStartDate] = useState(initialStartDate ?? '');
  const [dueDate, setDueDate] = useState(initialDueDate ?? '');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialAssigneeIds ?? []);
  const [memberQuery, setMemberQuery] = useState('');
  // CLIENTS-FLOW: which task group the task goes into. Starts on the one the caller named; the
  // picker only appears when the client has more than one group that is still taking work.
  const [groupId, setGroupId] = useState(taskListId);
  const { data: groups = [] } = useQuery<TaskGroup[]>({
    queryKey: ['task-groups', projectId],
    queryFn: () => api.taskLists.list(projectId),
    staleTime: 30_000,
  });
  const openGroups = groups.filter(g => g.status !== 'COMPLETED');
  // If the caller's pick turns out to be a completed group, start on one that takes work instead
  // of letting the save fail.
  useEffect(() => {
    if (!groups.length) return;
    const current = groups.find(g => g.id === groupId);
    if (current && current.status !== 'COMPLETED') return;
    const fallback = openGroups.find(g => g.isDefault) ?? openGroups[0];
    if (fallback) setGroupId(fallback.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);
  // CLIENTS-FLOW (deadlines): a task inside a group is due no later than the group. Until somebody
  // picks a date, the task takes the group's deadline — the server does the same when none is sent.
  const groupDue = (() => {
    const g = groups.find(x => x.id === groupId);
    return g?.dueDate ? String(g.dueDate).slice(0, 10) : '';
  })();
  const [dueTouched, setDueTouched] = useState(!!initialDueDate);
  useEffect(() => { if (!dueTouched) setDueDate(groupDue); }, [groupDue, dueTouched]);
  const dueAfterGroup = !!groupDue && !!dueDate && dueDate > groupDue;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Workflow statuses populate the "Status" picker so a task can start in any column.
  const { data: statuses = [] } = useQuery<WorkflowStatus[]>({
    queryKey: ['workflow-statuses', workflowId ?? 'default'],
    queryFn: () => api.workflows.statuses(workflowId ?? 'default'),
    staleTime: 5 * 60_000,
  });

  // Default the picker to the caller's column, else the first OPEN status.
  const defaultOpenId = useMemo(
    () => statuses.find(s => s.type === OPEN_TYPE)?.id ?? statuses[0]?.id ?? '',
    [statuses],
  );

  /**
   * The people shown in the picker: everyone matching the search, plus everyone already chosen.
   *
   * The second half is the part that matters. Filtering the list plainly would hide a person the
   * moment their name stopped matching — so somebody who picked three people, then typed a fourth
   * name, would see "(3)" above a list showing none of them, and would have no way to take one
   * back off without clearing the box first. A selection has to stay reachable.
   *
   * Matching is on the full name and the email, both case-folded, so "ajay", "sharma" and the
   * first half of a login all find the same person.
   */
  const visibleMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return users;
    const chosen = new Set(assigneeIds);
    return users.filter(u =>
      chosen.has(u.id)
      || `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase().includes(q)
      || (u.email ?? '').toLowerCase().includes(q));
  }, [users, memberQuery, assigneeIds]);
  useEffect(() => {
    if (!statusId && (initialStatusId || defaultOpenId)) setStatusId(initialStatusId ?? defaultOpenId);
  }, [initialStatusId, defaultOpenId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape-to-close for dialog a11y.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dueAfterGroup) { setError(`The deadline cannot be after the task group’s (${formatDate(groupDue)}).`); return; }
    setLoading(true);
    setError('');
    try {
      // Prefer the chosen status; fall back to the workflow's default-open if the
      // picker never populated (e.g. statuses failed to load).
      let currentWorkflowStatusId = statusId || undefined;
      if (!currentWorkflowStatusId) {
        try {
          currentWorkflowStatusId = (await api.workflows.defaultOpenStatus(workflowId ?? 'default')).id;
        } catch { /* proceed without status */ }
      }

      const created = await api.tasks.create({
        title,
        description: description || undefined,
        priority,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        projectId,
        taskListId: groupId || taskListId,
        createdBy: currentUser?.id ?? 'system', // server derives the real creator from the cookie actor
        currentWorkflowStatusId,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      });
      // Capacity assign: place the person in a specific ROLE with their hours + deadline.
      if (assignRole && initialAssigneeIds?.length === 1) {
        await api.tasks.setStaffing(created.id, [{
          userId: initialAssigneeIds[0], role: assignRole,
          estimatedHours: assignHours ? parseFloat(assignHours) : 0,
          dueDate: assignDue || dueDate || null,
        }]);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="New Task"
      subtitle="Fill in the details to create a task"
      size="lg"
      onClose={onClose}
      footer={
        <div>
          {error && <p className="text-xs text-red-600 mb-2 text-right">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button type="submit" form="add-task-form" disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
                : <><Plus size={15} /> Create Task</>}
            </button>
          </div>
        </div>
      }
    >
        <form id="add-task-form" onSubmit={handleSubmit} className="space-y-5">
          {openGroups.length > 1 && (
            <div>
              <label htmlFor="add-task-group" className="block text-sm font-medium text-gray-700 mb-1.5">Task group</label>
              <select id="add-task-group" value={groupId} onChange={e => setGroupId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white">
                {openGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text" required autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Search claim 7 variants"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select value={statusId} onChange={e => setStatusId(e.target.value)} disabled={statuses.length === 0}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white disabled:opacity-60"
              >
                {statuses.length === 0 && <option value="">Default</option>}
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
              <DateField type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Hours</label>
              <input type="number" min="0" step="0.5" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)}
                // The deadline and the people come AFTER this box, so Enter here created the task
                // with neither — the same mistake as the member search below, one field earlier.
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder="e.g. 4"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
              />
            </div>
          </div>

          {/* A task has a single deadline — the team's. The date promised to the client lives on its
              task group, and the task's must fall inside the group's. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Deadline</label>
            <DateField type="date" value={dueDate} max={groupDue || undefined}
              onChange={e => { setDueDate(e.target.value); setDueTouched(true); }}
              className={clsx('w-full px-3.5 py-2.5 text-sm border rounded-lg focus:outline-none focus:border-brand-500 transition',
                dueAfterGroup ? 'border-red-300' : 'border-gray-300')}
            />
            {groupDue && (
              <p className={clsx('text-[11px] mt-1', dueAfterGroup ? 'text-red-600' : 'text-gray-400')}>
                {dueAfterGroup
                  ? `After the task group’s deadline (${formatDate(groupDue)}) — pick that date or earlier.`
                  : `The task group is due ${formatDate(groupDue)}; the task can be due then or earlier.`}
              </p>
            )}
          </div>


          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Team members {assigneeIds.length > 0 && <span className="text-gray-400 font-normal">({assigneeIds.length})</span>}
            </label>
            {/* A search box, because the list is the whole firm and finding one person meant
                scrolling past everybody else. Anyone already chosen stays visible whatever is
                typed — otherwise a search would hide the selection it was used to make, and the
                count would say three with nothing on screen to show for it. */}
            <div className="relative mb-1.5">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={memberQuery}
                onChange={e => setMemberQuery(e.target.value)}
                // Enter in a text input inside a form submits it. Here that would CREATE THE TASK
                // in the middle of looking for somebody to put on it — the one keystroke a person
                // types without thinking, doing the one thing this dialog exists to do. Escape
                // clears the search rather than closing the whole dialog, for the same reason.
                onKeyDown={e => {
                  if (e.key === 'Enter') e.preventDefault();
                  if (e.key === 'Escape' && memberQuery) { e.preventDefault(); e.stopPropagation(); setMemberQuery(''); }
                }}
                placeholder="Search team members…"
                aria-label="Search team members"
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
              />
              {memberQuery && (
                <button type="button" onClick={() => setMemberQuery('')} aria-label="Clear the search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XIcon size={14} />
                </button>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-lg p-1.5 space-y-0.5">
              {users.length === 0 && <p className="text-xs text-gray-400 px-1.5 py-1">No team members available</p>}
              {users.length > 0 && visibleMembers.length === 0 && (
                <p className="text-xs text-gray-400 px-1.5 py-1">Nobody matches &ldquo;{memberQuery}&rdquo;.</p>
              )}
              {visibleMembers.map(u => {
                const on = assigneeIds.includes(u.id);
                return (
                  <button type="button" key={u.id} role="checkbox" aria-checked={on}
                    onClick={() => setAssigneeIds(prev => on ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                    className={clsx('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors',
                      on ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-700')}
                  >
                    <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      on ? 'bg-brand-600 border-brand-600' : 'border-gray-300')}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    {u.firstName} {u.lastName}
                  </button>
                );
              })}
            </div>
          </div>

        </form>
    </Modal>
  );
}
