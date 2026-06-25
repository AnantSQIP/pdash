'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FolderKanban, Activity, TrendingUp, CheckSquare,
  Plus, Flag, CheckCircle, MessageCircle, UserCheck,
  FileText, ThumbsUp, Clock, AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type ApiTask, type ApiProject, type DashboardStats } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { progressColor } from '@/lib/progress';

const PHASE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Active'    },
  PLANNING:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Planning'  },
  ON_HOLD:   { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'On Hold'   },
  COMPLETED: { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Completed' },
  ARCHIVED:  { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Archived'  },
  IDEA:      { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Idea'      },
};

type TaskTabKey = 'All' | 'In Progress' | 'Open' | 'Overdue';
const TASK_TABS: TaskTabKey[] = ['All', 'In Progress', 'Open', 'Overdue'];

function priorityDotClass(priority: string): string {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'bg-red-500';
  if (priority === 'MEDIUM') return 'bg-brand-500';
  return 'bg-gray-400';
}

function filterTasks(tasks: ApiTask[], tab: TaskTabKey, today: string): ApiTask[] {
  if (tab === 'In Progress') return tasks.filter(t => t.currentStatus?.type === 'OPEN' && t.completionPercentage > 0);
  if (tab === 'Open') return tasks.filter(t => t.currentStatus?.type === 'OPEN');
  if (tab === 'Overdue') return tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date(today) && t.currentStatus?.type !== 'CLOSED');
  return tasks;
}

function StatCard({ label, value, Icon, iconBg, iconColor, loading }: {
  label: string; value: string | number; Icon: React.ElementType;
  iconBg: string; iconColor: string; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
      <div className={clsx('w-11 h-11 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon size={20} className={iconColor} />
      </div>
      <div>
        {loading
          ? <div className="h-7 w-12 bg-gray-100 animate-pulse rounded" />
          : <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>}
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

export default function HomeDashboardPage() {
  const { org, currentUser, loading: orgLoading } = useOrg();
  const [activeTab, setActiveTab] = useState<TaskTabKey>('All');

  const today = new Date().toISOString().split('T')[0];
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['analytics-dashboard', org?.id],
    queryFn: () => api.analytics.dashboard(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: myTasks = [], isLoading: tasksLoading } = useQuery<ApiTask[]>({
    queryKey: ['tasks-me', currentUser?.id],
    queryFn: () => api.tasks.listForUser(currentUser!.id),
    enabled: !!currentUser?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const visibleTasks = filterTasks(myTasks, activeTab, today);
  const myProjects = [...projects].slice(0, 4);
  // Show stat-card skeletons immediately — don't gate on org; use statsLoading directly
  // so cached data renders instantly on re-visits while a background refetch runs.
  const statsSkeletonVisible = orgLoading || statsLoading;

  return (
    <div className="min-h-full">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Good morning, {currentUser?.firstName ?? 'there'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{todayStr}</p>
        </div>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          View Tasks
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-6">
        <StatCard label="Total Projects"  value={stats?.totalProjects  ?? 0}  Icon={FolderKanban} iconBg="bg-brand-50"  iconColor="text-brand-500"  loading={statsSkeletonVisible} />
        <StatCard label="Active Projects" value={stats?.activeProjects  ?? 0}  Icon={Activity}     iconBg="bg-green-100" iconColor="text-green-600"  loading={statsSkeletonVisible} />
        <StatCard label="Avg Completion"  value={`${stats?.avgCompletion ?? 0}%`} Icon={TrendingUp} iconBg="bg-amber-50"  iconColor="text-amber-600"  loading={statsSkeletonVisible} />
        <StatCard label="Total Tasks"     value={stats?.totalTasks     ?? 0}  Icon={CheckSquare}  iconBg="bg-brand-50"  iconColor="text-brand-600"  loading={statsSkeletonVisible} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6 p-6">
        {/* LEFT COLUMN */}
        <div className="col-span-2 space-y-6">

          {/* My Tasks */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">My Tasks</h2>
              <div className="flex items-center gap-1">
                {TASK_TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                      activeTab === tab ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {(orgLoading || tasksLoading) ? (
              <div>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
                    <div className="w-4 h-4 rounded border-2 border-gray-200 bg-gray-100 animate-pulse shrink-0" />
                    <div className="h-4 bg-gray-100 animate-pulse rounded flex-1" />
                    <div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse shrink-0" />
                    <div className="h-3 w-12 bg-gray-100 animate-pulse rounded shrink-0" />
                  </div>
                ))}
              </div>
            ) : visibleTasks.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No tasks in this category.</p>
            ) : (
              <div>
                {visibleTasks.map(task => {
                  const isOverdue = !!task.dueDate && new Date(task.dueDate) < new Date(today);
                  const project = (task as any).projectTasks?.[0]?.project;
                  return (
                    <div key={task.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
                      <div className={clsx('w-4 h-4 rounded border-2 shrink-0', task.currentStatus?.type === 'CLOSED' ? 'border-green-500 bg-green-500' : 'border-gray-300')} />
                      <span className="text-sm text-gray-800 flex-1 truncate">{task.title}</span>
                      {project && (
                        <Link href={`/projects/${project.id}`} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0 hover:bg-gray-200 truncate max-w-[120px]">
                          {project.title}
                        </Link>
                      )}
                      <div className={clsx('w-2 h-2 rounded-full shrink-0', priorityDotClass(task.priority))} />
                      {task.dueDate && (
                        <span className={clsx('text-xs shrink-0', isOverdue ? 'text-red-500' : 'text-gray-400')}>
                          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {task.currentStatus && (
                        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium" style={{ backgroundColor: task.currentStatus.colorHex + '22', color: task.currentStatus.colorHex }}>
                          {task.currentStatus.name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-5 py-3 border-t border-gray-100">
              <Link href="/tasks" className="text-sm text-brand-600 hover:underline">
                View all tasks →
              </Link>
            </div>
          </div>

          {/* My Projects */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">My Projects</h2>
              <Link href="/projects" className="text-sm text-brand-600 hover:underline">View all →</Link>
            </div>
            {(orgLoading || projectsLoading) ? (
              <div>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-200 animate-pulse shrink-0" />
                    <div className="h-4 bg-gray-100 animate-pulse rounded flex-1" />
                    <div className="h-5 w-16 bg-gray-100 animate-pulse rounded-full shrink-0" />
                    <div className="w-32 h-1.5 bg-gray-100 animate-pulse rounded-full shrink-0" />
                    <div className="h-3 w-8 bg-gray-100 animate-pulse rounded shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {myProjects.map(project => {
                  const phase = PHASE_COLORS[project.projectPhase] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: project.projectPhase };
                  const statusColor = project.currentStatus?.colorHex ?? '#3d8de2';
                  return (
                    <div key={project.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                      <Link href={`/projects/${project.id}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 flex-1 truncate">
                        {project.title}
                      </Link>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', phase.bg, phase.text)}>
                        {phase.label}
                      </span>
                      <div className="w-32 shrink-0">
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${project.completionPercentage}%`, backgroundColor: progressColor(project.completionPercentage, project.priority) }} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 shrink-0 w-8 text-right">{project.completionPercentage}%</span>
                      {project.dueDate && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  );
                })}
                {projects.length === 0 && !projectsLoading && (
                  <p className="px-5 py-6 text-sm text-gray-400 text-center">No projects yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-1 space-y-6">

          {/* Quick Stats */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Quick Stats</h2>
            </div>
            <div className="grid grid-cols-2 gap-px bg-gray-100 border-b border-gray-100">
              {[
                { label: 'Tasks due today', value: stats?.tasksDueToday ?? 0, badge: 'bg-orange-100 text-orange-600', Icon: Clock },
                { label: 'Overdue',          value: stats?.overdueCount   ?? 0, badge: 'bg-red-100 text-red-600',       Icon: AlertTriangle },
                { label: 'Active projects',  value: stats?.activeProjects  ?? 0, badge: 'bg-green-100 text-green-600',   Icon: Activity },
                { label: 'Hours this week',  value: `${Math.round(stats?.hoursLoggedThisWeek ?? 0)}h`, badge: 'bg-blue-100 text-blue-600', Icon: Clock },
              ].map(({ label, value, badge, Icon }) => (
                <div key={label} className="bg-white px-4 py-4 flex flex-col gap-1">
                  {statsSkeletonVisible
                    ? <div className="h-7 w-10 bg-gray-100 animate-pulse rounded" />
                    : <span className={clsx('text-lg font-bold px-2 py-0.5 rounded-md self-start', badge)}>{value}</span>}
                  <span className="text-xs text-gray-500 mt-1">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Projects summary */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Project Status</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {['ACTIVE', 'PLANNING', 'ON_HOLD', 'COMPLETED'].map(phase => {
                const count = projects.filter(p => p.projectPhase === phase).length;
                const ph = PHASE_COLORS[phase];
                return (
                  <div key={phase} className="px-5 py-3 flex items-center justify-between">
                    <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', ph.bg, ph.text)}>{ph.label}</span>
                    <span className="text-sm font-semibold text-gray-700">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <Link href="/projects" className="text-sm text-brand-600 hover:underline">Manage projects →</Link>
            </div>
          </div>

          {/* Navigation shortcuts */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Quick Access</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                { href: '/tasks',    label: 'My Tasks',    Icon: CheckSquare,   color: 'text-brand-600'  },
                { href: '/projects', label: 'Projects',    Icon: FolderKanban,  color: 'text-green-600'  },
                { href: '/calendar', label: 'Calendar',    Icon: Flag,          color: 'text-orange-600' },
                { href: '/discuss',  label: 'Discuss',     Icon: MessageCircle, color: 'text-purple-600' },
                { href: '/reports',  label: 'Reports',     Icon: FileText,      color: 'text-amber-600'  },
                { href: '/settings', label: 'Settings',    Icon: UserCheck,     color: 'text-gray-600'   },
              ].map(({ href, label, Icon, color }) => (
                <Link key={href} href={href} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <Icon size={16} className={color} />
                  <span className="text-sm text-gray-700">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
