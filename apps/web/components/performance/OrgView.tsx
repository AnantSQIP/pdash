'use client';

// "Organization" — admin view across all users. Gated by analytics.view.organization.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  RiTeamLine, RiCheckboxCircleLine, RiTimeLine, RiFolder3Line, RiTrophyLine,
  RiRefreshLine, RiArrowRightSLine,
} from '@remixicon/react';
import { Loader } from 'lucide-react';
import {
  api, type OrgPerformance, type OrgBreakdowns, type OrgTrend, type HeatmapDay, type LeaderboardRow, type NameValue,
} from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import {
  ChartCard, KpiTile, GaugeCard, DonutCard, PieCard, LineCard, AreaCard, BarCard, ColumnCard, BulletChart, DataGrid,
  type GridColumn,
} from './charts';
import { ContributionHeatmap } from './ContributionHeatmap';
import { UserPerfPanel } from './UserPerfPanel';
import { MultiSelectFilter, FilterBar } from './controls';
import { C, DONUT_COLORS, STATUS_COLORS, SEVERITY_COLORS, rateColor, round1 } from './tokens';
import { ExportMenu, type ExportData } from '@/components/ExportMenu';

type Metric = 'tasksCompleted' | 'hoursLogged' | 'onTimeRate' | 'activityVolume';
const METRIC_LABEL: Record<Metric, string> = {
  tasksCompleted: 'Tasks Completed', hoursLogged: 'Hours Logged', onTimeRate: 'On-time Rate', activityVolume: 'Activity',
};

function withColors(data: NameValue[], map: Record<string, string>): NameValue[] {
  return data.map(d => ({ ...d, color: map[d.name] ?? C.slate }));
}
function uniq(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}

export function OrgView({ days = 30 }: { days?: number }) {
  const { org } = useOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [focus, setFocus] = useState<Metric>('tasksCompleted');
  const [selectedUser, setSelectedUser] = useState('');
  const [depts, setDepts] = useState<string[]>([]);
  const [desigs, setDesigs] = useState<string[]>([]);
  const [rebuilding, setRebuilding] = useState(false);
  const drillRef = useRef<HTMLDivElement>(null);

  // When a member is selected, scroll their detail panel into view.
  useEffect(() => {
    if (selectedUser) {
      const id = setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return () => clearTimeout(id);
    }
  }, [selectedUser]);

  const { data: orgPerf, isLoading, dataUpdatedAt } = useQuery<OrgPerformance>({
    queryKey: ['perf-org', org?.id, days], queryFn: () => api.performance.org(org!.id, days), enabled: !!org?.id, staleTime: 30_000,
  });
  const { data: bd } = useQuery<OrgBreakdowns>({
    queryKey: ['perf-org-bd', org?.id, days], queryFn: () => api.performance.orgBreakdowns(org!.id, days), enabled: !!org?.id, staleTime: 30_000,
  });
  const { data: trend } = useQuery<OrgTrend>({
    queryKey: ['perf-org-trend', org?.id, days], queryFn: () => api.performance.orgTrend(org!.id, days), enabled: !!org?.id, staleTime: 30_000,
  });
  const { data: orgHeat } = useQuery<{ organizationId: string; days: HeatmapDay[] }>({
    queryKey: ['perf-org-heatmap', org?.id], queryFn: () => api.performance.orgHeatmap(org!.id, 365), enabled: !!org?.id, staleTime: 60_000,
  });

  async function handleRebuild() {
    if (!org?.id || rebuilding) return;
    setRebuilding(true);
    try {
      await api.performance.rebuild(org.id);
      ['perf-org', 'perf-org-bd', 'perf-org-trend', 'perf-user', 'perf-user-bd', 'perf-heatmap', 'perf-org-heatmap'].forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    } finally { setRebuilding(false); }
  }

  const leaderboard = orgPerf?.leaderboard ?? [];
  const deptOptions = useMemo(() => uniq(leaderboard.map(r => r.department)).map(d => ({ value: d, label: d })), [leaderboard]);
  const desigOptions = useMemo(() => uniq(leaderboard.map(r => r.designation)).map(d => ({ value: d, label: d })), [leaderboard]);

  const filtered = useMemo(() => leaderboard.filter(r =>
    (depts.length === 0 || (r.department && depts.includes(r.department))) &&
    (desigs.length === 0 || (r.designation && desigs.includes(r.designation))),
  ), [leaderboard, depts, desigs]);

  const ranked = useMemo(() => [...filtered].sort((a, b) => b[focus] - a[focus]), [filtered, focus]);

  if (isLoading || !orgPerf) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={18} className="animate-spin mr-2" />Loading organization performance…</div>;
  }
  const t = orgPerf.totals;
  const freshAt = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();
  const filterActive = depts.length > 0 || desigs.length > 0;

  // comparison data (top-N by focus)
  const topRanked = ranked.slice(0, 8).map(r => ({ name: r.name.split(' ')[0], value: r[focus], userId: r.userId }));

  // distributions (org-wide, from breakdowns endpoint)
  const desigDonut = bd?.hoursByDesignation ?? [];
  const deptPie = bd?.hoursByDepartment ?? [];
  const statusDonut = withColors(bd?.tasksByStatus ?? [], STATUS_COLORS);
  const severityPie = withColors(bd?.issuesBySeverity ?? [], SEVERITY_COLORS);
  const projectBars = (bd?.projectProgress ?? []).map(p => ({ name: p.name, value: p.completionPercentage }));
  const bullets = (bd?.capacityVsLogged ?? []).map(c => ({ label: c.name, actual: c.actual, target: c.target }));

  const avgCompletion = bd?.projectProgress?.length
    ? Math.round(bd.projectProgress.reduce((s, p) => s + p.completionPercentage, 0) / bd.projectProgress.length)
    : 0;
  const capUsed = (() => {
    const a = (bd?.capacityVsLogged ?? []).reduce((s, c) => s + c.actual, 0);
    const tg = (bd?.capacityVsLogged ?? []).reduce((s, c) => s + c.target, 0);
    return tg > 0 ? Math.round((a / tg) * 100) : 0;
  })();

  const summary = (() => {
    if (!leaderboard.length) return '';
    const strong = leaderboard.filter(r => r.onTimeRate >= 90).length;
    const active = leaderboard.filter(r => r.activityVolume > 0).length;
    return `${active} of ${leaderboard.length} members active · ${strong} at 90%+ on-time · ${Math.round(t.hoursLogged)}h logged.`;
  })();

  const trendSpark = (key: 'completed' | 'hours' | 'activity') => (trend?.totals ?? []).map(p => p[key]);

  const gridCols: GridColumn<LeaderboardRow>[] = [
    {
      key: 'name', header: 'Member', sortable: true, accessor: r => r.name,
      render: r => (
        <div className="flex items-center gap-2">
          <Avatar user={{ firstName: r.name.split(' ')[0], lastName: r.name.split(' ')[1], id: r.userId }} size={24} />
          <span className="text-gray-800">{r.name}</span>
        </div>
      ),
    },
    { key: 'designation', header: 'Role', sortable: true, accessor: r => r.designation ?? '', render: r => <span className="text-gray-500 text-xs">{r.designation ?? '—'}</span> },
    { key: 'department', header: 'Dept', sortable: true, accessor: r => r.department ?? '', render: r => <span className="text-gray-500 text-xs">{r.department ?? '—'}</span> },
    { key: 'tasksCompleted', header: 'Completed', align: 'right', sortable: true, accessor: r => r.tasksCompleted },
    { key: 'hoursLogged', header: 'Hours', align: 'right', sortable: true, accessor: r => r.hoursLogged, render: r => `${r.hoursLogged}h` },
    {
      key: 'onTimeRate', header: 'On-time', sortable: true, accessor: r => r.onTimeRate, width: '150px',
      render: r => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.onTimeRate)}%`, backgroundColor: rateColor(r.onTimeRate) }} /></div>
          <span className="text-xs text-gray-500 w-9 text-right">{r.onTimeRate}%</span>
        </div>
      ),
    },
    { key: 'score', header: 'Score', align: 'right', sortable: true, accessor: r => r.score, render: r => <span className="font-semibold text-brand-600">{r.score}</span> },
  ];

  const exportOrg = (): ExportData => ({
    filename: 'org-performance',
    title: 'Organization Performance Report',
    subtitle: `Last ${days} days · ${ranked.length} members`,
    columns: ['Member', 'Role', 'Department', 'Tasks completed', 'Hours logged', 'On-time %', 'Activity', 'Score'],
    rows: ranked.map(r => [
      r.name, r.designation ?? '', r.department ?? '',
      r.tasksCompleted, `${r.hoursLogged}h`, `${r.onTimeRate}%`, r.activityVolume, r.score,
    ]),
    meta: [
      { label: 'Members', value: String(t.users) },
      { label: 'Tasks completed', value: String(t.tasksCompleted) },
      { label: 'Hours logged', value: `${Math.round(t.hoursLogged)}h` },
      { label: 'Avg on-time', value: `${t.avgOnTimeRate}%` },
    ],
  });

  return (
    <div className="space-y-6">
      {/* toolbar: summary + filters + freshness/rebuild */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{summary}</p>
        <FilterBar>
          <MultiSelectFilter label="Department" options={deptOptions} selected={depts} onChange={setDepts} />
          <MultiSelectFilter label="Role" options={desigOptions} selected={desigs} onChange={setDesigs} />
          <span className="text-xs text-gray-400 hidden md:inline">as of {freshAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          {can('analytics.view.organization') && (
            <button onClick={handleRebuild} disabled={rebuilding} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60">
              <RiRefreshLine size={14} className={clsx(rebuilding && 'animate-spin')} />{rebuilding ? 'Rebuilding…' : 'Rebuild snapshots'}
            </button>
          )}
          <ExportMenu getData={exportOrg} label="Export report" />
        </FilterBar>
      </div>

      {/* Org KPI strip — clickable cross-filter */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-3">
        <KpiTile label="Team Members" value={t.users} Icon={RiTeamLine} tint="bg-brand-50 text-brand-600" />
        <KpiTile label={METRIC_LABEL.tasksCompleted} value={t.tasksCompleted} Icon={RiCheckboxCircleLine} tint="bg-green-100 text-green-600" active={focus === 'tasksCompleted'} onClick={() => setFocus('tasksCompleted')} delta={t.tasksCompleted - orgPerf.previousTotals.tasksCompleted} spark={trendSpark('completed')} sparkColor={C.green} />
        <KpiTile label={METRIC_LABEL.hoursLogged} value={`${t.hoursLogged}h`} Icon={RiTimeLine} tint="bg-blue-50 text-blue-600" active={focus === 'hoursLogged'} onClick={() => setFocus('hoursLogged')} delta={round1(t.hoursLogged - orgPerf.previousTotals.hoursLogged)} spark={trendSpark('hours')} sparkColor={C.brand} />
        <KpiTile label="Active Projects" value={t.activeProjects} Icon={RiFolder3Line} tint="bg-amber-50 text-amber-600" />
        <KpiTile label={METRIC_LABEL.onTimeRate} value={`${t.avgOnTimeRate}%`} Icon={RiTrophyLine} tint="bg-teal-50 text-teal-600" hero active={focus === 'onTimeRate'} onClick={() => setFocus('onTimeRate')} />
      </div>
      <p className="text-xs text-gray-400 -mt-3">Tip: click a metric tile to re-rank the comparison charts & table{filterActive ? ' · filters applied to ranking & table' : ''}.</p>

      {/* Team trends: line totals + stacked area by department */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Team trend" subtitle="Org-wide daily totals">
          <LineCard data={trend?.totals ?? []} xKey="date" xFmt={s => s.slice(5)} series={[
            { key: 'hours', name: 'Hours', color: C.accent },
            { key: 'completed', name: 'Completed', color: C.green },
            { key: 'activity', name: 'Activity', color: C.brand },
          ]} />
        </ChartCard>
        <ChartCard title="Hours by department — trend" subtitle="Stacked daily hours">
          <AreaCard
            data={trend?.byDepartment ?? []}
            xKey="date"
            xFmt={s => s.slice(5)}
            stacked
            series={(trend?.departments ?? []).map((dep, i) => ({ key: dep, name: dep, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
          />
        </ChartCard>
      </div>

      {/* Per-user comparison: column (top-N) + horizontal bar ranking (click → drill) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={`Top members — ${METRIC_LABEL[focus]}`}>
          <ColumnCard data={topRanked} categoryKey="name" series={[{ key: 'value', name: METRIC_LABEL[focus], color: C.brand }]} />
        </ChartCard>
        <ChartCard title={`Ranking — ${METRIC_LABEL[focus]}`} subtitle="Click a bar to open that member's detail">
          <BarCard data={topRanked} categoryKey="name" valueKey="value" onBarClick={(row) => row?.userId && setSelectedUser(row.userId)} highlightKey="userId" highlightValue={selectedUser} labelWidth={72} />
        </ChartCard>
      </div>

      {/* Distributions: donut + pie ×2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ChartCard title="Hours by designation"><DonutCard data={desigDonut} centerValue={`${t.hoursLogged}h`} centerLabel="Total" /></ChartCard>
        <ChartCard title="Hours by department"><PieCard data={deptPie} /></ChartCard>
        <ChartCard title="Tasks by status"><DonutCard data={statusDonut} centerValue={t.tasksCompleted} centerLabel="Completed" /></ChartCard>
        <ChartCard title="Issues by severity"><PieCard data={severityPie} /></ChartCard>
      </div>

      {/* Gauges + capacity bullets + project progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Org rates">
          <div className="flex flex-wrap items-center justify-around gap-3">
            <GaugeCard value={t.avgOnTimeRate} label="On-time" />
            <GaugeCard value={avgCompletion} label="Avg completion" color={C.brand} />
            <GaugeCard value={capUsed} label="Capacity used" color={C.teal} />
          </div>
        </ChartCard>
        <ChartCard title="Capacity vs logged — by department" subtitle="Bar = logged · marker = capacity">
          <BulletChart items={bullets} unit="h" />
        </ChartCard>
        <ChartCard title="Project progress">
          <BarCard data={projectBars} categoryKey="name" valueKey="value" color={C.brand} labelWidth={150} />
        </ChartCard>
      </div>

      {/* Org heatmap */}
      <ChartCard title="Team contribution — last year">
        {orgHeat ? <ContributionHeatmap days={orgHeat.days} /> : <div className="text-sm text-gray-400">Loading…</div>}
      </ChartCard>

      {/* All-users data grid (sort/search/filter/export, row → drill) */}
      <DataGrid
        title="All members"
        columns={gridCols}
        rows={ranked}
        searchKeys={['name', 'designation', 'department']}
        searchPlaceholder="Search members…"
        exportName="team-performance"
        initialSort={{ key: 'score', dir: 'desc' }}
        onRowClick={(r) => setSelectedUser(r.userId)}
        emptyLabel="No members match the filters"
      />

      {/* Drill-down into a single member */}
      {selectedUser && (
        <div ref={drillRef} className="scroll-mt-4 bg-gradient-to-b from-brand-50/60 to-transparent rounded-xl border border-brand-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <button onClick={() => setSelectedUser('')} className="hover:text-brand-600">Organization</button>
              <RiArrowRightSLine size={14} />
              <span className="font-semibold text-gray-900">{leaderboard.find(r => r.userId === selectedUser)?.name}</span>
              <span className="text-xs text-gray-400">· full performance detail</span>
            </div>
            <button onClick={() => setSelectedUser('')} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              ← Back to organization
            </button>
          </div>
          <UserPerfPanel userId={selectedUser} days={days} />
        </div>
      )}
    </div>
  );
}
