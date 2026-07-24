'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, CheckSquare, Users, Calendar, Pencil,
  LayoutList, Flag, UserPlus, X as XIcon, Lock as LockIcon,
  CheckCircle2, Archive, RotateCcw,
} from 'lucide-react';
import clsx from 'clsx';
import { KanbanBoard } from '@/components/projects/KanbanBoard';
import GanttView from '@/components/projects/GanttView';
import DiscussionsTab from '@/components/projects/DiscussionsTab';
import IssuesTab from '@/components/projects/IssuesTab';
import ActivityTab from '@/components/projects/ActivityTab';
import TimesheetsTab from '@/components/projects/TimesheetsTab';
import FilesTab from '@/components/projects/FilesTab';
import { EditProjectModal } from '@/components/projects/EditProjectModal';
import { ProjectCapacityTab } from '@/components/projects/ProjectCapacityTab';
import { PHASE_META, PRIORITY_META, type Phase, type Priority } from '@/lib/mock-data';
import { AddTaskModal } from '@/components/tasks/AddTaskModal';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import { api, type ApiProject, type ApiTask, type WorkflowStatus } from '@/lib/api';
import { useOrg, byName } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { useToast } from '@/components/ui/Toast';
import { isTaskClosed, taskAssigneeUsers, OPEN_TYPE, CLOSED_TYPE } from '@/lib/tasks';
import { formatDate } from '@/lib/date';

type Tab = 'Overview' | 'Task List' | 'Board' | 'Gantt' | 'Capacity' | 'Files' | 'Discussions' | 'Issues' | 'Activity' | 'Timesheets';
// Timesheets is a core, frequently-used tab, so it sits up front (3rd) rather than buried.
const BASE_TABS: Tab[] = ['Overview', 'Task List', 'Timesheets', 'Board', 'Gantt', 'Files', 'Issues', 'Activity', 'Discussions'];

const PRIORITY_FLAG: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-amber-500',
  LOW: 'text-gray-400',
};

interface Props { projectId: string }

export function ProjectDetailClient({ projectId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState<Tab>('Task List');
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskStatusId, setAddTaskStatusId] = useState<string | undefined>(undefined);
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  // Lifecycle: Complete → Close → Reopen.
  async function runLifecycle(action: 'complete' | 'close' | 'reopen') {
    if (lifecycleBusy) return;
    const confirms: Record<typeof action, string | null> = {
      complete: 'Mark this project complete? Its work is treated as finished.',
      close: 'Close this project? It moves to the Closed section (you can reopen it later).',
      reopen: null,
    };
    const msg = confirms[action];
    if (msg && !window.confirm(msg)) return;
    setLifecycleBusy(true);
    try {
      await api.projects[action](projectId);
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(action === 'complete' ? 'Project marked complete' : action === 'close' ? 'Project closed' : 'Project reopened', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the project', 'error');
    } finally {
      setLifecycleBusy(false);
    }
  }


  const { data: project, isLoading: projLoading, isError: projError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  // Project-type catalog (cached) → the readable label for this project's type badge.
  const { data: projectTypes = [] } = useQuery({
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: Infinity,
  });
  const typeLabel = projectTypes.find(t => t.value === project?.projectType)?.label;

  // Load tasks for any tab that renders them
  const needsTasks = activeTab === 'Task List' || activeTab === 'Overview' || activeTab === 'Board' || activeTab === 'Gantt';
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
    enabled: !!project && needsTasks,
    staleTime: 60_000,
    // Keep the current tasks visible while a new project's tasks load (or a background
    // refetch runs), so switching projects never flashes an empty board/list.
    placeholderData: keepPreviousData,
  });

  // Workflow statuses power the Kanban columns
  const { data: statuses = [] } = useQuery({
    queryKey: ['workflow-statuses', project?.workflowId ?? 'default'],
    queryFn: () => api.workflows.statuses(project?.workflowId ?? 'default'),
    // Needed by the Board (columns) AND the Task List (inline status control).
    enabled: !!project && (activeTab === 'Board' || activeTab === 'Task List'),
    staleTime: 5 * 60_000,
  });

  function openAddTask(statusId?: string) {
    setAddTaskStatusId(statusId);
    setShowAddTask(true);
  }

  function invalidateTasks() {
    // Invalidate broadly (M36 + L14): a task can appear in other projects/lists and
    // feeds the project cards + home dashboard analytics, so refresh them all — not
    // just the list this change was made from.
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['tasks-me'] });
    qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
    qc.invalidateQueries({ queryKey: ['activity'] }); // L29: refresh activity feeds after a change
  }

  async function handleMove(taskId: string, statusId: string) {
    const status = statuses.find(s => s.id === statusId);
    const movedTask = tasks.find(t => t.id === taskId);
    // Optimistic: update cache immediately so the card stays in the new column
    qc.setQueryData<ApiTask[]>(['tasks', projectId], old =>
      (old ?? []).map(t => t.id === taskId
        ? { ...t, currentStatus: status ?? t.currentStatus }
        : t));
    try {
      await api.tasks.setStatus(taskId, statusId);
      toast(`"${movedTask?.title ?? 'Task'}" moved to ${status?.name ?? 'new status'}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the task status', 'error');
    } finally {
      invalidateTasks(); // refetches tasks + project → progress bar re-syncs
    }
  }


  if (projLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden animate-pulse">
        {/* Header skeleton */}
        <div className="bg-white border-b border-gray-200 shrink-0 px-4 sm:px-6 py-4">
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
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-20 h-10 bg-gray-100 rounded mt-1" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
  // Capacity is a manager-grade view, so the tab only appears for capacity.view holders —
  // and the API enforces it regardless (the tab is a convenience, not the gate).
  const TABS: Tab[] = can('capacity.view')
    ? [...BASE_TABS.slice(0, 5), 'Capacity', ...BASE_TABS.slice(5)]
    : BASE_TABS;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0">
        <div className="px-4 sm:px-6 py-4">
          <Link href="/projects" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 w-fit">
            <ArrowLeft size={14} /> All Projects
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {project.code ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 font-mono ring-1 ring-gray-200">
                    {project.code}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 font-mono ring-1 ring-amber-200" title="A PID authority will assign the Project ID">
                    PID pending
                  </span>
                )}
                {typeLabel && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    {typeLabel}
                  </span>
                )}
                {project.client && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-100">
                    {project.client.name}
                  </span>
                )}
                <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', phase.bg, phase.text)}>
                  {phase.label}
                </span>
                <span className={clsx('text-xs font-semibold', priority.color)}>{priority.label} Priority</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{project.title}</h1>
              {project.description && (
                <p className="text-sm text-gray-500 mt-1 max-w-xl">{project.description}</p>
              )}
              {project.patents && project.patents.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] text-gray-400">Patents:</span>
                  {project.patents
                    .slice()
                    .sort((a, b) => a.patent.serial - b.patent.serial)
                    .map(({ patent }) => (
                      <span key={patent.id} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                        {patent.handle}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {can('project.update') && ['ACTIVE', 'ON_HOLD'].includes(project.projectPhase) && (
                <button
                  onClick={() => runLifecycle('complete')}
                  disabled={lifecycleBusy}
                  title="Mark this project as complete"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> Mark complete
                </button>
              )}
              {can('project.update') && project.projectPhase === 'COMPLETED' && (
                <button
                  onClick={() => runLifecycle('close')}
                  disabled={lifecycleBusy}
                  title="Close and archive this project to the Closed section"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <Archive size={14} /> Close
                </button>
              )}
              {can('project.update') && ['COMPLETED', 'CLOSED'].includes(project.projectPhase) && (
                <button
                  onClick={() => runLifecycle('reopen')}
                  disabled={lifecycleBusy}
                  title="Reopen this project and return it to Active"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Reopen
                </button>
              )}
              {can('project.update') && project.projectPhase !== 'CLOSED' && (
                <button
                  onClick={() => setEditingProject(true)}
                  title="Edit the project's details and deadlines"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              {(() => {
                const locked = ['COMPLETED', 'CLOSED'].includes(project.projectPhase);
                return (
                  <button
                    onClick={() => openAddTask()}
                    disabled={!defaultTaskList || locked}
                    title={locked ? 'This project is ' + (project.projectPhase === 'CLOSED' ? 'closed' : 'complete') + ' — reopen it to add work' : defaultTaskList ? 'Add a task' : 'This project has no task list yet'}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} /> Add Task
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center flex-wrap gap-x-6 gap-y-2 mt-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-500">
              <CheckSquare size={14} />
              <span><span className="font-medium text-gray-900">{project._count?.projectTasks ?? tasks.length}</span> tasks</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Users size={14} />
              <span><span className="font-medium text-gray-900">{project._count?.members ?? project.members?.length ?? 0}</span> members</span>
            </div>
            {/* The client date is only present when the actor may see it; the team's own
                deadline is always just "Deadline". */}
            {project.dueDate && (
              <div className="flex items-center gap-1.5 text-gray-500" title="Deadline">
                <Calendar size={14} />
                <span>Deadline <span className="font-medium text-gray-900">{formatDate(project.dueDate, { month: 'long', day: 'numeric', year: 'numeric' })}</span></span>
              </div>
            )}
            {project.clientDueDate && (
              <div
                className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full"
                title="Client deadline — visible to managers and admins only"
              >
                <LockIcon size={12} />
                <span>Client <span className="font-semibold">{formatDate(project.clientDueDate, { month: 'long', day: 'numeric', year: 'numeric' })}</span></span>
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
          {TABS.map((tab: Tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors',
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
      <div className={clsx('flex-1 overflow-hidden', activeTab === 'Board' ? 'p-4' : activeTab === 'Gantt' ? '' : 'overflow-y-auto p-4 sm:p-6')}>
        {activeTab === 'Task List' && (
          <TaskListView
            tasks={tasks}
            loading={tasksLoading}
            statuses={statuses}
            canAddTask={!!defaultTaskList}
            listName={defaultTaskList?.name}
            onTaskClick={task => setSelectedTask(task)}
            onAddTask={() => openAddTask()}
            onStatusChange={handleMove}
          />
        )}
        {activeTab === 'Board' && (
          <KanbanBoard
            tasks={tasks}
            statuses={statuses}
            onTaskClick={t => setSelectedTask(t)}
            onAddTask={statusId => openAddTask(statusId)}
            onMove={handleMove}
          />
        )}
        {activeTab === 'Overview' && <OverviewView project={project} tasks={tasks} />}
        {activeTab === 'Capacity' && <ProjectCapacityTab projectId={projectId} />}
        {activeTab === 'Files' && <FilesTab projectId={projectId} />}
        {activeTab === 'Gantt' && <GanttView tasks={tasks} project={project} />}
        {activeTab === 'Issues' && <IssuesTab projectId={projectId} />}
        {activeTab === 'Activity' && <ActivityTab projectId={projectId} />}
        {activeTab === 'Timesheets' && <TimesheetsTab projectId={projectId} />}
        {activeTab === 'Discussions' && <DiscussionsTab projectId={projectId} />}
      </div>

      {showAddTask && defaultTaskList && (
        <AddTaskModal
          projectId={projectId}
          taskListId={defaultTaskList.id}
          initialStatusId={addTaskStatusId}
          workflowId={project.workflowId}
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

      {editingProject && (
        <EditProjectModal
          project={project}
          onClose={() => setEditingProject(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['project', projectId] });
            qc.invalidateQueries({ queryKey: ['projects'] });
            qc.invalidateQueries({ queryKey: ['capacity'] }); // the board reads these dates
          }}
        />
      )}
    </div>
  );
}


function TaskListView({
  tasks, loading, statuses, canAddTask, listName, onTaskClick, onAddTask, onStatusChange,
}: {
  tasks: ApiTask[];
  loading: boolean;
  statuses: WorkflowStatus[];
  canAddTask: boolean;
  listName?: string;
  onTaskClick: (task: ApiTask) => void;
  onAddTask: () => void;
  onStatusChange: (taskId: string, statusId: string) => void;
}) {
  // Toggle done↔open from the row checkbox, via the workflow (reversible).
  function toggleComplete(task: ApiTask) {
    const target = isTaskClosed(task) ? statuses.find(s => s.type === OPEN_TYPE) : statuses.find(s => s.type === CLOSED_TYPE);
    if (target) onStatusChange(task.id, target.id);
  }

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
          <span className="text-sm font-semibold text-gray-700">{listName ?? 'General'}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tasks.length}</span>
        </div>
        <button onClick={onAddTask} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
          <Plus size={12} /> Add task
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
        <span className="w-4 shrink-0" />
        <span className="flex-1">Task</span>
        <span className="w-32 hidden sm:block">Status</span>
        <span className="w-20 hidden lg:block">Priority</span>
        <span className="w-20 hidden sm:block">Assignees</span>
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
        const closed = isTaskClosed(task);

        return (
          <div
            key={task.id}
            onClick={() => onTaskClick(task)}
            className={clsx(
              'flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer',
              i < tasks.length - 1 && 'border-b border-gray-50',
            )}
          >
            <button
              onClick={e => { e.stopPropagation(); toggleComplete(task); }}
              aria-label={closed ? 'Reopen task' : 'Mark task complete'}
              title={closed ? 'Completed — click to reopen' : 'Mark complete'}
              className={clsx(
                'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                closed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400',
              )}
            >
              {closed && (
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>

            <span className={clsx('flex-1 text-sm min-w-0 truncate', closed ? 'line-through text-gray-400' : 'text-gray-800')}>
              {task.title}
            </span>

            {/* Status control */}
            <div className="hidden sm:block w-32 shrink-0" onClick={e => e.stopPropagation()}>
              <select
                value={task.currentWorkflowStatusId ?? ''}
                onChange={e => onStatusChange(task.id, e.target.value)}
                disabled={statuses.length === 0}
                aria-label="Task status"
                className="w-full text-xs font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer disabled:cursor-default"
                style={task.currentStatus ? { backgroundColor: task.currentStatus.colorHex + '22', color: task.currentStatus.colorHex } : { backgroundColor: '#f1f5f9', color: '#64748b' }}
              >
                {!task.currentStatus && <option value="">—</option>}
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>


            <div className="hidden lg:block w-20 shrink-0">
              <span className={clsx('text-xs font-medium', PRIORITY_FLAG[task.priority] ?? 'text-gray-400')}>
                <Flag size={11} className="inline mr-1" />
                {task.priority ? task.priority.charAt(0) + task.priority.slice(1).toLowerCase() : '—'}
              </span>
            </div>

            <div className="hidden sm:flex items-center w-20 shrink-0">
              <AvatarStack
                users={taskAssigneeUsers(task)}
                size={24}
                max={3}
                empty={<div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-200" title="Unassigned" />}
              />
            </div>

            <span className="hidden lg:block w-24 shrink-0 text-right text-xs text-gray-500">
              {formatDate(task.dueDate)}
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
  const members = [...(project.members ?? [])].sort((a, b) => byName(a.user, b.user));

  // #11: add / remove project members.
  const { users } = useOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canManage = can('project.update');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const memberIds = new Set(members.map(m => m.userId));
  const candidates = (users ?? []).filter(u => !memberIds.has(u.id));
  const refresh = () => { qc.invalidateQueries({ queryKey: ['project', project.id] }); qc.invalidateQueries({ queryKey: ['projects'] }); };
  async function addMember(userId: string) {
    setBusy(true);
    try { await api.projects.addMember(project.id, userId); setAdding(false); refresh(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not add member.'); }
    finally { setBusy(false); }
  }
  async function removeMember(userId: string) {
    if (!window.confirm('Remove this member from the project?')) return;
    setBusy(true);
    try { await api.projects.removeMember(project.id, userId); refresh(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not remove member.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* Progress card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
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
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Team Members</h3>
          {canManage && !adding && candidates.length > 0 && (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <UserPlus size={13} /> Add member
            </button>
          )}
        </div>
        {canManage && adding && (
          <div className="flex items-center gap-2 mb-3">
            <select
              disabled={busy}
              defaultValue=""
              onChange={e => { if (e.target.value) addMember(e.target.value); }}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5"
              autoFocus
            >
              <option value="" disabled>Select a teammate…</option>
              {candidates.map(u => (
                <option key={u.id} value={u.id}>{`${u.firstName} ${u.lastName ?? ''}`.trim()}</option>
              ))}
            </select>
            <button onClick={() => setAdding(false)} className="p-1.5 text-gray-400 hover:text-gray-600"><XIcon size={15} /></button>
          </div>
        )}
        <div className="space-y-3">
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">No members assigned</p>
          ) : members.map((m, i) => (
            <div key={m.userId} className="flex items-center gap-3 group">
              <Avatar user={m.user} size={32} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{`${m.user.firstName} ${m.user.lastName ?? ''}`.trim()}</p>
                <p className="text-xs text-gray-500">{m.projectRole ?? (i === 0 ? 'Manager' : 'Member')}</p>
              </div>
              {canManage && (m.projectRole !== 'MANAGER') && (
                <button
                  onClick={() => removeMember(m.userId)}
                  disabled={busy}
                  title="Remove from project"
                  className="ml-auto p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
