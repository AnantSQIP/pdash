'use client';

import { useState } from 'react';
import { Plus, CheckSquare, Search, Circle, CheckCircle, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, type ApiTask, type WorkflowStatus } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { isTaskClosed, taskAssigneeUsers, progressOptions, OPEN_TYPE, CLOSED_TYPE } from '@/lib/tasks';
import { formatDate, isPastDue } from '@/lib/date';

const PRIORITY_META = {
  CRITICAL: { label: 'Critical', color: 'text-red-600',    bg: 'bg-red-50',    dot: 'bg-red-500'    },
  HIGH:     { label: 'High',     color: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   color: 'text-amber-600',  bg: 'bg-amber-50',  dot: 'bg-amber-500'  },
  LOW:      { label: 'Low',      color: 'text-gray-400',   bg: 'bg-gray-50',   dot: 'bg-gray-400'   },
};

type StatusFilter = 'All' | 'Open' | 'In Progress' | 'Closed' | 'Overdue';
const STATUS_FILTERS: StatusFilter[] = ['All', 'Open', 'In Progress', 'Closed', 'Overdue'];

// Single source of truth for a task's bucket — used by BOTH the filter and the
// counts so the tab badges can never disagree with the rows shown.
function statusCategory(t: ApiTask): 'Open' | 'In Progress' | 'Closed' {
  if (isTaskClosed(t)) return 'Closed';
  if ((t.currentStatus?.name ?? '').toLowerCase().includes('progress')) return 'In Progress';
  return 'Open';
}
const isOverdue = (t: ApiTask) => isPastDue(t.dueDate) && !isTaskClosed(t);

export default function TasksPage() {
  const { currentUser, loading: orgLoading } = useOrg();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const meKey = ['tasks-me', currentUser?.id];

  const { data: tasks = [], isLoading: tasksLoading, isError } = useQuery<ApiTask[]>({
    queryKey: meKey,
    queryFn: () => api.tasks.listForUser(currentUser!.id),
    enabled: !!currentUser?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  // Statuses drive the inline status dropdown. All tasks share the global workflow.
  const { data: statuses = [] } = useQuery<WorkflowStatus[]>({
    queryKey: ['workflow-statuses', 'default'],
    queryFn: () => api.workflows.statuses('default'),
    staleTime: 5 * 60_000,
  });

  const isLoading = orgLoading || (!!currentUser?.id && tasksLoading);

  const filtered = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Overdue') return isOverdue(t);
    return statusCategory(t) === statusFilter;
  });

  const counts: Record<StatusFilter, number> = { All: tasks.length, Open: 0, 'In Progress': 0, Closed: 0, Overdue: 0 };
  for (const t of tasks) {
    counts[statusCategory(t)]++;
    if (isOverdue(t)) counts.Overdue++;
  }

  // Optimistically patch a task in the cache, then reconcile with the server.
  function patchTask(taskId: string, patch: Partial<ApiTask>) {
    qc.setQueryData<ApiTask[]>(meKey, old => (old ?? []).map(t => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  async function changeStatus(task: ApiTask, statusId: string) {
    if (statusId === task.currentWorkflowStatusId) return;
    const status = statuses.find(s => s.id === statusId);
    // Match the server: only reopening a CLOSED task drops it to 0%. Keying the
    // reset on the prior status (not `>= 100`) preserves a 100%-but-open task.
    const wasClosed = task.currentStatus?.type === CLOSED_TYPE;
    patchTask(task.id, {
      currentWorkflowStatusId: statusId,
      currentStatus: status ?? task.currentStatus,
      completionPercentage: status?.type === CLOSED_TYPE ? 100 : (wasClosed ? 0 : task.completionPercentage),
    });
    try {
      await api.tasks.setStatus(task.id, statusId);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update status', 'error');
    } finally {
      qc.invalidateQueries({ queryKey: meKey });
    }
  }

  async function changeProgress(task: ApiTask, pct: number) {
    if (pct === task.completionPercentage) return;
    patchTask(task.id, { completionPercentage: pct });
    try {
      await api.tasks.update(task.id, { completionPercentage: pct });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update progress', 'error');
    } finally {
      qc.invalidateQueries({ queryKey: meKey });
    }
  }

  // Toggle done ↔ open via the workflow, so it's reversible (was a silent no-op before).
  async function toggleComplete(task: ApiTask) {
    const target = isTaskClosed(task) ? statuses.find(s => s.type === OPEN_TYPE) : statuses.find(s => s.type === CLOSED_TYPE);
    if (!target) { toast('No suitable workflow status is configured', 'error'); return; }
    await changeStatus(task, target.id);
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tasks assigned to you across all projects</p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
        >
          <Plus size={14} />
          Add in Project
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0',
                statusFilter === f ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              {f}
              <span className={clsx(
                'text-xs rounded-full px-1.5',
                statusFilter === f ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
              )}>
                {counts[f]}

                
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-400 bg-white"
          >
            <option value="All">All Priorities</option>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-48"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {isLoading ? (
          <div className="hidden sm:block">
          <TableShell>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-4 py-3 w-8"><div className="w-4 h-4 rounded-full bg-gray-200" /></td>
                <td className="px-4 py-3"><div className="h-3.5 bg-gray-200 rounded w-48" /></td>
                <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-24" /></td>
                <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full w-16" /></td>
                <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full w-20" /></td>
                <td className="px-4 py-3"><div className="h-6 bg-gray-100 rounded-full w-16" /></td>
                <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-14" /></td>
                <td className="px-4 py-3"><div className="h-1.5 bg-gray-100 rounded-full w-16" /></td>
              </tr>
            ))}
          </TableShell>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <AlertTriangle size={36} className="mb-3 text-red-300" />
            <p className="text-sm font-medium text-gray-600">Couldn’t load your tasks</p>
            <p className="text-xs mt-1">Check your connection and try again.</p>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: meKey })}
              className="mt-3 text-xs font-medium text-brand-600 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CheckSquare size={36} className="mb-3 opacity-20" />
            <p className="text-sm font-medium">No tasks found</p>
            <p className="text-xs mt-1">
              {tasks.length === 0 ? 'Tasks assigned to you will appear here.' : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <>
          {/* Mobile: each task as a card. A 9-column table is unusable on a phone; the card
              keeps every control (complete, status, progress) reachable without scrolling. */}
          <div className="sm:hidden space-y-2.5">
            {filtered.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                closed={isTaskClosed(task)}
                overdue={isOverdue(task)}
                statuses={statuses}
                onToggle={() => toggleComplete(task)}
                onStatus={id => changeStatus(task, id)}
                onProgress={p => changeProgress(task, p)}
              />
            ))}
          </div>

          {/* Desktop / tablet: the full table. */}
          <div className="hidden sm:block">
          <TableShell>
            {filtered.map(task => {
              const closed = isTaskClosed(task);
              const overdue = isOverdue(task);
              const pm = PRIORITY_META[task.priority as keyof typeof PRIORITY_META] ?? PRIORITY_META.LOW;
              const project = task.projectTasks?.[0]?.project;
              return (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 w-8">
                    <button
                      onClick={() => toggleComplete(task)}
                      className={clsx('transition-colors', closed ? 'text-green-500' : 'text-gray-300 hover:text-green-400')}
                      title={closed ? 'Completed — click to reopen' : 'Mark complete'}
                      aria-label={closed ? 'Reopen task' : 'Mark task complete'}
                    >
                      {closed ? <CheckCircle size={16} /> : <Circle size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-sm font-medium text-gray-900', closed && 'line-through text-gray-400')}>
                      {task.title}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {project ? (
                      <Link href={`/projects/${project.id}`} className="text-xs text-gray-500 hover:text-brand-600 hover:underline">
                        {project.title}
                      </Link>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', pm.bg, pm.color)}>
                      {pm.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={task.currentWorkflowStatusId ?? ''}
                      onChange={e => changeStatus(task, e.target.value)}
                      disabled={statuses.length === 0}
                      aria-label="Task status"
                      className="text-xs font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer disabled:cursor-default"
                      style={task.currentStatus ? { backgroundColor: task.currentStatus.colorHex + '22', color: task.currentStatus.colorHex } : { backgroundColor: '#f1f5f9', color: '#64748b' }}
                    >
                      {!task.currentStatus && <option value="">—</option>}
                      {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <AvatarStack users={taskAssigneeUsers(task)} size={22} />
                  </td>
                  <td className="px-4 py-3">
                    {task.dueDate ? (
                      <span className={clsx('text-xs', overdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                        {formatDate(task.dueDate)}{overdue && ' (overdue)'}
                      </span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${task.completionPercentage}%` }} />
                      </div>
                      <select
                        value={task.completionPercentage}
                        onChange={e => changeProgress(task, Number(e.target.value))}
                        disabled={closed}
                        aria-label="Task progress"
                        className="text-xs text-gray-500 bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 rounded cursor-pointer disabled:cursor-default"
                        title={closed ? 'Reopen the task to change progress' : 'Set progress'}
                      >
                        {progressOptions(task.completionPercentage).map(p => <option key={p} value={p}>{p}%</option>)}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </TableShell>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// Shared table chrome so the loading, populated and (implicitly) empty states line up.
function TableShell({ children }: { children: React.ReactNode }) {
  const headers = ['Task', 'Project', 'Priority', 'Status', 'Assignees', 'Due', 'Progress'];
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="w-8 px-4 py-2.5" />
              {headers.map(h => (
                <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

// One task as a card — the mobile layout. Every control the row has (complete, status,
// progress) is here, but stacked so nothing is pushed off a narrow screen.
function TaskCard({ task, closed, overdue, statuses, onToggle, onStatus, onProgress }: {
  task: ApiTask;
  closed: boolean;
  overdue: boolean;
  statuses: WorkflowStatus[];
  onToggle: () => void;
  onStatus: (id: string) => void;
  onProgress: (p: number) => void;
}) {
  const pm = PRIORITY_META[task.priority as keyof typeof PRIORITY_META] ?? PRIORITY_META.LOW;
  const project = task.projectTasks?.[0]?.project;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3.5">
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className={clsx('mt-0.5 shrink-0 transition-colors', closed ? 'text-green-500' : 'text-gray-300 hover:text-green-400')}
          aria-label={closed ? 'Reopen task' : 'Mark task complete'}
        >
          {closed ? <CheckCircle size={20} /> : <Circle size={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm font-medium leading-snug', closed ? 'line-through text-gray-400' : 'text-gray-900')}>
            {task.title}
          </p>
          {project && (
            <Link href={`/projects/${project.id}`} className="text-xs text-gray-500 hover:text-brand-600 hover:underline block mt-0.5 truncate">
              {project.title}
            </Link>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', pm.bg, pm.color)}>{pm.label}</span>
            <select
              value={task.currentWorkflowStatusId ?? ''}
              onChange={e => onStatus(e.target.value)}
              disabled={statuses.length === 0}
              aria-label="Task status"
              className="text-xs font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer disabled:cursor-default"
              style={task.currentStatus ? { backgroundColor: task.currentStatus.colorHex + '22', color: task.currentStatus.colorHex } : { backgroundColor: '#f1f5f9', color: '#64748b' }}
            >
              {!task.currentStatus && <option value="">—</option>}
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <AvatarStack users={taskAssigneeUsers(task)} size={22} />
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="flex items-center gap-2 min-w-0">
              {task.dueDate && (
                <span className={clsx('text-xs whitespace-nowrap', overdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                  {formatDate(task.dueDate)}{overdue && ' · overdue'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${task.completionPercentage}%` }} />
              </div>
              <select
                value={task.completionPercentage}
                onChange={e => onProgress(Number(e.target.value))}
                disabled={closed}
                aria-label="Task progress"
                className="text-xs text-gray-500 bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 rounded cursor-pointer disabled:cursor-default"
              >
                {progressOptions(task.completionPercentage).map(p => <option key={p} value={p}>{p}%</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
