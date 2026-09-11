'use client';

/**
 * One person's performance, which is now exactly two KPIs.
 *
 * What used to be here — a backlog count, an activity volume, an issue-severity pie, a radar of
 * five rates, a contribution heatmap and a full copy of the person's task list — is gone. The
 * task list in particular: ongoing and breaching work already lives in My Tasks, and repeating it
 * here is what made the two modules impossible to tell apart.
 *
 * The page is LAYERED. Two hero cards carry the two KPIs and nothing competes with them; the
 * charts under them are those same two KPIs drawn; everything else is behind a disclosure. That
 * ordering is the answer to "there is too much information on the page" — not fewer facts, one
 * obvious place for the eye to land first.
 */

import { useQuery } from '@tanstack/react-query';
import { Loader } from 'lucide-react';
import { api, type UserKpis, type ProjectBreachRow, type KpiRange } from '@/lib/api';
import { pidLabel } from '@/lib/mock-data';
import { ChartCard, DonutCard, DataGrid, type GridColumn } from './charts';
import { KpiHero, Breaches, Stat, ExcludedNote, KpiGlossary, KPI_HELP, kpiDonuts, streakCaption, overrunColor } from './KpiCards';
import { ExportMenu, type ExportData } from '@/components/ExportMenu';
import type { PeriodWindow } from '@/lib/periods';
import { apiRange, describeWindow } from '@/lib/periods';

function ratioText(r: number | null): string {
  return r == null ? 'n/a' : `${r.toFixed(2).replace(/\.00$/, '')}×`;
}
function pctText(v: number | null): string {
  return v == null ? 'n/a' : `${v}%`;
}
/** Two rounds of one PID share a code, so the round has to be on the label or rows are ambiguous. */
function projectLabel(r: ProjectBreachRow): string {
  return r.projectCode ? `${pidLabel(r.projectCode, r.roundSeq)} · ${r.projectName}` : r.projectName;
}

export function UserKpiPanel({ userId, period, self = false }: {
  userId: string;
  period: PeriodWindow;
  /** True when this is the signed-in person's own tab — it only changes the wording. */
  self?: boolean;
}) {
  const range: KpiRange = apiRange(period);
  const { data, isLoading, error } = useQuery<UserKpis>({
    queryKey: ['perf-kpis', userId, range.from, range.to, self],
    queryFn: () => (self ? api.performance.kpis(range) : api.performance.userKpis(userId, range)),
    enabled: !!userId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={18} className="animate-spin mr-2" />Loading performance…</div>;
  }
  if (error || !data) {
    return <p className="py-16 text-center text-sm text-gray-400">This performance report could not be loaded.</p>;
  }

  const { hours, deadlines, streak } = data;
  const overrun = hours.allocatedHours > 0 ? Math.round((hours.spentHours / hours.allocatedHours) * 100) / 100 : null;
  const breachTone = overrun == null ? 'neutral' : overrun >= 2 ? 'bad' : overrun > 1.1 ? 'warn' : 'good';
  const streakTone = streak.judged === 0 ? 'neutral' : streak.current >= 5 ? 'good' : streak.current === 0 ? 'bad' : 'warn';
  const donuts = kpiDonuts({ completed: data.tasksCompleted, outstanding: data.outstanding, hours, deadlines });
  const breachedProjects = data.byProject.filter(p => p.hoursBreaches.times > 0 || p.deadlineBreaches.times > 0);

  const projectCols: GridColumn<ProjectBreachRow>[] = [
    { key: 'projectName', header: 'Project', sortable: true, accessor: r => r.projectName, render: r => <span className="text-gray-800">{projectLabel(r)}</span>, exportValue: r => projectLabel(r) },
    { key: 'deliveries', header: 'Finished', align: 'right', sortable: true, accessor: r => r.deliveries },
    {
      key: 'hoursBreaches', header: 'Over allocated hours', sortable: true, accessor: r => r.hoursBreaches.times,
      render: r => <Breaches count={r.hoursBreaches} thing="task" className="text-xs" />,
      exportValue: r => `${r.hoursBreaches.times} times / ${r.hoursBreaches.things} tasks`,
    },
    {
      key: 'deadlineBreaches', header: 'Past deadline', sortable: true, accessor: r => r.deadlineBreaches.times,
      render: r => <Breaches count={r.deadlineBreaches} thing="task" className="text-xs" />,
      exportValue: r => `${r.deadlineBreaches.times} times / ${r.deadlineBreaches.things} tasks`,
    },
    { key: 'allocatedHours', header: 'Allocated', align: 'right', sortable: true, accessor: r => r.allocatedHours, render: r => `${r.allocatedHours}h` },
    { key: 'spentHours', header: 'Spent', align: 'right', sortable: true, accessor: r => r.spentHours, render: r => `${r.spentHours}h` },
    {
      key: 'overrun', header: 'Over-run', align: 'right', sortable: true, accessor: r => r.overrun ?? 0,
      render: r => <span className="font-semibold tabular-nums" style={{ color: overrunColor(r.overrun) }}>{ratioText(r.overrun)}</span>,
      exportValue: r => ratioText(r.overrun),
    },
  ];

  // CSV and PDF both come from here, exactly as they did before — the menu is unchanged, only
  // the rows it is handed are now the two KPIs rather than a dozen loosely related figures.
  const exportReport = (): ExportData => ({
    filename: `performance-${(data.name || 'user').replace(/\s+/g, '-').toLowerCase()}`,
    title: `Performance — ${data.name}`,
    subtitle: `${period.label} · ${describeWindow(period)}`,
    columns: ['Metric', 'Value'],
    rows: [
      ['KPI 1 — time spent vs allocated', ratioText(overrun)],
      ['Times over allocated hours', `${data.hoursBreaches.times} times across ${data.hoursBreaches.things} tasks`],
      ['Projects with an over-run', String(breachedProjects.length)],
      ['Red flags (2× or more)', String(hours.redFlag)],
      ['Allocated hours', `${hours.allocatedHours}h`],
      ['Hours spent', `${hours.spentHours}h`],
      ['Hours beyond allocation', `${hours.overHours}h`],
      ['Deliveries with no allocation (excluded)', String(hours.unmeasured)],
      ['KPI 2 — on-time & on-budget streak', `${streak.current} (best ${streak.longest})`],
      ['Times past the deadline', `${data.deadlineBreaches.times} times across ${data.deadlineBreaches.things} tasks`],
      ['Completed on time', `${deadlines.onTime} of ${deadlines.dated} dated (${pctText(deadlines.onTimeRate)})`],
      ['Completed within allocated hours', `${hours.within} of ${hours.measured} measurable (${pctText(hours.withinRate)})`],
      ['Tasks completed', String(data.tasksCompleted)],
      ['Still open and due by the end of the period', String(data.outstanding)],
      ...breachedProjects.map(p => [
        `Breaches · ${projectLabel(p)}`,
        `${p.hoursBreaches.times} over hours, ${p.deadlineBreaches.times} past deadline, ${ratioText(p.overrun)}`,
      ] as [string, string]),
    ],
    meta: [
      { label: 'Member', value: data.name },
      { label: 'Period', value: `${period.label} — ${describeWindow(period)}` },
    ],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-700">
          {data.name}
          <span className="font-normal text-gray-400"> · {describeWindow(period)}</span>
        </p>
        <ExportMenu getData={exportReport} label="Export report" />
      </div>

      {/* Layer 1 — the two KPIs, and nothing beside them. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KpiHero
          eyebrow="KPI 1 · Time spent vs allocated"
          value={ratioText(overrun)}
          unit={overrun == null ? undefined : 'of the time allowed'}
          tone={breachTone}
          info={KPI_HELP.overrun}
          caption={hours.measured === 0
            ? <>Nothing finished in this period had allocated hours, so there is nothing to measure against yet.</>
            : <>{hours.spentHours}h spent against {hours.allocatedHours}h allocated across {hours.measured} {hours.measured === 1 ? 'delivery' : 'deliveries'}.</>}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="over the limit" value={<Breaches count={data.hoursBreaches} thing="task" />} />
            <Stat label="projects affected" value={breachedProjects.length} />
            <Stat label="red flags (2×+)" value={hours.redFlag} tone={hours.redFlag ? 'bad' : undefined} />
            <Stat label="hours beyond allocation" value={`${hours.overHours}h`} tone={hours.overHours > 0 ? 'bad' : undefined} />
          </div>
          <div className="mt-3">
            <ExcludedNote unmeasured={hours.unmeasured} total={data.tasksCompleted} />
          </div>
        </KpiHero>

        <KpiHero
          eyebrow="KPI 2 · On-time & on-budget streak"
          value={streak.current}
          unit={streak.judged === 0 ? undefined : 'in a row'}
          tone={streakTone}
          info={KPI_HELP.streak}
          caption={streakCaption(streak)}
        >
          {/* The two KPIs set beside each other, because they are meant to correlate: a good
              on-time rate next to a poor within-hours rate is the case worth talking about. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="delivered on time" value={pctText(deadlines.onTimeRate)} tone={deadlines.onTimeRate == null ? 'muted' : undefined} />
            <Stat label="within allocated hours" value={pctText(hours.withinRate)} tone={hours.withinRate == null ? 'muted' : undefined} />
            <Stat label="past the deadline" value={<Breaches count={data.deadlineBreaches} thing="task" />} />
            <Stat label="best run this period" value={streak.longest} />
          </div>
          {streak.skipped > 0 && (
            <p className="mt-3 text-[11.5px] text-gray-400 leading-relaxed">
              {streak.skipped} {streak.skipped === 1 ? 'delivery had' : 'deliveries had'} neither a deadline nor an allocation,
              so the streak passed over {streak.skipped === 1 ? 'it' : 'them'} rather than counting {streak.skipped === 1 ? 'it' : 'them'} good.
            </p>
          )}
        </KpiHero>
      </div>

      {/* Layer 2 — the same two KPIs drawn, plus what was finished out of what was due. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Completed out of total" subtitle="Finished in the period vs still open and due by its end">
          <DonutCard data={donuts.completed} centerValue={data.tasksCompleted} centerLabel="Completed" />
        </ChartCard>
        {/* These two are deliberately labelled in full. "On time" and "within deadline" were
            being used interchangeably in conversation and they are different questions — one is
            about the DATE, one is about the HOURS, and a task can pass either while failing the
            other. The labels say which is which so nobody has to remember. */}
        <ChartCard title="Completed on time" subtitle="Finished on or before the deadline date">
          <DonutCard data={donuts.onTime} centerValue={pctText(deadlines.onTimeRate)} centerLabel="On time" />
        </ChartCard>
        <ChartCard title="Completed within allocated hours" subtitle="Finished inside the hours it was given">
          <DonutCard data={donuts.withinHours} centerValue={pctText(hours.withinRate)} centerLabel="Within" />
        </ChartCard>
      </div>

      {/* Layer 3 — the detail, folded away. Requirements 5 and 11: which projects, how often. */}
      <details className="group" open={breachedProjects.length > 0 && breachedProjects.length <= 3}>
        <summary className="cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-800 py-2">
          Where the breaches happened
          <span className="font-normal text-gray-400"> · {data.byProject.length} {data.byProject.length === 1 ? 'project' : 'projects'} worked on, {breachedProjects.length} with a breach</span>
        </summary>
        <div className="mt-2">
          <DataGrid
            columns={projectCols}
            rows={data.byProject}
            initialSort={{ key: 'hoursBreaches', dir: 'desc' }}
            exportName={`breaches-by-project-${period.key}`}
            emptyLabel="Nothing was finished in this period"
          />
        </div>
      </details>

      <KpiGlossary />
    </div>
  );
}
