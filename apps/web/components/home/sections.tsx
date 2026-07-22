'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FolderKanban, Activity, TrendingUp, CheckSquare, CheckCircle, Clock, AlertTriangle,
  Flag, MessageCircle, FileText, UserCheck, Users, Shield, ScrollText,
  Check, X, CalendarDays, UserPlus, Award, LogIn, LogOut, Loader,
} from 'lucide-react';
import {
  api, type ApiTask, type ApiProject, type DashboardStats, type UserPerformance,
  type OrgPerformance, type OrgAttendanceSummary, type LeaveRequestItem,
  type Holiday, type RoleSummary, type Attendance, type LeaveBalance, type UserSummary,
  type PendingApproval, type TeamCapacity,
} from '@/lib/api';
import { formatDate } from '@/lib/date';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { progressColor } from '@/lib/progress';
import { Card, CardHeader, StatTile, MetricRow, EmptyHint, PHASE_COLORS, priorityDotClass } from './shared';

const today = () => new Date().toISOString().split('T')[0];

// ── Persona banner (always shown) ───────────────────────────────────────────
const ROLE_PERSONA: Record<string, { label: string; sub: string }> = {
  'Super Admin':       { label: 'Super Admin',       sub: 'Full system overview' },
  Admin:               { label: 'Administrator',     sub: 'Administration & delivery overview' },
  Manager:             { label: 'Manager',           sub: 'Team, approvals & delivery' },
  HR:                  { label: 'People Operations', sub: 'Attendance, leave & people' },
  'Senior Consultant': { label: 'Senior Consultant', sub: 'Delivery & organization performance' },
  Consultant:          { label: 'Consultant',        sub: 'Your tasks & delivery' },
  Employee:            { label: 'Team Member',        sub: 'Your tasks & performance' },
};

export function PersonaBanner() {
  const { currentUser } = useOrg();
  const { primaryRole } = usePermissions();
  const persona = (primaryRole && ROLE_PERSONA[primaryRole]) || { label: primaryRole ?? 'Member', sub: 'Your workspace' };
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {currentUser?.firstName ?? 'there'}</h1>
        <p className="text-sm text-gray-500 mt-1">{todayStr}</p>
      </div>
      <div className="text-right">
        <span className="inline-block text-xs font-semibold text-brand-700 bg-brand-50 px-3 py-1 rounded-full">{persona.label}</span>
        <p className="text-xs text-gray-400 mt-1.5">{persona.sub}</p>
      </div>
    </div>
  );
}

// ── Org project stats row (project.view) ────────────────────────────────────
export function OrgStatsRow() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('project.view');
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['analytics-dashboard', org?.id],
    queryFn: () => api.analytics.dashboard(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-6">
      <StatTile label="Total Projects"  value={stats?.totalProjects ?? 0}        Icon={FolderKanban} iconBg="bg-brand-50"  iconColor="text-brand-500" loading={isLoading} />
      <StatTile label="Active Projects" value={stats?.activeProjects ?? 0}        Icon={Activity}     iconBg="bg-green-100" iconColor="text-green-600" loading={isLoading} />
      <StatTile label="Avg Completion"  value={`${stats?.avgCompletion ?? 0}%`}  Icon={TrendingUp}   iconBg="bg-amber-50"  iconColor="text-amber-600" loading={isLoading} />
      <StatTile label="Total Tasks"     value={stats?.totalTasks ?? 0}           Icon={CheckSquare}  iconBg="bg-brand-50"  iconColor="text-brand-600" loading={isLoading} />
    </div>
  );
}

// ── My performance KPI strip (performance.view.own) ─────────────────────────
export function MyPerformanceCard() {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const allowed = can('performance.view.own');
  const { data, isLoading } = useQuery<UserPerformance>({
    queryKey: ['perf-me', currentUser?.id],
    queryFn: () => api.performance.me(),
    enabled: allowed && !!currentUser?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const kpis = [
    { label: 'Completion rate', value: `${data?.kpis.completionRate ?? 0}%`,       Icon: CheckCircle,   color: 'text-green-600' },
    { label: 'On-time rate',    value: `${data?.kpis.onTimeCompletionRate ?? 0}%`, Icon: Clock,         color: 'text-amber-600' },
    { label: 'Hours logged',    value: `${data?.kpis.hoursLogged ?? 0}h`,          Icon: TrendingUp,    color: 'text-brand-600' },
    { label: 'Tasks overdue',   value: data?.kpis.tasksOverdue ?? 0,               Icon: AlertTriangle, color: 'text-red-500'   },
  ];
  return (
    <div className="px-6 pt-6">
      <Card>
        <CardHeader title="My Performance" icon={TrendingUp} href="/performance" linkLabel="View details" />
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
          {kpis.map(({ label, value, Icon, color }) => (
            <div key={label} className="px-5 py-4 flex items-center gap-3">
              <Icon size={18} className={clsx(color, 'shrink-0')} />
              <div>
                {isLoading && !data
                  ? <div className="h-6 w-12 bg-gray-100 animate-pulse rounded" />
                  : <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>}
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── My tasks (task.view) ────────────────────────────────────────────────────
type TaskTabKey = 'All' | 'In Progress' | 'Open' | 'Overdue';
const TASK_TABS: TaskTabKey[] = ['All', 'In Progress', 'Open', 'Overdue'];
function filterTasks(tasks: ApiTask[], tab: TaskTabKey, day: string): ApiTask[] {
  if (tab === 'In Progress') return tasks.filter(t => t.currentStatus?.type === 'OPEN' && t.completionPercentage > 0);
  if (tab === 'Open') return tasks.filter(t => t.currentStatus?.type === 'OPEN');
  if (tab === 'Overdue') return tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date(day) && t.currentStatus?.type !== 'CLOSED');
  return tasks;
}

export function MyTasksCard() {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const allowed = can('task.view');
  const [tab, setTab] = useState<TaskTabKey>('All');
  const { data: tasks = [], isLoading } = useQuery<ApiTask[]>({
    queryKey: ['tasks-me', currentUser?.id],
    queryFn: () => api.tasks.listForUser(currentUser!.id),
    enabled: allowed && !!currentUser?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const day = today();
  const visible = filterTasks(tasks, tab, day);
  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">My Tasks</h2>
        <div className="flex items-center gap-1">
          {TASK_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                tab === t ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
            <div className="w-4 h-4 rounded border-2 border-gray-200 bg-gray-100 animate-pulse shrink-0" />
            <div className="h-4 bg-gray-100 animate-pulse rounded flex-1" />
            <div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
          </div>
        ))
      ) : visible.length === 0 ? (
        <EmptyHint>No tasks in this category.</EmptyHint>
      ) : (
        visible.map(task => {
          const isOverdue = !!task.dueDate && new Date(task.dueDate) < new Date(day);
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
                  {formatDate(task.dueDate)}
                </span>
              )}
              {task.currentStatus && (
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium" style={{ backgroundColor: task.currentStatus.colorHex + '22', color: task.currentStatus.colorHex }}>
                  {task.currentStatus.name}
                </span>
              )}
            </div>
          );
        })
      )}
      <div className="px-5 py-3 border-t border-gray-100">
        <Link href="/tasks" className="text-sm text-brand-600 hover:underline">View all tasks →</Link>
      </div>
    </Card>
  );
}

// ── My projects (project.view) ──────────────────────────────────────────────
export function MyProjectsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('project.view');
  const { data: projects = [], isLoading } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const top = projects.slice(0, 5);
  return (
    <Card>
      <CardHeader title="My Projects" href="/projects" linkLabel="View all" />
      {isLoading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-200 animate-pulse shrink-0" />
            <div className="h-4 bg-gray-100 animate-pulse rounded flex-1" />
            <div className="w-32 h-1.5 bg-gray-100 animate-pulse rounded-full shrink-0" />
          </div>
        ))
      ) : top.length === 0 ? (
        <EmptyHint>No projects yet.</EmptyHint>
      ) : (
        top.map(project => {
          const phase = PHASE_COLORS[project.projectPhase] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: project.projectPhase };
          const statusColor = project.currentStatus?.colorHex ?? '#3d8de2';
          return (
            <div key={project.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
              <Link href={`/projects/${project.id}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 flex-1 truncate">{project.title}</Link>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', phase.bg, phase.text)}>{phase.label}</span>
              <div className="w-28 shrink-0">
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${project.completionPercentage}%`, backgroundColor: progressColor(project.completionPercentage, project.priority) }} />
                </div>
              </div>
              <span className="text-xs text-gray-500 shrink-0 w-8 text-right">{project.completionPercentage}%</span>
            </div>
          );
        })
      )}
    </Card>
  );
}

// ── Project status summary (project.view, side) ─────────────────────────────
export function ProjectStatusCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('project.view');
  const { data: projects = [] } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  return (
    <Card>
      <CardHeader title="Project Status" href="/projects" linkLabel="Manage" />
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
    </Card>
  );
}

// ── Quick stats (task.view, side) ───────────────────────────────────────────
export function QuickStatsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('task.view');
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['analytics-dashboard', org?.id],
    queryFn: () => api.analytics.dashboard(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  return (
    <Card>
      <CardHeader title="Quick Stats" />
      <MetricRow loading={isLoading} items={[
        { label: 'Tasks due today', value: stats?.tasksDueToday ?? 0, badge: 'bg-orange-100 text-orange-600' },
        { label: 'Overdue',         value: stats?.overdueCount ?? 0,  badge: 'bg-red-100 text-red-600' },
        { label: 'Active projects', value: stats?.activeProjects ?? 0, badge: 'bg-green-100 text-green-600' },
        { label: 'Hours this week', value: `${Math.round(stats?.hoursLoggedThisWeek ?? 0)}h`, badge: 'bg-blue-100 text-blue-600' },
      ]} />
    </Card>
  );
}

// ── My attendance & leave (attendance.view.own, side) ───────────────────────
export function MyAttendanceCard() {
  const { can } = usePermissions();
  const { currentUser } = useOrg();
  const qc = useQueryClient();
  const allowed = can('attendance.view.own');
  // M33: share the Attendance page's query keys so a punch/regularize there also
  // refreshes this card (previously 'att-today' ≠ the page's 'attn-today').
  const { data: att } = useQuery<Attendance | null>({
    queryKey: ['attn-today', currentUser?.id], queryFn: () => api.attendance.today(), enabled: allowed, staleTime: 30_000,
  });
  const { data: balances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances', currentUser?.id], queryFn: () => api.leave.balances(), enabled: allowed, staleTime: 60_000,
  });
  // Punch in/out straight from Home. Same endpoint AND cache keys as the Attendance page,
  // so a punch here updates the Attendance page (and vice-versa) without a reload.
  const punch = useMutation({
    mutationFn: () => api.attendance.punch(),
    onSuccess: () => ['attn-today', 'attn-month', 'attn-org', 'leave-balances'].forEach(k => qc.invalidateQueries({ queryKey: [k] })),
  });
  if (!allowed) return null;
  const timeOf = (s?: string | null) => (s ? new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—');
  const clockedIn = !!att?.checkIn && !att?.checkOut;
  const dayComplete = !!att?.checkIn && !!att?.checkOut; // clocked in AND out — locked for the day
  const statusLabel = dayComplete ? 'Day complete' : !att?.checkIn ? 'Not clocked in' : 'Clocked in';
  const totalRemaining = balances.reduce((s, b) => s + (b.remaining ?? 0), 0);
  const busy = punch.isPending;
  return (
    <Card>
      <CardHeader title="My Attendance" icon={Clock} href="/attendance" linkLabel="Open" />
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', clockedIn ? 'bg-green-500 animate-pulse' : dayComplete ? 'bg-gray-400' : 'bg-gray-300')} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{statusLabel}</p>
            {att?.checkIn && <p className="text-xs text-gray-400">In {timeOf(att.checkIn)}{att.checkOut ? ` · Out ${timeOf(att.checkOut)}` : ''}{att.totalHours != null ? ` · ${att.totalHours}h` : ''}</p>}
          </div>
        </div>
        {/* Punch In → Punch Out → locked once the day is complete (clocked in AND out). */}
        <button
          onClick={() => { if (!busy && !dayComplete) punch.mutate(); }}
          disabled={busy || dayComplete}
          title={dayComplete ? 'You have clocked in and out — the day is complete.' : clockedIn ? 'Clock out for the day' : 'Clock in for the day'}
          className={clsx('mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed',
            dayComplete ? 'bg-gray-300' : clockedIn ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-600 hover:bg-brand-700')}
        >
          {busy ? <Loader size={15} className="animate-spin" /> : dayComplete ? <Check size={15} /> : clockedIn ? <LogOut size={15} /> : <LogIn size={15} />}
          {dayComplete ? 'Completed for today' : clockedIn ? 'Punch Out' : 'Punch In'}
        </button>
        {punch.isError && <p className="text-xs text-red-600 mt-2">{punch.error instanceof Error ? punch.error.message : 'Could not record your punch.'}</p>}
      </div>
      <div className="px-5 py-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">Leave remaining</span>
        <span className="text-sm font-semibold text-gray-700">{totalRemaining} days</span>
      </div>
    </Card>
  );
}

// ── Org/team performance snapshot (analytics.view.organization) ──────────────
export function OrgPerformanceCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('analytics.view.organization');
  const { data, isLoading } = useQuery<OrgPerformance>({
    queryKey: ['perf-org', org?.id],
    queryFn: () => api.performance.org(org!.id),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const t = data?.totals;
  const leaders = (data?.leaderboard ?? []).slice(0, 3);
  return (
    <Card>
      <CardHeader title="Team Performance" icon={Award} iconColor="text-amber-500" href="/performance" linkLabel="Details" />
      <MetricRow loading={isLoading} items={[
        { label: 'Tasks completed', value: t?.tasksCompleted ?? 0 },
        { label: 'Hours logged',    value: `${Math.round(t?.hoursLogged ?? 0)}h` },
        { label: 'On-time rate',    value: `${t?.avgOnTimeRate ?? 0}%` },
        { label: 'Active projects', value: t?.activeProjects ?? 0 },
      ]} />
      {leaders.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Top performers</p>
          {leaders.map((l, i) => (
            <div key={l.userId} className="flex items-center gap-2 py-1">
              <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
              <span className="text-sm text-gray-700 flex-1 truncate">{l.name}</span>
              <span className="text-xs text-gray-500">{l.tasksCompleted} done</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Team attendance today (attendance.view.organization) ────────────────────
export function TeamAttendanceCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('attendance.view.organization');
  const d = today();
  const { data, isLoading } = useQuery<OrgAttendanceSummary>({
    queryKey: ['att-org', org?.id, d],
    queryFn: () => api.attendance.orgSummary(org!.id, d, d),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const rows = data?.rows ?? [];
  const present = rows.filter(r => r.present > 0).length;
  const onLeave = rows.filter(r => r.onLeave > 0).length;
  const absent = rows.filter(r => r.absent > 0).length;
  return (
    <Card>
      <CardHeader title="Team Attendance" icon={Users} iconColor="text-green-600" href="/attendance" linkLabel="Open" />
      <MetricRow loading={isLoading} items={[
        { label: 'Present today', value: present, badge: 'bg-green-100 text-green-600' },
        { label: 'On leave',      value: onLeave, badge: 'bg-amber-100 text-amber-600' },
        { label: 'Absent',        value: absent,  badge: 'bg-red-100 text-red-600' },
        { label: 'Headcount',     value: rows.length, badge: 'bg-gray-100 text-gray-600' },
      ]} />
    </Card>
  );
}

// ── Pending leave approvals (leave.approve) ─────────────────────────────────
export function LeaveApprovalsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('leave.approve');
  const qc = useQueryClient();
  const { data: pending = [], isLoading } = useQuery<LeaveRequestItem[]>({
    queryKey: ['leave-pending', org?.id],
    queryFn: () => api.leave.orgRequests(org!.id, 'PENDING'),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['leave-pending', org?.id] });
  const approve = useMutation({ mutationFn: (id: string) => api.leave.approve(id), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id: string) => api.leave.reject(id), onSuccess: invalidate });
  if (!allowed) return null;
  const busy = approve.isPending || reject.isPending;
  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <CheckCircle size={16} className="text-brand-600" /> Leave Approvals
          {pending.length > 0 && <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{pending.length}</span>}
        </h2>
        <Link href="/attendance" className="text-sm text-brand-600 hover:underline shrink-0">All requests →</Link>
      </div>
      {isLoading ? (
        <div className="px-5 py-8"><div className="h-4 bg-gray-100 animate-pulse rounded" /></div>
      ) : pending.length === 0 ? (
        <EmptyHint>No pending leave requests. 🎉</EmptyHint>
      ) : (
        pending.slice(0, 5).map(r => (
          <div key={r.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {r.user ? `${r.user.firstName} ${r.user.lastName ?? ''}`.trim() : 'Someone'}
                <span className="ml-2 text-xs text-gray-400">{r.leaveType} · {r.numDays}d</span>
              </p>
              <p className="text-xs text-gray-400">
                {formatDate(r.startDate)}
                {r.endDate && r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''}
                {r.reason ? ` · ${r.reason}` : ''}
              </p>
            </div>
            <button disabled={busy} onClick={() => approve.mutate(r.id)}
              className="p-1.5 rounded-md bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-40" title="Approve">
              <Check size={15} />
            </button>
            <button disabled={busy} onClick={() => reject.mutate(r.id)}
              className="p-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40" title="Reject">
              <X size={15} />
            </button>
          </div>
        ))
      )}
    </Card>
  );
}

// ── People ops: headcount + upcoming holidays (user.view) ───────────────────
export function PeopleOpsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('user.view');
  const year = new Date().getFullYear();
  const { data: users = [], isLoading } = useQuery<UserSummary[]>({
    queryKey: ['users', org?.id], queryFn: () => api.users.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  const { data: holidays = [] } = useQuery<Holiday[]>({
    queryKey: ['holidays', org?.id, year], queryFn: () => api.leave.holidays(org!.id, year),
    enabled: allowed && !!org?.id, staleTime: 300_000,
  });
  if (!allowed) return null;
  const active = users.filter(u => u.status === 'ACTIVE').length;
  const upcoming = holidays
    .filter(h => h.date.split('T')[0] >= today())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  return (
    <Card>
      <CardHeader title="People" icon={UserPlus} iconColor="text-teal-600" href="/users" linkLabel="Directory" />
      <MetricRow loading={isLoading} items={[
        { label: 'Headcount',  value: users.length, badge: 'bg-teal-100 text-teal-700' },
        { label: 'Active',     value: active,       badge: 'bg-green-100 text-green-600' },
      ]} />
      {upcoming.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1"><CalendarDays size={12} /> Upcoming holidays</p>
          {upcoming.map(h => (
            <div key={h.id} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-700 truncate">{h.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{formatDate(h.date)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Admin shortcuts (admin perms) ───────────────────────────────────────────
export function AdminShortcutsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can(['permission.view', 'role.view', 'audit.view']);
  const canRoles = can('role.view');
  const { data: roles = [] } = useQuery<RoleSummary[]>({
    queryKey: ['roles', org?.id], queryFn: () => api.roles.list(org!.id),
    enabled: allowed && canRoles && !!org?.id, staleTime: 120_000,
  });
  const { data: users = [] } = useQuery<UserSummary[]>({
    queryKey: ['users', org?.id], queryFn: () => api.users.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 120_000,
  });
  if (!allowed) return null;
  const links = [
    { href: '/admin',       Icon: Shield,     label: 'Access control', sub: `${users.length} users · ${roles.length} roles`, show: can(['permission.view', 'role.view', 'user.create']) },
    { href: '/admin/audit', Icon: ScrollText, label: 'Audit log',      sub: 'System activity trail', show: can('audit.view') },
  ].filter(l => l.show);
  return (
    <Card>
      <CardHeader title="Administration" icon={Shield} iconColor="text-brand-600" />
      <div className="divide-y divide-gray-100">
        {links.map(({ href, Icon, label, sub }) => (
          <Link key={href} href={href} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
              <Icon size={17} className="text-brand-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-400 truncate">{sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ── Project requests awaiting MY approval (project.approve) ─────────────────
// The other half of the intern flow: a junior submits a project, and it lands here
// for the manager they nominated.
export function ProjectApprovalsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('project.approve');
  const qc = useQueryClient();
  const { data: pending = [], isLoading } = useQuery<PendingApproval[]>({
    queryKey: ['project-approvals', org?.id],
    queryFn: () => api.projects.pendingApprovals(),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project-approvals', org?.id] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const approve = useMutation({ mutationFn: (id: string) => api.projects.approve(id), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id: string) => api.projects.reject(id), onSuccess: invalidate });
  if (!allowed) return null;
  const busy = approve.isPending || reject.isPending;

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <FolderKanban size={16} className="text-brand-600" /> Project Requests
          {pending.length > 0 && <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{pending.length}</span>}
        </h2>
        <Link href="/projects" className="text-sm text-brand-600 hover:underline shrink-0">All projects →</Link>
      </div>
      {isLoading ? (
        <div className="px-5 py-8"><div className="h-4 bg-gray-100 animate-pulse rounded" /></div>
      ) : pending.length === 0 ? (
        <EmptyHint>No project requests awaiting your approval.</EmptyHint>
      ) : (
        pending.slice(0, 5).map(p => (
          <div key={p.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Link href={`/projects/${p.id}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 truncate block">{p.title}</Link>
              <p className="text-xs text-gray-400">
                {p.requester ? `${p.requester.firstName} ${p.requester.lastName ?? ''}`.trim() : 'Someone'} requested this
                {p.dueDate ? ` · due ${formatDate(p.dueDate)}` : ''}
              </p>
            </div>
            <button disabled={busy} onClick={() => approve.mutate(p.id)}
              className="p-1.5 rounded-md bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-40" title="Approve">
              <Check size={15} />
            </button>
            <button disabled={busy} onClick={() => reject.mutate(p.id)}
              className="p-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40" title="Reject">
              <X size={15} />
            </button>
          </div>
        ))
      )}
    </Card>
  );
}

// ── Team availability snapshot (capacity.view) ──────────────────────────────
export function TeamAvailabilityCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('capacity.view');
  const { data, isLoading } = useQuery<TeamCapacity>({
    queryKey: ['capacity', org?.id, 7],
    queryFn: () => api.capacity.team(7),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const rows = data?.rows ?? [];
  const freeNow = rows.filter(r => r.availableNow);
  const soon = rows.filter(r => !r.availableNow && r.nextFreeDate).slice(0, 3);

  return (
    <Card>
      <CardHeader title="Team Availability" icon={UserCheck} iconColor="text-emerald-600" href="/capacity" linkLabel="Capacity board" />
      <MetricRow loading={isLoading} items={[
        { label: 'Available now', value: freeNow.length, badge: 'bg-emerald-100 text-emerald-700' },
        { label: 'Freeing soon', value: rows.filter(r => !r.availableNow && r.nextFreeDate).length, badge: 'bg-sky-100 text-sky-700' },
        { label: 'Spare hours',  value: `${Math.round(rows.reduce((s, r) => s + r.freeHours, 0))}h`, badge: 'bg-amber-100 text-amber-700' },
        { label: 'Overdue',      value: rows.reduce((s, r) => s + r.overdueCount, 0), badge: 'bg-purple-100 text-purple-700' },
      ]} />
      {(freeNow.length > 0 || soon.length > 0) && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Available for more work</p>
          {freeNow.slice(0, 3).map(r => (
            <div key={r.userId} className="flex items-center gap-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-sm text-gray-700 flex-1 truncate">{r.name}</span>
              <span className="text-xs text-emerald-600 font-medium">{r.freeHours}h free</span>
            </div>
          ))}
          {soon.map(r => (
            <div key={r.userId} className="flex items-center gap-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
              <span className="text-sm text-gray-500 flex-1 truncate">{r.name}</span>
              <span className="text-xs text-gray-400">free {formatDate(r.nextFreeDate!)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Quick access (links filtered by permission) ─────────────────────────────
export function QuickAccessCard() {
  const { can } = usePermissions();
  const LINKS: { href: string; label: string; Icon: typeof CheckSquare; color: string; perm?: string | string[] }[] = [
    { href: '/tasks',      label: 'My Tasks',   Icon: CheckSquare,   color: 'text-brand-600',  perm: 'task.view' },
    { href: '/projects',   label: 'Projects',   Icon: FolderKanban,  color: 'text-green-600',  perm: 'project.view' },
    { href: '/calendar',   label: 'Calendar',   Icon: Flag,          color: 'text-orange-600', perm: 'calendar.view' },
    { href: '/discuss',    label: 'Discuss',    Icon: MessageCircle, color: 'text-purple-600', perm: 'channel.view' },
    { href: '/reports',    label: 'Reports',    Icon: FileText,      color: 'text-amber-600',  perm: ['report.view', 'report.export'] },
    { href: '/attendance', label: 'Attendance', Icon: Clock,         color: 'text-blue-600',   perm: 'attendance.view.own' },
    { href: '/users',      label: 'People',     Icon: Users,         color: 'text-teal-600',   perm: 'user.view' },
    { href: '/settings',   label: 'Settings',   Icon: UserCheck,     color: 'text-gray-600' },
  ];
  const visible = LINKS.filter(l => !l.perm || can(l.perm));
  return (
    <Card>
      <CardHeader title="Quick Access" />
      <div className="divide-y divide-gray-100">
        {visible.map(({ href, label, Icon, color }) => (
          <Link key={href} href={href} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
            <Icon size={16} className={color} />
            <span className="text-sm text-gray-700">{label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
