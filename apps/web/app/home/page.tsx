'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FolderKanban, Activity, TrendingUp, CheckSquare,
  Plus, Flag, CheckCircle, MessageCircle, UserCheck,
  FileText, ThumbsUp,
} from 'lucide-react';
import clsx from 'clsx';
import { MOCK_PROJECTS, PHASE_META, PRIORITY_META } from '@/lib/mock-data';
import type { Priority } from '@/lib/mock-data';

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------
const totalProjects = MOCK_PROJECTS.length;
const activeProjects = MOCK_PROJECTS.filter(p => p.projectPhase === 'ACTIVE').length;
const avgCompletion = Math.round(
  MOCK_PROJECTS.reduce((sum, p) => sum + p.completionPercentage, 0) / MOCK_PROJECTS.length,
);
const totalTasks = MOCK_PROJECTS.reduce((sum, p) => sum + p.taskCount, 0);

const STATS = [
  { label: 'Total Projects',  value: totalProjects,      icon: FolderKanban, iconBg: 'bg-blue-100',   iconColor: 'text-blue-600'   },
  { label: 'Active Projects', value: activeProjects,     icon: Activity,     iconBg: 'bg-green-100',  iconColor: 'text-green-600'  },
  { label: 'Avg Completion',  value: `${avgCompletion}%`,icon: TrendingUp,   iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
  { label: 'Total Tasks',     value: totalTasks,         icon: CheckSquare,  iconBg: 'bg-orange-100', iconColor: 'text-orange-600' },
];

// ---------------------------------------------------------------------------
// My Tasks data
// ---------------------------------------------------------------------------
type TaskStatus = 'In Progress' | 'Open' | 'Overdue';
interface MyTask {
  id: string;
  title: string;
  project: string;
  priority: Priority;
  status: TaskStatus;
  due: string;
  overdue: boolean;
}

const MY_TASKS: MyTask[] = [
  { id: 't1', title: 'Create wireframes for all pages',  project: 'Apollo Website',  priority: 'HIGH',     status: 'In Progress', due: '2026-07-15', overdue: false },
  { id: 't2', title: 'Design component library',          project: 'Apollo Website',  priority: 'MEDIUM',   status: 'Open',        due: '2026-07-22', overdue: false },
  { id: 't3', title: 'Performance benchmark baseline',    project: 'Apollo Website',  priority: 'HIGH',     status: 'In Progress', due: '2026-07-10', overdue: false },
  { id: 't4', title: 'Setup CI/CD pipeline',             project: 'Internal Tools',  priority: 'CRITICAL', status: 'Overdue',     due: '2026-06-10', overdue: true  },
  { id: 't5', title: 'Update API documentation',         project: 'Mobile App v2.0', priority: 'LOW',      status: 'Open',        due: '2026-06-24', overdue: false },
  { id: 't6', title: 'Review pull request #142',         project: 'Apollo Website',  priority: 'HIGH',     status: 'Open',        due: '2026-06-24', overdue: false },
];

type TabKey = 'In Progress' | 'Open' | 'Due Today' | 'Overdue';
const TABS: TabKey[] = ['In Progress', 'Open', 'Due Today', 'Overdue'];

function filterTasks(tasks: MyTask[], tab: TabKey): MyTask[] {
  if (tab === 'In Progress') return tasks.filter(t => t.status === 'In Progress');
  if (tab === 'Open')        return tasks.filter(t => t.status === 'Open');
  if (tab === 'Due Today')   return tasks.filter(t => t.due === '2026-06-24');
  if (tab === 'Overdue')     return tasks.filter(t => t.overdue);
  return tasks;
}

function priorityDotClass(priority: Priority): string {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'bg-red-500';
  if (priority === 'MEDIUM') return 'bg-blue-500';
  return 'bg-gray-400';
}

// ---------------------------------------------------------------------------
// My Projects (sorted by completionPercentage asc, first 4)
// ---------------------------------------------------------------------------
const MY_PROJECTS = [...MOCK_PROJECTS]
  .sort((a, b) => a.completionPercentage - b.completionPercentage)
  .slice(0, 4);

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
const MILESTONES = [
  { name: 'Phase 1 Complete',   project: 'Apollo Website', due: '2026-07-01', progress: 75, daysLeft: 7  },
  { name: 'MVP Release',         project: 'Mobile App v2',  due: '2026-07-15', progress: 30, daysLeft: 21 },
  { name: 'Design System v1.0', project: 'Apollo Website',  due: '2026-07-22', progress: 45, daysLeft: 28 },
  { name: 'Perf Baseline',      project: 'Apollo Website',  due: '2026-08-01', progress: 60, daysLeft: 38 },
];

function milestoneBadge(daysLeft: number): string {
  if (daysLeft < 7)  return 'bg-red-100 text-red-600';
  if (daysLeft < 14) return 'bg-yellow-100 text-yellow-600';
  return 'bg-green-100 text-green-600';
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
type ActivityIcon = 'check' | 'comment' | 'assign' | 'milestone' | 'file' | 'approve';
const ACTIVITY_ICONS: Record<ActivityIcon, React.ElementType> = {
  check:     CheckCircle,
  comment:   MessageCircle,
  assign:    UserCheck,
  milestone: Flag,
  file:      FileText,
  approve:   ThumbsUp,
};

const ACTIVITY = [
  { icon: 'check'     as ActivityIcon, color: 'bg-green-100 text-green-600',   text: 'You completed "Define information architecture"',    time: '2h ago'  },
  { icon: 'comment'   as ActivityIcon, color: 'bg-blue-100 text-blue-600',     text: 'Alice Kim commented on "Design component library"', time: '3h ago'  },
  { icon: 'assign'    as ActivityIcon, color: 'bg-purple-100 text-purple-600', text: 'Assigned "Performance benchmark baseline"',          time: '5h ago'  },
  { icon: 'milestone' as ActivityIcon, color: 'bg-yellow-100 text-yellow-600', text: 'Milestone "Phase 1 Complete" due in 7 days',        time: '1d ago'  },
  { icon: 'file'      as ActivityIcon, color: 'bg-gray-100 text-gray-600',     text: 'Carol Patel uploaded "Wireframes_v3.fig"',          time: '2d ago'  },
  { icon: 'approve'   as ActivityIcon, color: 'bg-green-100 text-green-600',   text: 'Project "Data Pipeline" was approved',              time: '2d ago'  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HomeDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('In Progress');

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const visibleTasks = filterTasks(MY_TASKS, activeTab);

  return (
    <div className="min-h-full bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Good morning, Anant</h1>
          <p className="text-sm text-gray-500 mt-1">{todayStr}</p>
        </div>
        <button
          onClick={() => alert('Quick Add Task')}
          className="inline-flex items-center gap-2 bg-[#3d8de2] hover:bg-[#2a78cc] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Quick Add Task
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-6">
        {STATS.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
            <div className={clsx('w-11 h-11 rounded-full flex items-center justify-center shrink-0', iconBg)}>
              <Icon size={20} className={iconColor} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6 p-6">
        {/* ---------------------------------------------------------------- */}
        {/* LEFT COLUMN                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="col-span-2 space-y-6">

          {/* Widget 1 — My Tasks */}
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">My Tasks</h2>
              {/* Tab pills */}
              <div className="flex items-center gap-1">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                      activeTab === tab
                        ? 'bg-[#3d8de2] text-white'
                        : 'text-gray-500 hover:bg-gray-100',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Task rows */}
            <div>
              {visibleTasks.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">No tasks in this category.</p>
              ) : (
                visibleTasks.map(task => (
                  <div
                    key={task.id}
                    className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3"
                  >
                    {/* Checkbox */}
                    <div className="w-4 h-4 rounded border-2 border-gray-300 cursor-pointer shrink-0" />
                    {/* Title */}
                    <span className="text-sm text-gray-800 flex-1">{task.title}</span>
                    {/* Project badge */}
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
                      {task.project}
                    </span>
                    {/* Priority dot */}
                    <div className={clsx('w-2 h-2 rounded-full shrink-0', priorityDotClass(task.priority))} />
                    {/* Due date */}
                    <span className={clsx('text-xs shrink-0', task.overdue ? 'text-red-500' : 'text-gray-400')}>
                      {task.due}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100">
              <Link href="/home" className="text-sm text-[#3d8de2] hover:underline">
                View all tasks →
              </Link>
            </div>
          </div>

          {/* Widget 2 — My Projects */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">My Projects</h2>
              <Link href="/projects" className="text-sm text-[#3d8de2] hover:underline">
                View all →
              </Link>
            </div>
            <div>
              {MY_PROJECTS.map(project => {
                const phase = PHASE_META[project.projectPhase];
                return (
                  <div
                    key={project.id}
                    className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3"
                  >
                    {/* Status dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: project.statusColor }}
                    />
                    {/* Name */}
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-sm font-medium text-gray-800 hover:text-[#3d8de2] flex-1 truncate"
                    >
                      {project.title}
                    </Link>
                    {/* Phase badge */}
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', phase.bg, phase.text)}>
                      {phase.label}
                    </span>
                    {/* Progress bar */}
                    <div className="w-32 shrink-0">
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${project.completionPercentage}%`, backgroundColor: project.statusColor }}
                        />
                      </div>
                    </div>
                    {/* Percentage */}
                    <span className="text-xs text-gray-500 shrink-0 w-8 text-right">
                      {project.completionPercentage}%
                    </span>
                    {/* Due date */}
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT COLUMN                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="col-span-1 space-y-6">

          {/* Widget 3 — Upcoming Milestones */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Upcoming Milestones</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {MILESTONES.map(m => (
                <div key={m.name} className="px-5 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Flag size={14} className="text-orange-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400">{m.project}</p>
                    </div>
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', milestoneBadge(m.daysLeft))}>
                      {m.daysLeft}d
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#3d8de2]"
                      style={{ width: `${m.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <Link href="/calendar" className="text-sm text-[#3d8de2] hover:underline">
                Open calendar →
              </Link>
            </div>
          </div>

          {/* Widget 4 — Quick Stats */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Quick Stats</h2>
            </div>
            <div className="grid grid-cols-2 gap-px bg-gray-100 border-b border-gray-100">
              {[
                { label: 'Tasks due today', value: 2,    badge: 'bg-orange-100 text-orange-600' },
                { label: 'Overdue',          value: 1,    badge: 'bg-red-100 text-red-600'       },
                { label: 'Completed this week', value: 3, badge: 'bg-green-100 text-green-600'   },
                { label: 'Hours logged',     value: '12h',badge: 'bg-blue-100 text-blue-600'     },
              ].map(({ label, value, badge }) => (
                <div key={label} className="bg-white px-4 py-4 flex flex-col gap-1">
                  <span className={clsx('text-lg font-bold px-2 py-0.5 rounded-md self-start', badge)}>
                    {value}
                  </span>
                  <span className="text-xs text-gray-500 mt-1">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 5 — Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {ACTIVITY.map(({ icon, color, text, time }, i) => {
                const Icon = ACTIVITY_ICONS[icon];
                return (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5', color)}>
                      <Icon size={14} />
                    </div>
                    <p className="text-sm text-gray-700 flex-1 leading-snug">{text}</p>
                    <span className="text-xs text-gray-400 shrink-0 mt-0.5">{time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
