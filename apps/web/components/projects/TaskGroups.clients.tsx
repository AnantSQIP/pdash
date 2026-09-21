'use client';

/**
 * CLIENTS flow — see docs/WORKSPACE_FLOWS.md. The PROJECTS flow's implementation (production's, bb5728b)
 * is TaskGroups.tsx, which dispatches to this one when the organisation runs CLIENTS.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Plus, Pencil, Loader, Trash2, ChevronDown, Layers, CheckCircle2, RotateCcw, UserPlus, ArrowRightLeft,
  CalendarDays, Clock, ChevronsDownUp, ChevronsUpDown, Lock, BadgeIndianRupee,
  Search, X, AlertTriangle, UserCheck,
} from 'lucide-react';
import { api, type ApiTask, type TaskGroup, type UserSummary, type WorkflowStatus } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ClientsTaskListView as TaskListView } from './views.clients';
import { TaskGroupModal } from './TaskGroupModal';
import { domainLabelOf, useTechnologyDomains } from './TechnologyDomainPicker';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { byGroupOrder, byPriorityThenDeadline, isTaskClosed, taskAssigneeUsers } from '@/lib/tasks';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { Modal } from '@/components/ui/Modal';
import { TaskStaffing } from '@/components/tasks/TaskStaffing';
import { projectTypeLabel } from '@/lib/mock-data';
import { formatDate, isPastDue } from '@/lib/date';
import { useOrg } from '@/lib/org-context';

type Filter = 'ACTIVE' | 'COMPLETED' | 'ALL';

/**
 * A client's work, split into TASK GROUPS — one per piece of work ("FTO – Widget X",
 * "Invalidity – US 10,123,456").
 *
 * CLIENTS-FLOW. Groups used to be bare names; each now carries what a piece of work needs — its
 * kind (whose standard tasks were created with it), its field, its dates and a status — and says
 * how far along it is: tasks done of tasks in it, hours logged of hours planned, and who is on it.
 * From here a group is staffed task by task, tasks move between groups, and a group is completed
 * once nothing in it is open. Everything a person can change is checked again by the server; the
 * buttons here only avoid offering what would be refused.
 */
export function ClientsTaskGroups({
  projectId, tasks, loading, statuses, canEdit, onTaskClick, onAddTask, onStatusChange,
  clientName, members, managerId, locked, canManageGroups, canDeleteGroups, canAssign, canMoveTasks, canSetClientDue,
  focusGroupId,
}: {
  projectId: string;
  tasks: ApiTask[];
  loading: boolean;
  statuses: WorkflowStatus[];
  /** May add tasks (task.create). */
  canEdit: boolean;
  onTaskClick: (t: ApiTask) => void;
  onAddTask: (taskListId: string) => void;
  onStatusChange: (taskId: string, statusId: string) => void;
  // ── CLIENTS-FLOW (all optional, so older callers keep their behaviour) ──
  clientName?: string;
  members?: { userId: string; user?: UserSummary }[];
  managerId?: string | null;
  /** The client is completed or closed — nothing can change. */
  locked?: boolean;
  /** tasklist.create / tasklist.update. Defaults to canEdit. */
  canManageGroups?: boolean;
  canDeleteGroups?: boolean;
  /** task.assign — staff a task from its row. */
  canAssign?: boolean;
  /** task.update — move a task to another group. */
  canMoveTasks?: boolean;
  /** May set a group's client deadline (deadline.view.client, or this client's manager). */
  canSetClientDue?: boolean;
  /**
   * A group somebody arrived here to work on — from the Clients module's cross-client task-group
   * list (`/projects/<client>?group=<id>`). It is expanded, scrolled to and ringed once, so the
   * click lands ON the work rather than at the top of a client whose groups all look alike.
   */
  focusGroupId?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const manage = (canManageGroups ?? canEdit) && !locked;
  const mayAddTasks = canEdit && !locked;
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Organising the groups: one search box and the filters that earn their place (see `rows`).
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskGroup | null>(null);
  const [assigning, setAssigning] = useState<ApiTask | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: domains = [] } = useTechnologyDomains();
  const { currentUser } = useOrg();
  const meId = currentUser?.id ?? null;

  const { data: groups = [], isLoading: groupsLoading } = useQuery<TaskGroup[]>({
    queryKey: ['task-groups', projectId],
    queryFn: () => api.taskLists.list(projectId),
    staleTime: 30_000,
  });

  const refresh = () => {
    invalidateTaskCaches(qc);
    qc.invalidateQueries({ queryKey: ['task-groups', projectId] });
    qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
  };

  async function act(g: TaskGroup, what: string, fn: () => Promise<unknown>, done: string) {
    setBusyId(g.id);
    try { await fn(); refresh(); toast(done, 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : `Could not ${what}`, 'error'); }
    finally { setBusyId(null); }
  }

  const move = useMutation({
    mutationFn: ({ task, to }: { task: ApiTask; to: TaskGroup }) => api.tasks.moveToGroup(task.id, projectId, to.id),
    onSuccess: (_r, { task, to }) => { refresh(); toast(`“${task.title}” moved to ${to.name}`, 'success'); },
    onError: e => toast(e instanceof Error ? e.message : 'Could not move the task', 'error'),
  });

  /**
   * Tasks bucketed by group; anything whose group is gone falls into "Ungrouped". Each bucket is
   * ordered by priority, then the nearer deadline — the rule in lib/tasks.ts, the same wherever a
   * task list is drawn.
   */
  const byGroup = useMemo(() => {
    const m = new Map<string, ApiTask[]>();
    const known = new Set(groups.map(g => g.id));
    for (const t of tasks) {
      const link = (t.projectTasks ?? []).find(pt => pt.projectId === projectId);
      const key = link?.taskListId && known.has(link.taskListId) ? link.taskListId : '__ungrouped__';
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    }
    // Inside a group, tasks alike in priority and date keep the group's own order; the loose
    // "Ungrouped" bucket has no shared order to keep, so it takes the general one.
    const inGroup = byGroupOrder(projectId);
    for (const [key, list] of m) list.sort(key === '__ungrouped__' ? byPriorityThenDeadline : inGroup);
    return m;
  }, [tasks, groups, projectId]);

  const counts = {
    ACTIVE: groups.filter(g => g.status !== 'COMPLETED').length,
    COMPLETED: groups.filter(g => g.status === 'COMPLETED').length,
    ALL: groups.length,
  };
  // A client with no completed groups has nothing to filter, so the chips would be noise.
  const showFilter = counts.COMPLETED > 0;

  // ── ORGANISING THE GROUPS ──────────────────────────────────────────────────────────────
  //
  // Done here, not asked of the server: this client's groups and its tasks are already loaded
  // for the page, so typing filters what is on screen with no round trip, and the filter can
  // never surface a group the reader was not already sent.
  //
  // What a person types is matched against what they can SEE — the group's name and
  // description, the kind of work and the field BY THEIR LABELS (nobody types "SOURCE_CODE"),
  // and the titles of the tasks inside it. Every word has to match somewhere, so typing a
  // second word narrows the list instead of widening it.
  const tokens = useMemo(
    () => query.toLowerCase().split(/\s+/).map(t => t.trim()).filter(Boolean).slice(0, 6),
    [query]);

  const rows = useMemo(() => groups.map(g => {
    const list = byGroup.get(g.id) ?? [];
    const done = list.filter(isTaskClosed).length;
    const openCount = list.length - done;
    // The same sentence the group header makes: still running, past its deadline, work left.
    const late = g.status !== 'COMPLETED' && openCount > 0 && !!g.dueDate && isPastDue(g.dueDate);
    const mine = !!meId && list.some(t => taskAssigneeUsers(t).some(u => u.id === meId));
    const fields: [string, string][] = [
      ['name', g.name],
      ['description', g.description ?? ''],
      ['type', `${g.groupType ?? ''} ${g.groupType ? projectTypeLabel(g.groupType) : ''}`],
      ['domain', `${g.technologyDomain ?? ''} ${g.technologyDomain ? domainLabelOf(g.technologyDomain, domains) ?? '' : ''}`],
    ];
    const on = new Set<string>();
    const hitTasks: ApiTask[] = [];
    let matches = true;
    for (const tok of tokens) {
      let hit = false;
      for (const [key, value] of fields) if (value.toLowerCase().includes(tok)) { on.add(key); hit = true; }
      for (const t of list) {
        if (!t.title.toLowerCase().includes(tok)) continue;
        on.add('task'); hit = true;
        if (!hitTasks.includes(t)) hitTasks.push(t);
      }
      if (!hit) { matches = false; break; }
    }
    return { g, late, mine, matches, on: [...on], hitTasks };
  }), [groups, byGroup, tokens, domains, meId]);

  const passesStatus = (r: typeof rows[number]) =>
    !showFilter || filter === 'ALL' || (filter === 'COMPLETED' ? r.g.status === 'COMPLETED' : r.g.status !== 'COMPLETED');
  const passesFilters = (r: typeof rows[number]) =>
    (!typeFilter || r.g.groupType === typeFilter)
    && (!domainFilter || r.g.technologyDomain === domainFilter)
    && (!overdueOnly || r.late)
    && (!mineOnly || r.mine);

  const visible = rows.filter(r => r.matches && passesFilters(r) && passesStatus(r));
  const shown = visible.map(r => r.g);
  const rowOf = new Map(visible.map(r => [r.g.id, r]));
  // What an empty result is measured against, so it can say WHY rather than "nothing here".
  const matchedAnyStatus = rows.filter(r => r.matches && passesFilters(r)).length;
  const hiddenByStatus = matchedAnyStatus - visible.length;
  const hiddenByFilters = rows.filter(r => r.matches).length - matchedAnyStatus;
  const filtersOn = !!(typeFilter || domainFilter || overdueOnly || mineOnly);
  const organising = filtersOn || tokens.length > 0;
  function clearOrganising() {
    setQuery(''); setTypeFilter(''); setDomainFilter(''); setOverdueOnly(false); setMineOnly(false);
  }

  // A select is worth its space only when there is something to choose BETWEEN — one type of
  // work across every group is a dropdown that can only ever say what the page already says.
  const typeOptions = useMemo(
    () => [...new Set(groups.map(g => g.groupType).filter((v): v is string => !!v))].sort(),
    [groups]);
  const domainOptions = useMemo(
    () => [...new Set(groups.map(g => g.technologyDomain).filter((v): v is string => !!v))].sort(),
    [groups]);
  const anyLate = rows.some(r => r.late);
  const anyMine = rows.some(r => r.mine);

  const ungrouped = byGroup.get('__ungrouped__') ?? [];
  const activeGroups = groups.filter(g => g.status !== 'COMPLETED');

  const allFolded = shown.length > 0 && shown.every(g => collapsed[g.id]);
  function foldAll(fold: boolean) {
    setCollapsed(Object.fromEntries(shown.map(g => [g.id, fold])));
  }

  // A group you searched for is a group you are about to work in: it opens, and the first one
  // comes into view. `block: 'nearest'` so a match already on screen does not make the page jump.
  const firstMatchRef = useRef<HTMLDivElement>(null);
  const matchKey = shown.map(g => g.id).join(',');
  useEffect(() => {
    if (!tokens.length || !matchKey) return;
    setCollapsed(c => {
      const next = { ...c };
      for (const id of matchKey.split(',')) delete next[id];
      return next;
    });
    const t = setTimeout(() => firstMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    return () => clearTimeout(t);
  }, [matchKey, tokens.length]);

  // Arriving from the Clients module's cross-client list: open that group and go to it.
  useEffect(() => {
    if (!focusGroupId || !groups.some(g => g.id === focusGroupId)) return;
    setFilter('ALL');
    setCollapsed(c => ({ ...c, [focusGroupId]: false }));
    const t = setTimeout(() => {
      document.getElementById(`task-group-${focusGroupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(t);
  }, [focusGroupId, groups]);

  async function setGroupBilling(g: TaskGroup, billable: boolean, count: number) {
    const ok = await confirmDialog({
      title: billable ? `Make every task in “${g.name}” billable?` : `Make every task in “${g.name}” non-billable?`,
      body: `All ${count} task${count === 1 ? '' : 's'} in the group, and the time already logged on them, will be marked ${billable ? 'billable' : 'non-billable'}. Single tasks can still be changed on their own afterwards.`,
      confirmLabel: billable ? 'Make billable' : 'Make non-billable',
    });
    if (!ok) return;
    setBusyId(g.id);
    try {
      const r = await api.tasks.setGroupBillable(g.id, billable);
      refresh();
      invalidateTimesheetCaches(qc);
      toast(r.tasksChanged
        ? `${r.tasksChanged} task${r.tasksChanged === 1 ? '' : 's'} now ${billable ? 'billable' : 'non-billable'}${r.entriesUpdated ? `, ${r.entriesUpdated} logged ${r.entriesUpdated === 1 ? 'entry' : 'entries'} re-marked` : ''}.`
        : `Every task was already ${billable ? 'billable' : 'non-billable'}.`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not change billing for the group', 'error'); }
    finally { setBusyId(null); }
  }

  async function removeGroup(g: TaskGroup, count: number) {
    const target = groups.find(x => x.isDefault && x.id !== g.id);
    const ok = await confirmDialog({
      title: `Delete the task group “${g.name}”?`,
      body: count > 0
        ? `Its ${count} task${count === 1 ? '' : 's'} move${count === 1 ? 's' : ''} to “${target?.name ?? 'the default group'}” — nothing is deleted but the group itself.`
        : 'It has no tasks.',
      danger: true,
      confirmLabel: 'Delete group',
    });
    if (!ok) return;
    await act(g, 'delete the group', () => api.taskLists.remove(projectId, g.id), count ? `Group deleted — ${count} task${count === 1 ? '' : 's'} moved to ${target?.name ?? 'the default group'}` : 'Group deleted');
  }

  // Before the groups arrive, "0 active task groups" would be a false statement about the client.
  if (groupsLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1].map(i => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
            <div className="h-4 w-56 bg-gray-200 rounded mb-3" />
            <div className="h-3 w-80 bg-gray-100 rounded mb-4" />
            {[0, 1, 2].map(j => <div key={j} className="h-8 bg-gray-50 rounded mb-2" />)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar — the search, the status chips, then the filters that have something to say. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {groups.length > 1 && (
            <div className="relative w-56 sm:w-72 shrink-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search this client's task groups"
                placeholder="Search groups, types, domains, tasks…"
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
              />
              {query && (
                <button onClick={() => setQuery('')} title="Clear the search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700 rounded">
                  <X size={13} />
                </button>
              )}
            </div>
          )}
          {showFilter && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
              {(['ACTIVE', 'COMPLETED', 'ALL'] as Filter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={clsx('px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                    filter === f ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
                  {f === 'ACTIVE' ? 'Active' : f === 'COMPLETED' ? 'Completed' : 'All'} <span className="opacity-70">{counts[f]}</span>
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-gray-400">
            {organising
              ? `${visible.length} of ${groups.length} task group${groups.length === 1 ? '' : 's'}`
              : `${counts.ACTIVE} active task group${counts.ACTIVE === 1 ? '' : 's'}${counts.COMPLETED ? ` · ${counts.COMPLETED} completed` : ''}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {shown.length > 1 && (
              <button onClick={() => foldAll(!allFolded)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 bg-white">
                {allFolded ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />} {allFolded ? 'Expand all' : 'Collapse all'}
              </button>
            )}
            {manage && (
              <button onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700">
                <Plus size={13} /> New task group
              </button>
            )}
          </div>
        </div>

        {(typeOptions.length > 1 || domainOptions.length > 1 || anyLate || anyMine || filtersOn) && (
          <div className="flex items-center gap-2 flex-wrap">
            {typeOptions.length > 1 && (
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} title="Show one kind of work"
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-brand-500">
                <option value="">Any type of work</option>
                {typeOptions.map(t => <option key={t} value={t}>{projectTypeLabel(t)}</option>)}
              </select>
            )}
            {domainOptions.length > 1 && (
              <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)} title="Show one technology domain"
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-brand-500">
                <option value="">Any domain</option>
                {domainOptions.map(d => <option key={d} value={d}>{domainLabelOf(d, domains)}</option>)}
              </select>
            )}
            {/* Offered only when there IS late work, or work of the reader's own, to find. */}
            {anyLate && (
              <button onClick={() => setOverdueOnly(v => !v)} aria-pressed={overdueOnly}
                className={clsx('inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition-colors',
                  overdueOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200 hover:bg-red-50')}>
                <AlertTriangle size={12} /> Overdue
              </button>
            )}
            {anyMine && (
              <button onClick={() => setMineOnly(v => !v)} aria-pressed={mineOnly} title="Task groups I am staffed on"
                className={clsx('inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition-colors',
                  mineOnly ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
                <UserCheck size={12} /> Assigned to me
              </button>
            )}
            {organising && (
              <button onClick={clearOrganising}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100">
                <X size={12} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {shown.map((g, gi) => {
        const match = rowOf.get(g.id);
        const list = byGroup.get(g.id) ?? [];
        const open = !collapsed[g.id];
        const done = list.filter(isTaskClosed).length;
        const pct = list.length ? Math.round((done / list.length) * 100) : 0;
        const planned = list.reduce((n, t) => n + (t.estimatedHours ?? 0), 0);
        const logged = list.reduce((n, t) => n + (t.actualHours ?? 0), 0);
        const people = dedupe(list.flatMap(taskAssigneeUsers));
        const completed = g.status === 'COMPLETED';
        const openCount = list.length - done;
        const late = !completed && openCount > 0 && !!g.dueDate && isPastDue(g.dueDate);
        const others = groups.filter(x => x.id !== g.id && (x.status !== 'COMPLETED'));
        const nonBillable = list.filter(t => t.billable === false).length;
        const billing: 'ALL' | 'NONE' | 'SOME' = !list.length || nonBillable === 0 ? 'ALL' : nonBillable === list.length ? 'NONE' : 'SOME';
        return (
          <div key={g.id} id={`task-group-${g.id}`}
            ref={gi === 0 && tokens.length > 0 ? firstMatchRef : undefined}
            className={clsx('rounded-xl border bg-white overflow-hidden scroll-mt-2',
              focusGroupId === g.id ? 'border-brand-400 ring-2 ring-brand-500/30'
                : completed ? 'border-green-200' : late ? 'border-red-200' : 'border-gray-200')}>
            <div className={clsx('px-4 py-3 border-b', completed ? 'bg-green-50/50 border-green-100' : 'bg-gray-50/70 border-gray-100')}>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setCollapsed(c => ({ ...c, [g.id]: open }))}
                  className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0" title={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
                  <ChevronDown size={15} className={clsx('transition-transform', !open && '-rotate-90')} />
                </button>
                {completed ? <CheckCircle2 size={15} className="text-green-600 shrink-0" /> : <Layers size={15} className="text-brand-500 shrink-0" />}
                <span className={clsx('text-sm font-semibold truncate', completed ? 'text-gray-600' : 'text-gray-900')}>{g.name}</span>
                {g.groupType && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                    {projectTypeLabel(g.groupType)}
                  </span>
                )}
                {g.technologyDomain && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100 shrink-0">
                    {domainLabelOf(g.technologyDomain, domains)}
                  </span>
                )}
                {completed && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">Completed</span>}
                {late && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">Overdue</span>}

                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {busyId === g.id && <Loader size={14} className="animate-spin text-gray-400 mr-1" />}
                  {mayAddTasks && !completed && (
                    <button onClick={() => onAddTask(g.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100">
                      <Plus size={12} /> Add task
                    </button>
                  )}
                  {manage && !completed && (
                    <button
                      onClick={() => act(g, 'complete the group', () => api.taskLists.complete(projectId, g.id), `“${g.name}” completed`)}
                      disabled={!!busyId || list.length === 0 || openCount > 0}
                      title={list.length === 0 ? 'No tasks to complete yet' : openCount > 0 ? `${openCount} task${openCount === 1 ? ' is' : 's are'} still open` : 'Mark this group complete'}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 border border-green-200 bg-white rounded-lg hover:bg-green-50 disabled:opacity-40 disabled:hover:bg-white">
                      <CheckCircle2 size={12} /> Complete
                    </button>
                  )}
                  {manage && completed && (
                    <button onClick={() => act(g, 'reopen the group', () => api.taskLists.reopen(projectId, g.id), `“${g.name}” reopened`)}
                      disabled={!!busyId}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-700 border border-brand-200 bg-white rounded-lg hover:bg-brand-50">
                      <RotateCcw size={12} /> Reopen
                    </button>
                  )}
                  {/* Billable is per task; this sets every task in the group at once. Anybody on
                      the client may — the server checks, and re-marks the time already logged. */}
                  {!locked && list.length > 0 && (
                    <button
                      onClick={() => setGroupBilling(g, billing === 'NONE', list.length)}
                      disabled={!!busyId}
                      title={billing === 'NONE' ? 'Every task here is non-billable — click to make them all billable'
                        : billing === 'SOME' ? `${nonBillable} of ${list.length} tasks are non-billable — click to make them all non-billable`
                          : 'Every task here is billable — click to make them all non-billable'}
                      className={clsx('inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border',
                        billing === 'ALL' ? 'text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50'
                          : billing === 'NONE' ? 'text-gray-600 border-gray-300 bg-gray-50 hover:bg-gray-100'
                            : 'text-amber-700 border-amber-200 bg-white hover:bg-amber-50')}>
                      <BadgeIndianRupee size={12} />
                      {billing === 'ALL' ? 'Billable' : billing === 'NONE' ? 'Non-billable' : 'Partly billable'}
                    </button>
                  )}
                  {manage && (
                    <button onClick={() => setEditing(g)} className="p-1.5 text-gray-400 hover:text-brand-600 rounded" title="Edit this task group">
                      <Pencil size={13} />
                    </button>
                  )}
                  {/* The default group is where tasks made elsewhere land, so it always exists. */}
                  {(canDeleteGroups ?? manage) && !locked && !g.isDefault && (
                    <button onClick={() => removeGroup(g, list.length)} disabled={!!busyId}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Delete this task group">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* How far along it is. */}
              <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap mt-2 pl-7 text-xs text-gray-500">
                {(g.startDate || g.dueDate) && (
                  <span className={clsx('inline-flex items-center gap-1', late && 'text-red-600 font-medium')}>
                    <CalendarDays size={12} />
                    {g.startDate ? formatDate(g.startDate) : '…'} → {g.dueDate ? formatDate(g.dueDate) : 'no deadline'}
                  </span>
                )}
                {/* Present only for a reader allowed to see it — the server strips it for everyone else. */}
                {g.clientDueDate && (
                  <span className="inline-flex items-center gap-1 text-amber-700" title="The date promised to the client — seen only by managers and people allowed to see client deadlines">
                    <Lock size={11} /> Client {formatDate(g.clientDueDate)}
                  </span>
                )}
                <span className="inline-flex items-center gap-2" title={`${done} of ${list.length} tasks closed`}>
                  <span className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <span className={clsx('block h-full rounded-full', completed ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="tabular-nums">{done}/{list.length} done</span>
                </span>
                {(planned > 0 || logged > 0) && (
                  <span className={clsx('inline-flex items-center gap-1 tabular-nums', planned > 0 && logged > planned && 'text-red-600')} title="Hours logged of hours planned">
                    <Clock size={12} /> {round1(logged)}h of {round1(planned)}h
                  </span>
                )}
                {people.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <AvatarStack users={people} size={20} max={5} />
                  </span>
                )}
              </div>
              {g.description && <p className="mt-1.5 pl-7 text-xs text-gray-500 line-clamp-2">{g.description}</p>}
              {/* Why this group is on screen. A group called "Round 2" turning up for "claim
                  chart" is otherwise inexplicable — and the tasks that matched are NAMED, and
                  still listed below, rather than being the invisible reason for a row. */}
              {match && match.on.length > 0 && (
                <p className="mt-2 ml-7 inline-flex flex-wrap items-center gap-1 px-2 py-1 rounded-lg bg-brand-50 border border-brand-100 text-[11px] text-brand-800">
                  <Search size={11} className="shrink-0" />
                  <span>Matched {matchReason(match.on, match.hitTasks.length)}</span>
                  {match.hitTasks.length > 0 && (
                    <span className="text-brand-700/80">
                      — {match.hitTasks.slice(0, 3).map(t => `“${t.title}”`).join(', ')}
                      {match.hitTasks.length > 3 ? ` +${match.hitTasks.length - 3} more` : ''}
                    </span>
                  )}
                </p>
              )}
            </div>

            {open && (
              <TaskListView
                tasks={list}
                loading={loading}
                statuses={statuses}
                canAddTask={mayAddTasks && !completed}
                showHours
                emptyText={completed ? 'This group has no tasks' : 'No tasks in this group yet'}
                onTaskClick={onTaskClick}
                onAddTask={() => onAddTask(g.id)}
                onStatusChange={onStatusChange}
                rowActions={(canAssign || canMoveTasks) && !locked ? task => (
                  <>
                    {canAssign && !isTaskClosed(task) && (
                      <button onClick={() => setAssigning(task)} title="Assign people, hours and dates"
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded">
                        <UserPlus size={14} />
                      </button>
                    )}
                    {canMoveTasks && others.length > 0 && (
                      <MoveMenu groups={others} task={task} busy={move.isPending} onPick={to => move.mutate({ task, to })} />
                    )}
                  </>
                ) : undefined}
              />
            )}
          </div>
        );
      })}

      {shown.length === 0 && groups.length > 0 && (
        <div className="border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center">
          {organising ? <Search size={20} className="mx-auto text-gray-300 mb-2" /> : null}
          <p className="text-sm font-medium text-gray-600">
            {tokens.length > 0
              ? `No task group matches “${query.trim()}”.`
              : filtersOn ? 'No task group matches these filters.'
                : filter === 'ACTIVE' ? 'Every task group is complete.' : 'No task groups here.'}
          </p>
          {/* Nothing is more useless than an empty list that will not say what it did. */}
          {organising && (
            <p className="text-xs text-gray-500 mt-1.5 max-w-md mx-auto">
              {hiddenByStatus > 0 && (
                <>{hiddenByStatus} matching group{hiddenByStatus === 1 ? ' is' : 's are'} hidden by the{' '}
                  <button onClick={() => setFilter('ALL')} className="font-medium text-brand-600 hover:underline">
                    {filter === 'COMPLETED' ? 'Completed' : 'Active'}
                  </button>{' '}chip. </>
              )}
              {hiddenByFilters > 0 && <>{hiddenByFilters} more {hiddenByFilters === 1 ? 'is' : 'are'} hidden by the filters. </>}
              {hiddenByStatus === 0 && hiddenByFilters === 0 && (
                <>Searched the name, description, type of work, technology domain and the task titles of all {groups.length} group{groups.length === 1 ? '' : 's'} on this client.</>
              )}
            </p>
          )}
          {organising && (
            <button onClick={clearOrganising}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
              <X size={12} /> Clear search and filters
            </button>
          )}
        </div>
      )}

      {/* Tasks whose group was removed still have to be reachable. */}
      {ungrouped.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-600">Ungrouped <span className="text-xs font-normal text-gray-400">· {ungrouped.length}</span></div>
          <TaskListView tasks={ungrouped} loading={loading} statuses={statuses} canAddTask={false} showHours
            onTaskClick={onTaskClick} onAddTask={() => {}} onStatusChange={onStatusChange}
            rowActions={canMoveTasks && !locked && activeGroups.length > 0 ? task => (
              <MoveMenu groups={activeGroups} task={task} busy={move.isPending} onPick={to => move.mutate({ task, to })} />
            ) : undefined} />
        </div>
      )}

      {groups.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center">
          <Layers size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-600">No task groups yet</p>
          <p className="text-xs text-gray-400 mt-1">Create one for each piece of work — e.g. “FTO – Widget X”.</p>
        </div>
      )}

      {creating && (
        <TaskGroupModal projectId={projectId} clientName={clientName} members={members} canSetClientDue={canSetClientDue} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <TaskGroupModal projectId={projectId} clientName={clientName} members={members} group={editing} canSetClientDue={canSetClientDue} onClose={() => setEditing(null)} />
      )}
      {assigning && (
        <Modal title="Assign" subtitle={assigning.title} size="xl" onClose={() => setAssigning(null)}>
          <TaskStaffing
            task={assigning}
            canAssign={!!canAssign}
            defaultManagerId={managerId}
            onSaved={() => { refresh(); qc.invalidateQueries({ queryKey: ['capacity'] }); setAssigning(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * Move a task to another group: a small menu, closed by clicking anywhere else. A group due
 * before the task is offered but disabled — the server refuses it, because a task inside a group
 * cannot be due after the group; the task's own date has to come in first.
 */
function MoveMenu({ groups, task, busy, onPick }: { groups: TaskGroup[]; task: ApiTask; busy: boolean; onPick: (g: TaskGroup) => void }) {
  const taskDue = task.dueDate ? String(task.dueDate).slice(0, 10) : '';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={busy} title="Move to another task group" aria-haspopup="menu" aria-expanded={open}
        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded disabled:opacity-40">
        <ArrowRightLeft size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Move to</p>
          {groups.map(g => {
            const groupDue = g.dueDate ? String(g.dueDate).slice(0, 10) : '';
            const tooEarly = !!groupDue && !!taskDue && groupDue < taskDue;
            return (
              <button key={g.id} role="menuitem" disabled={tooEarly} onClick={() => { setOpen(false); onPick(g); }}
                title={tooEarly ? `Due ${formatDate(g.dueDate!)} — before this task (${formatDate(task.dueDate!)}). Bring the task's date in first.` : undefined}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-brand-50 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed">
                <Layers size={13} className="text-brand-400 shrink-0" />
                <span className="truncate">{g.name}</span>
                {groupDue && <span className="ml-auto text-[11px] text-gray-400 shrink-0">{formatDate(g.dueDate!)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** What a search hit, in the words the screen already uses for those things. */
const MATCH_LABEL: Record<string, string> = {
  name: 'its name',
  description: 'its description',
  type: 'its type of work',
  domain: 'its technology domain',
};
function matchReason(on: string[], taskHits: number): string {
  const parts = on.filter(k => k !== 'task').map(k => MATCH_LABEL[k]).filter(Boolean);
  if (taskHits > 0) parts.push(`${taskHits} task${taskHits === 1 ? '' : 's'} in it`);
  return parts.join(' and ') || 'this client';
}

/** One avatar per person, however many tasks in the group they are on. */
function dedupe<T extends { id?: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter(x => {
    const key = x.id ?? JSON.stringify(x);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const round1 = (n: number) => Math.round(n * 10) / 10;
