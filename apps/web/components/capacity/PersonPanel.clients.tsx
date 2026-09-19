'use client';

// The per-person capacity drill-down drawer — shows what someone is working on and lets
// you extend a task's or its task group's deadline to relieve their load. Shared by the full
// Team Capacity board and the per-client Capacity tab so the two never drift apart.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { X, Plus, ArrowRight, CalendarPlus, ChevronDown, AlertTriangle, Pencil, UserRoundCog, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type CapacityRow, type CapacityOpenTask } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/Avatar';
import { formatDate, shiftDay, toUtcDay, todayIST } from '@/lib/date';
import { cidLabel } from '@/lib/mock-data';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { type ProjectHue, NO_PROJECT_HUE, segmentFill, segmentRing, textureStyle, deadlineState, railStyle, urgencyOrder } from '@/lib/project-colors.clients';
import type { TaskActions } from './TaskEditor';
import { DayCell, DOW, dayNum, dayOfWeek, isToday, segmentsFor } from './grid.clients';
import { dueText, priorityWord } from './HoverCard.clients';

// Extending a deadline spreads the same remaining work over more days, which lowers the
// assignee's daily occupancy — the lever to relieve someone who is overloaded or on leave.
const EXTEND_PRESETS: { label: string; days: number }[] = [
  { label: '+1 day', days: 1 }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 },
];

/** newDeadline = max(currentDue, today) + days, as a calendar day (YYYY-MM-DD). Never moves a
 *  deadline into the past even if the current one is already overdue. A day, not an instant: an
 *  instant built from local midnight lands on the previous UTC day in IST. */
function extendedDay(currentDue: string | null | undefined, days: number): string {
  const today = todayIST();
  const from = currentDue ? toUtcDay(currentDue) : today;
  return shiftDay(from > today ? from : today, days);
}

type ExtendTarget = {
  id: string; dueDate?: string | null; projectId?: string | null;
  /** The task's own deadline, when `dueDate` is one person's. */
  taskDueDate?: string | null;
  taskGroupId?: string | null; taskGroup?: string | null; taskGroupDueDate?: string | null;
};
/**
 * CLIENTS-FLOW (deadlines): what an extension moves.
 *   person — one person's own deadline on the task; may run past the task and its group by design.
 *   task   — the task's deadline for everyone; it cannot pass its task group's.
 *   group  — the task group's deadline; open tasks due on the old date move with it.
 * "Client" used to be here and pushed a project-wide date; a client has no deadline of its own now.
 */
export type ExtendScope = 'person' | 'task' | 'group';

/** Apply an extension and say, in words, what moved. Shared by every Extend menu. */
export async function applyExtend(scope: ExtendScope, task: ExtendTarget, day: string, person?: { userId: string; name: string }): Promise<string> {
  if (scope === 'group') {
    if (!task.projectId || !task.taskGroupId) throw new Error('This task is not in a task group.');
    const r = await api.taskLists.update(task.projectId, task.taskGroupId, { dueDate: day });
    const moved = r.movedTasks ?? 0;
    return `“${task.taskGroup ?? 'The task group'}” is now due ${formatDate(day)}${moved ? ` — ${moved} task${moved === 1 ? '' : 's'} moved with it` : ''}`;
  }
  if (scope === 'task') {
    await api.tasks.update(task.id, { dueDate: day });
    return `Deadline extended to ${formatDate(day)}`;
  }
  if (!person) throw new Error('Whose deadline?');
  await api.tasks.setAssigneeDeadline(task.id, person.userId, day);
  return `${person.name.split(' ')[0]}'s deadline on this task moved to ${formatDate(day)} — nobody else's changed`;
}

export function ExtendMenu({ task, person, canGroup, disabled, onExtend }: {
  task: ExtendTarget;
  /** The person whose plan is on screen: the default scope moves THEIR deadline only. */
  person?: { userId: string; name: string };
  /** May move a task group's deadline (tasklist.update). */
  canGroup: boolean;
  disabled: boolean;
  onExtend: (scope: ExtendScope, day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExtendScope>(person ? 'person' : 'task');
  const first = person?.name.split(' ')[0] ?? '';
  const [custom, setCustom] = useState('');
  const groupDue = task.taskGroupDueDate ?? null;
  // Only a group that HAS a deadline can be extended. Offering it for one with none turned
  // "+1 day" into "invent a deadline from this task's date" — and the server then pulls every
  // later task in the group in to it, dragging colleagues' work backwards by weeks.
  const offerGroup = canGroup && !!task.projectId && !!task.taskGroupId && !!groupDue;
  // Where the presets count from: the thing being moved.
  const base = scope === 'group' ? groupDue : scope === 'task' ? (task.taskDueDate ?? task.dueDate) : task.dueDate;
  // A task cannot be due after its group — say so here rather than let the save be refused.
  const pastGroup = (day: string) => scope === 'task' && !!groupDue && day > groupDue;
  // "Extend" only ever moves a deadline outwards. Pulling a GROUP's deadline in from here would
  // drag every later task in it forward, which is not what the word says; that is an edit on the
  // task group itself, where the dialog spells out what moves.
  const earlierGroup = (day: string) => scope === 'group' && !!groupDue && day < groupDue;
  const apply = (day: string) => {
    if (pastGroup(day) || earlierGroup(day)) return;
    onExtend(scope, day); setOpen(false); setCustom('');
  };
  const tab = (s: ExtendScope, label: string) => (
    <button onClick={() => setScope(s)} className={clsx('flex-1 py-1 rounded', scope === s ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>{label}</button>
  );
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
          <div className="absolute right-0 mt-1 z-50 w-64 bg-white rounded-lg border border-gray-200 shadow-lg p-3">
            {(person || offerGroup) && (
              <div className="flex gap-0.5 mb-2 bg-gray-100 rounded-md p-0.5 text-[11px] font-medium">
                {person && tab('person', `Only ${first}`)}
                {tab('task', 'Whole task')}
                {offerGroup && tab('group', 'Task group')}
              </div>
            )}
            <p className="text-[11px] text-gray-400 mb-1.5">
              {scope === 'person' ? `Give ${first} more time on this task — nobody else's deadline moves`
                : scope === 'group' ? `Move “${task.taskGroup}” (due ${formatDate(groupDue!)}) — every task due on that date moves with it`
                  : 'Push this task’s deadline for everyone on it'}
            </p>
            <div className="flex gap-1 mb-2">
              {EXTEND_PRESETS.map(p => {
                const day = extendedDay(base, p.days);
                const blocked = pastGroup(day);
                return (
                  <button key={p.days} onClick={() => apply(day)} disabled={blocked}
                    title={blocked ? `After the task group’s deadline (${formatDate(groupDue!)})` : formatDate(day)}
                    className="flex-1 text-[11px] font-medium px-1.5 py-1.5 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 disabled:hover:bg-brand-50">
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1">
              <input type="date" value={custom} onChange={e => setCustom(e.target.value)}
                max={scope === 'task' && groupDue ? groupDue : undefined}
                // Extending never moves a deadline EARLIER: on a task group that pulls other
                // people's tasks in with it.
                min={scope === 'group' && groupDue ? groupDue : undefined}
                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1.5" />
              <button onClick={() => custom && apply(custom)} disabled={!custom || pastGroup(custom) || earlierGroup(custom)}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-gray-800 text-white hover:bg-black disabled:opacity-40">Set</button>
            </div>
            {scope === 'task' && groupDue && (
              <p className="mt-2 text-[11px] text-amber-700">
                Its task group is due {formatDate(groupDue)}.{offerGroup ? ' To go past that, extend the task group.' : ''}
              </p>
            )}
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
 * tasks below are grouped by client under the same swatch, each with its task group, allocated range,
 * hours per day, hours left and deadline. The three summary tiles, the availability pill and the
 * completion percentage that used to be here all restated things the strip now shows.
 */
export function PersonPanel({
  row, hues, holidays, today, focusDate, onClose, onAssign, taskActions,
}: {
  row: CapacityRow;
  hues: Map<string, ProjectHue>;
  holidays: ReadonlySet<string>;
  today: string;
  /** Opened from a day cell: scroll to and flash that day's tasks. */
  focusDate?: string;
  onClose: () => void;
  onAssign?: () => void;
  /** capacity.manage: Edit / Reassign / Delete on every task listed. */
  taskActions?: TaskActions | null;
}) {
  const { can } = usePermissions();
  const { users } = useOrg();
  /** A person's first name, for saying WHO is covering rather than that somebody is. */
  const firstNameOf = (id?: string) => {
    const u = users.find(x => x.id === id);
    return u ? u.firstName : 'someone else';
  };
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busyTaskId, setBusyTaskId] = useState('');
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  // The day whose tasks are flashed: seeded by the cell that opened the panel, and moved from
  // inside it by the over-committed list.
  const [focus, setFocus] = useState<string | undefined>(focusDate);
  useEffect(() => { setFocus(focusDate); }, [focusDate]);
  const canTask = can('task.update');
  const canGroup = can('tasklist.update');

  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Escape belongs to whatever is on top: with the task editor or a confirmation open over the
    // panel, it closes THAT, not the panel underneath as well.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      if (dialogs.some(d => d !== panelRef.current)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A dialog that opens without taking focus leaves a keyboard user still on the board behind it.
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  // An older API with no per-day itemisation: every task is still real work; it just cannot be
  // placed on a day. Then nothing is "not scheduled" — it is simply not itemised.
  const itemised = row.days.some(d => d.tasks !== undefined);

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

  // Tasks grouped by client, most hours in the window first; within a group, most urgent first.
  const groups = useMemo(() => {
    type Group = { key: string; id?: string; pid: string | null; round?: number; title: string; isTeam: boolean;
      projectDueDate?: string | null; projectPriority?: string; hue: ProjectHue; hours: number; tasks: CapacityOpenTask[] };
    const m = new Map<string, Group>();
    for (const t of row.openTasks) {
      const key = t.projectId ?? '__none';
      const g = m.get(key) ?? {
        key, id: t.projectId, pid: t.isTeamWork ? null : (t.projectPid ?? null), round: t.projectRound,
        title: t.project ?? (t.isTeamWork ? 'Team space' : 'No client'), isTeam: !!t.isTeamWork,
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
  const unscheduled = itemised ? row.openTasks.filter(t => !(footprints.get(t.id)?.hours ?? 0)) : [];

  // Opened from a cell: the tasks on that day get a moment's ring, and the first scrolls into view.
  const focusIds = useMemo(() => {
    if (!focus) return new Set<string>();
    const d = row.days.find(x => x.date === focus);
    return new Set((d?.tasks ?? []).map(a => a.taskId));
  }, [row.days, focus]);
  // Days planned beyond capacity — the conflicts, as a list you can act on, not just a dark edge.
  const overDays = useMemo(() => row.days.filter(d => d.capacity > 0 && d.load > d.capacity + 0.05), [row.days]);
  // Every scheduled task in group order, for the timeline.
  const timeline = useMemo(() => {
    const out: { t: CapacityOpenTask; hue: ProjectHue }[] = [];
    for (const g of groups) for (const t of g.tasks) if ((footprints.get(t.id)?.hours ?? 0) > 0) out.push({ t, hue: g.hue });
    return out;
  }, [groups, footprints]);
  const [flash, setFlash] = useState(false);
  const firstFocusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusIds.size) return;
    setFlash(true);
    firstFocusRef.current?.scrollIntoView({ block: 'center' });
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [focusIds]);

  async function extend(scope: ExtendScope, task: CapacityRow['openTasks'][number], day: string) {
    setBusyTaskId(task.id);
    try {
      const said = await applyExtend(scope, task, day, { userId: row.userId, name: row.name });
      invalidateTaskCaches(qc);
      qc.invalidateQueries({ queryKey: ['coverage-risks'] });
      if (scope === 'group') qc.invalidateQueries({ queryKey: ['task-groups'] });
      toast(said, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not extend the deadline', 'error');
    } finally {
      setBusyTaskId('');
    }
  }


  const over = row.overCommittedHours > 0.05;
  let firstFocusAssigned = false;

  /** `withClient`: the row sits outside its client's section, so it names the client too. */
  const taskRow = (t: CapacityOpenTask, hue: ProjectHue, scheduled: boolean, withClient = false) => {
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
          focused && flash && 'rounded-md ring-2 ring-brand-400')}
      >
        <span className="relative mt-0.5 h-6 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: fill, ...textureStyle(hue.texture), boxShadow: segmentRing(hue) }}>
          {rail && <span className="absolute inset-x-0 bottom-0 h-[3px] border-t border-white" style={{ background: rail }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-[13px] font-medium text-gray-900" title={t.title}>{t.title}</p>
            <span className="shrink-0 text-[11px] tabular-nums text-gray-500">{t.remainingHours}h left</span>
          </div>
          {(t.taskGroup || (withClient && t.project)) && (
            <p className="truncate text-[10.5px] text-gray-400" title={t.taskGroup ? 'Task group' : undefined}>
              {withClient && t.project && (
                <span className="text-gray-500">
                  {t.projectPid && !t.isTeamWork ? `${cidLabel(t.projectPid, t.projectRound)} · ` : ''}{t.project}
                  {t.taskGroup ? ' · ' : ''}
                </span>
              )}
              {t.taskGroup}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-gray-500">
            <span className="text-gray-600">{priorityWord(t.priority)}</span>
            {' · '}<span className={due.cls}>{due.text}</span>
            {t.ownDeadline && <span className="text-gray-400" title="A deadline set for this person alone; the task's own deadline is unchanged"> · own deadline{t.taskDueDate ? ` (task due ${formatDate(t.taskDueDate)})` : ''}</span>}
            {scheduled && <>{' · '}<span className="tabular-nums">{rangeText(footprints.get(t.id))}</span></>}
          </p>
          {t.estimatedHours != null && (
            <p className="mt-0.5 text-[10.5px] tabular-nums text-gray-400">
              {t.loggedHours ?? 0}h logged of {t.estimatedHours}h estimated
              {t.overEstimate && <span className="text-amber-700"> · over the estimate</span>}
            </p>
          )}
          {/* Placed work knows the day it will actually finish, so a plan that no longer fits can
              say so with a number instead of quietly compressing itself into the days that are
              left. This is what an absence looks like once the work is on the calendar: the days
              lost to leave push the fill later, and the shortfall shows up here — beside the
              Extend control, which is the usual answer to it. */}
          {/* Cover was computed and shown nowhere, so a manager could arrange it and neither the
              person away nor the stand-in would ever see it on the board they plan from. The
              hours moved silently, which looks exactly like hours going missing. */}
          {t.coveringForUserId && (
            <p className="mt-1 text-[10.5px] font-medium text-brand-700">
              Covering {firstNameOf(t.coveringForUserId)} — {t.remainingHours}h of their work
            </p>
          )}
          {t.coveredAway && (
            // Named on both sides. "8h stays with them" read as if the hours were the stand-in's,
            // which is the opposite of what it means.
            <p className="mt-1 text-[10.5px] font-medium text-brand-700">
              {firstNameOf(t.coveredByUserId)} is covering part of this — {row.name.split(' ')[0]} keeps {t.remainingHours}h
            </p>
          )}
          {!!t.overrunDays && t.plannedFinish && (
            <p className="mt-1 text-[10.5px] font-medium text-amber-700">
              Plan finishes {formatDate(t.plannedFinish)} — {t.overrunDays} working day{t.overrunDays === 1 ? '' : 's'} past this deadline.
            </p>
          )}
        </div>
        {(canTask || (taskActions && !t.isTeamWork)) && (
          // Revealed on hover where there IS hover; always shown on a touch screen, where a control
          // that only appears on hover is a control nobody can find.
          <div className="flex shrink-0 flex-col items-end gap-1.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/task:opacity-100 focus-within:opacity-100">
            {canTask && (
              <ExtendMenu task={t} person={{ userId: row.userId, name: row.name }} canGroup={canGroup} disabled={busyTaskId === t.id} onExtend={(scope, day) => extend(scope, t, day)} />
            )}
            {taskActions && !t.isTeamWork && (
              <div className="flex items-center gap-2.5 text-[11px] font-medium">
                <button type="button" onClick={() => taskActions.edit(t)} title="Edit this task"
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-brand-700"><Pencil size={11} /> Edit</button>
                <button type="button" onClick={() => taskActions.reassign(t, row.userId)} title={`Give ${row.name.split(' ')[0]}'s part to someone else`}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-brand-700"><UserRoundCog size={11} /> Reassign</button>
                <button type="button" onClick={() => taskActions.remove(t)} title="Delete this task" aria-label={`Delete ${t.title}`}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-rose-600"><Trash2 size={11} /></button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div ref={panelRef} className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl sm:w-[460px]" role="dialog" aria-modal="true" aria-label={`${row.name}'s plan`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ').slice(1).join(' '), profilePhoto: row.profilePhoto }} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{row.name}</p>
              <p className="truncate text-xs text-gray-400">{row.designation ?? '—'}{row.department ? ` · ${row.department}` : ''}</p>
            </div>
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={16} /></button>
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
              <DayCell key={d.date} day={d} compact inert today={isToday(d.date)}
                segments={segmentsFor(row, d, hues, today, holidays)} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-gray-600 tabular-nums">
            <span className="font-medium text-gray-900">{row.committedHours}h</span> planned of {row.capacityHours}h in this window
            {' · '}<span className={row.freeHours > 0 ? 'text-emerald-700' : 'text-gray-500'}>{row.freeHours}h free</span>
            {over && <>{' · '}<span className="font-medium text-rose-700">{row.overCommittedHours}h over on some days</span></>}
            {row.nextFreeDate && !row.availableNow && <>{' · '}free from {formatDate(row.nextFreeDate)}</>}
            {row.availableNow && <>{' · '}<span className="text-emerald-700">free now</span></>}
          </p>
          {overDays.length > 0 && (
            <ul className="mt-2 space-y-1" aria-label="Days planned beyond capacity">
              {overDays.map(d => (
                <li key={d.date} className="flex items-center justify-between gap-2 rounded-md bg-rose-50/60 px-2 py-1 text-[11px] text-gray-600">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle size={11} className="text-rose-500" />
                    <span className="font-medium text-gray-900">{formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    {' · '}{d.load}h planned · <span className="font-medium text-rose-700">{Math.round((d.load - d.capacity) * 10) / 10}h over</span>
                  </span>
                  <button type="button" onClick={() => setFocus(d.date)} className="shrink-0 font-medium text-brand-600 hover:underline">See the tasks</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* When each task lands: one block per day it puts hours on, in its own colour — the plan
            as a timeline, across every client at once. */}
        {timeline.length > 0 && (
          <div className="border-b border-gray-100 px-5 py-2">
            <button onClick={() => setShowTimeline(v => !v)}
              className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600">
              <ChevronDown size={12} className={clsx('transition-transform', !showTimeline && '-rotate-90')} />
              Timeline · {timeline.length} {timeline.length === 1 ? 'task' : 'tasks'} in this window
            </button>
            {showTimeline && (
              <div className="mt-1 space-y-1">
                {timeline.slice(0, 14).map(({ t, hue }) => {
                  const f = footprints.get(t.id)!;
                  const byDay = new Map(f.days.map((d, i) => [d, f.perDay[i]]));
                  const fill = segmentFill(hue, t.priority);
                  const rail = railStyle(deadlineState(t.dueDate, today, holidays));
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <button type="button" onClick={() => setFocus(f.days[0])} title={`${t.title} — ${rangeText(f)}`}
                        className="w-[104px] shrink-0 truncate text-left text-[10.5px] text-gray-600 hover:text-gray-900">
                        <span className="mr-1 inline-block h-2 w-2 rounded-[2px] align-middle" style={{ backgroundColor: fill, boxShadow: segmentRing(hue) }} />{t.title}
                      </button>
                      <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${row.days.length}, minmax(0, 1fr))` }}>
                        {row.days.map(d => {
                          const h = byDay.get(d.date);
                          return (
                            <div key={d.date} title={h ? `${formatDate(d.date, { weekday: 'short', day: 'numeric' })} · ${Math.round(h * 10) / 10}h` : undefined}
                              className={clsx('relative h-2.5 rounded-[2px]', isToday(d.date) && 'ring-1 ring-brand-400')}
                              style={h ? { backgroundColor: fill, ...textureStyle(hue.texture), boxShadow: segmentRing(hue) } : { backgroundColor: d.capacity > 0 ? '#f3f4f6' : 'transparent' }}>
                              {h && rail && <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: rail }} />}
                            </div>
                          );
                        })}
                      </div>
                      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-gray-400">{Math.round(f.hours * 10) / 10}h</span>
                    </div>
                  );
                })}
                {timeline.length > 14 && <p className="text-[10.5px] text-gray-400">+{timeline.length - 14} more below</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {row.openTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nothing assigned — completely free to take work.</p>
          ) : (
            <div className="space-y-4">
              {groups.filter(g => !itemised || g.tasks.some(t => (footprints.get(t.id)?.hours ?? 0) > 0)).map(g => (
                <section key={g.key}>
                  <div className="flex items-center gap-2 rounded-md px-1 py-1.5" style={{ backgroundColor: g.hue.tint }}>
                    <span className="h-3 w-4 shrink-0 rounded-sm" style={{ backgroundColor: g.hue.high, boxShadow: segmentRing(g.hue), ...textureStyle(g.hue.texture) }} />
                    {g.pid && <span className="font-mono text-[11px] font-semibold" style={{ color: g.hue.ink }}>{cidLabel(g.pid, g.round)}</span>}
                    {g.id && !g.isTeam
                      ? <Link href={`/projects/${g.id}`} className="min-w-0 truncate text-[12.5px] font-medium text-gray-800 hover:underline">{g.title}</Link>
                      : <span className="min-w-0 truncate text-[12.5px] font-medium text-gray-800">{g.title}</span>}
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-600">{g.hours}h in window</span>
                  </div>
                  {(g.projectDueDate || g.projectPriority) && (
                    <p className="px-1 pt-1 text-[10.5px] text-gray-400">
                      {g.projectDueDate && <>Overall due {formatDate(g.projectDueDate)}</>}
                      {g.projectDueDate && g.projectPriority && ' · '}
                      {g.projectPriority && <>{priorityWord(g.projectPriority)} priority</>}
                    </p>
                  )}
                  <div className="divide-y divide-gray-100">
                    {g.tasks.filter(t => !itemised || (footprints.get(t.id)?.hours ?? 0) > 0).map(t => taskRow(t, g.hue, itemised))}
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
                      {unscheduled.map(t => taskRow(t, (t.projectId && !t.isTeamWork && hues.get(t.projectId)) || NO_PROJECT_HUE, false, true))}
                    </div>
                  )}
                </section>
              )}
              {itemised && scheduledCount === 0 && unscheduled.length > 0 && (
                <p className="text-[11.5px] text-gray-400">Assigned work, none of it landing in this window — every task is either done, overdue with no hours left, or starts later.</p>
              )}
            </div>
          )}
        </div>

        {onAssign && (
          <div className="border-t border-gray-100 px-5 py-4">
            <button
              onClick={onAssign}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
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
