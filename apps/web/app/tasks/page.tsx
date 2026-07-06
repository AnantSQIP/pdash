'use client';

import { useState } from 'react';
import { Plus, CheckSquare, Search, Circle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, type ApiTask } from '@/lib/api';
import { useOrg } from '@/lib/org-context';

const PRIORITY_META = {
  CRITICAL: { label: 'Critical', color: 'text-red-600',    bg: 'bg-red-50',    dot: 'bg-red-500'    },
  HIGH:     { label: 'High',     color: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   color: 'text-amber-600',  bg: 'bg-amber-50',  dot: 'bg-amber-500'  },
  LOW:      { label: 'Low',      color: 'text-gray-400',   bg: 'bg-gray-50',   dot: 'bg-gray-400'   },
};

const AVATAR_COLORS = ['bg-brand-600','bg-purple-500','bg-pink-500','bg-slate-600','bg-green-500','bg-amber-500'];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type StatusFilter = 'All' | 'Open' | 'In Progress' | 'Closed' | 'Overdue';
const STATUS_FILTERS: StatusFilter[] = ['All', 'Open', 'In Progress', 'Closed', 'Overdue'];

export default function TasksPage() {
  const { currentUser, loading: orgLoading } = useOrg();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ApiTask[]>({
    queryKey: ['tasks-me', currentUser?.id],
    queryFn: () => api.tasks.listForUser(currentUser!.id),
    enabled: !!currentUser?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const isLoading = orgLoading || (!!currentUser?.id && tasksLoading);

  const today = new Date().toISOString().split('T')[0];

  function filterTasks(tasks: ApiTask[]): ApiTask[] {
    return tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
      const statusName = t.currentStatus?.name ?? '';
      const isClosed = t.currentStatus?.type === 'CLOSED';
      const isOverdue = !!t.dueDate && new Date(t.dueDate) < new Date(today) && !isClosed;
      if (statusFilter === 'Closed' && !isClosed) return false;
      if (statusFilter === 'Open' && (isClosed || statusName.toLowerCase().includes('progress'))) return false;
      if (statusFilter === 'In Progress' && !statusName.toLowerCase().includes('progress')) return false;
      if (statusFilter === 'Overdue' && !isOverdue) return false;
      return true;
    });
  }

  const filtered = filterTasks(tasks);

  const counts = {
    All: tasks.length,
    Open: tasks.filter(t => t.currentStatus?.type === 'OPEN' && !t.currentStatus?.name.toLowerCase().includes('progress')).length,
    'In Progress': tasks.filter(t => t.currentStatus?.name.toLowerCase().includes('progress')).length,
    Closed: tasks.filter(t => t.currentStatus?.type === 'CLOSED').length,
    Overdue: tasks.filter(t => !!t.dueDate && new Date(t.dueDate) < new Date(today) && t.currentStatus?.type !== 'CLOSED').length,
  };

  async function markComplete(task: ApiTask) {
    const closedStatus = task.currentStatus?.type === 'CLOSED';
    if (closedStatus) return;
    // Find the closed status from the workflow
    try {
      const statuses = await api.workflows.statuses(task.workflowId ?? 'default');
      const closedSt = statuses.find(s => s.type === 'CLOSED');
      if (closedSt) {
        await api.tasks.setStatus(task.id, closedSt.id);
        qc.invalidateQueries({ queryKey: ['tasks-me', currentUser?.id] });
      }
    } catch {}
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
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-8 px-4 py-2.5" />
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Task</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Project</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Priority</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3 w-8"><div className="w-4 h-4 rounded-full bg-gray-200" /></td>
                    <td className="px-4 py-3"><div className="h-3.5 bg-gray-200 rounded w-48" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-24" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full w-16" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full w-20" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-14" /></td>
                    <td className="px-4 py-3"><div className="h-1.5 bg-gray-100 rounded-full w-16" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-8 px-4 py-2.5" />
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Task</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Project</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Priority</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(task => {
                  const isClosed = task.currentStatus?.type === 'CLOSED';
                  const isOverdue = !!task.dueDate && new Date(task.dueDate) < new Date(today) && !isClosed;
                  const pm = PRIORITY_META[task.priority as keyof typeof PRIORITY_META] ?? PRIORITY_META.LOW;
                  const project = (task as any).projectTasks?.[0]?.project;
                  const assignees = task.assignees ?? [];
                  return (
                    <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 w-8">
                        <button
                          onClick={() => markComplete(task)}
                          className={clsx('transition-colors', isClosed ? 'text-green-500' : 'text-gray-300 hover:text-green-400')}
                          title={isClosed ? 'Completed' : 'Mark complete'}
                        >
                          {isClosed ? <CheckCircle size={16} /> : <Circle size={16} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-sm font-medium text-gray-900', isClosed && 'line-through text-gray-400')}>
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
                        {task.currentStatus ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                            backgroundColor: task.currentStatus.colorHex + '22',
                            color: task.currentStatus.colorHex,
                          }}>
                            {task.currentStatus.name}
                          </span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {task.dueDate ? (
                          <span className={clsx('text-xs', isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {isOverdue && ' (overdue)'}
                          </span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${task.completionPercentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-8">{task.completionPercentage}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
