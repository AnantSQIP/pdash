'use client';

import { useState } from 'react';
import { Plus, Flag, Calendar, CheckSquare, Filter, LayoutList, LayoutGrid, ChevronDown, Search, Circle } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type TaskStatus = 'Open' | 'In Progress' | 'In Review' | 'Closed';

type Task = {
  id: string;
  title: string;
  project: string;
  projectId: string;
  projectColor: string;
  priority: Priority;
  status: TaskStatus;
  statusColor: string;
  assignee: string;
  assigneeColor: string;
  dueDate: string;
  overdue: boolean;
  completionPercentage: number;
  tags: string[];
};

const ALL_TASKS: Task[] = [
  { id: 't1',  title: 'Create wireframes for all pages',       project: 'Apollo Website',    projectId: 'p1', projectColor: '#3d8de2', priority: 'HIGH',     status: 'In Progress', statusColor: '#3d8de2', assignee: 'CP', assigneeColor: 'bg-pink-500',   dueDate: '2026-07-15', overdue: false, completionPercentage: 40, tags: ['design'] },
  { id: 't2',  title: 'Design component library',              project: 'Apollo Website',    projectId: 'p1', projectColor: '#3d8de2', priority: 'MEDIUM',   status: 'Open',        statusColor: '#64748b', assignee: 'CP', assigneeColor: 'bg-pink-500',   dueDate: '2026-07-22', overdue: false, completionPercentage: 0,  tags: ['design', 'frontend'] },
  { id: 't3',  title: 'Performance benchmark baseline',        project: 'Apollo Website',    projectId: 'p1', projectColor: '#3d8de2', priority: 'HIGH',     status: 'In Review',   statusColor: '#7c3aed', assignee: 'BT', assigneeColor: 'bg-blue-500',   dueDate: '2026-07-10', overdue: false, completionPercentage: 80, tags: ['engineering'] },
  { id: 't4',  title: 'Setup CI/CD pipeline',                  project: 'Internal Tools',    projectId: 'p3', projectColor: '#16a34a', priority: 'CRITICAL', status: 'Open',        statusColor: '#64748b', assignee: 'AN', assigneeColor: 'bg-brand-600', dueDate: '2026-06-10', overdue: true,  completionPercentage: 0,  tags: ['devops'] },
  { id: 't5',  title: 'Update API documentation',              project: 'Mobile App v2.0',   projectId: 'p2', projectColor: '#eab308', priority: 'LOW',      status: 'Open',        statusColor: '#64748b', assignee: 'AK', assigneeColor: 'bg-purple-500', dueDate: '2026-06-24', overdue: false, completionPercentage: 0,  tags: ['docs'] },
  { id: 't6',  title: 'Review pull request #142',              project: 'Apollo Website',    projectId: 'p1', projectColor: '#3d8de2', priority: 'HIGH',     status: 'Open',        statusColor: '#64748b', assignee: 'AN', assigneeColor: 'bg-brand-600', dueDate: '2026-06-24', overdue: false, completionPercentage: 0,  tags: [] },
  { id: 't7',  title: 'Implement push notifications',          project: 'Mobile App v2.0',   projectId: 'p2', projectColor: '#eab308', priority: 'HIGH',     status: 'In Progress', statusColor: '#3d8de2', assignee: 'BT', assigneeColor: 'bg-blue-500',   dueDate: '2026-07-20', overdue: false, completionPercentage: 25, tags: ['mobile'] },
  { id: 't8',  title: 'Write onboarding user guide',           project: 'Internal Tools',    projectId: 'p3', projectColor: '#16a34a', priority: 'LOW',      status: 'Open',        statusColor: '#64748b', assignee: 'AK', assigneeColor: 'bg-purple-500', dueDate: '2026-07-30', overdue: false, completionPercentage: 0,  tags: ['docs'] },
  { id: 't9',  title: 'Fix login button on mobile Safari',     project: 'Apollo Website',    projectId: 'p1', projectColor: '#3d8de2', priority: 'CRITICAL', status: 'In Progress', statusColor: '#3d8de2', assignee: 'DV', assigneeColor: 'bg-red-500',    dueDate: '2026-06-28', overdue: false, completionPercentage: 50, tags: ['bug', 'mobile'] },
  { id: 't10', title: 'Define information architecture',       project: 'Apollo Website',    projectId: 'p1', projectColor: '#3d8de2', priority: 'HIGH',     status: 'Closed',      statusColor: '#16a34a', assignee: 'AN', assigneeColor: 'bg-brand-600', dueDate: '2026-06-15', overdue: false, completionPercentage: 100, tags: ['design'] },
  { id: 't11', title: 'SEO audit and meta tag updates',        project: 'Apollo Website',    projectId: 'p1', projectColor: '#3d8de2', priority: 'LOW',      status: 'Open',        statusColor: '#64748b', assignee: 'AK', assigneeColor: 'bg-purple-500', dueDate: '2026-08-05', overdue: false, completionPercentage: 0,  tags: ['seo'] },
  { id: 't12', title: 'Design app icon set',                   project: 'Mobile App v2.0',   projectId: 'p2', projectColor: '#eab308', priority: 'MEDIUM',   status: 'Open',        statusColor: '#64748b', assignee: 'GL', assigneeColor: 'bg-cyan-500',   dueDate: '2026-07-12', overdue: false, completionPercentage: 0,  tags: ['design', 'mobile'] },
];

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-600',    bg: 'bg-red-50' },
  HIGH:     { label: 'High',     color: 'text-accent-600', bg: 'bg-accent-50' },
  MEDIUM:   { label: 'Medium',   color: 'text-brand-500',  bg: 'bg-brand-50' },
  LOW:      { label: 'Low',      color: 'text-gray-400',   bg: 'bg-gray-50' },
};

type ViewTab = 'all' | 'in_progress' | 'open' | 'due_today' | 'overdue' | 'completed';

const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'all',         label: 'All Tasks' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'open',        label: 'Open' },
  { id: 'due_today',   label: 'Due Today' },
  { id: 'overdue',     label: 'Overdue' },
  { id: 'completed',   label: 'Completed' },
];

function filterTasks(tasks: Task[], tab: ViewTab, search: string, priority: string, project: string): Task[] {
  return tasks.filter(t => {
    if (tab === 'in_progress' && t.status !== 'In Progress') return false;
    if (tab === 'open' && t.status !== 'Open') return false;
    if (tab === 'due_today' && t.dueDate !== '2026-06-24') return false;
    if (tab === 'overdue' && !t.overdue) return false;
    if (tab === 'completed' && t.status !== 'Closed') return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (priority !== 'ALL' && t.priority !== priority) return false;
    if (project !== 'ALL' && t.project !== project) return false;
    return true;
  });
}

const PROJECTS = ['ALL', ...Array.from(new Set(ALL_TASKS.map(t => t.project)))];

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterProject, setFilterProject] = useState('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [tasks, setTasks] = useState(ALL_TASKS);

  const filtered = filterTasks(tasks, activeTab, search, filterPriority, filterProject);

  const counts: Record<ViewTab, number> = {
    all:         tasks.length,
    in_progress: tasks.filter(t => t.status === 'In Progress').length,
    open:        tasks.filter(t => t.status === 'Open').length,
    due_today:   tasks.filter(t => t.dueDate === '2026-06-24').length,
    overdue:     tasks.filter(t => t.overdue).length,
    completed:   tasks.filter(t => t.status === 'Closed').length,
  };

  function toggleComplete(id: string) {
    setTasks(prev => prev.map(t =>
      t.id === id
        ? { ...t, status: t.status === 'Closed' ? 'Open' : 'Closed' as TaskStatus, statusColor: t.status === 'Closed' ? '#64748b' : '#16a34a', completionPercentage: t.status === 'Closed' ? 0 : 100 }
        : t
    ));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
            <p className="text-sm text-gray-500 mt-0.5">{tasks.filter(t => t.status !== 'Closed').length} active tasks across {PROJECTS.length - 1} projects</p>
          </div>
          <button
            onClick={() => alert('Add task coming soon')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus size={15} /> New Task
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                activeTab === tab.id
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              {tab.label}
              <span className={clsx(
                'text-xs px-1.5 py-0.5 rounded-full',
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
              )}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* Filters row */}
      <div className="bg-white border-b border-gray-100 px-6 py-2.5 shrink-0 flex items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400 w-52"
          />
        </div>

        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400 text-gray-600"
        >
          <option value="ALL">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400 text-gray-600"
        >
          {PROJECTS.map(p => (
            <option key={p} value={p}>{p === 'ALL' ? 'All Projects' : p}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-white shadow text-brand-600' : 'text-gray-400 hover:text-gray-600')}
          >
            <LayoutList size={15} />
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'board' ? 'bg-white shadow text-brand-600' : 'text-gray-400 hover:text-gray-600')}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <CheckSquare size={22} className="text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium">No tasks found</p>
            <p className="text-sm text-gray-400 mt-1">Try changing the filters or tab</p>
          </div>
        ) : viewMode === 'list' ? (
          <ListView tasks={filtered} onToggle={toggleComplete} />
        ) : (
          <BoardView tasks={filtered} onToggle={toggleComplete} />
        )}
      </div>
    </div>
  );
}

function ListView({ tasks, onToggle }: { tasks: Task[]; onToggle: (id: string) => void }) {
  // Group by project
  const groups = tasks.reduce<Record<string, Task[]>>((acc, t) => {
    if (!acc[t.project]) acc[t.project] = [];
    acc[t.project].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([project, projectTasks]) => {
        const projectColor = projectTasks[0].projectColor;
        const projectId = projectTasks[0].projectId;
        return (
          <div key={project} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: projectColor }} />
              <Link href={`/projects/${projectId}`} className="text-sm font-semibold text-gray-700 hover:text-brand-600 transition-colors">
                {project}
              </Link>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{projectTasks.length}</span>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide">
              <span className="flex-1">Task</span>
              <span className="w-24 hidden md:block">Status</span>
              <span className="w-20 hidden lg:block">Priority</span>
              <span className="w-8 hidden sm:block">Who</span>
              <span className="w-24 hidden lg:block text-right">Due Date</span>
            </div>

            {/* Task rows */}
            {projectTasks.map((task, i) => {
              const pm = PRIORITY_META[task.priority];
              const isDone = task.status === 'Closed';
              return (
                <div
                  key={task.id}
                  className={clsx(
                    'flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors',
                    i < projectTasks.length - 1 && 'border-b border-gray-50',
                  )}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => onToggle(task.id)}
                    className={clsx(
                      'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                      isDone ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-brand-400',
                    )}
                  >
                    {isDone && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </button>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <span className={clsx('text-sm', isDone ? 'line-through text-gray-400' : 'text-gray-800')}>
                      {task.title}
                    </span>
                    {task.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {task.tags.map(tag => (
                          <span key={tag} className="text-[10px] bg-brand-50 text-brand-600 px-1.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="hidden md:flex items-center gap-1.5 w-24 shrink-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.statusColor }} />
                    <span className="text-xs text-gray-600 truncate">{task.status}</span>
                  </div>

                  {/* Priority */}
                  <div className="hidden lg:flex items-center gap-1 w-20 shrink-0">
                    <Flag size={11} className={pm.color} />
                    <span className={clsx('text-xs font-medium', pm.color)}>{pm.label}</span>
                  </div>

                  {/* Assignee */}
                  <div className="hidden sm:block w-8 shrink-0">
                    <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white', task.assigneeColor)}>
                      {task.assignee}
                    </div>
                  </div>

                  {/* Due */}
                  <span className={clsx('hidden lg:block w-24 shrink-0 text-right text-xs', task.overdue ? 'text-red-500 font-medium' : 'text-gray-500')}>
                    {task.overdue ? '⚠ ' : ''}{new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const STATUS_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'Open',        label: 'Open',        color: '#64748b' },
  { status: 'In Progress', label: 'In Progress', color: '#3d8de2' },
  { status: 'In Review',   label: 'In Review',   color: '#7c3aed' },
  { status: 'Closed',      label: 'Closed',      color: '#16a34a' },
];

function BoardView({ tasks, onToggle }: { tasks: Task[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-4">
      {STATUS_COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.status);
        return (
          <div key={col.status} className="flex-shrink-0 w-72 flex flex-col gap-2">
            {/* Column header */}
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
              <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-auto">{colTasks.length}</span>
            </div>

            {/* Task cards */}
            <div className="space-y-2">
              {colTasks.map(task => {
                const pm = PRIORITY_META[task.priority];
                return (
                  <div key={task.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm hover:border-brand-200 transition-all cursor-pointer">
                    {/* Project badge */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.projectColor }} />
                      <span className="text-[10px] text-gray-500 truncate">{task.project}</span>
                    </div>

                    {/* Title */}
                    <p className={clsx('text-sm font-medium mb-3', task.status === 'Closed' ? 'line-through text-gray-400' : 'text-gray-800')}>
                      {task.title}
                    </p>

                    {/* Tags */}
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {task.tags.map(tag => (
                          <span key={tag} className="text-[10px] bg-brand-50 text-brand-600 px-1.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center gap-2">
                      <Flag size={11} className={pm.color} />
                      <span className={clsx('text-xs', pm.color)}>{pm.label}</span>
                      <div className="ml-auto flex items-center gap-2">
                        {task.overdue && <span className="text-[10px] text-red-500 font-medium">Overdue</span>}
                        <span className="text-xs text-gray-400">
                          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white', task.assigneeColor)}>
                          {task.assignee}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {task.completionPercentage > 0 && (
                      <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${task.completionPercentage}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {colTasks.length === 0 && (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-xs text-gray-400">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
