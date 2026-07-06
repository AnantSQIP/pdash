'use client';

// "My Performance" — a single user's own analytics. Also reused for admin drill-down.

import { useQuery } from '@tanstack/react-query';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts';
import {
  RiCheckboxCircleLine, RiTimeLine, RiPulseLine, RiBugLine, RiInboxLine, RiBarChartBoxLine,
} from '@remixicon/react';
import { Loader } from 'lucide-react';
import { format } from 'date-fns';
import { api, type UserPerformance, type UserBreakdowns, type HeatmapDay, type ApiTask, type NameValue } from '@/lib/api';
import { ContributionHeatmap } from './ContributionHeatmap';
import {
  ChartCard, KpiTile, GaugeCard, DonutCard, PieCard, LineCard, AreaCard, BarCard, ColumnCard, BulletChart, DataGrid,
  type GridColumn,
} from './charts';
import { C, PRIORITY_COLORS, SEVERITY_COLORS, STATUS_COLORS } from './tokens';
import { ExportMenu, type ExportData } from '@/components/ExportMenu';

function withColors(data: NameValue[], map: Record<string, string>): NameValue[] {
  return data.map(d => ({ ...d, color: map[d.name] ?? C.slate }));
}
function titleCase(s: string) { return s ? s[0] + s.slice(1).toLowerCase() : s; }

function PriorityBadge({ p }: { p: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[p] ?? C.slate }} />{titleCase(p)}
    </span>
  );
}
function StatusDot({ s }: { s?: string }) {
  if (!s) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] ?? C.slate }} />{s}
    </span>
  );
}
function DueCell({ due, closed }: { due: string; closed?: boolean }) {
  const date = new Date(due);
  const overdue = !closed && date < new Date();
  return <span className={overdue ? 'text-red-500 font-medium' : 'text-gray-500'}>{format(date, 'MMM d')}</span>;
}

export function UserPerfPanel({ userId, days = 30 }: { userId: string; days?: number }) {
  const { data: perf, isLoading } = useQuery<UserPerformance>({
    queryKey: ['perf-user', userId, days], queryFn: () => api.performance.user(userId, days), enabled: !!userId, staleTime: 30_000,
  });
  const { data: bd } = useQuery<UserBreakdowns>({
    queryKey: ['perf-user-bd', userId, days], queryFn: () => api.performance.breakdowns(userId, days), enabled: !!userId, staleTime: 30_000,
  });
  const { data: heat } = useQuery<{ userId: string; days: HeatmapDay[] }>({
    queryKey: ['perf-heatmap', userId], queryFn: () => api.performance.heatmap(userId, 365), enabled: !!userId, staleTime: 60_000,
  });
  const { data: tasks } = useQuery<ApiTask[]>({
    queryKey: ['perf-user-tasks', userId], queryFn: () => api.tasks.listForUser(userId), enabled: !!userId, staleTime: 30_000,
  });

  if (isLoading || !perf) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={18} className="animate-spin mr-2" />Loading performance…</div>;
  }
  const k = perf.kpis; const p = perf.previous;
  const delta = (cur: number, prev: number) => Math.round((cur - prev) * 10) / 10;
  const trend = perf.trend ?? [];
  const sparkOf = (key: 'completed' | 'hours' | 'activity') => trend.map(t => t[key]);

  const hoursDonut: NameValue[] = [
    { name: 'Billable', value: k.billableHours, color: C.teal },
    { name: 'Non-billable', value: Math.max(0, Math.round((k.hoursLogged - k.billableHours) * 10) / 10), color: C.slate },
  ];
  const radar = [
    { axis: 'Completion', v: k.completionRate },
    { axis: 'On-time', v: k.onTimeCompletionRate },
    { axis: 'Billable', v: k.billablePct },
    { axis: 'Activity', v: Math.min(100, k.activityVolume * 8) },
    { axis: 'Issues', v: k.issuesReported ? Math.round((k.issuesResolved / k.issuesReported) * 100) : 0 },
  ];

  const statusData = withColors(bd?.tasksByStatus ?? [], STATUS_COLORS);
  const priorityData = withColors(bd?.tasksByPriority ?? [], PRIORITY_COLORS);
  const severityData = withColors(bd?.issuesBySeverity ?? [], SEVERITY_COLORS);
  const hoursByProject = (bd?.hoursByProject ?? []).map(x => ({ name: x.name, value: x.hours }));
  const bullets = (bd?.estimatedVsActual ?? []).map(x => ({ label: x.name, actual: x.actual, target: x.target }));

  const taskCols: GridColumn<ApiTask>[] = [
    { key: 'title', header: 'Task', sortable: true, accessor: t => t.title },
    { key: 'priority', header: 'Priority', sortable: true, accessor: t => t.priority, render: t => <PriorityBadge p={t.priority} /> },
    { key: 'status', header: 'Status', sortable: true, accessor: t => t.currentStatus?.name ?? '', render: t => <StatusDot s={t.currentStatus?.name} />, exportValue: t => t.currentStatus?.name ?? '' },
    { key: 'completionPercentage', header: 'Progress', align: 'right', sortable: true, accessor: t => t.completionPercentage, render: t => `${t.completionPercentage}%` },
    { key: 'dueDate', header: 'Due', sortable: true, accessor: t => t.dueDate ?? '', render: t => (t.dueDate ? <DueCell due={t.dueDate} closed={t.currentStatus?.type === 'CLOSED'} /> : <span className="text-gray-300">—</span>), exportValue: t => t.dueDate ? t.dueDate.slice(0, 10) : '' },
  ];

  const exportReport = (): ExportData => ({
    filename: `performance-${(perf.name || 'user').replace(/\s+/g, '-').toLowerCase()}`,
    title: `Performance Report — ${perf.name}`,
    subtitle: `Last ${days} days`,
    columns: ['Metric', 'Value'],
    rows: [
      ['Tasks completed (period)', perf.periodTasksCompleted],
      ['Tasks assigned', k.tasksAssigned],
      ['Tasks open', k.tasksOpen],
      ['Tasks overdue', k.tasksOverdue],
      ['Completion rate', `${k.completionRate}%`],
      ['On-time completion rate', `${k.onTimeCompletionRate}%`],
      ['Hours logged', `${k.hoursLogged}h`],
      ['Billable hours', `${k.billableHours}h`],
      ['Billable %', `${k.billablePct}%`],
      ['Issues reported', k.issuesReported],
      ['Issues resolved', k.issuesResolved],
      ['Comments posted', k.commentsPosted],
      ['Activity volume', k.activityVolume],
      ['Avg cycle time', perf.cycleTimeDays != null ? `${perf.cycleTimeDays} days` : '—'],
    ],
    meta: [{ label: 'Member', value: perf.name }, { label: 'Period', value: `Last ${days} days` }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-700">{perf.name}<span className="font-normal text-gray-400"> · last {days} days</span></p>
        <ExportMenu getData={exportReport} label="Export report" />
      </div>
      {/* KPI strip with deltas + sparklines */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
        <KpiTile label="Completed" value={perf.periodTasksCompleted} Icon={RiCheckboxCircleLine} tint="bg-green-100 text-green-600" delta={delta(perf.periodTasksCompleted, p.tasksCompleted)} spark={sparkOf('completed')} sparkColor={C.green} />
        <KpiTile label="Hours" value={`${k.hoursLogged}h`} Icon={RiTimeLine} tint="bg-blue-50 text-blue-600" delta={delta(k.hoursLogged, p.hoursLogged)} spark={sparkOf('hours')} sparkColor={C.brand} />
        <KpiTile label="Activity" value={k.activityVolume} Icon={RiPulseLine} tint="bg-purple-50 text-purple-600" delta={delta(k.activityVolume, p.activityVolume)} spark={sparkOf('activity')} sparkColor={C.purple} />
        <KpiTile label="Resolved" value={k.issuesResolved} Icon={RiBugLine} tint="bg-orange-50 text-orange-600" delta={delta(k.issuesResolved, p.issuesResolved)} />
        <KpiTile label="On-time" value={`${k.onTimeCompletionRate}%`} Icon={RiBarChartBoxLine} tint="bg-teal-50 text-teal-600" />
        <KpiTile label="Open · Overdue" value={`${k.tasksOpen} · ${k.tasksOverdue}`} Icon={RiInboxLine} tint="bg-sky-50 text-sky-600" />
      </div>

      {/* Rates (gauges) + status mix (donut) + profile (radar) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Quality & effort rates">
          <div className="flex items-center justify-around">
            <GaugeCard value={k.completionRate} label="Completion" color={C.brand} />
            <GaugeCard value={k.onTimeCompletionRate} label="On-time" />
            <GaugeCard value={k.billablePct} label="Billable" color={C.teal} />
          </div>
        </ChartCard>
        <ChartCard title="Task status mix">
          <DonutCard data={statusData} centerValue={k.tasksAssigned} centerLabel="Assigned" />
        </ChartCard>
        <ChartCard title="Performance profile">
          <ResponsiveContainer width="100%" height={208}>
            <RadarChart data={radar} outerRadius="70%">
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: '#64748b' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="v" stroke={C.brand} fill={C.brand} fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Time-series: line + area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Activity & completion — trend" subtitle={`Last ${trend.length} days`}>
          <LineCard data={trend} xKey="date" xFmt={s => s.slice(5)} series={[
            { key: 'activity', name: 'Activity', color: C.brand },
            { key: 'completed', name: 'Completed', color: C.green },
          ]} />
        </ChartCard>
        <ChartCard title="Hours logged — trend" subtitle={`Last ${trend.length} days`}>
          <AreaCard data={trend} xKey="date" xFmt={s => s.slice(5)} series={[{ key: 'hours', name: 'Hours', color: C.accent }]} />
        </ChartCard>
      </div>

      {/* Priority column + hours-by-project bar + issues pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Tasks by priority">
          <ColumnCard data={priorityData} categoryKey="name" series={[{ key: 'value', name: 'Tasks', color: C.brand }]} />
        </ChartCard>
        <ChartCard title="Hours by project" subtitle={`Last ${days} days`}>
          <BarCard data={hoursByProject} categoryKey="name" valueKey="value" color={C.brand} />
        </ChartCard>
        <ChartCard title="Issues by severity">
          <PieCard data={severityData} />
        </ChartCard>
      </div>

      {/* Billable split (donut) + estimated-vs-actual (bullet) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Hours: billable vs non-billable">
          <DonutCard data={hoursDonut} centerValue={`${k.hoursLogged}h`} centerLabel="Logged" />
        </ChartCard>
        <ChartCard title="Estimated vs actual — open tasks" subtitle="Bar = logged hours · marker = estimate" className="lg:col-span-2">
          <BulletChart items={bullets} unit="h" />
        </ChartCard>
      </div>

      {/* Heatmap */}
      <ChartCard title="Contribution heatmap — last year">
        {heat ? <ContributionHeatmap days={heat.days} /> : <div className="text-sm text-gray-400">Loading…</div>}
      </ChartCard>

      {/* My tasks data grid */}
      <DataGrid
        title="My tasks"
        columns={taskCols}
        rows={tasks ?? []}
        searchKeys={['title']}
        searchPlaceholder="Search tasks…"
        exportName="my-tasks"
        initialSort={{ key: 'dueDate', dir: 'asc' }}
        emptyLabel="No assigned tasks"
      />
    </div>
  );
}
