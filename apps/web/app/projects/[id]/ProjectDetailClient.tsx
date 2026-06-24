'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { MockProject, PHASE_META, PRIORITY_META } from '@/lib/mock-data';
import { AddTaskModal } from '@/components/tasks/AddTaskModal';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';

type Tab = 'Overview' | 'Task List' | 'Board' | 'Gantt' | 'Files' | 'Discussions' | 'Issues' | 'Activity' | 'Timesheets';

const MOCK_TASKS = [
  { id: 't1', title: 'Define information architecture', status: 'Closed',       statusColor: '#16a34a', priority: 'HIGH',   assignee: 'AN', assigneeColor: 'bg-brand-600', dueDate: '2026-07-01' },
  { id: 't2', title: 'Create wireframes for all pages', status: 'In Progress',  statusColor: '#3d8de2', priority: 'HIGH',   assignee: 'CP', assigneeColor: 'bg-pink-500',   dueDate: '2026-07-15' },
  { id: 't3', title: 'Design component library',        status: 'Open',          statusColor: '#64748b', priority: 'MEDIUM', assignee: 'MK', assigneeColor: 'bg-purple-500', dueDate: '2026-07-22' },
  { id: 't4', title: 'Implement responsive navbar',     status: 'Open',          statusColor: '#64748b', priority: 'MEDIUM', assignee: 'BT', assigneeColor: 'bg-blue-500',   dueDate: '2026-07-28' },
  { id: 't5', title: 'SEO audit and meta tag updates',  status: 'Open',          statusColor: '#64748b', priority: 'LOW',    assignee: 'AK', assigneeColor: 'bg-green-500',  dueDate: '2026-08-05' },
  { id: 't6', title: 'Performance benchmark baseline',  status: 'In Review',     statusColor: '#7c3aed', priority: 'HIGH',   assignee: 'BT', assigneeColor: 'bg-blue-500',   dueDate: '2026-07-10' },
];

const TABS: Tab[] = ['Overview', 'Task List', 'Board', 'Gantt', 'Issues', 'Activity', 'Timesheets', 'Files', 'Discussions'];

interface Props {
  project: MockProject;
}

export function ProjectDetailClient({ project }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Task List');
  const [showAddTask, setShowAddTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const phase = PHASE_META[project.projectPhase];
  const priority = PRIORITY_META[project.priority];

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
              <p className="text-sm text-gray-500 mt-1 max-w-xl">{project.description}</p>
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
              <span><span className="font-medium text-gray-900">{project.taskCount}</span> tasks</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Users size={14} />
              <span><span className="font-medium text-gray-900">{project.memberCount}</span> members</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Calendar size={14} />
              <span>Due <span className="font-medium text-gray-900">
                {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span></span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">{project.completionPercentage}% complete</span>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${project.completionPercentage}%`, backgroundColor: project.statusColor }}
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
        {activeTab === 'Task List' && <TaskListView project={project} onTaskClick={setSelectedTask} />}
        {activeTab === 'Board' && <KanbanBoard onTaskClick={setSelectedTask} onAddTask={() => setShowAddTask(true)} />}
        {activeTab === 'Overview' && <OverviewView project={project} />}
        {activeTab === 'Gantt' && <GanttView />}
        {activeTab === 'Issues' && <IssuesTab projectId={project.id} />}
        {activeTab === 'Activity' && <ActivityTab projectId={project.id} />}
        {activeTab === 'Timesheets' && <TimesheetsTab projectId={project.id} />}
        {activeTab === 'Files' && <FilesTab />}
        {activeTab === 'Discussions' && <DiscussionsTab />}
      </div>

      {showAddTask && (
        <AddTaskModal
          projectId={project.id}
          taskListId="general"
          onClose={() => setShowAddTask(false)}
        />
      )}
      <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}

function TaskListView({ project, onTaskClick }: { project: MockProject; onTaskClick: (task: any) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <LayoutList size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">General</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{MOCK_TASKS.length}</span>
        </div>
        <button className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
          <Plus size={12} /> Add task
        </button>
      </div>

      <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
        <span className="flex-1">Task</span>
        <span className="w-28 hidden md:block">Status</span>
        <span className="w-20 hidden lg:block">Priority</span>
        <span className="w-24 hidden sm:block">Assignee</span>
        <span className="w-24 hidden lg:block text-right">Due Date</span>
      </div>

      {MOCK_TASKS.map((task, i) => (
        <div
          key={task.id}
          onClick={() => onTaskClick(task)}
          className={clsx(
            'flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer',
            i < MOCK_TASKS.length - 1 && 'border-b border-gray-50',
          )}
        >
          <div className={clsx('w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center', task.status === 'Closed' ? 'bg-green-500 border-green-500' : 'border-gray-300')}>
            {task.status === 'Closed' && (
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6l3 3 5-5" />
              </svg>
            )}
          </div>
          <span className={clsx('flex-1 text-sm min-w-0', task.status === 'Closed' ? 'line-through text-gray-400' : 'text-gray-800')}>
            {task.title}
          </span>
          <div className="hidden md:flex items-center gap-1.5 w-28 shrink-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.statusColor }} />
            <span className="text-xs text-gray-600 truncate">{task.status}</span>
          </div>
          <div className="hidden lg:block w-20 shrink-0">
            <span className={clsx('text-xs font-medium', task.priority === 'HIGH' ? 'text-orange-500' : task.priority === 'MEDIUM' ? 'text-blue-500' : 'text-gray-400')}>
              <Flag size={11} className="inline mr-1" />
              {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 w-24 shrink-0">
            <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white', task.assigneeColor)}>
              {task.assignee}
            </div>
          </div>
          <span className="hidden lg:block w-24 shrink-0 text-right text-xs text-gray-500">
            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      ))}

      <div className="flex items-center gap-3 px-5 py-3 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors border-t border-dashed border-gray-200">
        <Plus size={14} /> Add a task...
      </div>
    </div>
  );
}

function OverviewView({ project }: { project: MockProject }) {
  const statuses = [
    { label: 'Closed', count: 1, color: '#16a34a' },
    { label: 'In Review', count: 1, color: '#7c3aed' },
    { label: 'In Progress', count: 1, color: '#3d8de2' },
    { label: 'Open', count: 3, color: '#64748b' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Progress card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Overall Progress</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-24 h-24">
            <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={project.statusColor} strokeWidth="3"
                strokeDasharray={`${project.completionPercentage} ${100 - project.completionPercentage}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-900">{project.completionPercentage}%</span>
            </div>
          </div>
          <div className="space-y-2">
            {statuses.map(s => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
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
          {project.members.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white', m.color)}>
                {m.initials}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{m.initials}</p>
                <p className="text-xs text-gray-500">{i === 0 ? 'Manager' : 'Member'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
