'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Check, Lock } from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api, type WorkflowStatus, type Milestone } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { DateField } from '@/components/ui/DateField';
import { OPEN_TYPE } from '@/lib/tasks';

interface AddTaskModalProps {
  projectId: string;
  taskListId: string;
  initialStatusId?: string;
  workflowId?: string;
  milestones?: Milestone[];
  onClose: () => void;
  onSuccess?: () => void;
  /** Prefills — used by the Capacity board to assign into someone's free window. */
  initialAssigneeIds?: string[];
  initialStartDate?: string;
  initialDueDate?: string;
}

export function AddTaskModal({
  projectId, taskListId, initialStatusId, workflowId, milestones, onClose, onSuccess,
  initialAssigneeIds, initialStartDate, initialDueDate,
}: AddTaskModalProps) {
  const [milestoneId, setMilestoneId] = useState('');
  const { currentUser, users } = useOrg();
  const { can } = usePermissions();
  // The client-facing deadline is restricted — only offer the field to those who may set it.
  const canSetClientDue = can('deadline.view.client');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [statusId, setStatusId] = useState<string>(initialStatusId ?? '');
  const [startDate, setStartDate] = useState(initialStartDate ?? '');
  const [dueDate, setDueDate] = useState(initialDueDate ?? '');
  const [clientDueDate, setClientDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialAssigneeIds ?? []);
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

      await api.tasks.create({
        title,
        description: description || undefined,
        priority,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        clientDueDate: (canSetClientDue && clientDueDate) ? clientDueDate : undefined,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        projectId,
        taskListId,
        milestoneId: milestoneId || undefined,
        createdBy: currentUser?.id ?? 'system', // server derives the real creator from the cookie actor
        currentWorkflowStatusId,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="New task">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
            <p className="text-sm text-gray-500 mt-0.5">Fill in the details to create a task</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text" required autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Implement login page"
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
                placeholder="e.g. 4"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
              />
            </div>
          </div>

          {/* Dual deadlines: the internal date is what the team works to; the client date
              is the promised delivery and is only offered to those allowed to set it. */}
          <div className={clsx('grid gap-4', canSetClientDue ? 'grid-cols-2' : 'grid-cols-1')}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Internal Deadline
                <span className="ml-1 text-xs font-normal text-gray-400">· the team&apos;s date</span>
              </label>
              <DateField type="date" value={dueDate} max={clientDueDate || undefined} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
              />
            </div>
            {canSetClientDue && (
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1.5 flex items-center gap-1">
                  <Lock size={11} /> Client Deadline
                  <span className="text-xs font-normal text-amber-600/70">· managers only</span>
                </label>
                <DateField type="date" value={clientDueDate} min={dueDate || undefined} onChange={e => setClientDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-amber-300 bg-amber-50/40 rounded-lg focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            )}
          </div>

          {milestones && milestones.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Milestone</label>
              <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition">
                <option value="">No milestone</option>
                {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Assignees {assigneeIds.length > 0 && <span className="text-gray-400 font-normal">({assigneeIds.length})</span>}
            </label>
            <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-1.5 space-y-0.5">
              {users.length === 0 && <p className="text-xs text-gray-400 px-1.5 py-1">No team members available</p>}
              {users.map(u => {
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

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
                : <><Plus size={15} /> Create Task</>}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </form>
      </div>
    </div>
  );
}
