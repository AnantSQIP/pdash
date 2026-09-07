'use client';

// The per-person capacity drill-down drawer — shows what someone is working on and lets
// you extend a task's or project's deadline to relieve their load. Shared by the full
// Team Capacity board and the per-project Capacity tab so the two never drift apart.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { X, Plus, ArrowRight, CalendarPlus, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type CapacityRow, type CapacityOpenTask } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/Avatar';
import { formatDate } from '@/lib/date';
import { pidLabel } from '@/lib/mock-data';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { type ProjectHue, NO_PROJECT_HUE, segmentFill, deadlineState, railStyle, urgencyOrder } from '@/lib/project-colors';
import { DayCell, DOW, dayNum, dayOfWeek, isToday, segmentsFor, DAILY_CAPACITY } from './grid';
import { dueText, priorityWord } from './HoverCard';

// Extending a deadline spreads the same remaining work over more days, which lowers the
// assignee's daily occupancy — the lever to relieve someone who is overloaded or on leave.
const EXTEND_PRESETS: { label: string; days: number }[] = [
  { label: '+1 day', days: 1 }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 },
];

/** newDeadline = max(currentDue, today) + days, as an ISO string. Never moves a deadline
 *  into the past even if the current one is already overdue. */
function extendedISO(currentDue: string | null | undefined, days: number): string {
  const from = currentDue ? new Date(currentDue) : new Date();
  const base = new Date(Math.max(from.getTime(), Date.now()));
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

type ExtendTarget = { id: string; dueDate?: string | null; projectId?: string | null };

export function ExtendMenu({ task, canProject, disabled, onExtend }: {
  task: ExtendTarget;
  canProject: boolean;
  disabled: boolean;
  onExtend: (scope: 'task' | 'project', iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'task' | 'project'>('task');
  const [custom, setCustom] = useState('');
  const applyPreset = (days: number) => { onExtend(scope, extendedISO(task.dueDate, days)); setOpen(false); };
  const applyCustom = () => {
    if (!custom) return;
    onExtend(scope, new Date(`${custom}T00:00:00`).toISOString());
    setOpen(false); setCustom('');
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-brand-600 disabled:opacity-40"
        title="Extend the deadline to relieve the load"
      >
        <CalendarPlus size={12} /> Extend
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 w-56 bg-white rounded-lg border border-gray-200 shadow-lg p-3">
            {canProject && task.projectId && (
              <div className="flex gap-0.5 mb-2 bg-gray-100 rounded-md p-0.5 text-[11px] font-medium">
                <button onClick={() => setScope('task')} className={clsx('flex-1 py-1 rounded', scope === 'task' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>This task</button>
                <button onClick={() => setScope('project')} className={clsx('flex-1 py-1 rounded', scope === 'project' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>Whole project</button>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mb-1.5">
              {scope === 'project' ? 'Push the project deadline' : 'Push this task’s deadline'}
            </p>
            <div className="flex gap-1 mb-2">
              {EXTEND_PRESETS.map(p => (
                <button key={p.days} onClick={() => applyPreset(p.days)}
                  className="flex-1 text-[11px] font-medium px-1.5 py-1.5 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input type="date" value={custom} onChange={e => setCustom(e.target.value)}
                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1.5" />
              <button onClick={applyCustom} disabled={!custom}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-gray-800 text-white hover:bg-black disabled:opacity-40">Set</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** One task's footprint in the window: the days it lands on and how many hours per day. */
type Footprint = { hours: number; days: string[]; perDay: number[] };

/** The words for an allocated range — "8–12 Sep · 3h/day", or "2–4h/day" when it varies. */
function rangeText(f: Footprint | undefined): string {
  if (!f || f.days.length === 0) return 'Not scheduled in this window';
  const first = f.days[0], last = f.days[f.days.length - 1];
  const lo = Math.min(...f.perDay), hi = Math.max(...f.perDay);
  const rate = hi - lo < 0.1 ? `${Math.round(hi * 10) / 10}h/day` : `${Math.round(lo * 10) / 10}–${Math.round(hi * 10) / 10}h/day`;
  const span = first === last ? formatDate(first) : `${formatDate(first)}–${formatDate(last)}`;
  return `${span} · ${rate}`;
}

/**
 * Everything one person is on, in the colours the board uses.
 *
 * The person's own day strip sits at the top so the colour scheme is read in context; the
 * tasks below are grouped by project under the same swatch, each with its allocated range,
 * hours per day, hours left and deadline. The three summary tiles, the availability pill and the
 * completion percentage that used to be here all restated things the strip now shows.
 */
export function PersonPanel({
  row, hues, holidays, today, focusDate, onClose, onAssign,
}: {
  row: CapacityRow;
  hues: Map<string, ProjectHue>;
  holidays: ReadonlySet<string>;
  today: string;
  /** Opened from a day cell: scroll to and flash that day's tasks. */
  focusDate?: string;
  onClose: () => void;
  onAssign?: () => void;
}) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busyTaskId, setBusyTaskId] = useState('');
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const canTask = can('task.update');
  const canProject = can('project.update');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Where each task's hours land across the window.
  const footprints = useMemo(() => {
    const m = new Map<string, Footprint>();
    for (const d of row.days) for (const a of d.tasks ?? []) {
      const f = m.get(a.taskId) ?? { hours: 0, days: [], perDay: [] };
      f.hours += a.hours; f.days.push(d.date); f.perDay.push(a.hours);
      m.set(a.taskId, f);
    }
    return m;
  }, [row.days]);

  // Tasks grouped by project, most hours in the window first; within a group, most urgent first.
  const groups = useMemo(() => {
    type Group = { key: string; id?: string; pid: string | null; round?: number; title: string; isTeam: boolean;
      projectDueDate?: string | null; projectPriority?: string; hue: ProjectHue; hours: number; tasks: CapacityOpenTask[] };
    const m = new Map<string, Group>();
    for (const t of row.openTasks) {
      const key = t.projectId ?? '__none';
      const g = m.get(key) ?? {
        key, id: t.projectId, pid: t.isTeamWork ? null : (t.projectPid ?? null), round: t.projectRound,
        title: t.project ?? (t.isTeamWork ? 'Team space' : 'No project'), isTeam: !!t.isTeamWork,
        projectDueDate: t.projectDueDate, projectPriority: t.projectPriority,
        hue: (t.projectId && !t.isTeamWork && hues.get(t.projectId)) || NO_PROJECT_HUE, hours: 0, tasks: [],
      };
      g.tasks.push(t);
      g.hours += footprints.get(t.id)?.hours ?? 0;
      m.set(key, g);
    }
    for (const g of m.values()) {
      g.hours = Math.round(g.hours * 10) / 10;
      g.tasks.sort((a, b) => urgencyOrder(
        { id: a.id, overdue: a.overdue, priority: a.priority, dueDate: a.dueDate, projectPid: a.projectPid },
        { id: b.id, overdue: b.overdue, priority: b.priority, dueDate: b.dueDate, projectPid: b.projectPid }));
    }
    return [...m.values()].sort((a, b) => b.hours - a.hours || (a.pid ?? '~').localeCompare(b.pid ?? '~'));
  }, [row.openTasks, hues, footprints]);

  const scheduledCount = row.openTasks.filter(t => (footprints.get(t.id)?.hours ?? 0) > 0).length;
  const unscheduled = row.openTasks.filter(t => !(footprints.get(t.id)?.hours ?? 0));

  // Opened from a cell: the tasks on that day get a moment's ring, and the first scrolls into view.
  const focusIds = useMemo(() => {
    if (!focusDate) return new Set<string>();
    const d = row.days.find(x => x.date === focusDate);
    return new Set((d?.tasks ?? []).map(a => a.taskId));
  }, [row.days, focusDate]);
  const [flash, setFlash] = useState(false);
  const firstFocusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusIds.size) return;
    setFlash(true);
    firstFocusRef.current?.scrollIntoView({ block: 'center' });
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [focusIds]);

  async function extend(scope: 'task' | 'project', task: CapacityRow['openTasks'][number], iso: string) {
    setBusyTaskId(task.id);
    try {
      if (scope === 'project') {
        if (!task.projectId) throw new Error('This task has no project.');
        await api.projects.update(task.projectId, { dueDate: iso });
      } else {
        await api.tasks.update(task.id, { dueDate: iso });
      }
      invalidateTaskCaches(qc);
      qc.invalidateQueries({ queryKey: ['coverage-risks'] });
      toast(`Deadline extended to ${formatDate(iso)}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not extend the deadline', 'error');
    } finally {
      setBusyTaskId('');
    }
  }

  const over = row.overCommittedHours > 0.05;
  let firstFocusAssigned = false;

  const taskRow = (t: CapacityOpenTask, hue: ProjectHue, scheduled: boolean) => {
    const fill = segmentFill(hue, t.priority);
    const deadline = deadlineState(t.dueDate, today, holidays);
    const rail = railStyle(deadline);
    const due = dueText({ taskId: t.id, hours: 0, task: t, hue, fill, deadline, rail }, today);
    const focused = focusIds.has(t.id);
    const ref = focused && !firstFocusAssigned ? (firstFocusAssigned = true, firstFocusRef) : undefined;
    return (
      <div
        key={t.id}
        ref={ref}
        className={clsx('group/task flex gap-2.5 px-1 py-2 transition-shadow',
          focused && flash && 'rounded-md ring-2 ring-gray-900')}
      >
        <span className="relative mt-0.5 h-6 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: fill, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)' }}>
          {rail && <span className="absolute inset-x-0 bottom-0 h-[3px] border-t border-white" style={{ background: rail }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-[13px] font-medium text-gray-900" title={t.title}>{t.title}</p>
            <span className="shrink-0 text-[11px] tabular-nums text-gray-500">{t.remainingHours}h left</span>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            <span className="text-gray-600">{priorityWord(t.priority)}</span>
            {' · '}<span className={due.cls}>{due.text}</span>
            {scheduled && <>{' · '}<span className="tabular-nums">{rangeText(footprints.get(t.id))}</span></>}
          </p>
        </div>
        {canTask && (
          <div className="shrink-0 opacity-0 transition-opacity group-hover/task:opacity-100 focus-within:opacity-100">
            <ExtendMenu task={t} canProject={canProject} disabled={busyTaskId === t.id} onExtend={(scope, iso) => extend(scope, t, iso)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl sm:w-[460px]" role="dialog" aria-label={`${row.name}'s plan`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ').slice(1).join(' '), profilePhoto: row.profilePhoto }} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{row.name}</p>
              <p className="truncate text-xs text-gray-400">{row.designation ?? '—'}{row.department ? ` · ${row.department}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={16} /></button>
        </div>

        {/* Their own window, in the board's colours — the context for everything below. */}
        <div className="border-b border-gray-100 px-5 pb-3 pt-3">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${row.days.length}, minmax(0, 1fr))` }}>
            {row.days.map(d => (
              <div key={d.date} className={clsx('text-center text-[9px] leading-none', isToday(d.date) ? 'font-bold text-gray-900' : 'text-gray-400')}>
                {DOW[dayOfWeek(d.date)]}<br />{dayNum(d.date)}
              </div>
            ))}
            {row.days.map(d => (
              <DayCell key={d.date} day={d} compact today={isToday(d.date)}
                segments={segmentsFor(row, d, hues, today, holidays)} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-gray-600 tabular-nums">
            <span className="font-medium text-gray-900">{row.committedHours}h</span> planned of {row.capacityHours}h in this window
            {' · '}<span className={row.freeHours > 0 ? 'text-emerald-700' : 'text-gray-500'}>{row.freeHours}h free</span>
            {over && <>{' · '}<span className="font-medium text-red-700">{row.overCommittedHours}h over on some days</span></>}
            {row.nextFreeDate && !row.availableNow && <>{' · '}free from {formatDate(row.nextFreeDate)}</>}
            {row.availableNow && <>{' · '}<span className="text-emerald-700">free now</span></>}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {row.openTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nothing assigned — completely free to take work.</p>
          ) : (
            <div className="space-y-4">
              {groups.filter(g => g.tasks.some(t => (footprints.get(t.id)?.hours ?? 0) > 0)).map(g => (
                <section key={g.key}>
                  <div className="flex items-center gap-2 rounded-md px-1 py-1.5" style={{ backgroundColor: g.hue.tint }}>
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: g.hue.medium }} />
                    {g.pid && <span className="font-mono text-[11px] font-semibold" style={{ color: g.hue.critical }}>{pidLabel(g.pid, g.round)}</span>}
                    {g.id && !g.isTeam
                      ? <Link href={`/projects/${g.id}`} className="min-w-0 truncate text-[12.5px] font-medium text-gray-800 hover:underline">{g.title}</Link>
                      : <span className="min-w-0 truncate text-[12.5px] font-medium text-gray-800">{g.title}</span>}
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-600">{g.hours}h in window</span>
                  </div>
                  {(g.projectDueDate || g.projectPriority) && (
                    <p className="px-1 pt-1 text-[10.5px] text-gray-400">
                      {g.projectDueDate && <>Project due {formatDate(g.projectDueDate)}</>}
                      {g.projectDueDate && g.projectPriority && ' · '}
                      {g.projectPriority && <>{priorityWord(g.projectPriority)} priority</>}
                    </p>
                  )}
                  <div className="divide-y divide-gray-100">
                    {g.tasks.filter(t => (footprints.get(t.id)?.hours ?? 0) > 0).map(t => taskRow(t, g.hue, true))}
                  </div>
                </section>
              ))}

              {unscheduled.length > 0 && (
                <section>
                  <button onClick={() => setShowUnscheduled(v => !v)}
                    className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:bg-gray-50">
                    <ChevronDown size={12} className={clsx('transition-transform', !showUnscheduled && '-rotate-90')} />
                    Not scheduled in this window ({unscheduled.length})
                  </button>
                  {showUnscheduled && (
                    <div className="divide-y divide-gray-100">
                      {unscheduled.map(t => taskRow(t, (t.projectId && !t.isTeamWork && hues.get(t.projectId)) || NO_PROJECT_HUE, false))}
                    </div>
                  )}
                </section>
              )}
              {scheduledCount === 0 && unscheduled.length > 0 && (
                <p className="text-[11.5px] text-gray-400">Assigned work, none of it landing in this window — every task is either done, overdue with no hours left, or starts later.</p>
              )}
            </div>
          )}
        </div>

        {onAssign && (
          <div className="border-t border-gray-100 px-5 py-4">
            <button
              onClick={onAssign}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              <Plus size={15} /> Assign a task to {row.name.split(' ')[0]}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
