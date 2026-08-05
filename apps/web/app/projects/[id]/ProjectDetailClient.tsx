'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, CheckSquare, Users, Calendar, Pencil,
  LayoutList, Flag, UserPlus, X as XIcon, Lock as LockIcon,
  CheckCircle2, Archive, RotateCcw, KeyRound, Truck, Clock,
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
import { CompleteProjectModal } from '@/components/projects/CompleteProjectModal';
import { ProjectCapacityTab } from '@/components/projects/ProjectCapacityTab';
import { TaskListView, OverviewView } from '@/components/projects/views';
import { RoundCard } from '@/components/projects/RoundCard';
import { RoundTabContent } from '@/components/projects/RoundTabContent';
import { TaskGroups } from '@/components/projects/TaskGroups';
import { AddRoundModal } from '@/components/projects/AddRoundModal';
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
import { formatDate, formatDateTimeIST } from '@/lib/date';

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
  const [attachingPid, setAttachingPid] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [completing, setCompleting] = useState(false); // the completion form (delivery + hours)
  const [addingRound, setAddingRound] = useState(false); // "new project under this PID"
  // Which project a task came from, so the detail panel edits the right one on a multi-project PID.
  const [taskProjectId, setTaskProjectId] = useState(projectId);

  // Lifecycle: Complete → Close → Reopen. Completing goes through its own form (it has to capture
  // the client delivery date and the hours), so it is NOT a plain confirm like the others.
  async function runLifecycle(
    action: 'complete' | 'close' | 'reopen' | 'reinitialize',
    completion?: { clientDeliveryDate: string; workingHours: number; actualHours?: number },
  ) {
    if (lifecycleBusy) return;
    const confirms: Record<typeof action, string | null> = {
      complete: null, // asked for in the modal instead
      close: 'Close this project? It moves to the Closed section (its Project ID shows as discontinued until you reopen it).',
      reopen: null,
      reinitialize: 'Re-initialize this project for a returning client? It reopens with the SAME Project ID and reuses all the existing data.',
    };
    const msg = confirms[action];
    if (msg && !window.confirm(msg)) return;
    setLifecycleBusy(true);
    try {
      if (action === 'complete') await api.projects.complete(projectId, completion);
      else await api.projects[action](projectId);
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(action === 'complete' ? 'Project marked complete' : action === 'close' ? 'Project closed' : action === 'reinitialize' ? 'Project re-initialized (same PID)' : 'Project reopened', 'success');
      if (action === 'complete') setCompleting(false);
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
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: 5 * 60_000,
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

  // Every project sharing this PID. A Gurgaon (single-project) PID reports multiRound=false and
  // the page renders exactly as it always has — the card layout is additive, not a replacement.
  const { data: roundsData } = useQuery({
    queryKey: ['project-rounds', projectId],
    queryFn: () => api.projects.rounds(projectId),
    enabled: !!project,
    staleTime: 30_000,
  });
  const multiRound = !!roundsData?.multiRound && (roundsData?.rounds?.length ?? 0) > 0;
  const rounds = roundsData?.rounds ?? [];

  // Workflow statuses power the Kanban columns
  const { data: statuses = [] } = useQuery({
    queryKey: ['workflow-statuses', project?.workflowId ?? 'default'],
    queryFn: () => api.workflows.statuses(project?.workflowId ?? 'default'),
    // Needed by the Board (columns) AND the Task List (inline status control).
    // On a multi-project PID every card's Task List and Board needs them, so load them there too.
    enabled: !!project && (activeTab === 'Board' || activeTab === 'Task List' || multiRound),
    staleTime: 5 * 60_000,
  });

  // On a multi-project PID the task is added to the round whose card was clicked, not to
  // whichever project the URL happens to point at.
  const [addTaskProjectId, setAddTaskProjectId] = useState(projectId);
  // Which GROUP the new task lands in. Null = the project's default group.
  const [addTaskListId, setAddTaskListId] = useState<string | null>(null);
  function openAddTask(statusId?: string, forProjectId?: string, taskListId?: string) {
    setAddTaskProjectId(forProjectId ?? projectId);
    setAddTaskListId(taskListId ?? null);
    setAddTaskStatusId(statusId);
    setShowAddTask(true);
  }
  /** The task list a new task should land in, for whichever project the card belongs to. */
  const addTaskList = addTaskListId
    ? { id: addTaskListId }
    : addTaskProjectId === projectId
      ? (project?.taskLists?.find(tl => tl.isDefault) ?? project?.taskLists?.[0])
      : (() => {
          const r = rounds.find(x => x.id === addTaskProjectId);
          return r?.taskLists?.find(tl => tl.isDefault) ?? r?.taskLists?.[0];
        })();

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

  // A reopened (or otherwise pending) project needs a fresh PID — an authority attaches one
  // (auto-assigned from the next free serial). The old PID stayed discontinued on close.
  async function handleAttachPid() {
    setAttachingPid(true);
    try {
      const r = await api.projects.attachPid(projectId);
      toast(`Project ID ${r.pid} attached`, 'success');
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not attach a Project ID', 'error');
    } finally {
      setAttachingPid(false);
    }
  }

  async function handleMove(taskId: string, statusId: string) {
    const status = statuses.find(s => s.id === statusId);
    const movedTask = tasks.find(t => t.id === taskId);
    const key = ['tasks', projectId] as const;
    const snapshot = qc.getQueryData<ApiTask[]>(key); // for rollback if the move is rejected
    // Optimistic: patch BOTH the status object (Board column) AND currentWorkflowStatusId (the
    // id the Task List <select> binds to) — patching only currentStatus left the dropdown
    // snapping straight back to the old value.
    qc.setQueryData<ApiTask[]>(key, old =>
      (old ?? []).map(t => t.id === taskId
        ? { ...t, currentStatus: status ?? t.currentStatus, currentWorkflowStatusId: statusId }
        : t));
    try {
      await api.tasks.setStatus(taskId, statusId);
      toast(`"${movedTask?.title ?? 'Task'}" moved to ${status?.name ?? 'new status'}`, 'success');
      invalidateTasks(); // refetch truth (progress bar etc.) — only on success
    } catch (e) {
      if (snapshot) qc.setQueryData(key, snapshot); // roll the card back where it came from
      toast(e instanceof Error ? e.message : 'Could not update the task status', 'error');
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
    // Honest copy instead of blaming a local dev server — this page 403s legitimately whenever
    // you open a matter you're not staffed on, or 404s for a moved/deleted project.
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-8">
        <p className="text-gray-600 font-medium">Couldn&apos;t open this project</p>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">It may have been moved, or you don&apos;t have access to it.</p>
        <Link href="/projects" className="mt-4 text-sm text-brand-600 hover:underline">← Back to Projects</Link>
      </div>
    );
  }

  const phase = PHASE_META[project.projectPhase as Phase] ?? PHASE_META['PLANNING'];
  const priority = PRIORITY_META[project.priority as Priority] ?? PRIORITY_META['MEDIUM'];
  const defaultTaskList = project.taskLists?.find(tl => tl.isDefault) ?? project.taskLists?.[0];
  // The project's manager — used to pre-fill each task's Project Manager (still editable per task).
  const projectManagerId = project.members?.find(m => m.projectRole === 'MANAGER' && m.isActive)?.userId ?? null;
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

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {project.code ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 font-mono ring-1 ring-gray-200">
                    {project.code}
                    {multiRound && (
                      <span className="font-sans font-medium text-gray-500">
                        · {rounds.length} project{rounds.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 font-mono ring-1 ring-amber-200" title="A PID authority will assign the Project ID">
                      PID pending
                    </span>
                    {can('project.generate_pid') && (
                      <button
                        onClick={handleAttachPid}
                        disabled={attachingPid}
                        title="Attach a fresh Project ID to this project"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 transition-colors"
                      >
                        <KeyRound size={12} /> {attachingPid ? 'Attaching…' : 'Attach PID'}
                      </button>
                    )}
                  </>
                )}
                {typeLabel && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    {typeLabel}
                  </span>
                )}
                {/* The DELIVERY client. The code is shareable; the name only arrives from the
                    server when the viewer is allowed it, so nothing is hidden in the markup. */}
                {project.projectClient && (
                  <Link href="/clients"
                    title={project.projectClient.name ? `Client: ${project.projectClient.name}` : 'Client code — open the client ledger'}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-100 hover:bg-purple-100">
                    <span className="font-mono font-bold">{project.projectClient.code}</span>
                    {project.projectClient.name && <span>{project.projectClient.name}</span>}
                  </Link>
                )}
                {!project.projectClient && project.client && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-100">
                    {project.client.name}
                  </span>
                )}
                <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', phase.bg, phase.text)}>
                  {phase.label}
                </span>
                <span className={clsx('text-xs font-semibold', priority.color)}>{priority.label} Priority</span>
              </div>
              <h1 title={project.title} className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{project.title}</h1>
              {project.description && (
                <p className="text-sm text-gray-500 mt-1 max-w-xl line-clamp-2">{project.description}</p>
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
              {/* A returning client keeps this PID; their next piece of work becomes another
                  project under it rather than being forced into this one's task list. */}
              {multiRound && can('project.create') && project.code && (
                <button
                  onClick={() => setAddingRound(true)}
                  title={`Start another project under ${project.code}`}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  <Plus size={14} /> New project
                </button>
              )}
              {can('project.update') && ['ACTIVE', 'ON_HOLD'].includes(project.projectPhase) && (
                <button
                  onClick={() => setCompleting(true)}
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
              {/* On a SINGLE-project PID this is the returning-client action: reopen in place,
                  keeping the same Project ID.

                  On a MULTI-project PID the returning client gets a NEW project instead ("New
                  project" above), so the same button here would say two contradictory things.
                  It stays available — you still need a way to undo a completion made by mistake —
                  but it is worded as what it actually does: reopen THIS piece of work. */}
              {can('project.update') && project.projectPhase === 'COMPLETED' && (
                <button
                  onClick={() => runLifecycle('reinitialize')}
                  disabled={lifecycleBusy}
                  title={multiRound
                    ? 'Reopen this project — use “New project” for a returning client with new work'
                    : 'Re-initialize for a returning client — same Project ID, existing data reused'}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} /> {multiRound ? 'Reopen' : 'Re-initialize'}
                </button>
              )}
              {/* A CLOSED project reopens with a FRESH PID (the old one was discontinued on close). */}
              {can('project.update') && project.projectPhase === 'CLOSED' && (
                <button
                  onClick={() => runLifecycle('reopen')}
                  disabled={lifecycleBusy}
                  title="Reopen this project — same Project ID, back to Working"
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
            {/* Delivery record — only exists once the project has been completed, and it is the
                first thing anyone asks about a finished matter. */}
            {project.clientDeliveryDate && (
              <div className="flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full" title="When the work reached the client">
                <Truck size={12} />
                <span>Delivered <span className="font-semibold">{formatDateTimeIST(project.clientDeliveryDate)}</span></span>
              </div>
            )}
            {(project.workingHours != null || project.actualHours != null) && (
              <div className="flex items-center gap-1.5 text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full"
                title="Working hours = the time on paper (timesheets/estimates). Actual = what it really took.">
                <Clock size={12} />
                <span>
                  {project.workingHours != null && <>Working <span className="font-semibold">{project.workingHours}h</span></>}
                  {project.workingHours != null && project.actualHours != null && ' · '}
                  {project.actualHours != null && <>Actual <span className="font-semibold">{project.actualHours}h</span></>}
                </span>
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
        <nav className="flex items-center gap-1 px-4 sm:px-6 overflow-x-auto">
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
      {/* A multi-project PID stacks one card per project and shows the SAME tab inside each, so
          the whole client history is visible in one place. A single-project PID falls through to
          the original rendering below, byte for byte. */}
      {multiRound ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {rounds.map((r, i) => (
            <RoundCard
              key={r.id}
              round={r}
              index={i}
              total={rounds.length}
              canEdit={can('project.update')}
              // Finished work starts collapsed; the live round (and the one you navigated to) is open.
              defaultOpen={r.id === projectId || !['COMPLETED', 'CLOSED'].includes(r.projectPhase)}
            >
              <RoundTabContent
                round={r}
                tab={activeTab}
                statuses={statuses}
                onTaskClick={(t, pid) => { setTaskProjectId(pid); setSelectedTask(t); }}
                canEdit={can('task.create')}
                onAddTask={(pid, statusId) => openAddTask(statusId, pid)}
                onAddTaskToGroup={(pid, listId) => openAddTask(undefined, pid, listId)}
              />
            </RoundCard>
          ))}
        </div>
      ) : (
      <div className={clsx('flex-1 overflow-hidden', activeTab === 'Board' ? 'p-4' : activeTab === 'Gantt' ? '' : 'overflow-y-auto p-4 sm:p-6')}>
        {activeTab === 'Task List' && (
          /* Grouped: "General" is a placeholder nobody chose, so groups can be renamed and added. */
          <TaskGroups
            projectId={projectId}
            tasks={tasks}
            loading={tasksLoading}
            statuses={statuses}
            canEdit={can('task.create')}
            onTaskClick={task => setSelectedTask(task)}
            onAddTask={listId => openAddTask(undefined, projectId, listId)}
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
      )}

      {showAddTask && addTaskList && (
        <AddTaskModal
          projectId={addTaskProjectId}
          taskListId={addTaskList.id}
          initialStatusId={addTaskStatusId}
          workflowId={project.workflowId}
          onClose={() => setShowAddTask(false)}
          onSuccess={invalidateTasks}
        />
      )}

      <TaskDetailPanel
        task={selectedTask}
        projectId={multiRound ? taskProjectId : projectId}
        projectClosed={['COMPLETED', 'CLOSED'].includes(project.projectPhase)}
        defaultManagerId={projectManagerId}
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

      {addingRound && project.code && (
        <AddRoundModal
          fromProjectId={projectId}
          pid={project.code}
          onClose={() => setAddingRound(false)}
          onCreated={() => {
            setAddingRound(false);
            qc.invalidateQueries({ queryKey: ['project-rounds', projectId] });
          }}
        />
      )}

      {/* Completing asks for the client delivery date and the hours — the only moment anyone
          actually knows them. */}
      {completing && (
        <CompleteProjectModal
          projectId={projectId}
          projectTitle={project.title}
          busy={lifecycleBusy}
          onClose={() => setCompleting(false)}
          onConfirm={v => runLifecycle('complete', v)}
        />
      )}
    </div>
  );
}
