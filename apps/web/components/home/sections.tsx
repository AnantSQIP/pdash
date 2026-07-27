'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FolderKanban, Activity, TrendingUp, CheckSquare, CheckCircle, CheckCircle2, Clock, AlertTriangle,
  CalendarDays, MessageCircle, FileText, Settings, Users, Shield, ScrollText, KeyRound,
  Check, X, UserPlus, Award, Receipt, Timer, Hash,
} from 'lucide-react';
import {
  api, type ApiTask, type ApiProject, type DashboardStats, type UserPerformance,
  type OrgPerformance, type OrgAttendanceSummary, type LeaveRequestItem,
  type Holiday, type RoleSummary, type UserSummary, type TeamCapacity, type PidRequestItem,
} from '@/lib/api';
import { formatDate, fmtHours, fmtNum, fmtPct, plural, longDateIST, hourIST, todayUtc, isPastDue, relativePast } from '@/lib/date';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/Avatar';
import { progressColor } from '@/lib/progress';
import {
  Card, CardHeader, CountBadge, StatTile, MetricRow, EmptyHint, ErrorState, SkeletonRows,
  PersonRow, ConfirmButton, BADGE, phaseChip, priorityDotClass,
} from './shared';
import { PunchControl } from './usePunch';
import { homeKeys } from './keys';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

/** Friendly label for a raw leave-type code (SICK/CL/COMP_OFF…). */
function prettyLeave(code: string): string {
  const map: Record<string, string> = {
    SICK: 'Sick', SL: 'Sick', CASUAL: 'Casual', CL: 'Casual', EARNED: 'Earned', EL: 'Earned',
    COMP_OFF: 'Comp-off', CO: 'Comp-off', WFH: 'WFH', UNPAID: 'Unpaid', LOP: 'Unpaid',
  };
  return map[code] ?? code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Persona banner (always shown) ───────────────────────────────────────────
const ROLE_PERSONA: Record<string, { label: string; sub: string }> = {
  'Super Admin':               { label: 'Super Admin',               sub: 'Full system overview' },
  Admin:                       { label: 'Administrator',             sub: 'Administration & delivery' },
  Manager:                     { label: 'Manager',                   sub: 'Team, approvals & delivery' },
  HR:                          { label: 'People Operations',         sub: 'Attendance, leave & people' },
  'Senior Consultant':         { label: 'Senior Consultant',         sub: 'Delivery & org performance' },
  Consultant:                  { label: 'Consultant',                sub: 'Your matters & delivery' },
  'Senior Research Associate': { label: 'Senior Research Associate', sub: 'Your research & PID requests' },
  Employee:                    { label: 'Team Member',               sub: 'Your tasks & performance' },
};

export function PersonaBanner() {
  const { currentUser } = useOrg();
  const { primaryRole } = usePermissions();
  const persona = (primaryRole && ROLE_PERSONA[primaryRole]) || { label: primaryRole ?? 'Team Member', sub: 'Your workspace' };
  const h = hourIST();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {/* Wrap the avatar so the responsive hide lives on a container — passing a `display`
            class straight to <Avatar> overrides its own flex and makes the initials overflow. */}
        <div className="hidden sm:block shrink-0"><Avatar user={currentUser} size={40} /></div>
        <div className="min-w-0">
          {/* Greeting + date are pinned to IST and stamped consistently on server & client. */}
          <h1 suppressHydrationWarning className="text-2xl font-bold text-gray-900 truncate">
            {greeting}, {currentUser?.firstName?.trim() || 'there'}
          </h1>
          <p suppressHydrationWarning className="text-sm text-gray-500 mt-0.5">{longDateIST()}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-block text-xs font-semibold text-brand-700 bg-brand-50 px-3 py-1 rounded-full">{persona.label}</span>
            <span className="text-xs text-gray-500">{currentUser?.designation?.trim() || persona.sub}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0"><PunchControl variant="banner" /></div>
    </header>
  );
}

/**
 * A prominent strip shown when the workspace (org/user) itself failed to load — otherwise
 * that failure is invisible and every dependent card looks merely "empty".
 */
export function WorkspaceErrorBanner() {
  const { isError } = useOrg();
  if (!isError) return null;
  return (
    <div className="mx-4 sm:mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
      <AlertTriangle size={18} className="text-red-500 shrink-0" />
      <p className="text-sm text-red-700 flex-1">We couldn&apos;t load your workspace. Some cards below may be empty.</p>
      <button onClick={() => window.location.reload()} className="text-sm font-semibold text-red-700 hover:underline shrink-0">Reload</button>
    </div>
  );
}

// ── Org project stats row (project.view) ────────────────────────────────────
export function OrgStatsRow() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('project.view');
  const { data: stats, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: homeKeys.analyticsDashboard(org?.id),
    queryFn: () => api.analytics.dashboard(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 sm:px-6 pt-4 sm:pt-6">
      <StatTile label="Total projects"  value={fmtNum(stats?.totalProjects)} Icon={FolderKanban} iconBg="bg-brand-50"  iconColor="text-brand-600" loading={isLoading} error={isError} />
      <StatTile label="Active projects" value={fmtNum(stats?.activeProjects)} Icon={Activity}     iconBg="bg-green-100" iconColor="text-green-600" loading={isLoading} error={isError} />
      <StatTile label="Avg completion"  value={fmtPct(stats?.avgCompletion)}  Icon={TrendingUp}   iconBg="bg-amber-50"  iconColor="text-amber-600" loading={isLoading} error={isError} />
      <StatTile label="Total tasks"     value={fmtNum(stats?.totalTasks)}     Icon={CheckSquare}  iconBg="bg-brand-50"  iconColor="text-brand-600" loading={isLoading} error={isError} />
    </div>
  );
}

// ── My performance KPI strip (performance.view.own) ─────────────────────────
export function MyPerformanceCard() {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const allowed = can('performance.view.own');
  const { data, isLoading, isError, refetch } = useQuery<UserPerformance>({
    queryKey: homeKeys.perfMe(currentUser?.id),
    queryFn: () => api.performance.me(),
    enabled: allowed && !!currentUser?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const k = data?.kpis;
  const noData = !!k && k.tasksAssigned === 0 && k.hoursLogged === 0 && k.tasksOverdue === 0;
  const kpis = [
    { label: 'Completion rate', value: fmtPct(k?.completionRate),       Icon: CheckCircle,   color: 'text-green-600' },
    { label: 'On-time rate',    value: fmtPct(k?.onTimeCompletionRate), Icon: Clock,         color: 'text-amber-600' },
    { label: 'Hours logged',    value: fmtHours(k?.hoursLogged),        Icon: TrendingUp,    color: 'text-brand-600' },
    { label: 'Tasks overdue',   value: fmtNum(k?.tasksOverdue),         Icon: AlertTriangle, color: 'text-red-500'   },
  ];
  return (
    <div className="px-4 sm:px-6 pt-4 sm:pt-6">
      <Card>
        <CardHeader title="My Performance" icon={TrendingUp} href="/performance" linkLabel="View details" />
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : noData ? (
          <EmptyHint>No performance data yet — complete tasks and log time to see your metrics.</EmptyHint>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
              {kpis.map(({ label, value, Icon, color }) => (
                <div key={label} className="px-5 py-4 flex items-center gap-3">
                  <Icon size={18} className={clsx(color, 'shrink-0')} />
                  <div className="min-w-0">
                    {isLoading && !data
                      ? <div className="h-6 w-12 bg-gray-100 animate-pulse rounded" />
                      : <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>}
                    <p className="text-xs text-gray-500 mt-1 truncate">{label}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100">Last {data?.periodDays ?? 30} days</p>
          </>
        )}
      </Card>
    </div>
  );
}

// ── My tasks (task.view) ────────────────────────────────────────────────────
type TaskTabKey = 'All' | 'In Progress' | 'Open' | 'Overdue';
const TASK_TABS: TaskTabKey[] = ['All', 'In Progress', 'Open', 'Overdue'];
const TASK_CAP = 6;
function filterTasks(tasks: ApiTask[], tab: TaskTabKey): ApiTask[] {
  if (tab === 'In Progress') return tasks.filter(t => t.currentStatus?.type === 'OPEN' && t.completionPercentage > 0);
  if (tab === 'Open') return tasks.filter(t => t.currentStatus?.type === 'OPEN');
  if (tab === 'Overdue') return tasks.filter(t => t.currentStatus?.type !== 'CLOSED' && isPastDue(t.dueDate));
  return tasks;
}

export function MyTasksCard() {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const allowed = can('task.view');
  const [tab, setTab] = useState<TaskTabKey>('All');
  const uid = currentUser?.id;
  const { data: tasks = [], isLoading, isError, refetch } = useQuery<ApiTask[]>({
    queryKey: homeKeys.tasksMe(uid),
    queryFn: () => api.tasks.listForUser(uid!),
    enabled: allowed && !!uid, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const loading = isLoading || !uid; // disabled-query window reads as loading, not "empty"
  const visible = filterTasks(tasks, tab);
  const shown = visible.slice(0, TASK_CAP);
  const more = visible.length - shown.length;
  const tabs = (
    <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Task filter">
      {TASK_TABS.map(t => (
        <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
          className={clsx('px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-400',
            tab === t ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
          {t}
        </button>
      ))}
    </div>
  );
  return (
    <Card>
      <CardHeader title="My Tasks" actions={tabs} href="/tasks" linkLabel="View all" />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : loading ? (
        <SkeletonRows />
      ) : shown.length === 0 ? (
        <EmptyHint>{tab === 'All' ? 'You have no tasks yet.' : `Nothing ${tab.toLowerCase()} right now.`}</EmptyHint>
      ) : (
        shown.map(task => {
          const overdue = task.currentStatus?.type !== 'CLOSED' && isPastDue(task.dueDate);
          const done = task.currentStatus?.type === 'CLOSED';
          const project = (task as any).projectTasks?.[0]?.project;
          return (
            <div key={task.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
              {done
                ? <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                : <span className={clsx('w-2 h-2 rounded-full shrink-0', priorityDotClass(task.priority))} title={`${task.priority} priority`} />}
              <span className={clsx('text-sm flex-1 truncate', done ? 'text-gray-400 line-through' : 'text-gray-800')}>{task.title}</span>
              {project && (
                <Link href={`/projects/${project.id}`} className="hidden sm:block text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0 hover:bg-gray-200 truncate max-w-[120px]">
                  {project.title}
                </Link>
              )}
              {task.dueDate && (
                <span className={clsx('text-xs shrink-0', overdue ? 'text-red-500 font-medium' : 'text-gray-500')}>
                  {formatDate(task.dueDate)}
                </span>
              )}
              {task.currentStatus && (
                <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full shrink-0 font-medium truncate max-w-[110px]"
                  style={{ backgroundColor: task.currentStatus.colorHex + '22', color: task.currentStatus.colorHex }}>
                  {task.currentStatus.name}
                </span>
              )}
            </div>
          );
        })
      )}
      {more > 0 && (
        <div className="px-5 py-2.5 border-t border-gray-100 text-center">
          <Link href="/tasks" className="text-xs font-medium text-brand-600 hover:underline">+{more} more →</Link>
        </div>
      )}
    </Card>
  );
}

// ── Projects (project.view) ─────────────────────────────────────────────────
export function MyProjectsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('project.view');
  const { data: projects = [], isLoading, isError, refetch } = useQuery<ApiProject[]>({
    queryKey: homeKeys.projects(org?.id),
    queryFn: () => api.projects.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const loading = isLoading || !org;
  const top = projects.slice(0, 5);
  return (
    <Card>
      <CardHeader title="Projects" icon={FolderKanban} href="/projects" linkLabel="View all" />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : loading ? (
        <SkeletonRows />
      ) : top.length === 0 ? (
        <EmptyHint>No projects yet.</EmptyHint>
      ) : (
        top.map(project => {
          const phase = phaseChip(project.projectPhase);
          const statusColor = project.currentStatus?.colorHex ?? '#3d8de2';
          const pct = Math.max(0, Math.min(100, Math.round(project.completionPercentage ?? 0)));
          return (
            <div key={project.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
              <Link href={`/projects/${project.id}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 flex-1 truncate">{project.title}</Link>
              {project.code
                ? <span className="hidden md:inline text-[11px] font-mono text-gray-500 shrink-0">{project.code}</span>
                : <span className="hidden md:inline text-[11px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">PID pending</span>}
              <span className={clsx('hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium shrink-0', phase.bg, phase.text)}>{phase.label}</span>
              <div className="w-16 sm:w-28 shrink-0">
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: progressColor(pct, project.priority) }} />
                </div>
              </div>
              <span className="text-xs text-gray-500 shrink-0 w-8 text-right">{pct}%</span>
            </div>
          );
        })
      )}
    </Card>
  );
}

// ── Project status summary (project.view, side) ─────────────────────────────
const PHASE_ORDER = ['ACTIVE', 'PLANNING', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED', 'ARCHIVED', 'IDEA'];
export function ProjectStatusCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('project.view');
  const { data: projects = [], isLoading, isError, refetch } = useQuery<ApiProject[]>({
    queryKey: homeKeys.projects(org?.id),
    queryFn: () => api.projects.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const loading = isLoading || !org;
  // Count EVERY phase present so the rows reconcile with the "Total projects" tile.
  const counts = new Map<string, number>();
  for (const p of projects) counts.set(p.projectPhase, (counts.get(p.projectPhase) ?? 0) + 1);
  const phases = [
    ...PHASE_ORDER.filter(p => counts.has(p)),
    ...[...counts.keys()].filter(p => !PHASE_ORDER.includes(p)),
  ];
  return (
    <Card>
      <CardHeader title="Project Status" icon={Activity} href="/projects" linkLabel="View all" />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : loading ? (
        <SkeletonRows n={4} />
      ) : projects.length === 0 ? (
        <EmptyHint>No projects yet.</EmptyHint>
      ) : (
        <div className="divide-y divide-gray-100">
          {phases.map(phase => {
            const ph = phaseChip(phase);
            return (
              <div key={phase} className="px-5 py-3 flex items-center justify-between">
                <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', ph.bg, ph.text)}>{ph.label}</span>
                <span className="text-sm font-semibold text-gray-700">{counts.get(phase)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Quick stats (task.view, side) ───────────────────────────────────────────
export function QuickStatsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('task.view');
  const { data: stats, isLoading, isError, refetch } = useQuery<DashboardStats>({
    queryKey: homeKeys.analyticsDashboard(org?.id),
    queryFn: () => api.analytics.dashboard(org!.id),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  return (
    <Card>
      <CardHeader title="Quick Stats" icon={TrendingUp} />
      <MetricRow loading={isLoading} error={isError} onRetry={() => refetch()} items={[
        { label: 'Tasks due today', value: fmtNum(stats?.tasksDueToday), badge: BADGE.warn },
        { label: 'Overdue',         value: fmtNum(stats?.overdueCount),  badge: BADGE.danger },
        { label: 'Active projects', value: fmtNum(stats?.activeProjects), badge: BADGE.good },
        { label: 'Hours this week', value: fmtHours(stats?.hoursLoggedThisWeek), badge: BADGE.info },
      ]} />
    </Card>
  );
}

// ── Org/team performance snapshot (analytics.view.organization) ──────────────
export function OrgPerformanceCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('analytics.view.organization');
  const { data, isLoading, isError, refetch } = useQuery<OrgPerformance>({
    queryKey: homeKeys.perfOrg(org?.id),
    queryFn: () => api.performance.org(org!.id),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const t = data?.totals;
  // Rank the Home top-3 by the number we actually SHOW (tasks completed) so the order
  // and the figure agree (the full /performance ranking is score-based).
  const leaders = [...(data?.leaderboard ?? [])].sort((a, b) => b.tasksCompleted - a.tasksCompleted).slice(0, 3);
  return (
    <Card>
      <CardHeader title="Team Performance" icon={Award} iconColor="text-amber-500" href="/performance" linkLabel="View details" />
      <MetricRow loading={isLoading} error={isError} onRetry={() => refetch()} items={[
        { label: 'Tasks completed', value: fmtNum(t?.tasksCompleted) },
        { label: 'Hours logged',    value: fmtHours(t?.hoursLogged) },
        { label: 'On-time rate',    value: fmtPct(t?.avgOnTimeRate) },
        { label: 'Active projects', value: fmtNum(t?.activeProjects) },
      ]} />
      {leaders.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Top performers</p>
          {leaders.map((l, i) => (
            <PersonRow key={l.userId} user={{ firstName: l.name, id: l.userId }} name={l.name} rank={i + 1}
              trailing={<span className="text-xs text-gray-500">{plural(l.tasksCompleted, 'task')}</span>} />
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
  const d = todayUtc();
  const { data, isLoading, isError, refetch } = useQuery<OrgAttendanceSummary>({
    // Keyed 'attn-org' (NOT 'att-org') so a punch's invalidation refreshes this card.
    queryKey: homeKeys.attnOrg(org?.id, d),
    queryFn: () => api.attendance.orgSummary(org!.id, d, d),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const rows = data?.rows ?? [];
  const present = rows.filter(r => r.present > 0).length;
  const onLeave = rows.filter(r => r.onLeave > 0).length;
  const notIn = Math.max(0, rows.length - present - onLeave);
  return (
    <Card>
      <CardHeader title="Team Attendance" icon={Users} iconColor="text-green-600" href="/attendance" linkLabel="View all" />
      <MetricRow loading={isLoading} error={isError} onRetry={() => refetch()} items={[
        { label: 'Present today', value: fmtNum(present), badge: BADGE.good },
        { label: 'On leave',      value: fmtNum(onLeave), badge: BADGE.warn },
        { label: 'Not in yet',    value: fmtNum(notIn),   badge: BADGE.neutral },
        { label: 'Headcount',     value: fmtNum(rows.length), badge: BADGE.neutral },
      ]} />
    </Card>
  );
}

// ── Pending leave approvals (leave.approve) ─────────────────────────────────
export function LeaveApprovalsCard() {
  const { org, currentUser } = useOrg();
  const { can } = usePermissions();
  const { toast } = useToast();
  const allowed = can('leave.approve');
  const qc = useQueryClient();
  const { data: pending = [], isLoading, isError, refetch } = useQuery<LeaveRequestItem[]>({
    queryKey: homeKeys.leavePending(org?.id),
    queryFn: () => api.leave.orgRequests(org!.id, 'PENDING'),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  const invalidate = () => { qc.invalidateQueries({ queryKey: homeKeys.leavePending(org?.id) }); qc.invalidateQueries({ queryKey: ['attn-org'] }); };
  const approve = useMutation({ mutationFn: (id: string) => api.leave.approve(id), onSuccess: () => { invalidate(); toast('Leave approved.', 'success'); }, onError: e => toast(errMsg(e), 'error') });
  const reject = useMutation({ mutationFn: (id: string) => api.leave.reject(id), onSuccess: () => { invalidate(); toast('Leave request rejected.', 'info'); }, onError: e => toast(errMsg(e), 'error') });
  if (!allowed) return null;
  // Hide the approver's OWN request — self-review is blocked server-side (its buttons would 403).
  const rows = pending.filter(r => r.userId !== currentUser?.id);
  const pendingId = approve.isPending ? approve.variables : reject.isPending ? reject.variables : null;
  return (
    <Card>
      <CardHeader title="Leave Approvals" icon={CheckCircle} badge={<CountBadge n={rows.length} />} href="/attendance?tab=team" linkLabel="All requests" />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <SkeletonRows n={3} />
      ) : rows.length === 0 ? (
        <EmptyHint>No pending leave requests.</EmptyHint>
      ) : (
        rows.slice(0, 5).map(r => {
          const busy = r.id === pendingId;
          const name = r.user ? `${r.user.firstName} ${r.user.lastName ?? ''}`.trim() : 'A team member';
          return (
            <div key={r.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
              <Avatar user={r.user ?? { firstName: name }} size={30} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {name}<span className="ml-2 text-xs text-gray-500">{prettyLeave(r.leaveType)} · {plural(r.numDays, 'day')}</span>
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {formatDate(r.startDate)}{r.endDate && r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''}{r.reason ? ` · ${r.reason}` : ''}
                </p>
              </div>
              <button disabled={busy} onClick={() => approve.mutate(r.id)} aria-label={`Approve leave for ${name}`}
                className="p-2 rounded-md bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-40" title="Approve">
                <Check size={15} />
              </button>
              <ConfirmButton disabled={busy} onConfirm={() => reject.mutate(r.id)} title={`Reject leave for ${name}`}
                className="p-2 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                armedClassName="p-2 rounded-md bg-red-600 text-white"
                armedChildren={<Check size={15} />}>
                <X size={15} />
              </ConfirmButton>
            </div>
          );
        })
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
  const { data: users = [], isLoading, isError, refetch } = useQuery<UserSummary[]>({
    queryKey: homeKeys.users(org?.id), queryFn: () => api.users.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  const { data: holidays = [] } = useQuery<Holiday[]>({
    queryKey: homeKeys.holidays(org?.id, year), queryFn: () => api.leave.holidays(org!.id, year),
    enabled: allowed && !!org?.id, staleTime: 300_000,
  });
  if (!allowed) return null;
  const upcoming = holidays.filter(h => h.date.slice(0, 10) >= todayUtc()).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card>
      <CardHeader title="People" icon={UserPlus} iconColor="text-teal-600" href="/users" linkLabel="Directory" />
      <MetricRow loading={isLoading} error={isError} onRetry={() => refetch()} items={[
        { label: 'Team members',   value: fmtNum(users.length), badge: BADGE.info },
        { label: 'Holidays ahead', value: fmtNum(upcoming.length), badge: BADGE.warn },
      ]} />
      {upcoming.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1"><CalendarDays size={12} /> Upcoming holidays</p>
          {upcoming.slice(0, 3).map(h => (
            <div key={h.id} className="flex items-center justify-between py-1 gap-2">
              <span className="text-sm text-gray-700 truncate">{h.name}</span>
              <span className="text-xs text-gray-500 shrink-0">{formatDate(h.date)}</span>
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
    queryKey: homeKeys.roles(org?.id), queryFn: () => api.roles.list(org!.id),
    enabled: allowed && canRoles && !!org?.id, staleTime: 120_000,
  });
  const { data: users = [] } = useQuery<UserSummary[]>({
    queryKey: homeKeys.users(org?.id), queryFn: () => api.users.list(org!.id),
    enabled: allowed && !!org?.id, staleTime: 120_000,
  });
  if (!allowed) return null;
  const links = [
    { href: '/admin',       Icon: KeyRound,   label: 'Access control', sub: `${plural(users.length, 'user')} · ${plural(roles.length, 'role')}`, show: can(['permission.view', 'role.view', 'user.create']) },
    { href: '/admin/audit', Icon: ScrollText, label: 'Audit log',      sub: 'System activity trail', show: can('audit.view') },
  ].filter(l => l.show);
  if (links.length === 0) return null;
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
              <p className="text-xs text-gray-500 truncate">{sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ── Incoming PID requests awaiting me (project.generate_pid) ─────────────────
// Replaces the old (dead) project-approval card: project approval was removed, but
// juniors still RAISE PID requests that an authority mints & assigns here.
export function PidRequestsCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const { toast } = useToast();
  const allowed = can('project.generate_pid');
  const qc = useQueryClient();
  const { data: pending = [], isLoading, isError, refetch } = useQuery<PidRequestItem[]>({
    queryKey: homeKeys.pidRequests(org?.id),
    queryFn: () => api.projects.pidRequests(),
    enabled: allowed && !!org?.id, staleTime: 30_000, placeholderData: keepPreviousData,
  });
  const fulfill = useMutation({
    mutationFn: async (id: string) => { const { pid } = await api.projects.generatePid(); return api.projects.fulfillPidRequest(id, pid); },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: homeKeys.pidRequests(org?.id) });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(`PID ${res.pid} assigned.`, 'success');
    },
    onError: e => toast(errMsg(e), 'error'),
  });
  if (!allowed) return null;
  const pendingId = fulfill.isPending ? fulfill.variables : null;
  return (
    <Card>
      <CardHeader title="PID Requests" icon={Hash} badge={<CountBadge n={pending.length} />} href="/projects" linkLabel="All projects" />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <SkeletonRows n={3} />
      ) : pending.length === 0 ? (
        <EmptyHint>No PID requests awaiting you.</EmptyHint>
      ) : (
        pending.slice(0, 5).map(p => {
          const busy = p.id === pendingId;
          return (
            <div key={p.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href={`/projects/${p.projectId}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 truncate block">{p.projectTitle}</Link>
                <p className="text-xs text-gray-500 truncate">
                  {p.projectType ? `${p.projectType.replace(/_/g, ' ')} · ` : ''}requested {relativePast(p.createdAt)}{p.note ? ` · ${p.note}` : ''}
                </p>
              </div>
              <button disabled={busy} onClick={() => fulfill.mutate(p.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50 shrink-0" title="Generate and assign a PID">
                <Hash size={13} /> {busy ? 'Assigning…' : 'Assign PID'}
              </button>
            </div>
          );
        })
      )}
    </Card>
  );
}

// ── Team availability snapshot (capacity.view) ──────────────────────────────
export function TeamAvailabilityCard() {
  const { org } = useOrg();
  const { can } = usePermissions();
  const allowed = can('capacity.view');
  const { data, isLoading, isError, refetch } = useQuery<TeamCapacity>({
    queryKey: homeKeys.capacity(org?.id, 7),
    queryFn: () => api.capacity.team(7),
    enabled: allowed && !!org?.id, staleTime: 60_000, placeholderData: keepPreviousData,
  });
  if (!allowed) return null;
  const rows = data?.rows ?? [];
  const freeNow = rows.filter(r => r.availableNow);
  const soon = rows.filter(r => !r.availableNow && r.nextFreeDate).slice(0, 3);
  return (
    <Card>
      <CardHeader title="Team Availability" icon={Activity} iconColor="text-emerald-600" href="/capacity" linkLabel="Capacity board" />
      <MetricRow loading={isLoading} error={isError} onRetry={() => refetch()} items={[
        { label: 'Available now', value: fmtNum(freeNow.length), badge: BADGE.good },
        { label: 'Freeing soon',  value: fmtNum(rows.filter(r => !r.availableNow && r.nextFreeDate).length), badge: BADGE.info },
        { label: 'Spare hours (7d)', value: fmtHours(rows.reduce((s, r) => s + r.freeHours, 0)), badge: BADGE.warn },
        { label: 'Overdue',       value: fmtNum(rows.reduce((s, r) => s + r.overdueCount, 0)), badge: BADGE.danger },
      ]} />
      {(freeNow.length > 0 || soon.length > 0) && (
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Available for more work</p>
          {freeNow.slice(0, 3).map(r => (
            <PersonRow key={r.userId} user={{ firstName: r.name, id: r.userId, profilePhoto: r.profilePhoto }} name={r.name}
              trailing={<span className="text-xs text-emerald-600 font-medium">{fmtHours(r.freeHours)} free</span>} />
          ))}
          {soon.map(r => (
            <PersonRow key={r.userId} user={{ firstName: r.name, id: r.userId, profilePhoto: r.profilePhoto }} name={r.name}
              trailing={<span className="text-xs text-gray-500">free {formatDate(r.nextFreeDate!)}</span>} />
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
    { href: '/calendar',   label: 'Calendar',   Icon: CalendarDays,  color: 'text-orange-600', perm: 'calendar.view' },
    { href: '/discuss',    label: 'Discuss',    Icon: MessageCircle, color: 'text-purple-600', perm: 'channel.view' },
    { href: '/timesheets', label: 'Timesheets', Icon: Timer,         color: 'text-brand-600',  perm: ['timesheet.view', 'timesheet.create'] },
    { href: '/reports',    label: 'Reports',    Icon: FileText,      color: 'text-amber-600',  perm: ['report.view', 'report.export'] },
    { href: '/attendance', label: 'Attendance', Icon: Clock,         color: 'text-blue-600',   perm: 'attendance.view.own' },
    { href: '/expenses',   label: 'Expenses',   Icon: Receipt,       color: 'text-rose-600',   perm: ['expense.view.own', 'expense.submit'] },
    { href: '/users',      label: 'People',     Icon: Users,         color: 'text-teal-600',   perm: 'user.view' },
    { href: '/settings',   label: 'Settings',   Icon: Settings,      color: 'text-gray-600' },
  ];
  const visible = LINKS.filter(l => !l.perm || can(l.perm));
  return (
    <Card>
      <CardHeader title="Quick Access" icon={Activity} />
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
