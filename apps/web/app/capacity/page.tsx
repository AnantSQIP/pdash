'use client';

// Team Capacity — "who is busy, who is free, and when".
//
// Every person × every day across ALL projects: committed hours vs capacity, with
// weekends, company holidays and approved leave excluded properly. The point of the
// board is a single decision — "who can take more work?" — so the most available
// people sort to the top, free windows are the loudest thing on the screen, and every
// free run is one click away from assigning a task into exactly that window.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Users, Loader, CalendarRange, Sparkles, AlertTriangle, Gauge,
  ArrowRight, Zap, X, Plus, Search, Clock, CalendarPlus, Plane, Flag, Building2,
} from 'lucide-react';

/** Human label for an office/branch grouping key. */
const officeLabel = (o: string) =>
  o === 'GURGAON' ? 'Gurgaon' : o === 'JAIPUR' ? 'Jaipur' : o;
import { api, type TeamCapacity, type CapacityRow, type DayState, type ApiProject, type CoverageRisks, type TeamHistory, type HistoryRow } from '@/lib/api';

type RangeKey = 'next-7' | 'next-14' | 'next-30' | 'past-30';
const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'next-7',  label: 'Next 7 days' },
  { value: 'next-14', label: 'Next 14 days' },
  { value: 'next-30', label: 'Next 30 days' },
  { value: 'past-30', label: 'Past 30 days' },
];
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { PersonPanel, ExtendMenu } from '@/components/capacity/PersonPanel';
import { Avatar } from '@/components/Avatar';
import { AddTaskModal } from '@/components/tasks/AddTaskModal';
import { formatDate } from '@/lib/date';
import { STATE_STYLE, DOW, DayCell, dayOfWeek, dayNum, isToday } from '@/components/capacity/grid';

export default function CapacityPage() {
  const { org } = useOrg();
  const { can, loading: permLoading } = usePermissions();
  const qc = useQueryClient();
  const allowed = can('capacity.view');

  const [range, setRange] = useState<RangeKey>('next-14');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [selected, setSelected] = useState<CapacityRow | null>(null);
  const [assignTo, setAssignTo] = useState<{ row: CapacityRow; start?: string; due?: string } | null>(null);

  const isPast = range === 'past-30';
  const days = range === 'next-7' ? 7 : range === 'next-30' ? 30 : 14; // forward horizon
  const histDays = 30;

  // Forward projected-capacity board (default). Disabled while viewing the past.
  const { data, isLoading: fwdLoading } = useQuery<TeamCapacity>({
    queryKey: ['capacity', org?.id, days],
    queryFn: () => api.capacity.team(days),
    enabled: allowed && !!org?.id && !isPast,
    staleTime: 60_000,
  });

  // Retrospective actual-attendance board (the "Past 30 days" option).
  const { data: history, isLoading: histLoading } = useQuery<TeamHistory>({
    queryKey: ['capacity-history', org?.id, histDays],
    queryFn: () => api.capacity.history(histDays),
    enabled: allowed && !!org?.id && isPast,
    staleTime: 60_000,
  });

  // Projects the manager can assign INTO (approved/active work).
  const { data: projects = [] } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: allowed && !!org?.id,
    staleTime: 60_000,
  });

  // Emergency-leave coverage: short-notice absences over HIGH/CRITICAL work.
  const { data: coverage } = useQuery<CoverageRisks>({
    queryKey: ['coverage-risks', org?.id, days],
    queryFn: () => api.capacity.coverageRisks(days),
    enabled: allowed && !!org?.id && !isPast,
    staleTime: 60_000,
  });

  const isLoading = isPast ? histLoading : fwdLoading;
  const fwdRows = data?.rows ?? [];
  const histRows = history?.rows ?? [];
  const allRows: { name: string; department?: string }[] = isPast ? histRows : fwdRows;

  const departments = useMemo(
    () => [...new Set(allRows.map(r => r.department).filter(Boolean))].sort() as string[],
    [allRows],
  );
  const matches = (r: { name: string; department?: string }) =>
    (!search || r.name.toLowerCase().includes(search.toLowerCase())) && (!dept || r.department === dept);
  const visibleFwd = useMemo(() => fwdRows.filter(matches), [fwdRows, search, dept]);
  const visibleHist = useMemo(() => histRows.filter(matches), [histRows, search, dept]);

  // Group the forward board by office (Gurgaon, Jaipur, then anything else), A–Z within each.
  const groupedFwd = useMemo(() => {
    const ORDER = ['GURGAON', 'JAIPUR'];
    const byOffice = new Map<string, CapacityRow[]>();
    for (const r of visibleFwd) {
      const key = r.office || 'Unassigned';
      if (!byOffice.has(key)) byOffice.set(key, []);
      byOffice.get(key)!.push(r);
    }
    return [...byOffice.keys()]
      .sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.localeCompare(b);
      })
      .map(office => ({
        office,
        rows: byOffice.get(office)!.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [visibleFwd]);

  // Forward headline numbers a manager acts on.
  const stats = useMemo(() => {
    const freeNow = fwdRows.filter(r => r.availableNow).length;
    const freeingSoon = fwdRows.filter(r => !r.availableNow && r.nextFreeDate).length;
    const spareHours = Math.round(fwdRows.reduce((s, r) => s + r.freeHours, 0));
    const overdue = fwdRows.reduce((s, r) => s + r.overdueCount, 0);
    return { freeNow, freeingSoon, spareHours, overdue };
  }, [fwdRows]);

  // Retrospective headline numbers.
  const histStats = useMemo(() => {
    const compoff = histRows.reduce((s, r) => s + r.compoff, 0);
    const present = histRows.reduce((s, r) => s + r.present, 0);
    const onLeave = histRows.reduce((s, r) => s + r.onLeave, 0);
    const absent = histRows.reduce((s, r) => s + r.absent, 0);
    return { compoff, present, onLeave, absent };
  }, [histRows]);

  // Who's on approved leave, and which company holidays fall in this window — synced from
  // the same leave/holiday data the Calendar uses, surfaced up front so it's unmissable
  // when planning. (Forward view only.)
  const leaveHoliday = useMemo(() => {
    const people: { name: string; from: string; to: string }[] = [];
    for (const r of fwdRows) {
      const ds = r.days.filter(d => d.state === 'LEAVE').map(d => d.date).sort();
      if (ds.length) people.push({ name: r.name, from: ds[0], to: ds[ds.length - 1] });
    }
    const holidays: { date: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const d of fwdRows[0]?.days ?? []) {
      if (d.state === 'HOLIDAY' && !seen.has(d.date)) { seen.add(d.date); holidays.push({ date: d.date, name: d.note ?? 'Holiday' }); }
    }
    return { people, holidays };
  }, [fwdRows]);

  if (permLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Users size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">You need the <code>capacity.view</code> permission to see team availability.</p>
      </div>
    );
  }

  const header = (isPast ? histRows[0]?.days : fwdRows[0]?.days) ?? [];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Gauge size={20} className="text-brand-600" /> Team Capacity
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Who is busy, who is free, and when — across every project. Click any free day to assign work into it.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-40"
              />
            </div>
            {departments.length > 0 && (
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                <option value="">All departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <select
              value={range}
              onChange={e => setRange(e.target.value as RangeKey)}
              title="Time range"
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white font-medium text-gray-700"
            >
              {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* KPI strip — the four things worth acting on */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {isPast ? (
            <>
              <Kpi label="Comp-off candidates" value={histStats.compoff} Icon={CalendarPlus} tint="bg-indigo-100 text-indigo-700" hint="worked on a non-working day" />
              <Kpi label="Days present" value={histStats.present} Icon={Sparkles} tint="bg-emerald-100 text-emerald-700" hint="across the team, past 30 days" />
              <Kpi label="Days on leave" value={histStats.onLeave} Icon={CalendarRange} tint="bg-purple-100 text-purple-700" hint="approved leave taken" />
              <Kpi label="Days absent" value={histStats.absent} Icon={AlertTriangle} tint="bg-red-100 text-red-700" hint="working days with no attendance" />
            </>
          ) : (
            <>
              <Kpi label="Available now" value={stats.freeNow} Icon={Sparkles} tint="bg-emerald-100 text-emerald-700" hint="free on the next working day" />
              <Kpi label="Freeing up soon" value={stats.freeingSoon} Icon={CalendarRange} tint="bg-sky-100 text-sky-700" hint="within this window" />
              <Kpi label="Spare capacity" value={`${stats.spareHours}h`} Icon={Zap} tint="bg-amber-100 text-amber-700" hint="unused hours in window" />
              <Kpi label="Overdue tasks" value={stats.overdue} Icon={Clock} tint="bg-purple-100 text-purple-700" hint="past deadline" />
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-4 sm:p-6 gap-4">
        {!isPast && (leaveHoliday.people.length > 0 || leaveHoliday.holidays.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-start gap-x-6 gap-y-2">
            {leaveHoliday.people.length > 0 && (
              <div className="flex items-start gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full shrink-0 mt-0.5"><Plane size={12} /> On leave</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                  {leaveHoliday.people.map(p => (
                    <span key={p.name}><span className="font-medium text-gray-800">{p.name}</span> · {formatDate(p.from)}{p.to !== p.from ? `–${formatDate(p.to)}` : ''}</span>
                  ))}
                </div>
              </div>
            )}
            {leaveHoliday.holidays.length > 0 && (
              <div className="flex items-start gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full shrink-0 mt-0.5"><Flag size={12} /> Holidays</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                  {leaveHoliday.holidays.map(h => (
                    <span key={h.date}><span className="font-medium text-gray-800">{h.name}</span> · {formatDate(h.date)}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {coverage && coverage.risks.length > 0 && (
          <CoveragePanel data={coverage} />
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" /> Building the availability map…
          </div>
        ) : allRows.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No active team members.</div>
        ) : (
          // The board is a fixed date-header ABOVE an independently-scrolling rows region:
          // the dates never move and rows scroll strictly BELOW them (never behind).
          <div className="bg-white rounded-xl border border-gray-200 flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Day header — pinned (not sticky): it sits outside the scroll area entirely.
                scrollbar-gutter reserves the same space the rows' scrollbar takes, so the
                date columns stay aligned with the cells below. */}
            <div className="flex items-end gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0 rounded-t-xl overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className="w-56 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">Member</div>
              <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))` }}>
                {header.map(d => {
                  const holiday = d.state === 'HOLIDAY';
                  const weekend = d.state === 'WEEKEND';
                  return (
                    <div key={d.date}
                      title={holiday ? `Holiday${d.note ? ` — ${d.note}` : ''}` : weekend ? 'Weekend' : formatDate(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                      className={clsx('text-center rounded-md py-0.5',
                        holiday && 'bg-amber-100',
                        weekend && 'bg-gray-100',
                        isToday(d.date) && 'ring-1 ring-brand-400')}>
                      <div className={clsx('text-[9px] uppercase', holiday ? 'text-amber-600' : 'text-gray-400')}>{DOW[dayOfWeek(d.date)]}</div>
                      <div className={clsx('text-[11px] font-medium', isToday(d.date) ? 'text-brand-600 font-bold' : holiday ? 'text-amber-700' : 'text-gray-600')}>{dayNum(d.date)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="w-40 shrink-0 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{isPast ? 'Summary' : 'Availability'}</div>
            </div>

            {/* Rows — the ONLY scrolling region; the header above and legend below stay put. */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-50" style={{ scrollbarGutter: 'stable' }}>
              {isPast ? (
                visibleHist.length === 0
                  ? <p className="px-4 py-10 text-center text-sm text-gray-400">No one matches those filters.</p>
                  : visibleHist.map(row => <HistoryRowView key={row.userId} row={row} />)
              ) : (
                visibleFwd.length === 0
                  ? <p className="px-4 py-10 text-center text-sm text-gray-400">No one matches those filters.</p>
                  : groupedFwd.map(g => (
                    <div key={g.office}>
                      <div className="sticky top-0 z-[5] flex items-center gap-1.5 px-4 py-1.5 bg-gray-100/95 backdrop-blur border-y border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <Building2 size={12} className="text-gray-400" />
                        {officeLabel(g.office)}
                        <span className="normal-case font-normal text-gray-400">· {g.rows.length}</span>
                      </div>
                      {g.rows.map(row => (
                    <div key={row.userId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/70 transition-colors group">
                      <button onClick={() => setSelected(row)} className="w-56 shrink-0 flex items-center gap-2.5 text-left">
                        <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ')[1], profilePhoto: row.profilePhoto }} size={30} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-brand-600 transition-colors">{row.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {row.designation ?? '—'}
                            {row.overdueCount > 0 && <span className="ml-1 text-red-500 font-medium">· {row.overdueCount} overdue</span>}
                          </p>
                        </div>
                      </button>
                      <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${row.days.length}, minmax(0, 1fr))` }}>
                        {row.days.map(d => (
                          <DayCell key={d.date} day={d} onClick={() => setAssignTo({ row, start: d.date, due: d.date })} />
                        ))}
                      </div>
                      <div className="w-40 shrink-0 flex items-center justify-end gap-2">
                        <div className="text-right">
                          {row.availableNow ? (
                            <p className="text-xs font-semibold text-emerald-600">Available now</p>
                          ) : row.nextFreeDate ? (
                            <p className="text-xs font-medium text-gray-600">Free {formatDate(row.nextFreeDate)}</p>
                          ) : (
                            <p className="text-xs font-medium text-red-500">Fully booked</p>
                          )}
                          <p className="text-[10px] text-gray-400">
                            {row.freeHours}h free · {row.utilization}% used
                            {row.freeRunDays > 1 && <span className="text-emerald-600 font-medium"> · {row.freeRunDays}d window</span>}
                          </p>
                        </div>
                        <button
                          onClick={() => setAssignTo({ row, start: row.nextFreeDate ?? undefined, due: row.nextFreeDate ?? undefined })}
                          title={`Assign a task to ${row.name}`}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-brand-600 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                      ))}
                    </div>
                  ))
              )}
            </div>

            {/* Legend */}
            <div className="shrink-0 flex items-center gap-4 flex-wrap px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              {((isPast
                ? ['PRESENT', 'COMPOFF', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'ABSENT']
                : ['FREE', 'LIGHT', 'BUSY', 'LEAVE', 'LEAVE_PENDING', 'HOLIDAY', 'WEEKEND']) as DayState[]).map(s => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={clsx('w-2.5 h-2.5 rounded-sm', STATE_STYLE[s].dot)} />{STATE_STYLE[s].label}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 ml-auto">
                {isPast ? 'Actual attendance over the past 30 days' : `Capacity ${data?.capacityPerDay}h/day · leave & holidays excluded`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Person drill-down */}
      {selected && (
        <PersonPanel
          row={selected}
          onClose={() => setSelected(null)}
          onAssign={() => { setAssignTo({ row: selected, start: selected.nextFreeDate ?? undefined, due: selected.nextFreeDate ?? undefined }); setSelected(null); }}
        />
      )}

      {/* Assign into their free window */}
      {assignTo && (
        <AssignTaskFlow
          row={assignTo.row}
          projects={projects}
          startDate={assignTo.start}
          dueDate={assignTo.due}
          onClose={() => setAssignTo(null)}
          onDone={() => {
            setAssignTo(null);
            qc.invalidateQueries({ queryKey: ['capacity'] });
            qc.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────────
function Kpi({ label, value, Icon, tint, hint }: {
  label: string; value: string | number; Icon: typeof Users; tint: string; hint: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center shrink-0', tint)}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-[11px] text-gray-500 mt-1 truncate" title={hint}>{label}</p>
      </div>
    </div>
  );
}


// Emergency-leave coverage: who is on short-notice leave over HIGH/CRITICAL work, with
// one-click reassign to a free teammate or a deadline extension to buy time.
function CoveragePanel({ data }: { data: CoverageRisks }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canAssign = can('task.assign');
  const canTask = can('task.update');
  const canProject = can('project.update');
  const [busy, setBusy] = useState('');

  function refresh() {
    qc.invalidateQueries({ queryKey: ['coverage-risks'] });
    qc.invalidateQueries({ queryKey: ['capacity'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  }

  async function reassign(taskId: string, fromUserId: string, toUserId: string) {
    if (!toUserId) return;
    setBusy(taskId);
    try {
      // Swap only the on-leave person for the chosen teammate — keep any co-assignees.
      const full = await api.tasks.get(taskId);
      const current = (full.assignees ?? []).map(a => a.userId);
      const next = [...new Set([...current.filter(id => id !== fromUserId), toUserId])];
      await api.tasks.setAssignees(taskId, next);
      refresh();
      toast('Task reassigned', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not reassign the task', 'error');
    } finally { setBusy(''); }
  }

  async function extend(scope: 'task' | 'project', task: { id: string; projectId?: string }, iso: string) {
    setBusy(task.id);
    try {
      if (scope === 'project') {
        if (!task.projectId) throw new Error('This task has no project.');
        await api.projects.update(task.projectId, { dueDate: iso });
      } else {
        await api.tasks.update(task.id, { dueDate: iso });
      }
      refresh();
      toast(`Deadline extended to ${formatDate(iso)}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not extend the deadline', 'error');
    } finally { setBusy(''); }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2 flex-wrap">
        <AlertTriangle size={16} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">Coverage at risk</h3>
        <span className="text-[11px] bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-medium">{data.risks.length}</span>
        <span className="text-xs text-amber-600/80 ml-1">short-notice leave over high-priority work — reassign or extend</span>
      </div>
      <div className="divide-y divide-gray-50">
        {data.risks.map(risk => (
          <div key={risk.leaveId} className="px-5 py-3">
            <div className="flex items-center gap-2.5 mb-2">
              <Avatar user={{ id: risk.userId, firstName: risk.name.split(' ')[0], lastName: risk.name.split(' ')[1], profilePhoto: risk.profilePhoto }} size={30} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{risk.name}</p>
                <p className="text-[11px] text-gray-400">
                  {risk.leaveType} leave · {formatDate(risk.startDate)}–{formatDate(risk.endDate)} · {risk.noticeDays}d notice
                </p>
              </div>
            </div>
            <div className="space-y-1.5 sm:pl-10">
              {risk.tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{t.title}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {t.projectId ? <Link href={`/projects/${t.projectId}`} className="hover:text-brand-600">{t.project}</Link> : '—'}
                      {' · '}{t.projectPriority}{' · '}
                      <span className={t.overdue ? 'text-red-500 font-medium' : ''}>{t.overdue ? 'overdue ' : 'due '}{formatDate(t.dueDate)}</span>
                      {' · '}{t.remainingHours}h left
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canTask && (
                      <ExtendMenu task={t} canProject={canProject} disabled={busy === t.id}
                        onExtend={(scope, iso) => extend(scope, t, iso)} />
                    )}
                    {canAssign && (
                      <select
                        disabled={busy === t.id}
                        value=""
                        onChange={e => reassign(t.id, risk.userId, e.target.value)}
                        className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 max-w-[140px] text-gray-600 disabled:opacity-40"
                        title="Reassign this task to a free teammate"
                      >
                        <option value="">Reassign to…</option>
                        {data.suggestions.map(s => (
                          <option key={s.userId} value={s.userId}>{s.name.split(' ')[0]} · {s.freeHours}h free</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// One person's row in the retrospective (past-30-days) view — read-only actual attendance,
// with the comp-off count surfaced so managers can see who worked on non-working days.
function HistoryRowView({ row }: { row: HistoryRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/70 transition-colors">
      <div className="w-56 shrink-0 flex items-center gap-2.5">
        <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ')[1], profilePhoto: row.profilePhoto }} size={30} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{row.name}</p>
          <p className="text-[11px] text-gray-400 truncate">{row.designation ?? '—'}</p>
        </div>
      </div>
      <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${row.days.length}, minmax(0, 1fr))` }}>
        {row.days.map(d => <DayCell key={d.date} day={d} />)}
      </div>
      <div className="w-40 shrink-0 text-right">
        <p className="text-xs font-medium text-gray-700">{row.present} present · {row.absent} absent</p>
        <p className="text-[10px] text-gray-400">
          {row.onLeave} on leave
          {row.compoff > 0 && <span className="ml-1 text-indigo-600 font-semibold">· ⚑ {row.compoff} comp-off</span>}
        </p>
      </div>
    </div>
  );
}


/**
 * Assigning from the board: pick which project the work belongs to, then reuse the
 * normal AddTaskModal with the person and their free window pre-filled.
 */
function AssignTaskFlow({ row, projects, startDate, dueDate, onClose, onDone }: {
  row: CapacityRow; projects: ApiProject[]; startDate?: string; dueDate?: string;
  onClose: () => void; onDone: () => void;
}) {
  const [projectId, setProjectId] = useState('');
  const { data: project } = useQuery<ApiProject>({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
    enabled: !!projectId,
  });
  const assignable = projects.filter(p => !['ARCHIVED', 'CANCELLED'].includes(p.projectPhase));
  const taskList = project?.taskLists?.find(tl => tl.isDefault) ?? project?.taskLists?.[0];

  if (projectId && project && taskList) {
    return (
      <AddTaskModal
        projectId={project.id}
        taskListId={taskList.id}
        workflowId={project.workflowId}
        initialAssigneeIds={[row.userId]}
        initialStartDate={startDate}
        initialDueDate={dueDate}
        onClose={onClose}
        onSuccess={onDone}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ')[1], profilePhoto: row.profilePhoto }} size={36} />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Assign work to {row.name.split(' ')[0]}</h2>
              <p className="text-xs text-gray-500">
                {startDate ? `Into their free window from ${formatDate(startDate)}` : 'Choose a project to add the task to'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Project</label>
          <select
            autoFocus
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
          >
            <option value="">Select a project…</option>
            {assignable.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <p className="text-[11px] text-gray-400">
            The task form opens next with {row.name.split(' ')[0]} and the dates already filled in.
          </p>
          {projectId && !taskList && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader size={12} className="animate-spin" /> Loading project…</p>
          )}
        </div>
      </div>
    </div>
  );
}
