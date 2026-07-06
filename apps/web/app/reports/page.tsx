'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, FolderOpen, CheckSquare, Users, Loader, BarChart2, Clock, ChevronDown, ChevronUp, Edit3, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { api, type ApiProject, type DashboardStats } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { ExportMenu, type ExportData } from '@/components/ExportMenu';

function projectsExport(projects: ApiProject[], stats?: DashboardStats): ExportData {
  return {
    filename: 'projects-report',
    title: 'Projects Report',
    subtitle: `${projects.length} projects`,
    columns: ['Title', 'Phase', 'Priority', 'Completion %', 'Tasks', 'Members', 'Due Date'],
    rows: projects.map(p => [
      p.title, p.projectPhase, p.priority, `${p.completionPercentage}%`,
      p._count?.projectTasks ?? 0, p._count?.members ?? 0,
      p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '',
    ]),
    meta: stats ? [
      { label: 'Total', value: String(stats.totalProjects) },
      { label: 'Active', value: String(stats.activeProjects) },
      { label: 'Avg completion', value: `${stats.avgCompletion}%` },
    ] : undefined,
  };
}

const PHASE_COLORS: Record<string, { color: string; label: string }> = {
  ACTIVE:    { color: '#34a853', label: 'Active'    },
  COMPLETED: { color: '#1a73e8', label: 'Completed' },
  ON_HOLD:   { color: '#fbbc04', label: 'On Hold'   },
  PLANNING:  { color: '#fe841f', label: 'Planning'  },
  IDEA:      { color: '#9aa0a6', label: 'Idea'      },
  ARCHIVED:  { color: '#bdc1c6', label: 'Archived'  },
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ea4335', HIGH: '#fa7b17', MEDIUM: '#fbbc04', LOW: '#34a853',
};

function ProgressEditor({ project, onUpdated }: { project: ApiProject; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.completionPercentage);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.projects.update(project.id, { completionPercentage: value });
      onUpdated();
      setEditing(false);
    } catch {} finally { setSaving(false); }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          type="number" min={0} max={100} value={value}
          onChange={e => setValue(Number(e.target.value))}
          className="w-14 px-1.5 py-0.5 text-xs border border-brand-400 rounded focus:outline-none"
          autoFocus
        />
        <span className="text-xs text-gray-500">%</span>
        <button onClick={save} disabled={saving} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
          {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button onClick={() => setEditing(false)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-24">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${project.completionPercentage}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8 text-right">{project.completionPercentage}%</span>
      <button
        onClick={() => { setValue(project.completionPercentage); setEditing(true); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-brand-600 transition-opacity"
        title="Edit progress"
      >
        <Edit3 size={12} />
      </button>
    </div>
  );
}

export default function ReportsPage() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [sortField, setSortField] = useState<'title' | 'completionPercentage' | 'projectPhase' | 'priority'>('completionPercentage');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['analytics-dashboard', org?.id],
    queryFn: () => api.analytics.dashboard(org!.id),
    enabled: !!org?.id,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ApiProject[]>({
    queryKey: ['analytics-projects', org?.id],
    queryFn: () => api.analytics.projects(org!.id),
    enabled: !!org?.id,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['analytics-projects', org?.id] });
    qc.invalidateQueries({ queryKey: ['analytics-dashboard', org?.id] });
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const sorted = [...projects].sort((a, b) => {
    const av = a[sortField]; const bv = b[sortField];
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const statusDist = Object.entries(PHASE_COLORS).map(([phase, { color, label }]) => ({
    label, count: projects.filter(p => p.projectPhase === phase).length, color,
  })).filter(d => d.count > 0);

  const maxCount = Math.max(...statusDist.map(d => d.count), 1);

  const loading = statsLoading || projectsLoading;

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline ml-1" /> : <ChevronDown size={12} className="inline ml-1" />;
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Project analytics and progress tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader size={16} className="animate-spin text-gray-400" />}
          <ExportMenu getData={() => projectsExport(projects, stats)} disabled={loading || projects.length === 0} />
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Projects',   value: stats?.totalProjects   ?? 0,       Icon: FolderOpen, iconBg: 'bg-brand-50',  iconColor: 'text-brand-500'  },
            { label: 'Active Projects',  value: stats?.activeProjects  ?? 0,       Icon: TrendingUp, iconBg: 'bg-green-50',  iconColor: 'text-green-600'  },
            { label: 'Avg Completion',   value: `${stats?.avgCompletion ?? 0}%`,   Icon: BarChart2,  iconBg: 'bg-amber-50',  iconColor: 'text-amber-600'  },
            { label: 'Total Tasks',      value: stats?.totalTasks      ?? 0,       Icon: CheckSquare,iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
          ].map(({ label, value, Icon, iconBg, iconColor }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
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
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Status distribution chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Projects by Phase</h3>
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {statusDist.map(({ label, count, color }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{label}</span>
                      <span className="text-xs font-semibold text-gray-800">{count}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
                {statusDist.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No project data yet.</p>}
              </div>
            )}
          </div>

          {/* Priority breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Projects by Priority</h3>
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(pr => {
                  const group = projects.filter(p => p.priority === pr);
                  const avg = group.length > 0 ? Math.round(group.reduce((s, p) => s + p.completionPercentage, 0) / group.length) : 0;
                  return (
                    <div key={pr}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: PRIORITY_COLORS[pr] }}>{pr.charAt(0) + pr.slice(1).toLowerCase()}</span>
                        <span className="text-xs text-gray-500">{group.length} projects · avg {avg}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${avg}%`, backgroundColor: PRIORITY_COLORS[pr] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Weekly hours */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Time Tracking Summary</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <Clock size={18} className="text-brand-600" />
                </div>
                <div>
                  {loading ? <div className="h-6 w-16 bg-gray-100 animate-pulse rounded" /> : <p className="text-xl font-bold text-gray-900">{Math.round(stats?.hoursLoggedThisWeek ?? 0)}h</p>}
                  <p className="text-xs text-gray-500">Hours logged this week</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <CheckSquare size={18} className="text-red-500" />
                </div>
                <div>
                  {loading ? <div className="h-6 w-16 bg-gray-100 animate-pulse rounded" /> : <p className="text-xl font-bold text-gray-900">{stats?.overdueCount ?? 0}</p>}
                  <p className="text-xs text-gray-500">Overdue tasks</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-orange-500" />
                </div>
                <div>
                  {loading ? <div className="h-6 w-16 bg-gray-100 animate-pulse rounded" /> : <p className="text-xl font-bold text-gray-900">{stats?.tasksDueToday ?? 0}</p>}
                  <p className="text-xs text-gray-500">Tasks due today</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Projects table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">All Projects</h3>
            <ExportMenu getData={() => projectsExport(projects, stats)} disabled={loading || projects.length === 0} />
          </div>

          {projectsLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader size={20} className="animate-spin mr-2" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[
                    ['title', 'Project'],
                    ['projectPhase', 'Phase'],
                    ['priority', 'Priority'],
                    ['completionPercentage', 'Progress'],
                  ].map(([field, label]) => (
                    <th
                      key={field}
                      className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                      onClick={() => toggleSort(field as typeof sortField)}
                    >
                      {label}
                      <SortIcon field={field as typeof sortField} />
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Tasks</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">No projects found.</td></tr>
                )}
                {sorted.map(project => {
                  const phase = PHASE_COLORS[project.projectPhase];
                  const priorityColor = PRIORITY_COLORS[project.priority] ?? '#9aa0a6';
                  return (
                    <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/projects/${project.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">
                          {project.title}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (phase?.color ?? '#9aa0a6') + '22', color: phase?.color ?? '#9aa0a6' }}>
                          {phase?.label ?? project.projectPhase}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold" style={{ color: priorityColor }}>{project.priority}</span>
                      </td>
                      <td className="px-4 py-3 min-w-[160px]">
                        <ProgressEditor project={project} onUpdated={invalidate} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{project._count?.projectTasks ?? 0}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {project.dueDate ? new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
