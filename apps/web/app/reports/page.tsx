'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, FolderOpen, CheckSquare, Users, Loader, BarChart2, Clock, ChevronDown, ChevronUp, ChevronRight, Edit3, Check, X, Search, Download, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { api, type DashboardStats, type ReportProject } from '@/lib/api';
import { formatDate, formatDateIST, formatDateTimeIST } from '@/lib/date';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { projectTypeLabel, pidLabel } from '@/lib/mock-data';
import { ExportMenu } from '@/components/ExportMenu';
import { projectsExport, fullReportCsv, singleProjectCsv } from './export';
import { PeriodFilter, buildPeriods, inPeriod, type Period } from '@/components/reports/PeriodFilter';

const PHASE_COLORS: Record<string, { color: string; label: string }> = {
  ACTIVE:    { color: '#34a853', label: 'Active'    },
  COMPLETED: { color: '#1a73e8', label: 'Completed' },
  ON_HOLD:   { color: '#fbbc04', label: 'On Hold'   },
  PLANNING:  { color: '#fe841f', label: 'Planning'  },
  ARCHIVED:  { color: '#bdc1c6', label: 'Archived'  },
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ea4335', HIGH: '#fa7b17', MEDIUM: '#fbbc04', LOW: '#34a853',
};

function ProgressEditor({ project, onUpdated }: { project: ReportProject; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.progress);
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
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${project.progress}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8 text-right">{project.progress}%</span>
      <button
        onClick={() => { setValue(project.progress); setEditing(true); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-brand-600 transition-opacity"
        title="Edit progress"
      >
        <Edit3 size={12} />
      </button>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { PM: 'Project Manager', REVIEWER: 'Reviewer', ANALYST: 'Analyst' };

/**
 * A project row in the reports table. Expanding it SPOTLIGHTS the matter: the row and its detail
 * are ringed and lifted, and everything else on the table dims — so on a long list there is never
 * any doubt which project you have open.
 */
function ProjectReportRow({ project, onUpdated, expanded, dimmed, onToggle, canExport }: {
  project: ReportProject; onUpdated: () => void; expanded: boolean; dimmed: boolean; onToggle: () => void;
  /** Passed down rather than read here, so every download control on this page obeys one decision. */
  canExport: boolean;
}) {
  const phase = PHASE_COLORS[project.phase];
  const priorityColor = PRIORITY_COLORS[project.priority] ?? '#9aa0a6';
  const hrs = (n: number | null | undefined) => (n == null ? '—' : `${n}h`);

  return (
    <>
      <tr
        className={clsx('transition-all cursor-pointer',
          expanded ? 'bg-brand-50/70 shadow-[inset_3px_0_0_0_theme(colors.brand.500)]' : 'hover:bg-gray-50',
          dimmed && 'opacity-40 hover:opacity-100')}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown size={14} className="text-brand-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
            <div className="min-w-0">
              <span className={clsx('block text-[11px] font-mono font-bold', expanded ? 'text-brand-800' : 'text-brand-700')}>
                {pidLabel(project.pid, project.roundSeq)}
              </span>
              <span className={clsx('text-sm', expanded ? 'font-semibold text-gray-900' : 'font-medium text-gray-900')}>{project.title}</span>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          {project.type
            ? <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">{projectTypeLabel(project.type)}</span>
            : <span className="text-xs text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: (phase?.color ?? '#9aa0a6') + '22', color: phase?.color ?? '#9aa0a6' }}>
            {phase?.label ?? project.phase}
          </span>
        </td>
        <td className="px-4 py-3"><span className="text-xs font-semibold" style={{ color: priorityColor }}>{project.priority}</span></td>
        <td className="px-4 py-3 min-w-[160px]" onClick={e => e.stopPropagation()}><ProgressEditor project={project} onUpdated={onUpdated} /></td>
        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{project.tasksClosed}/{project.taskCount}</td>
        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{project.dueDate ? formatDate(project.dueDate) : '—'}</td>
      </tr>
      {expanded && (
        <tr className="bg-brand-50/40">
          <td colSpan={7} className="px-4 py-4 shadow-[inset_3px_0_0_0_theme(colors.brand.500)]">
            <div className="rounded-xl border-2 border-brand-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-mono font-bold text-brand-700">{pidLabel(project.pid, project.roundSeq)}</span>
                  <Link href={`/projects/${project.id}`} onClick={e => e.stopPropagation()}
                    className="text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline inline-flex items-center gap-1">
                    {project.title} <ExternalLink size={12} className="text-gray-300" />
                  </Link>
                </div>
                {canExport && (
                  <button
                    onClick={e => { e.stopPropagation(); singleProjectCsv(project); }}
                    title="Download everything about this project as CSV"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 shrink-0"
                  >
                    <Download size={13} /> Download this project
                  </button>
                )}
              </div>

              {/* Everything known about the matter. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-2 text-xs mb-4">
                <div><span className="text-gray-400">Type</span><p className="text-gray-800">{project.type ? projectTypeLabel(project.type) : '—'}</p></div>
                <div><span className="text-gray-400">Client</span><p className="text-gray-800">{project.client ?? '—'}</p></div>
                <div><span className="text-gray-400">Status</span><p className="text-gray-800">{project.status ?? project.phase}</p></div>
                <div><span className="text-gray-400">Start</span><p className="text-gray-800">{project.startDate ? formatDate(project.startDate) : '—'}</p></div>
                <div><span className="text-gray-400">Deadline</span><p className="text-gray-800">{project.dueDate ? formatDate(project.dueDate) : '—'}</p></div>
                <div><span className="text-gray-400">Client deadline</span><p className="text-gray-800">{project.clientDueDate ? formatDate(project.clientDueDate) : '—'}</p></div>
                <div><span className="text-gray-400">Delivered to client</span><p className="text-gray-800">{project.clientDeliveryDate ? formatDateIST(project.clientDeliveryDate) : '—'}</p></div>
                <div><span className="text-gray-400">Completed</span><p className="text-gray-800">{project.completedAt ? formatDateTimeIST(project.completedAt) : '—'}</p></div>
                <div><span className="text-gray-400">Working hours</span><p className="text-gray-800">{hrs(project.workingHours)}</p></div>
                <div><span className="text-gray-400">Actual hours</span><p className="text-gray-800">{hrs(project.actualHours)}</p></div>
                <div><span className="text-gray-400">Logged (timesheets)</span><p className="text-gray-800">{project.loggedHours}h</p></div>
                <div><span className="text-gray-400">Estimated</span><p className="text-gray-800">{project.estimatedHours}h</p></div>
                <div><span className="text-gray-400">Tasks</span><p className="text-gray-800">{project.tasksClosed} closed · {project.tasksOpen} open</p></div>
                <div><span className="text-gray-400">Billable</span><p className="text-gray-800">{project.billable ? 'Yes' : 'No'}</p></div>
                <div><span className="text-gray-400">Created by</span><p className="text-gray-800">{project.createdBy ?? '—'}</p></div>
                <div><span className="text-gray-400">Created</span><p className="text-gray-800">{project.createdAt ? formatDate(project.createdAt) : '—'}</p></div>
              </div>

              {project.patents.length > 0 && (
                <div className="mb-3">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Patents</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {project.patents.map((h, i) => <span key={i} className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-mono text-[11px] ring-1 ring-amber-100">{h}</span>)}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Team</span>
                {project.members.length === 0 ? <p className="text-xs text-gray-400 mt-1">Nobody staffed.</p> : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {project.members.map(m => (
                      <Link key={m.id} href={`/users/${m.id}`} onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-[11px] text-gray-700 hover:border-brand-300 hover:text-brand-600">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-gray-400">· {ROLE_LABEL[m.role] ?? m.role}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tasks &amp; staffing</p>
              {project.tasks.length === 0 ? (
                <p className="text-xs text-gray-400">No tasks on this project.</p>
              ) : (
                <div className="space-y-2">
                  {project.tasks.map(t => (
                    <div key={t.id} className="bg-gray-50/70 rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{t.title}</span>
                        <span className="text-[11px] text-gray-400">
                          {t.status ? `${t.status} · ` : ''}{t.dueDate ? `due ${formatDate(t.dueDate)}` : 'no deadline'}
                          {t.estimatedHours ? ` · ${t.estimatedHours}h est.` : ''}{t.actualHours ? ` · ${t.actualHours}h actual` : ''}
                        </span>
                      </div>
                      {t.assignees.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {t.assignees.map(a => (
                            <Link key={a.id} href={`/users/${a.id}`} onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] text-gray-700 hover:border-brand-300 hover:text-brand-600">
                              <span className="font-medium">{a.name}</span>
                              <span className="text-gray-400">· {ROLE_LABEL[a.role] ?? a.role}</span>
                              {a.estimatedHours ? <span className="text-gray-400">· {a.estimatedHours}h</span> : null}
                              {a.dueDate ? <span className="text-gray-400">· {formatDate(a.dueDate)}</span> : null}
                            </Link>
                          ))}
                        </div>
                      ) : <p className="mt-1.5 text-[11px] text-gray-400">No one staffed yet.</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ReportsPage() {
  const { org } = useOrg();
  // `report.export` existed in the catalogue, was granted to every role, and gated nothing at all
  // — a permission implying a control that did not exist. It gates the download controls now.
  //
  // Be clear about what that can and cannot mean: the CSV is built in the browser from data the
  // page already holds, so this is NOT a security boundary — anyone who can read the report can
  // copy it. What it does is stop the whole book leaving in one click, which is a policy control
  // a firm may reasonably want, and it makes revoking the permission from a role actually do
  // something.
  const { can } = usePermissions();
  const canExport = can('report.export');
  const qc = useQueryClient();
  const [sortField, setSortField] = useState<'title' | 'progress' | 'phase' | 'priority'>('progress');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [openId, setOpenId] = useState<string | null>(null); // expanded project detail (spotlit)
  const [search, setSearch] = useState('');                   // by PID or project name
  const [period, setPeriod] = useState<Period>(() => buildPeriods()[0]);   // All time

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['analytics-dashboard', org?.id],
    queryFn: () => api.analytics.dashboard(org!.id),
    enabled: !!org?.id,
  });

  // ONE call carrying every field the table, the detail panel and the CSV all need — the page
  // used to load a thin list and then fetch tasks per row, which is why the export was so thin.
  const { data: projects = [], isLoading: projectsLoading } = useQuery<ReportProject[]>({
    queryKey: ['report-projects', org?.id],
    queryFn: () => api.projects.fullReport(),
    enabled: !!org?.id,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['report-projects', org?.id] });
    qc.invalidateQueries({ queryKey: ['analytics-dashboard', org?.id] });
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  // The period comes first: everything below — the table, the totals and the CSV — describes the
  // window that was asked for, so the export can no longer disagree with the screen.
  const inWindow = useMemo(() => projects.filter(pr => inPeriod(pr, period)), [projects, period]);

  // What the exported file should say about itself. A CSV that does not state its period is a
  // set of numbers with the question missing.
  const exportCaption = [
    period.key === 'all' ? 'All time' : `Period: ${period.label}`,
    search.trim() ? `Filtered by “${search.trim()}”` : null,
  ].filter(Boolean).join(' · ');

  // Search matches the PID or the name — the two things anyone actually has to hand.
  const q = search.trim().toLowerCase();
  const filtered = q
    ? inWindow.filter(p => `${p.pid ?? ''} ${p.title} ${p.client ?? ''}`.toLowerCase().includes(q))
    : inWindow;

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortField]; const bv = b[sortField];
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const statusDist = Object.entries(PHASE_COLORS).map(([phase, { color, label }]) => ({
    label, count: projects.filter(p => p.phase === phase).length, color,
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
          {canExport && <ExportMenu getData={() => projectsExport(sorted, exportCaption)} disabled={loading || sorted.length === 0} />}
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

        {/* Activity digest — range-selectable + exportable (day/week/month/quarter/year). */}

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
                  const avg = group.length > 0 ? Math.round(group.reduce((s, p) => s + p.progress, 0) / group.length) : 0;
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

        {/* Which period the whole page describes. Above the table because it governs the table,
            the totals and the export alike — the export used to ignore every filter on screen. */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3">
          <PeriodFilter value={period} onChange={setPeriod} matched={inWindow.length} total={projects.length} />
        </div>

        {/* Projects table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 shrink-0">
                {period.key === 'all' ? 'All Projects' : period.label}
              </h3>
              {/* Look one up by the number the client quotes, or by name. */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search PID, project or client…"
                  className="w-56 sm:w-72 pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400"
                />
                {search && (
                  <button onClick={() => setSearch('')} title="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              {q && <span className="text-xs text-gray-400 whitespace-nowrap">{sorted.length} match{sorted.length === 1 ? '' : 'es'}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canExport && (
                <button
                  onClick={() => fullReportCsv(sorted)}
                  disabled={loading || sorted.length === 0}
                  title="Full CSV — every project plus every task and who is on it"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <Download size={14} /> Full CSV
                </button>
              )}
              {canExport && <ExportMenu getData={() => projectsExport(sorted, exportCaption)} disabled={loading || sorted.length === 0} />}
            </div>
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
                    ['type', 'Type'],
                    ['phase', 'Phase'],
                    ['priority', 'Priority'],
                    ['progress', 'Progress'],
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
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    {q ? `No project matches “${search.trim()}”.` : 'No projects found.'}
                  </td></tr>
                )}
                {sorted.map(project => (
                  <ProjectReportRow
                    key={project.id}
                    project={project}
                    canExport={canExport}
                    onUpdated={invalidate}
                    expanded={openId === project.id}
                    // Everything else dims while one project is open — that's the spotlight.
                    dimmed={openId !== null && openId !== project.id}
                    onToggle={() => setOpenId(openId === project.id ? null : project.id)}
                  />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
