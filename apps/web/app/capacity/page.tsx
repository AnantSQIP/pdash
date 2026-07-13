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
  Users, Loader, CalendarRange, Sparkles, AlertTriangle, Plane, Flag,
  ArrowRight, Zap, X, Plus, Search, TrendingUp, Clock,
} from 'lucide-react';
import { api, type TeamCapacity, type CapacityRow, type CapacityDay, type DayState, type ApiProject } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import { AddTaskModal } from '@/components/tasks/AddTaskModal';
import { formatDate } from '@/lib/date';

// ── day-cell visual language ──────────────────────────────────────────────────
// Free reads GREEN (opportunity), overloaded reads RED (risk) — the two states a
// manager acts on. Busy/light are calm blues so the greens and reds pop.
const STATE_STYLE: Record<DayState, { cell: string; label: string; dot: string }> = {
  FREE:       { cell: 'bg-emerald-100 hover:bg-emerald-200 border-emerald-200',   label: 'Free',       dot: 'bg-emerald-400' },
  LIGHT:      { cell: 'bg-sky-100 hover:bg-sky-200 border-sky-200',               label: 'Light',      dot: 'bg-sky-300' },
  BUSY:       { cell: 'bg-brand-500 hover:bg-brand-600 border-brand-600',         label: 'Busy',       dot: 'bg-brand-500' },
  OVERLOADED: { cell: 'bg-red-500 hover:bg-red-600 border-red-600',               label: 'Overloaded', dot: 'bg-red-500' },
  LEAVE:      { cell: 'bg-purple-100 border-purple-200 bg-stripes-purple',        label: 'On leave',   dot: 'bg-purple-300' },
  HOLIDAY:    { cell: 'bg-amber-100 border-amber-200',                            label: 'Holiday',    dot: 'bg-amber-300' },
  WEEKEND:    { cell: 'bg-gray-50 border-gray-100',                               label: 'Weekend',    dot: 'bg-gray-200' },
};
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayOfWeek(iso: string) { return new Date(`${iso}T00:00:00Z`).getUTCDay(); }
function dayNum(iso: string) { return new Date(`${iso}T00:00:00Z`).getUTCDate(); }
function isToday(iso: string) { return iso === new Date().toISOString().slice(0, 10); }

function DayCell({ day, onClick }: { day: CapacityDay; onClick?: () => void }) {
  const s = STATE_STYLE[day.state];
  const working = day.capacity > 0;
  const title = working
    ? `${formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${s.label} — ${day.load}h of ${day.capacity}h committed (${day.free}h free)`
    : `${formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${day.note ?? s.label}`;

  return (
    <button
      type="button"
      title={title}
      onClick={working ? onClick : undefined}
      disabled={!working}
      className={clsx(
        'relative h-9 w-full rounded-md border transition-all duration-150',
        s.cell,
        working && 'cursor-pointer hover:scale-[1.08] hover:shadow-sm hover:z-10',
        !working && 'cursor-default',
        isToday(day.date) && 'ring-2 ring-offset-1 ring-gray-900/70',
      )}
    >
      {/* Fill bar shows how much of the day is taken — a glanceable "how full". */}
      {working && day.utilization > 0 && (
        <span
          className="absolute inset-x-0 bottom-0 rounded-b-[5px] bg-black/10"
          style={{ height: `${Math.min(100, day.utilization * 100)}%` }}
        />
      )}
      {day.state === 'LEAVE' && <Plane size={11} className="absolute inset-0 m-auto text-purple-500" />}
      {day.state === 'HOLIDAY' && <Flag size={11} className="absolute inset-0 m-auto text-amber-500" />}
    </button>
  );
}

export default function CapacityPage() {
  const { org } = useOrg();
  const { can, loading: permLoading } = usePermissions();
  const qc = useQueryClient();
  const allowed = can('capacity.view');

  const [days, setDays] = useState(14);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [selected, setSelected] = useState<CapacityRow | null>(null);
  const [assignTo, setAssignTo] = useState<{ row: CapacityRow; start?: string; due?: string } | null>(null);

  const { data, isLoading } = useQuery<TeamCapacity>({
    queryKey: ['capacity', org?.id, days],
    queryFn: () => api.capacity.team(org!.id, days),
    enabled: allowed && !!org?.id,
    staleTime: 60_000,
  });

  // Projects the manager can assign INTO (approved/active work).
  const { data: projects = [] } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: allowed && !!org?.id,
    staleTime: 60_000,
  });

  const rows = data?.rows ?? [];
  const departments = useMemo(
    () => [...new Set(rows.map(r => r.department).filter(Boolean))].sort() as string[],
    [rows],
  );
  const visible = useMemo(() => rows.filter(r =>
    (!search || r.name.toLowerCase().includes(search.toLowerCase())) &&
    (!dept || r.department === dept),
  ), [rows, search, dept]);

  // Headline numbers a manager acts on.
  const stats = useMemo(() => {
    const freeNow = rows.filter(r => r.availableNow).length;
    const freeingSoon = rows.filter(r => !r.availableNow && r.nextFreeDate).length;
    const overloaded = rows.filter(r => r.days.some(d => d.state === 'OVERLOADED')).length;
    const spareHours = Math.round(rows.reduce((s, r) => s + r.freeHours, 0));
    const overdue = rows.reduce((s, r) => s + r.overdueCount, 0);
    return { freeNow, freeingSoon, overloaded, spareHours, overdue };
  }, [rows]);

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

  const header = data?.rows[0]?.days ?? [];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users size={20} className="text-brand-600" /> Team Capacity
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
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={clsx('px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    days === d ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI strip — the four things worth acting on */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
          <Kpi label="Available now" value={stats.freeNow} Icon={Sparkles} tint="bg-emerald-100 text-emerald-700" hint="free on the next working day" />
          <Kpi label="Freeing up soon" value={stats.freeingSoon} Icon={CalendarRange} tint="bg-sky-100 text-sky-700" hint="within this window" />
          <Kpi label="Overloaded" value={stats.overloaded} Icon={AlertTriangle} tint="bg-red-100 text-red-700" hint="over 100% on a day" />
          <Kpi label="Spare capacity" value={`${stats.spareHours}h`} Icon={Zap} tint="bg-amber-100 text-amber-700" hint="unused hours in window" />
          <Kpi label="Overdue tasks" value={stats.overdue} Icon={Clock} tint="bg-purple-100 text-purple-700" hint="past internal deadline" />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" /> Building the availability map…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No active team members.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Day header */}
            <div className="flex items-end gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
              <div className="w-56 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">Member</div>
              <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))` }}>
                {header.map(d => (
                  <div key={d.date} className={clsx('text-center', isToday(d.date) && 'text-brand-600 font-bold')}>
                    <div className="text-[9px] uppercase text-gray-400">{DOW[dayOfWeek(d.date)]}</div>
                    <div className="text-[11px] font-medium text-gray-600">{dayNum(d.date)}</div>
                  </div>
                ))}
              </div>
              <div className="w-40 shrink-0 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Availability</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {visible.map(row => (
                <div key={row.userId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/70 transition-colors group">
                  {/* Person */}
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

                  {/* Day cells */}
                  <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${row.days.length}, minmax(0, 1fr))` }}>
                    {row.days.map(d => (
                      <DayCell
                        key={d.date}
                        day={d}
                        onClick={() => setAssignTo({ row, start: d.date, due: d.date })}
                      />
                    ))}
                  </div>

                  {/* Availability summary + the action this board exists for */}
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
              {visible.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-gray-400">No one matches those filters.</p>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              {(['FREE', 'LIGHT', 'BUSY', 'OVERLOADED', 'LEAVE', 'HOLIDAY', 'WEEKEND'] as DayState[]).map(s => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={clsx('w-2.5 h-2.5 rounded-sm', STATE_STYLE[s].dot)} />{STATE_STYLE[s].label}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 ml-auto">
                Capacity {data?.capacityPerDay}h/day · leave &amp; holidays excluded
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

function PersonPanel({ row, onClose, onAssign }: { row: CapacityRow; onClose: () => void; onAssign: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ')[1], profilePhoto: row.profilePhoto }} size={40} />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{row.name}</p>
              <p className="text-xs text-gray-400 truncate">{row.designation ?? '—'}{row.department ? ` · ${row.department}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-gray-100">
          {[
            { label: 'Free', value: `${row.freeHours}h`, cls: 'text-emerald-600' },
            { label: 'Committed', value: `${row.committedHours}h`, cls: 'text-brand-600' },
            { label: 'Utilisation', value: `${row.utilization}%`, cls: row.utilization > 100 ? 'text-red-600' : 'text-gray-800' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={clsx('text-lg font-bold leading-none', s.cls)}>{s.value}</p>
              <p className="text-[11px] text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 text-sm">
          {row.availableNow ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full text-xs font-medium">
              <Sparkles size={12} /> Available now
            </span>
          ) : row.nextFreeDate ? (
            <span className="inline-flex items-center gap-1.5 text-sky-700 bg-sky-50 border border-sky-100 px-2.5 py-1 rounded-full text-xs font-medium">
              <CalendarRange size={12} /> Frees up {formatDate(row.nextFreeDate)}
              {row.freeRunDays > 1 && ` · ${row.freeRunDays} days`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full text-xs font-medium">
              <AlertTriangle size={12} /> Fully booked in this window
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Open tasks ({row.openTasks.length})
          </p>
          {row.openTasks.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing assigned — completely free to take work.</p>
          ) : (
            <div className="space-y-2">
              {row.openTasks.map(t => (
                <div key={t.id} className={clsx('rounded-lg border p-3', t.overdue ? 'border-red-200 bg-red-50/40' : 'border-gray-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 leading-snug">{t.title}</p>
                    <span className="text-xs text-gray-400 shrink-0">{t.remainingHours}h left</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                    {t.projectId
                      ? <Link href={`/projects/${t.projectId}`} className="hover:text-brand-600 truncate max-w-[160px]">{t.project}</Link>
                      : <span>—</span>}
                    <span>·</span>
                    <span>{t.completionPercentage}%</span>
                    {t.dueDate && (
                      <>
                        <span>·</span>
                        <span className={t.overdue ? 'text-red-500 font-medium' : ''}>
                          {t.overdue ? 'overdue ' : 'due '}{formatDate(t.dueDate)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={onAssign}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus size={15} /> Assign a task to {row.name.split(' ')[0]}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </>
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
        milestones={project.milestones}
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
