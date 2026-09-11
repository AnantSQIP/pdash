'use client';

/**
 * The firm's performance — the same two KPIs, at the scale of an organisation.
 *
 * Gated on `performance.view.organization`, and the gate is real: every route this view calls
 * carries the same check on the server, so hiding the tab is a courtesy rather than the control.
 *
 * The leaderboard that used to live here is gone. It ranked people by a score built largely out
 * of logged hours and analytics events, which measure how long somebody was present and how much
 * they clicked. The table below ranks by BREACHES instead — the thing an appraisal is actually
 * about — and every column in it is one of the two KPIs.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from 'lucide-react';
import { RiArrowRightSLine } from '@remixicon/react';
import {
  api, type OrgKpis, type OrgKpiMember, type ProjectKpis, type ProjectKpiRow, type ManagerKpiRow,
  type KpiRange,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { pidLabel } from '@/lib/mock-data';
import { ChartCard, DonutCard, DataGrid, type GridColumn } from './charts';
import { KpiHero, Breaches, Stat, ExcludedNote, KpiGlossary, KPI_HELP, kpiDonuts, overrunColor } from './KpiCards';
import { UserKpiPanel } from './UserKpiPanel';
import { MultiSelectFilter, FilterBar } from './controls';
import { ExportMenu, type ExportData } from '@/components/ExportMenu';
import type { PeriodWindow } from '@/lib/periods';
import { apiRange, describeWindow } from '@/lib/periods';

function ratioText(r: number | null): string {
  return r == null ? 'n/a' : `${r.toFixed(2).replace(/\.00$/, '')}×`;
}
function pctText(v: number | null): string {
  return v == null ? 'n/a' : `${v}%`;
}
function uniq(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}
function projectLabel(p: { code: string | null; roundSeq: number | null; name: string }): string {
  return p.code ? `${pidLabel(p.code, p.roundSeq)} · ${p.name}` : p.name;
}

export function OrgKpiView({ period }: { period: PeriodWindow }) {
  const range: KpiRange = apiRange(period);
  const [selectedUser, setSelectedUser] = useState('');
  const [depts, setDepts] = useState<string[]>([]);
  const [desigs, setDesigs] = useState<string[]>([]);
  const drillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedUser) return;
    const id = setTimeout(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return () => clearTimeout(id);
  }, [selectedUser]);

  const { data, isLoading } = useQuery<OrgKpis>({
    queryKey: ['perf-org-kpis', range.from, range.to],
    queryFn: () => api.performance.orgKpis(range),
    staleTime: 30_000,
  });
  // Projects and their managers load alongside rather than inside the disclosure: opening a
  // folded panel and then waiting for it reads as the panel being broken.
  const { data: projectData } = useQuery<ProjectKpis>({
    queryKey: ['perf-project-kpis', range.from, range.to],
    queryFn: () => api.performance.projectKpis(range),
    staleTime: 30_000,
  });

  const members = data?.members ?? [];
  const deptOptions = useMemo(() => uniq(members.map(r => r.department)).map(d => ({ value: d, label: d })), [members]);
  const desigOptions = useMemo(() => uniq(members.map(r => r.designation)).map(d => ({ value: d, label: d })), [members]);
  const filtered = useMemo(() => members.filter(r =>
    (depts.length === 0 || (r.department && depts.includes(r.department))) &&
    (desigs.length === 0 || (r.designation && desigs.includes(r.designation))),
  ), [members, depts, desigs]);

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={18} className="animate-spin mr-2" />Loading organisation performance…</div>;
  }

  const { hours, deadlines } = data.totals;
  const overrun = hours.allocatedHours > 0 ? Math.round((hours.spentHours / hours.allocatedHours) * 100) / 100 : null;
  const breachTone = overrun == null ? 'neutral' : overrun >= 2 ? 'bad' : overrun > 1.1 ? 'warn' : 'good';
  const donuts = kpiDonuts({ completed: data.totals.tasksCompleted, outstanding: data.totals.outstanding, hours, deadlines });
  const overMembers = members.filter(m => m.hoursBreaches.times > 0).length;
  const projects = projectData?.projects ?? [];
  const managers = projectData?.managers ?? [];
  const shiftedProjects = projects.filter(p => p.deadlineShifts.times > 0);

  const memberCols: GridColumn<OrgKpiMember>[] = [
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
    { key: 'tasksCompleted', header: 'Finished', align: 'right', sortable: true, accessor: r => r.tasksCompleted },
    {
      key: 'overrun', header: 'Time vs allocated', align: 'right', sortable: true, accessor: r => r.overrun ?? 0,
      render: r => <span className="font-semibold tabular-nums" style={{ color: overrunColor(r.overrun) }}>{ratioText(r.overrun)}</span>,
      exportValue: r => ratioText(r.overrun),
    },
    {
      key: 'hoursBreaches', header: 'Over allocated hours', sortable: true, accessor: r => r.hoursBreaches.times,
      render: r => <Breaches count={r.hoursBreaches} thing="task" className="text-xs" />,
      exportValue: r => `${r.hoursBreaches.times} times / ${r.hoursBreaches.things} tasks`,
    },
    // Requirement 5, as a column: somebody over on ten matters and somebody over on one are two
    // different conversations, and the table has to say which before anyone opens a row.
    { key: 'projectsBreached', header: 'Projects affected', align: 'right', sortable: true, accessor: r => r.projectsBreached },
    {
      key: 'deadlineBreaches', header: 'Past deadline', sortable: true, accessor: r => r.deadlineBreaches.times,
      render: r => <Breaches count={r.deadlineBreaches} thing="task" className="text-xs" />,
      exportValue: r => `${r.deadlineBreaches.times} times / ${r.deadlineBreaches.things} tasks`,
    },
    {
      key: 'streak', header: 'Streak', align: 'right', sortable: true, accessor: r => r.streak.current,
      render: r => <span className="tabular-nums text-gray-700">{r.streak.current}<span className="text-gray-300"> / {r.streak.longest}</span></span>,
      exportValue: r => `${r.streak.current} (best ${r.streak.longest})`,
    },
  ];

  const projectCols: GridColumn<ProjectKpiRow>[] = [
    { key: 'name', header: 'Project', sortable: true, accessor: r => r.name, render: r => <span className="text-gray-800">{projectLabel(r)}</span>, exportValue: r => projectLabel(r) },
    {
      key: 'deadlineShifts', header: 'Deadline shifted', sortable: true, accessor: r => r.deadlineShifts.times,
      render: r => (r.deadlineShifts.times === 0
        ? <span className="text-gray-300 text-xs">none recorded</span>
        : <span className="text-xs tabular-nums font-semibold text-amber-700">{r.deadlineShifts.times} {r.deadlineShifts.times === 1 ? 'time' : 'times'}</span>),
      exportValue: r => String(r.deadlineShifts.times),
    },
    { key: 'tasksCompleted', header: 'Finished', align: 'right', sortable: true, accessor: r => r.tasksCompleted },
    {
      key: 'overrun', header: 'Overshoot', align: 'right', sortable: true, accessor: r => r.overrun ?? 0,
      render: r => <span className="font-semibold tabular-nums" style={{ color: overrunColor(r.overrun) }}>{ratioText(r.overrun)}</span>,
      exportValue: r => ratioText(r.overrun),
    },
    {
      key: 'importantOverrun', header: 'On important work', align: 'right', sortable: true,
      accessor: r => (r.importantHours.allocatedHours > 0 ? r.importantHours.spentHours / r.importantHours.allocatedHours : 0),
      render: r => {
        const v = r.importantHours.allocatedHours > 0 ? Math.round((r.importantHours.spentHours / r.importantHours.allocatedHours) * 100) / 100 : null;
        return <span className="font-semibold tabular-nums" style={{ color: overrunColor(v) }}>{ratioText(v)}</span>;
      },
      exportValue: r => ratioText(r.importantHours.allocatedHours > 0 ? Math.round((r.importantHours.spentHours / r.importantHours.allocatedHours) * 100) / 100 : null),
    },
    { key: 'onTimeRate', header: 'On time', align: 'right', sortable: true, accessor: r => r.deadlines.onTimeRate ?? -1, render: r => pctText(r.deadlines.onTimeRate) },
  ];

  const managerCols: GridColumn<ManagerKpiRow>[] = [
    {
      key: 'name', header: 'Project manager', sortable: true, accessor: r => r.name,
      render: r => (
        <div className="flex items-center gap-2">
          <Avatar user={{ firstName: r.name.split(' ')[0], lastName: r.name.split(' ')[1], id: r.userId }} size={24} />
          <span className="text-gray-800">{r.name}</span>
        </div>
      ),
    },
    { key: 'projects', header: 'Projects', align: 'right', sortable: true, accessor: r => r.projects },
    {
      key: 'overrun', header: 'Aggregate overshoot', align: 'right', sortable: true, accessor: r => r.overrun ?? 0,
      render: r => <span className="font-semibold tabular-nums" style={{ color: overrunColor(r.overrun) }}>{ratioText(r.overrun)}</span>,
      exportValue: r => ratioText(r.overrun),
    },
    {
      key: 'importantOverrun', header: 'On important work', align: 'right', sortable: true, accessor: r => r.importantOverrun ?? 0,
      render: r => <span className="font-semibold tabular-nums" style={{ color: overrunColor(r.importantOverrun) }}>{ratioText(r.importantOverrun)}</span>,
      exportValue: r => ratioText(r.importantOverrun),
    },
    {
      key: 'deadlineShifts', header: 'Deadlines shifted', sortable: true, accessor: r => r.deadlineShifts.times,
      render: r => <Breaches count={r.deadlineShifts} thing="project" className="text-xs" />,
      exportValue: r => `${r.deadlineShifts.times} times / ${r.deadlineShifts.things} projects`,
    },
    { key: 'onTimeRate', header: 'On time', align: 'right', sortable: true, accessor: r => r.onTimeRate ?? -1, render: r => pctText(r.onTimeRate) },
    { key: 'spentHours', header: 'Spent / allocated', align: 'right', sortable: true, accessor: r => r.spentHours, render: r => `${r.spentHours}h / ${r.allocatedHours}h`, exportValue: r => `${r.spentHours}h of ${r.allocatedHours}h` },
  ];

  const exportOrg = (): ExportData => ({
    filename: 'organisation-performance',
    title: 'Organisation Performance',
    subtitle: `${period.label} · ${describeWindow(period)} · ${filtered.length} members`,
    columns: ['Member', 'Role', 'Department', 'Finished', 'Time vs allocated', 'Over hours (times/tasks)', 'Projects affected', 'Past deadline (times/tasks)', 'On time', 'Streak'],
    rows: filtered.map(r => [
      r.name, r.designation ?? '', r.department ?? '',
      r.tasksCompleted, ratioText(r.overrun),
      `${r.hoursBreaches.times}/${r.hoursBreaches.things}`,
      r.projectsBreached,
      `${r.deadlineBreaches.times}/${r.deadlineBreaches.things}`,
      pctText(r.onTimeRate), `${r.streak.current} (best ${r.streak.longest})`,
    ]),
    meta: [
      { label: 'Period', value: `${period.label} — ${describeWindow(period)}` },
      { label: 'Time vs allocated', value: ratioText(overrun) },
      { label: 'Over allocated hours', value: `${data.totals.hoursBreaches.times} times across ${data.totals.hoursBreaches.things} tasks` },
      { label: 'Past deadline', value: `${data.totals.deadlineBreaches.times} times across ${data.totals.deadlineBreaches.things} tasks` },
      { label: 'Tasks completed', value: String(data.totals.tasksCompleted) },
    ],
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">
          {data.totals.members} members · {data.totals.tasksCompleted} finished · {overMembers} over their allocated hours somewhere.
        </p>
        <FilterBar>
          <MultiSelectFilter label="Department" options={deptOptions} selected={depts} onChange={setDepts} />
          <MultiSelectFilter label="Role" options={desigOptions} selected={desigs} onChange={setDesigs} />
          <ExportMenu getData={exportOrg} label="Export report" />
        </FilterBar>
      </div>

      {/* Layer 1 — the two KPIs for the firm. */}
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
            <Stat label="over the limit" value={<Breaches count={data.totals.hoursBreaches} thing="task" />} />
            <Stat label="members affected" value={overMembers} />
            <Stat label="red flags (2×+)" value={hours.redFlag} tone={hours.redFlag ? 'bad' : undefined} />
            <Stat label="hours beyond allocation" value={`${hours.overHours}h`} tone={hours.overHours > 0 ? 'bad' : undefined} />
          </div>
          <div className="mt-3"><ExcludedNote unmeasured={hours.unmeasured} total={data.totals.tasksCompleted} /></div>
        </KpiHero>

        <KpiHero
          eyebrow="KPI 2 · On time and on budget"
          value={pctText(deadlines.onTimeRate)}
          unit={deadlines.onTimeRate == null ? undefined : 'delivered on time'}
          tone={deadlines.onTimeRate == null ? 'neutral' : deadlines.onTimeRate >= 85 ? 'good' : deadlines.onTimeRate >= 60 ? 'warn' : 'bad'}
          info={KPI_HELP.streak}
          caption={deadlines.dated === 0
            ? <>Nothing with a deadline was finished in this period, so there is no punctuality to report.</>
            : <>{deadlines.onTime} of {deadlines.dated} dated deliveries landed on or before their date. The individual streaks are in the table below.</>}
        >
          {/* The two KPIs beside each other, because they are meant to correlate — a firm that is
              punctual and consistently over budget is buying its punctuality with hours. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="within allocated hours" value={pctText(hours.withinRate)} tone={hours.withinRate == null ? 'muted' : undefined} />
            <Stat label="past the deadline" value={<Breaches count={data.totals.deadlineBreaches} thing="task" />} />
            <Stat label="days late in total" value={deadlines.lateDays} tone={deadlines.lateDays > 0 ? 'bad' : undefined} />
            <Stat label="previous period on time" value={pctText(data.previous.onTimeRate)} tone="muted" />
          </div>
        </KpiHero>
      </div>

      {/* Layer 2 — the same two KPIs drawn. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Completed out of total" subtitle="Finished in the period vs still open and due by its end">
          <DonutCard data={donuts.completed} centerValue={data.totals.tasksCompleted} centerLabel="Completed" />
        </ChartCard>
        <ChartCard title="Completed on time" subtitle="Finished on or before the deadline date">
          <DonutCard data={donuts.onTime} centerValue={pctText(deadlines.onTimeRate)} centerLabel="On time" />
        </ChartCard>
        <ChartCard title="Completed within allocated hours" subtitle="Finished inside the hours it was given">
          <DonutCard data={donuts.withinHours} centerValue={pctText(hours.withinRate)} centerLabel="Within" />
        </ChartCard>
      </div>

      <DataGrid
        title="Members — worst breaches first"
        columns={memberCols}
        rows={filtered}
        searchKeys={['name', 'designation', 'department']}
        searchPlaceholder="Search members…"
        exportName="member-kpis"
        initialSort={{ key: 'hoursBreaches', dir: 'desc' }}
        onRowClick={r => setSelectedUser(r.userId)}
        emptyLabel="No members match the filters"
      />

      {/* Layer 3 — the project view and whose performance it is. Requirements 18–20. */}
      <details className="group" open={shiftedProjects.length > 0}>
        <summary className="cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-800 py-2">
          Projects and project managers
          <span className="font-normal text-gray-400"> · {projects.length} {projects.length === 1 ? 'project' : 'projects'}, {shiftedProjects.length} with a recorded deadline shift</span>
        </summary>
        <div className="mt-2 space-y-4">
          <DataGrid
            title="Project managers — aggregate overshoot against aggregate delivery"
            columns={managerCols}
            rows={managers}
            searchKeys={['name']}
            searchPlaceholder="Search managers…"
            exportName="project-manager-performance"
            initialSort={{ key: 'overrun', dir: 'desc' }}
            emptyLabel="No project has a manager on it in this period"
            rightSlot={<span title={KPI_HELP.pmPerformance} className="text-[11px] text-gray-400 cursor-help">what this measures</span>}
          />
          <DataGrid
            title="Projects"
            columns={projectCols}
            rows={projects}
            searchKeys={['name', 'code']}
            searchPlaceholder="Search projects…"
            exportName="project-performance"
            initialSort={{ key: 'overrun', dir: 'desc' }}
            emptyLabel="Nothing was finished and no deadline moved in this period"
            rightSlot={<span title={KPI_HELP.deadlineShifts} className="text-[11px] text-gray-400 cursor-help">about deadline shifts</span>}
          />
        </div>
      </details>

      <KpiGlossary />

      {selectedUser && (
        <div ref={drillRef} className="scroll-mt-4 bg-gradient-to-b from-brand-50/60 to-transparent rounded-xl border border-brand-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <button onClick={() => setSelectedUser('')} className="hover:text-brand-600">Organisation</button>
              <RiArrowRightSLine size={14} />
              <span className="font-semibold text-gray-900">{members.find(r => r.userId === selectedUser)?.name}</span>
            </div>
            <button onClick={() => setSelectedUser('')} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              ← Back to organisation
            </button>
          </div>
          <UserKpiPanel userId={selectedUser} period={period} />
        </div>
      )}
    </div>
  );
}

