'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, CheckSquare, Users, Calendar, Pencil,
  LayoutList, Flag, UserPlus, X as XIcon, Lock as LockIcon,
  CheckCircle2, Archive, RotateCcw, KeyRound, Truck, Clock, Trash2, ChevronsDownUp, ChevronsUpDown, Layers,
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
import { TaskGroupModal } from '@/components/projects/TaskGroupModal';
import { ClientGroupChip } from '@/components/projects/ClientGroups';
import { CidBadge } from '@/components/projects/CidBadge';
import { CidMoveModal } from '@/components/projects/CidMoveModal';
import { PatentTagsEditor } from '@/components/projects/PatentTagsEditor';
import { PATENTS_AND_CLIENT_CODES } from '@/lib/features';
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
import { formatDate, formatDateIST, formatDateTimeIST } from '@/lib/date';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

type Tab = 'Overview' | 'Task List' | 'Board' | 'Gantt' | 'Capacity' | 'Files' | 'Discussions' | 'Issues' | 'Activity' | 'Timesheets';
// Timesheets is a core, frequently-used tab, so it sits up front (3rd) rather than buried.
// CLIENTS-FLOW: the work comes first on a client's page, so Task groups leads.
const BASE_TABS: Tab[] = ['Task List', 'Overview', 'Timesheets', 'Board', 'Gantt', 'Files', 'Issues', 'Activity', 'Discussions'];
/** CLIENTS-FLOW: what each tab is CALLED. The ids stay, because the round cards share them. */
const TAB_LABEL: Partial<Record<Tab, string>> = { 'Task List': 'Task groups' };

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
  const router = useRouter();
  const { can } = usePermissions();
  const { currentUser } = useOrg();
  const [activeTab, setActiveTab] = useState<Tab>('Task List');
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskStatusId, setAddTaskStatusId] = useState<string | undefined>(undefined);
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [completing, setCompleting] = useState(false); // the completion form (delivery + hours)
  const [movingCid, setMovingCid] = useState(false); // "this client's CID should change" — reassign/split/merge
  const [creatingGroup, setCreatingGroup] = useState(false); // CLIENTS-FLOW: "New task group" from the header
  // Which client a task came from, so the detail panel edits the right one on a multi-client CID.
  const [taskProjectId, setTaskProjectId] = useState(projectId);

  /**
   * Whether the project header is folded away.
   *
   * Expanded it carries the description, the client and patent lines and a row of statistics, and
   * on a laptop that is most of the window before a single task is visible — which is what people
   * actually came to look at. Folding it keeps the title, the phase, the actions and the tabs, and
   * gives the list back the screen.
   *
   * The choice is remembered per browser, because it is a working preference rather than a
   * property of the project: somebody who wants the detail out of the way wants it out of the way
   * on the next project too. It is read in an effect rather than during render — reading
   * localStorage while rendering makes the server and the client disagree, and React replaces the
   * markup wholesale when they do. Every access is guarded: a private window throws here.
   */
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  useEffect(() => {
    try { setHeaderCollapsed(localStorage.getItem('pdash.projectHeaderCollapsed') === '1'); } catch { /* storage blocked */ }
  }, []);
  function toggleHeader() {
    setHeaderCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('pdash.projectHeaderCollapsed', next ? '1' : '0'); } catch { /* storage blocked */ }
      return next;
    });
  }

  // Lifecycle: Complete → Close → Reopen. Completing goes through its own form (it has to capture
  // the client delivery date and the hours), so it is NOT a plain confirm like the others.
  async function runLifecycle(
    action: 'complete' | 'reopen' | 'reinitialize',
    completion?: { clientDeliveryDate: string; workingHours: number; actualHours?: number },
  ) {
    if (lifecycleBusy) return;
    const confirms: Record<typeof action, string | null> = {
      complete: null, // asked for in the modal instead
      reopen: null,
      reinitialize: 'Re-initialize this client? It reopens with the SAME CID and keeps all of its existing work.',
    };
    const msg = confirms[action];
    if (msg && !await confirmDialog(msg)) return;
    setLifecycleBusy(true);
    try {
      if (action === 'complete') await api.projects.complete(projectId, completion);
      else await api.projects[action](projectId);
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(action === 'complete' ? 'Client marked complete' : action === 'reinitialize' ? 'Client re-initialized (same CID)' : 'Client reopened', 'success');
      if (action === 'complete') setCompleting(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the client', 'error');
    } finally {
      setLifecycleBusy(false);
    }
  }

  /**
   * Delete the project — the reversible kind.
   *
   * This is the ONLY way a project reaches Administration → Deleted Data, where a Super Admin can
   * destroy it for good. Without it the permanent delete had no entry point at all: the screen
   * listed soft-deleted projects and nothing in the app could put one there, so the feature read
   * as built and was unreachable. Tasks had this already, on the task panel; projects did not.
   *
   * Deliberately NOT the same thing as Close. Closing is a lifecycle state a finished matter ends
   * in, and it keeps the project in every list and report. This removes it from them, and is for
   * a project that should not have existed — a duplicate, a typo, a test.
   */
  async function deleteProject() {
    if (lifecycleBusy) return;
    if (!await confirmDialog({
      title: 'Delete this client?',
      body: 'It stops appearing in clients, reports and the capacity board. Nothing is destroyed — '
        + 'a Super Admin can restore it, or remove it for good, from Administration → Deleted Data.',
      danger: true,
      confirmLabel: 'Delete',
    })) return;
    setLifecycleBusy(true);
    try {
      await api.projects.delete(projectId);
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast('Client deleted — restore it from Administration → Deleted Data', 'success');
      router.push('/projects');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the client', 'error');
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

  // Every project sharing this CID. A Gurgaon (single-project) CID reports multiRound=false and
  // the page renders exactly as it always has — the card layout is additive, not a replacement.
  const { data: roundsData } = useQuery({
    queryKey: ['project-rounds', projectId],
    queryFn: () => api.projects.rounds(projectId),
    enabled: !!project,
    staleTime: 30_000,
  });
  // CLIENTS-FLOW: a CID names ONE client now, and further work is a task group inside it — so the
  // stacked-rounds layout is only for a CID that genuinely holds more than one client (data from
  // before this change). It used to switch on for every CID with a single round, which drew the
  // client inside a "The project you opened" card and hid the client's own task-group controls.
  const multiRound = !!roundsData?.multiRound && (roundsData?.rounds?.length ?? 0) > 1;
  const rounds = roundsData?.rounds ?? [];

  /**
   * The cards, with the project the URL actually names pulled to the front.
   *
   * A CID that a returning client keeps coming back to holds several rounds, and every card
   * draws the SAME tab — so a stack of them is a stack of identically-shaped task lists for
   * different matters. The header says which project you opened; the cards did not, and the
   * first one you met was simply whichever round sorted earliest and happened to be live.
   * People logged time and moved statuses on the wrong client's work and had no way to tell.
   *
   * `index` is captured BEFORE the sort so the card still says "Project 2 of 3" — the round
   * number is a fact about the matter's history, not about where the card landed on screen.
   */
  const roundCards = useMemo(
    () => rounds
      .map((round, index) => ({ round, index, isThisProject: round.id === projectId }))
      .sort((a, b) => Number(b.isThisProject) - Number(a.isThisProject)),
    [rounds, projectId],
  );
  // Where the OTHER rounds begin, so the divider that introduces them is drawn exactly once.
  const firstOtherRound = roundCards.findIndex(c => !c.isThisProject);

  // Workflow statuses power the Kanban columns
  const { data: statuses = [] } = useQuery({
    queryKey: ['workflow-statuses', project?.workflowId ?? 'default'],
    queryFn: () => api.workflows.statuses(project?.workflowId ?? 'default'),
    // Needed by the Board (columns) AND the Task List (inline status control).
    // On a multi-project CID every card's Task List and Board needs them, so load them there too.
    enabled: !!project && (activeTab === 'Board' || activeTab === 'Task List' || multiRound),
    staleTime: 5 * 60_000,
  });

  // On a multi-project CID the task is added to the round whose card was clicked, not to
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
  /**
   * The task list a new task should land in, for whichever project the card belongs to.
   *
   * CLIENTS-FLOW: the first ACTIVE task group — the default one if it is still active. A completed
   * group takes no new work (the server refuses it), so offering it as the landing place would make
   * "Add task" fail for anyone whose first group is finished.
   */
  const firstActive = (lists?: { id: string; isDefault: boolean; status?: string }[]) =>
    lists?.find(tl => tl.isDefault && tl.status !== 'COMPLETED')
      ?? lists?.find(tl => tl.status !== 'COMPLETED');
  const addTaskList = addTaskListId
    ? { id: addTaskListId }
    : addTaskProjectId === projectId
      ? firstActive(project?.taskLists)
      : (() => {
          const r = rounds.find(x => x.id === addTaskProjectId);
          return r?.taskLists?.find(tl => tl.isDefault) ?? r?.taskLists?.[0];
        })();

  function invalidateTasks() {
    // Invalidate broadly (M36 + L14): a task can appear in other projects/lists and
    // feeds the project cards + home dashboard analytics, so refresh them all — not
    // just the list this change was made from.
    // Every cache that renders this task, not just the ones on this screen.
    invalidateTaskCaches(qc);
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
        <p className="text-gray-600 font-medium">Couldn&apos;t open this client</p>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">It may have been moved, or you don&apos;t have access to it.</p>
        <Link href="/projects" className="mt-4 text-sm text-brand-600 hover:underline">← Back to Clients</Link>
      </div>
    );
  }

  const phase = PHASE_META[project.projectPhase as Phase] ?? PHASE_META['ACTIVE'];
  const priority = PRIORITY_META[project.priority as Priority] ?? PRIORITY_META['MEDIUM'];
  const defaultTaskList = firstActive(project.taskLists);
  const liveGroups = project.taskLists ?? [];
  const activeGroupCount = liveGroups.filter(g => g.status !== 'COMPLETED').length;
  const clientLocked = ['COMPLETED', 'CLOSED'].includes(project.projectPhase);
  // The project's manager — used to pre-fill each task's Project Manager (still editable per task).
  const projectManagerId = project.members?.find(m => m.projectRole === 'MANAGER' && m.isActive)?.userId ?? null;
  // The activity feed is the whole matter's history in one list, so it is oversight material:
  // administrators (audit.view) and this project's own manager, nobody else. Being a member of
  // the project is not enough. The API enforces exactly the same rule — hiding the tab only
  // avoids offering a door that would not open.
  const taskCount = project._count?.projectTasks ?? tasks.length;
  const memberCount = project._count?.members ?? project.members?.length ?? 0;
  const canSeeActivity = can('audit.view') || (!!currentUser && projectManagerId === currentUser.id);
  // CLIENTS-FLOW (deadlines): the date promised to the client is set by whoever may see client
  // deadlines, or by a manager of this client — the rule DeadlineVisibilityService enforces.
  const canSetClientDue = can('deadline.view.client')
    || (!!currentUser && !!project.members?.some(m => m.userId === currentUser.id && m.projectRole === 'MANAGER' && m.isActive));
  // Capacity is a manager-grade view, so the tab only appears for capacity.view holders —
  // and the API enforces it regardless (the tab is a convenience, not the gate).
  const TABS: Tab[] = (can('capacity.view')
    ? ([...BASE_TABS.slice(0, 5), 'Capacity', ...BASE_TABS.slice(5)] as Tab[])
    : BASE_TABS
  ).filter(t => t !== 'Activity' || canSeeActivity);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0">
        {/* The vertical budget of this header is the whole point of its layout.
            Measured at 1440x732 it stood at 290px expanded — two fifths of the window spent before
            a single task appeared. Three things bought that back without dropping anything:
            the back link and the fold control moved ONTO the badge row (a 42px row gone),
            the block padding came down from 16px to 10px (12px), and the gaps between rows
            tightened (14px). What is left is the same information in about 200px. */}
        <div className="px-4 sm:px-6 py-2.5">
          {/* Row one: where you came from, what this project IS, and the fold control. All three
              are labels rather than actions, which is why they share a line and why the fold
              control is here and not beside Delete. */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Link
              href="/projects"
              title="Back to all clients"
              className="flex items-center gap-1 -ml-1 pr-1 text-xs text-gray-500 hover:text-gray-700 shrink-0"
            >
              <ArrowLeft size={13} /> <span className="hidden sm:inline">All clients</span>
            </Link>
            <span className="w-px h-3.5 bg-gray-200 shrink-0" aria-hidden />
            <div className="flex items-center gap-2 flex-wrap min-w-0">
                {/* The client's CID — issued automatically when the client was created. */}
                <CidBadge cid={project.code ?? null} multiRound={multiRound} roundsCount={rounds.length} />
                {/* CLIENTS-FLOW: which client group this client is filed under — changeable in place. */}
                <ClientGroupChip
                  projectId={projectId}
                  groupId={project.clientGroupId ?? null}
                  groupName={project.clientGroup?.name ?? null}
                  canEdit={can('project.update') && !clientLocked}
                />
                {/* A client created before task groups carried the type still shows it. */}
                {typeLabel && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    {typeLabel}
                  </span>
                )}
                {/* The client now lives on its own line below the title, where it can say where
                    it came from and be changed. A second copy up here would only be a duplicate
                    that quietly showed nothing for a code-only client (name is optional). */}
                <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', phase.bg, phase.text)}>
                  {phase.label}
                </span>
                <span className={clsx('text-xs font-semibold', priority.color)}>{priority.label} Priority</span>
            </div>
            <button
              onClick={toggleHeader}
              aria-expanded={!headerCollapsed}
              title={headerCollapsed
                ? 'Show the description and statistics'
                : 'Fold these details away and give the screen to the work'}
              className="flex items-center gap-1 ml-auto shrink-0 px-2 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 hover:text-gray-700 transition-colors"
            >
              {headerCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
              {headerCollapsed ? 'Show details' : 'Hide details'}
            </button>
          </div>

          {/* Row two: the title and everything you can DO, side by side. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 title={project.title} className="text-lg sm:text-xl font-bold text-gray-900 truncate leading-snug">{project.title}</h1>
              {!headerCollapsed && project.description && (
                <p className="text-[13px] leading-snug text-gray-500 mt-0.5 max-w-2xl line-clamp-2">{project.description}</p>
              )}
              {/* CLIENTS-FLOW: commented out — the client-code line and patent IDs are switched off. */}
              {PATENTS_AND_CLIENT_CODES && !headerCollapsed && <PatentTagsEditor project={project} />}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* CLIENTS-FLOW: another piece of work for this client is another TASK GROUP, not another
                  client under its CID — so "New project" (a round) gives way to "New task group".
                  The round machinery is untouched; existing rounds still show below. */}
              {can('tasklist.create') && !clientLocked && !multiRound && (
                <button
                  onClick={() => setCreatingGroup(true)}
                  title="Start a new piece of work for this client"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                >
                  <Layers size={14} /> New task group
                </button>
              )}
              {can('project.update') && ['ACTIVE', 'ON_HOLD'].includes(project.projectPhase) && (
                <button
                  onClick={() => setCompleting(true)}
                  disabled={lifecycleBusy}
                  title="Mark this client as complete"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> Mark complete
                </button>
              )}
              {/* On a CID holding ONE client this is the returning-client action: reopen in place,
                  keeping the same CID.

                  On a CID holding several clients the same button would say two contradictory things.
                  It stays available — you still need a way to undo a completion made by mistake —
                  but it is worded as what it actually does: reopen THIS piece of work. */}
              {can('project.update') && project.projectPhase === 'COMPLETED' && (
                <button
                  onClick={() => runLifecycle('reinitialize')}
                  disabled={lifecycleBusy}
                  title={multiRound
                    ? 'Reopen this client'
                    : 'Re-initialize this client — same CID, existing work kept'}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} /> {multiRound ? 'Reopen' : 'Re-initialize'}
                </button>
              )}
              {/* A legacy CLOSED client reopens with the same CID. */}
              {can('project.update') && project.projectPhase === 'CLOSED' && (
                <button
                  onClick={() => runLifecycle('reopen')}
                  disabled={lifecycleBusy}
                  title="Reopen this client — same CID, back to Working"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Reopen
                </button>
              )}
              {can('project.update') && project.projectPhase !== 'CLOSED' && (
                <button
                  onClick={() => setEditingProject(true)}
                  title="Edit the client's details and its group"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              {/* Changing a CID is a rare, deliberate act — and one only an Admin or Super Admin may
                  perform, since it issues or retires a number the firm files work under. It sits
                  with Edit rather than near the primary action for the same reason Delete does:
                  nothing here should be reachable by muscle memory. */}
              {can('project.generate_pid') && project.code && (
                <button
                  onClick={() => setMovingCid(true)}
                  title={`Change this client's CID — currently ${project.code}`}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <KeyRound size={14} /> Change CID
                </button>
              )}
              {/* Sits AFTER Edit and before the primary action, so the destructive button is never
                  the one next to "Add task" — the two get clicked from muscle memory. */}
              {can('project.delete') && (
                <button
                  onClick={deleteProject}
                  disabled={lifecycleBusy}
                  title="Delete this client — it can be restored, or destroyed for good, from Administration → Deleted Data"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              {(() => {
                const locked = ['COMPLETED', 'CLOSED'].includes(project.projectPhase);
                return (
                  <button
                    onClick={() => openAddTask()}
                    disabled={!defaultTaskList || locked}
                    title={locked ? 'This client is ' + (project.projectPhase === 'CLOSED' ? 'closed' : 'complete') + ' — reopen it to add work' : defaultTaskList ? 'Add a task' : 'Every task group is complete — create or reopen one to add work'}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} /> Add Task
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Stats row — the bulk of the header's height, and the first thing to go when it is folded. */}
          <div className={clsx('flex items-center flex-wrap gap-x-5 gap-y-1.5 mt-2 text-[13px]', headerCollapsed && 'hidden')}>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Layers size={14} />
              <span><span className="font-medium text-gray-900">{activeGroupCount}</span> active task group{activeGroupCount === 1 ? '' : 's'}
                {liveGroups.length > activeGroupCount && <span className="text-gray-400"> · {liveGroups.length - activeGroupCount} completed</span>}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <CheckSquare size={14} />
              <span><span className="font-medium text-gray-900">{taskCount}</span> task{taskCount === 1 ? '' : 's'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Users size={14} />
              <span><span className="font-medium text-gray-900">{memberCount}</span> member{memberCount === 1 ? '' : 's'}</span>
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
                <span>Delivered <span className="font-semibold">{formatDateIST(project.clientDeliveryDate)}</span></span>
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
                'px-3.5 py-2 text-[13px] font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {TAB_LABEL[tab] ?? tab}
            </button>
          ))}
        </nav>
      </header>


      {/* Tab content */}
      {/* A multi-project CID stacks one card per project and shows the SAME tab inside each, so
          the whole client history is visible in one place. A single-project CID falls through to
          the original rendering below, byte for byte. */}
      {multiRound ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {roundCards.map(({ round: r, index, isThisProject }, position) => (
            <div key={r.id}>
              {/* Name the card you asked for, and put a line before the ones you didn't. Two
                  open task lists that look alike is how the wrong client's work gets touched. */}
              {isThisProject && (
                <p className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                  <CheckSquare size={12} /> The project you opened
                </p>
              )}
              {position === firstOtherRound && (
                <p className="flex items-center gap-2 mb-1.5 mt-5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  <span className="h-px flex-1 bg-gray-200" aria-hidden />
                  Also under {project.code ?? 'this CID'}
                  <span className="h-px flex-1 bg-gray-200" aria-hidden />
                </p>
              )}
              <div className={clsx(isThisProject && 'rounded-xl ring-2 ring-brand-500 shadow-sm')}>
                <RoundCard
                  round={r}
                  index={index}
                  total={rounds.length}
                  canEdit={can('project.update')}
                  // Only the project you opened is expanded. The earlier rule — every live round
                  // open — meant that on a CID whose rounds are all ACTIVE the clause never
                  // singled anything out, and the first task list on screen was somebody else's.
                  // The rest stay one click away: their bar still carries title, phase and dates.
                  defaultOpen={isThisProject}
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
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className={clsx('flex-1 overflow-hidden', activeTab === 'Board' ? 'p-3' : activeTab === 'Gantt' ? '' : 'overflow-y-auto p-3 sm:p-4')}>
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
            clientName={project.title}
            members={project.members}
            managerId={projectManagerId}
            locked={clientLocked}
            canManageGroups={can('tasklist.create') || can('tasklist.update')}
            canDeleteGroups={can('tasklist.delete')}
            canAssign={can('task.assign')}
            canMoveTasks={can('task.update')}
            canSetClientDue={canSetClientDue}
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
        {activeTab === 'Activity' && canSeeActivity && <ActivityTab projectId={projectId} />}
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

      {creatingGroup && (
        <TaskGroupModal
          projectId={projectId}
          clientName={project.title}
          members={project.members}
          canSetClientDue={canSetClientDue}
          onClose={() => setCreatingGroup(false)}
          onSaved={() => setActiveTab('Task List')}
        />
      )}

      {/* Reassign / split / merge the CID. One dialog, because to the person opening it they are
          one thought: this client's CID should change. */}
      {movingCid && project.code && (
        <CidMoveModal
          projectId={projectId}
          projectTitle={project.title}
          currentCid={project.code}
          onClose={() => setMovingCid(false)}
          onMoved={() => {
            qc.invalidateQueries({ queryKey: ['project', projectId] });
            qc.invalidateQueries({ queryKey: ['project-rounds', projectId] });
            qc.invalidateQueries({ queryKey: ['projects'] });
            qc.invalidateQueries({ queryKey: ['cid-ledger'] });
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


