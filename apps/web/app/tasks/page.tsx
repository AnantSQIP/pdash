'use client';

import { useMemo, useState } from 'react';
import { Plus, CheckSquare, Search, Circle, CheckCircle, AlertTriangle, RotateCcw, Loader, Clock } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, type ApiTask, type WorkflowStatus } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast, toastError } from '@/components/ui/Toast';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { isTaskClosed, taskAssigneeUsers, progressOptions, OPEN_TYPE, CLOSED_TYPE, nextUpFirst } from '@/lib/tasks';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { formatDate, isPastDue } from '@/lib/date';
import { RunningTimersBar, TimerButton, FinishButton, LogTimeDialog, quarterHours } from '@/components/tasks/TaskWork';
import { pidLabel } from '@/lib/mock-data';
import type { RunningTimer, DayStatus } from '@/lib/api';
import { CatchUpBanner } from '@/components/attendance/CatchUpBanner';
import { TrackedTodayBar } from '@/components/tasks/TrackedTodayBar';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';

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
/**
 * The deadline that applies to THIS person: their own seat's date when one was set for them
 * (a manager gave them more time from the capacity board), otherwise the task's.
 */
const myDue = (t: ApiTask, uid?: string | null): string | null | undefined =>
  (uid && t.assignees?.find(a => a.userId === uid && a.dueDate)?.dueDate) || t.dueDate;
const isOverdue = (t: ApiTask, uid?: string | null) => isPastDue(myDue(t, uid)) && !isTaskClosed(t);

/**
 * Reopen a closed task.
 *
 * Goes through POST /tasks/:id/reopen rather than simply setting the status back to Open.
 * They are not the same thing: the status dropdown moves the task and nothing else, so the
 * reopening leaves no trace, while this records it on the task (reopenedCount) and clears the
 * completion so the work can be timed again. The review asked for reopening to be RECORDED —
 * "if it is not recorded, the hours and everything derived from them understate the work".
 */
function ReopenButton({ task, openStatusId }: { task: ApiTask; openStatusId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: () => api.tasks.reopenTask(task.id, openStatusId),
    onSuccess: r => {
      toast(r.reopenedCount === 1 ? 'Reopened. Time it again and close when it is done.'
                                  : `Reopened — ${r.reopenedCount} times now.`, 'success');
      invalidateTaskCaches(qc);
      qc.invalidateQueries({ queryKey: ['running-timer'] });
    },
    onError: e => toastError(e, 'Could not reopen the task.'),
  });
  return (
    <button
      onClick={() => m.mutate()}
      disabled={m.isPending}
      title="Reopen this task — the reopening is recorded and you can log further hours"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-gray-600 ring-1 ring-inset ring-gray-950/[0.08] hover:bg-gray-50 disabled:opacity-40"
    >
      {m.isPending ? <Loader size={12} className="animate-spin" /> : <RotateCcw size={12} />} Reopen
    </button>
  );
}

export default function TasksPage() {
  const { currentUser, loading: orgLoading } = useOrg();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  // A row's Log-time dialog; `hours` is pre-filled when it was opened from a stopped timer.
  const [logging, setLogging] = useState<{ task: ApiTask; hours?: number } | null>(null);

  // Every clock this person has running — several at once is allowed. Polled gently: somebody
  // may start a task on their phone, and a stale bar claiming nothing is running is worse than
  // no bar at all.
  const { data: running = [] } = useQuery<RunningTimer[]>({
    queryKey: ['running-timer'],
    queryFn: () => api.tasks.runningTimers(),
    refetchInterval: 60_000,
    refetchOnMount: 'always',
  });

  // What the clock recorded today and how much of it the timesheet has. Filing the day is a
  // condition of punching out, so the arithmetic belongs here, where the work is, rather than
  // being sprung on somebody at the door.
  const { data: today } = useQuery<DayStatus>({
    queryKey: ['timer-today'],
    queryFn: () => api.tasks.today(),
    refetchInterval: 60_000,
    refetchOnMount: 'always',
  });
  const trackedByTask = useMemo(() => new Map((today?.tracked ?? []).map(t => [t.taskId, t])), [today]);

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

  // Sorted the same way the home card is, and for the same reason: this is the page people are
  // told to work from, so it has to open on what to do next. Without this it showed whatever
  // order the API returned — which is by due date, so a task closed in June sat above six
  // overdue ones, and a CRITICAL task sat below a LOW one that happened to be older.
  const filtered = tasks
    .filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Overdue') return isOverdue(t, currentUser?.id);
      return statusCategory(t) === statusFilter;
    })
    .sort(nextUpFirst);

  const counts: Record<StatusFilter, number> = { All: tasks.length, Open: 0, 'In Progress': 0, Closed: 0, Overdue: 0 };
  for (const t of tasks) {
    counts[statusCategory(t)]++;
    if (isOverdue(t, currentUser?.id)) counts.Overdue++;
  }

  // Optimistically patch a task in the cache, then reconcile with the server.
  function patchTask(taskId: string, patch: Partial<ApiTask>) {
    qc.setQueryData<ApiTask[]>(meKey, old => (old ?? []).map(t => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  function afterTimeLogged() { invalidateTimesheetCaches(qc); }
  const openLogFromTimer = (taskId: string, minutes: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) setLogging({ task, hours: quarterHours(minutes) });
  };

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
      // The same task is on screen in the project view too — refresh every cache
      // that renders it, not just this page's.
      invalidateTaskCaches(qc);
    }
  }

  async function changeProgress(task: ApiTask, pct: number) {
    if (pct === task.completionPercentage) return;
    patchTask(task.id, { completionPercentage: pct });
    try {
      await api.tasks.setProgress(task.id, pct);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update progress', 'error');
    } finally {
      invalidateTaskCaches(qc);
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
      <CatchUpBanner />
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tasks assigned to you across all projects</p>
        </div>
        <div className="flex items-center gap-3">
          {running.length > 0 && <div className="w-[min(24rem,60vw)]"><RunningTimersBar running={running} onPaused={openLogFromTimer} /></div>}
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            <Plus size={14} />
            Add in Project
          </Link>
        </div>
      </div>

      {today && <TrackedTodayBar day={today} onFiled={afterTimeLogged} />}

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
                <td className="sticky right-0 z-10 bg-white px-4 py-3"><div className="h-6 bg-gray-100 rounded-lg w-28 ml-auto" /></td>
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
                overdue={isOverdue(task, currentUser?.id)}
                due={myDue(task, currentUser?.id)}
                statuses={statuses}
                onToggle={() => toggleComplete(task)}
                onStatus={id => changeStatus(task, id)}
                onProgress={p => changeProgress(task, p)}
                onLogTime={() => setLogging({ task })}
                running={running}
                hasTracked={(trackedByTask.get(task.id)?.minutes ?? 0) > 0}
                onPaused={openLogFromTimer}
                onFinished={afterTimeLogged}
              />
            ))}
          </div>

          {/* Desktop / tablet: the full table. */}
          <div className="hidden sm:block">
          <TableShell>
            {filtered.map(task => {
              const closed = isTaskClosed(task);
              const overdue = isOverdue(task, currentUser?.id);
              const due = myDue(task, currentUser?.id);
              const ownDue = !!due && due !== task.dueDate;
              const pm = PRIORITY_META[task.priority as keyof typeof PRIORITY_META] ?? PRIORITY_META.LOW;
              const project = task.projectTasks?.[0]?.project;
              return (
                <tr key={task.id} className="group hover:bg-gray-50 transition-colors">
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
                    {due ? (
                      <span className={clsx('text-xs', overdue ? 'text-red-500 font-medium' : 'text-gray-400')}
                        title={ownDue ? `Your own deadline on this task${task.dueDate ? ` — the task itself is due ${formatDate(task.dueDate)}` : ''}` : undefined}>
                        {formatDate(due)}{ownDue && <span className="text-gray-400"> · yours</span>}{overdue && ' (overdue)'}
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
                  {/* Everything a person does with a task, on the row they are already looking
                      at. Closing it and recording the time used to be two errands in two
                      modules; here they are one. */}
                  <td className="sticky right-0 z-10 bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(16,24,40,0.10)] group-hover:bg-gray-50">
                    <div className="flex items-center justify-end gap-1.5">
                      {!closed && <TimerButton taskId={task.id} running={running} hasTracked={(trackedByTask.get(task.id)?.minutes ?? 0) > 0} onPaused={openLogFromTimer} />}
                      {!closed && (() => {
                        // The ledger refuses time on a completed or closed matter; say so here
                        // rather than after a round trip.
                        const phase = task.projectTasks?.[0]?.project?.projectPhase;
                        const matterClosed = phase === 'COMPLETED' || phase === 'CLOSED';
                        return (
                          <button
                            onClick={() => setLogging({ task })}
                            disabled={matterClosed}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-gray-600 ring-1 ring-inset ring-gray-950/[0.08] hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                            title={matterClosed ? 'This project is completed or closed — reopen it to log time' : 'Log time on this task without leaving the page'}
                          >
                            <Clock size={12} /> Log time
                          </button>
                        );
                      })()}
                      {!closed && <FinishButton taskId={task.id} onDone={afterTimeLogged} />}
                      {closed && <ReopenButton task={task} openStatusId={statuses.find(x => x.type === OPEN_TYPE)?.id} />}
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



      {logging && (
        <LogTimeDialog
          key={`${logging.task.id}:${logging.hours ?? ''}`}
          taskId={logging.task.id}
          taskTitle={logging.task.title}
          projectLabel={(() => {
            const p = logging.task.projectTasks?.[0]?.project;
            if (!p) return undefined;
            return p.code ? `${pidLabel(p.code, p.roundSeq)} · ${p.title}` : p.title;
          })()}
          defaultHours={logging.hours}
          onClose={() => setLogging(null)}
          onDone={() => { setLogging(null); afterTimeLogged(); }}
        />
      )}
    </div>
  );
}

// Shared table chrome so the loading, populated and (implicitly) empty states line up.
function TableShell({ children }: { children: React.ReactNode }) {
  const headers = ['Task', 'Project', 'Priority', 'Status', 'Assignees', 'Due', 'Progress', 'Work'];
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="w-8 px-4 py-2.5" />
              {headers.map(h => (
                <th
                  key={h}
                  className={clsx(
                    'px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap',
                    // Pinned so the actions stay reachable when the table scrolls sideways.
                    h === 'Work' && 'sticky right-0 z-10 bg-gray-50 shadow-[-8px_0_8px_-8px_rgba(16,24,40,0.10)]',
                  )}
                >
                  {h}
                </th>
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
function TaskCard({ task, closed, overdue, due, statuses, onToggle, onStatus, onProgress, onLogTime, running, hasTracked, onPaused, onFinished }: {
  task: ApiTask;
  closed: boolean;
  overdue: boolean;
  /** The deadline that applies to this person (their own, when one was set). */
  due?: string | null;
  statuses: WorkflowStatus[];
  onToggle: () => void;
  onStatus: (id: string) => void;
  onProgress: (p: number) => void;
  /** The phone gets the same in-place timesheet as the table. */
  onLogTime?: () => void;
  /** …and the same clock and Finish. A phone could previously do neither. */
  running: RunningTimer[];
  hasTracked?: boolean;
  onPaused?: (taskId: string, minutes: number) => void;
  onFinished?: () => void;
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
              {due && (
                <span className={clsx('text-xs whitespace-nowrap', overdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                  {formatDate(due)}{due !== task.dueDate && ' · yours'}{overdue && ' · overdue'}
                </span>
              )}
              {/* The phone gets the same in-place timesheet as the table — the whole point was
                  not having to go to another screen, and a phone is where that hurts most. */}
              {!closed && onLogTime && (
                <button
                  onClick={onLogTime}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-950/[0.08] hover:bg-gray-50"
                  title="Log time on this task"
                >
                  <Clock size={11} /> Log time
                </button>
              )}
              {!closed && <TimerButton taskId={task.id} running={running} hasTracked={hasTracked} onPaused={onPaused} />}
              {!closed && <FinishButton taskId={task.id} onDone={onFinished} />}
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
