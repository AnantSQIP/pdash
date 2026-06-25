'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, CheckSquare, Users, Calendar,
  LayoutList, Flag, MoreHorizontal,
} from 'lucide-react';
import clsx from 'clsx';
import { KanbanBoard } from '@/components/projects/KanbanBoard';
import GanttView from '@/components/projects/GanttView';
import FilesTab from '@/components/projects/FilesTab';
import DiscussionsTab from '@/components/projects/DiscussionsTab';
import IssuesTab from '@/components/projects/IssuesTab';
import ActivityTab from '@/components/projects/ActivityTab';
import TimesheetsTab from '@/components/projects/TimesheetsTab';
import { PHASE_META, PRIORITY_META, type Phase, type Priority } from '@/lib/mock-data';
import { AddTaskModal } from '@/components/tasks/AddTaskModal';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import { api, type ApiProject, type ApiTask } from '@/lib/api';
import { userInitials, avatarColor as avatarColorFor } from '@/lib/avatar';

type Tab = 'Overview' | 'Task List' | 'Board' | 'Gantt' | 'Files' | 'Discussions' | 'Issues' | 'Activity' | 'Timesheets';
const TABS: Tab[] = ['Overview', 'Task List', 'Board', 'Gantt', 'Issues', 'Activity', 'Timesheets', 'Files', 'Discussions'];

const PRIORITY_FLAG: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-amber-500',
  LOW: 'text-gray-400',
};

interface Props { projectId: string }

export function ProjectDetailClient({ projectId }: Props) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Task List');
  const [showAddTask, setShowAddTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);

  const { data: project, isLoading: projLoading, isError: projError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  // Load tasks for any tab that renders them
  const needsTasks = activeTab === 'Task List' || activeTab === 'Overview' || activeTab === 'Board' || activeTab === 'Gantt';
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
    enabled: !!project && needsTasks,
    staleTime: 60_000,
  });

  // Workflow statuses power the Kanban columns
  const { data: statuses = [] } = useQuery({
    queryKey: ['workflow-statuses', project?.workflowId ?? 'default'],
    queryFn: () => api.workflows.statuses(project?.workflowId ?? 'default'),
    enabled: !!project && (activeTab === 'Board'),
    staleTime: 5 * 60_000,
  });

  function invalidateTasks() {
    qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
  }

  async function handleMove(taskId: string, statusId: string) {
    // Optimistic: update cache immediately so the card stays in the new column
    qc.setQueryData<ApiTask[]>(['tasks', projectId], old =>
      (old ?? []).map(t => t.id === taskId
        ? { ...t, currentStatus: statuses.find(s => s.id === statusId) ?? t.currentStatus }
        : t));
    try {
      await api.tasks.setStatus(taskId, statusId);
    } finally {
      invalidateTasks();
    }
  }

  if (projLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden animate-pulse">
        {/* Header skeleton */}
        <div className="bg-white border-b border-gray-200 shrink-0 px-6 py-4">
          <div className="w-24 h-4 bg-gray-200 rounded mb-3" />
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="w-20 h-6 bg-gray-200 rounded-full" />
                <div className="w-24 h-6 bg-gray-100 rounded-full" />
              </div>
              <div className="w-64 h-7 bg-gray-200 rounded" />
              <div className="w-96 h-4 bg-gray-100 rounded" />
            </div>
            <div className="flex gap-2 shrink-0">
              <div className="w-9 h-9 bg-gray-100 rounded-lg" />
              <div className="w-24 h-9 bg-gray-200 rounded-lg" />
            </div>
          </div>
          {/* Stats row skeleton */}
          <div className="flex items-center gap-6 mt-2">
            <div className="w-20 h-4 bg-gray-100 rounded" />
            <div className="w-20 h-4 bg-gray-100 rounded" />
            <div className="w-28 h-4 bg-gray-100 rounded" />
            <div className="flex items-center gap-2 ml-auto">
              <div className="w-20 h-3 bg-gray-100 rounded" />
              <div className="w-32 h-2 bg-gray-100 rounded-full" />
            </div>
          </div>
        </div>
        {/* Tab bar skeleton */}
        <div className="bg-white border-b border-gray-100 px-6 flex gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-20 h-10 bg-gray-100 rounded mt-1" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50">
                <div className="w-4 h-4 rounded border-2 border-gray-200 shrink-0" />
                <div className="flex-1 h-4 bg-gray-100 rounded" />
                <div className="w-24 h-3 bg-gray-100 rounded hidden md:block" />
                <div className="w-16 h-3 bg-gray-100 rounded hidden lg:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (projError || !project) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-8">
        <p className="text-gray-500 font-medium">Could not load project</p>
        <p className="text-sm text-gray-400 mt-1">Make sure the API server is running on port 4000</p>
        <Link href="/projects" className="mt-4 text-sm text-brand-600 hover:underline">← Back to Projects</Link>
      </div>
    );
  }

  const phase = PHASE_META[project.projectPhase as Phase] ?? PHASE_META['PLANNING'];
  const priority = PRIORITY_META[project.priority as Priority] ?? PRIORITY_META['MEDIUM'];
  const defaultTaskList = project.taskLists?.find(tl => tl.isDefault) ?? project.taskLists?.[0];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0">
        <div className="px-6 py-4">
          <Link href="/projects" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 w-fit">
            <ArrowLeft size={14} /> All Projects
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', phase.bg, phase.text)}>
                  {phase.label}
                </span>
                <span className={clsx('text-xs font-semibold', priority.color)}>{priority.label} Priority</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
              {project.description && (
                <p className="text-sm text-gray-500 mt-1 max-w-xl">{project.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                <MoreHorizontal size={18} />
              </button>
              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
              >
                <Plus size={14} /> Add Task
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-500">
              <CheckSquare size={14} />
              <span><span className="font-medium text-gray-900">{project._count?.projectTasks ?? tasks.length}</span> tasks</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Users size={14} />
              <span><span className="font-medium text-gray-900">{project._count?.members ?? project.members?.length ?? 0}</span> members</span>
            </div>
            {project.dueDate && (
              <div className="flex items-center gap-1.5 text-gray-500">
                <Calendar size={14} />
                <span>Due <span className="font-medium text-gray-900">
                  {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span></span>
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">{project.completionPercentage}% complete</span>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${project.completionPercentage}%`, backgroundColor: '#E8533A' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-1 px-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {/* Tab content */}
      <div className={clsx('flex-1 overflow-hidden', activeTab === 'Board' ? 'p-4' : activeTab === 'Gantt' ? '' : 'overflow-y-auto p-6')}>
        {activeTab === 'Task List' && (
          <TaskListView
            tasks={tasks}
            loading={tasksLoading}
            onTaskClick={task => setSelectedTask(task)}
            onAddTask={() => setShowAddTask(true)}
          />
        )}
        {activeTab === 'Board' && (
          <KanbanBoard
            tasks={tasks}
            statuses={statuses}
            onTaskClick={t => setSelectedTask(t)}
            onAddTask={() => setShowAddTask(true)}
            onMove={handleMove}
          />
        )}
        {activeTab === 'Overview' && <OverviewView project={project} tasks={tasks} />}
        {activeTab === 'Gantt' && <GanttView tasks={tasks} project={project} />}
        {activeTab === 'Issues' && <IssuesTab projectId={projectId} />}
        {activeTab === 'Activity' && <ActivityTab projectId={projectId} />}
        {activeTab === 'Timesheets' && <TimesheetsTab projectId={projectId} />}
        {activeTab === 'Files' && <FilesTab />}
        {activeTab === 'Discussions' && <DiscussionsTab projectId={projectId} />}
      </div>

      {showAddTask && (
        <AddTaskModal
          projectId={projectId}
          taskListId={defaultTaskList?.id ?? 'general'}
          onClose={() => setShowAddTask(false)}
          onSuccess={invalidateTasks}
        />
      )}

      <TaskDetailPanel
        task={selectedTask}
        projectId={projectId}
        onClose={() => setSelectedTask(null)}
        onUpdated={updated => {
          setSelectedTask(updated);
          invalidateTasks();
        }}
        onDeleted={() => {
          setSelectedTask(null);
          invalidateTasks();
        }}
      />
    </div>
  );
}

// ── Task List View ─────────────────────────────────────────────────────────────

function TaskListView({
  tasks, loading, onTaskClick, onAddTask,
}: {
  tasks: ApiTask[];
  loading: boolean;
  onTaskClick: (task: ApiTask) => void;
  onAddTask: () => void;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 animate-pulse">
            <div className="w-4 h-4 rounded border-2 border-gray-200 shrink-0" />
            <div className="flex-1 h-4 bg-gray-100 rounded" />
            <div className="w-24 h-3 bg-gray-100 rounded hidden md:block" />
            <div className="w-16 h-3 bg-gray-100 rounded hidden lg:block" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* List header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <LayoutList size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">General</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tasks.length}</span>
        </div>
        <button onClick={onAddTask} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
          <Plus size={12} /> Add task
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
        <span className="flex-1">Task</span>
        <span className="w-28 hidden md:block">Status</span>
        <span className="w-20 hidden lg:block">Priority</span>
        <span className="w-24 hidden sm:block">Assignee</span>
        <span className="w-24 hidden lg:block text-right">Due Date</span>
      </div>

      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-400">
          <CheckSquare size={32} className="mb-3 text-gray-200" />
          <p>No tasks yet</p>
          <button onClick={onAddTask} className="mt-2 text-brand-600 hover:underline text-xs font-medium">
            Add the first task
          </button>
        </div>
      )}

      {tasks.map((task, i) => {
        const isClosed = task.currentStatus?.type === 'CLOSED' || task.completionPercentage === 100;
        const statusName = task.currentStatus?.name ?? 'Open';
        const statusColor = task.currentStatus?.colorHex ?? '#64748b';
        const firstAssignee = task.assignees?.[0];
        const assigneeInitials = firstAssignee ? userInitials(firstAssignee.user) : null;

        return (
          <div
            key={task.id}
            onClick={() => onTaskClick(task)}
            className={clsx(
              'flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer',
              i < tasks.length - 1 && 'border-b border-gray-50',
            )}
          >
            <div className={clsx(
              'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center',
              isClosed ? 'bg-green-500 border-green-500' : 'border-gray-300',
            )}>
              {isClosed && (
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </div>

            <span className={clsx('flex-1 text-sm min-w-0 truncate', isClosed ? 'line-through text-gray-400' : 'text-gray-800')}>
              {task.title}
            </span>

            <div className="hidden md:flex items-center gap-1.5 w-28 shrink-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
              <span className="text-xs text-gray-600 truncate">{statusName}</span>
            </div>

            <div className="hidden lg:block w-20 shrink-0">
              <span className={clsx('text-xs font-medium', PRIORITY_FLAG[task.priority] ?? 'text-gray-400')}>
                <Flag size={11} className="inline mr-1" />
                {task.priority ? task.priority.charAt(0) + task.priority.slice(1).toLowerCase() : '—'}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2 w-24 shrink-0">
              {assigneeInitials ? (
                <div
                  title={`${firstAssignee!.user.firstName} ${firstAssignee!.user.lastName ?? ''}`.trim()}
                  className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white', avatarColorFor(firstAssignee!.user.id))}
                >
                  {assigneeInitials}
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-200" title="Unassigned" />
              )}
            </div>

            <span className="hidden lg:block w-24 shrink-0 text-right text-xs text-gray-500">
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            </span>
          </div>
        );
      })}

      <div
        onClick={onAddTask}
        className="flex items-center gap-3 px-5 py-3 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors border-t border-dashed border-gray-200"
      >
        <Plus size={14} /> Add a task...
      </div>
    </div>
  );
}

// ── Overview View ──────────────────────────────────────────────────────────────

function OverviewView({ project, tasks }: { project: ApiProject; tasks: ApiTask[] }) {
  const statusCounts: Record<string, { count: number; color: string }> = {};
  for (const t of tasks) {
    const name = t.currentStatus?.name ?? 'Open';
    const color = t.currentStatus?.colorHex ?? '#64748b';
    if (!statusCounts[name]) statusCounts[name] = { count: 0, color };
    statusCounts[name].count++;
  }
  const statuses = Object.entries(statusCounts).map(([label, { count, color }]) => ({ label, count, color }));
  const members = project.members ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Progress card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Overall Progress</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="#E8533A" strokeWidth="3"
                strokeDasharray={`${project.completionPercentage} ${100 - project.completionPercentage}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-900">{project.completionPercentage}%</span>
            </div>
          </div>
          <div className="space-y-2">
            {statuses.length === 0 ? (
              <p className="text-sm text-gray-400">No tasks yet</p>
            ) : statuses.map(s => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-gray-600">{s.label}</span>
                <span className="font-medium text-gray-900 ml-auto pl-4">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Team Members</h3>
        <div className="space-y-3">
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">No members assigned</p>
          ) : members.map((m, i) => (
            <div key={m.userId} className="flex items-center gap-3">
              <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', avatarColorFor(m.user.id))}>
                {userInitials(m.user)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{`${m.user.firstName} ${m.user.lastName ?? ''}`.trim()}</p>
                <p className="text-xs text-gray-500">{m.projectRole ?? (i === 0 ? 'Manager' : 'Member')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
