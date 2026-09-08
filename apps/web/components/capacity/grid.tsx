'use client';

// Shared visual language for capacity grids, used by both the full Team Capacity board and the
// per-project availability tab so the two never drift apart.
//
// A working day is the owner's "green box". Work is drawn INTO it as segments — one per task,
// width proportional to the hours that task puts on the day — so the green left showing is
// literally the free hours. Each segment is its project's hue at its priority's depth, with a
// rail along the bottom when its deadline is close. See lib/project-colors.ts for the rules.

import clsx from 'clsx';
import type { MouseEvent, FocusEvent } from 'react';
import { Plane, Flag } from 'lucide-react';
import type { CapacityDay, CapacityOpenTask, CapacityRow, DayState } from '@/lib/api';
import { formatDate, todayIST } from '@/lib/date';
import {
  type ProjectHue, NO_PROJECT_HUE, FREE_BASE, OVER_COMMITTED, SEGMENT_RING,
  segmentFill, textOnFill, textureStyle, deadlineState, railStyle, urgencyOrder, type DeadlineState,
} from '@/lib/project-colors';

/** Cell classes for the day states that are NOT drawn as segments. */
export const STATE_STYLE: Record<DayState, { cell: string; label: string; dot: string }> = {
  FREE:          { cell: '',                                                   label: 'Free',            dot: 'bg-emerald-200' },
  LIGHT:         { cell: '',                                                   label: 'Light',           dot: 'bg-emerald-200' },
  BUSY:          { cell: '',                                                   label: 'Busy',            dot: 'bg-emerald-200' },
  LEAVE:         { cell: 'bg-purple-100 border-purple-200',                    label: 'On leave',        dot: 'bg-purple-300' },
  LEAVE_PENDING: { cell: 'border-purple-400 border-dashed',                    label: 'Leave (pending)', dot: 'bg-purple-200' },
  HOLIDAY:       { cell: 'bg-amber-100 border-amber-200',                      label: 'Holiday',         dot: 'bg-amber-300' },
  WEEKEND:       { cell: 'bg-gray-50 border-gray-100',                         label: 'Weekend',         dot: 'bg-gray-200' },
  // Past (actual-attendance) states — unchanged:
  PRESENT:       { cell: 'bg-emerald-200 hover:bg-emerald-300 border-emerald-300', label: 'Present',     dot: 'bg-emerald-500' },
  ABSENT:        { cell: 'bg-red-100 border-red-200',                          label: 'Absent',          dot: 'bg-red-300' },
  COMPOFF:       { cell: 'bg-indigo-500 hover:bg-indigo-600 border-indigo-600', label: 'Worked (comp-off)', dot: 'bg-indigo-500' },
  // Nothing recorded yet — neutral, never green (green would assert presence).
  NOT_MARKED:    { cell: 'bg-white border-gray-200 border-dashed',             label: 'Not marked',      dot: 'bg-gray-200' },
};

export const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export function dayOfWeek(iso: string) { return new Date(`${iso}T00:00:00Z`).getUTCDay(); }
export function dayNum(iso: string) { return new Date(`${iso}T00:00:00Z`).getUTCDate(); }
export function isToday(iso: string) { return iso === todayIST(); }

export const DAILY_CAPACITY = 8;

/**
 * The words printed INSIDE a segment when it is wide enough to hold them: the PID's serial
 * ("003"), or the space for team work. A legend is what you consult when a label will not fit;
 * a label is what you read without looking away. The full PID and title are always in the hover.
 */
export function segmentLabel(task: CapacityOpenTask): string | null {
  if (task.isTeamWork) return 'team';
  if (task.projectPid) {
    const serial = task.projectPid.split(/[_\-/]/).pop() ?? task.projectPid;
    return task.projectRound && task.projectRound > 1 ? `${serial}·P${task.projectRound}` : serial;
  }
  // No PID yet (a project still waiting for one): the initials of its title's first words.
  const words = (task.project ?? '').split(/[^A-Za-z0-9]+/).filter(w => w.length > 2);
  return words.length ? words.slice(0, 3).map(w => w[0].toUpperCase()).join('') : null;
}
/** A segment must be at least this wide (px) before a label goes inside it. */
const LABEL_MIN_PX = 26;
const LABEL_HOURS_MIN_PX = 54;

/** One task's share of one day, resolved to everything the cell, the hover and the panel show. */
export type Segment = {
  taskId: string;
  hours: number;
  task: CapacityOpenTask;
  hue: ProjectHue;
  fill: string;
  deadline: DeadlineState;
  rail: string | null;
};

/** The company holidays a board knows about — from any row's HOLIDAY cells. */
export function holidaysOf(rows: { days: CapacityDay[] }[]): Set<string> {
  const out = new Set<string>();
  for (const d of rows[0]?.days ?? []) if (d.state === 'HOLIDAY' && d.note !== 'Optional holiday') out.add(d.date);
  return out;
}

/** Every project a board's rows mention, for hue assignment. */
export function projectsOf(rows: { openTasks: CapacityOpenTask[] }[]): { id: string; pid: string | null }[] {
  const m = new Map<string, { id: string; pid: string | null }>();
  for (const r of rows) for (const t of r.openTasks) {
    if (t.projectId && !t.isTeamWork && !m.has(t.projectId)) m.set(t.projectId, { id: t.projectId, pid: t.projectPid ?? null });
  }
  return [...m.values()];
}

/**
 * The segments of one person's day, most urgent first.
 *
 * Returns null when the payload carries no itemisation for the day (an older API) so the cell
 * can fall back to a plain fill instead of drawing nothing.
 */
export function segmentsFor(
  row: CapacityRow, day: CapacityDay, hues: Map<string, ProjectHue>, today: string, holidays: ReadonlySet<string>,
): Segment[] | null {
  if (!day.tasks) return null;
  const byId = new Map(row.openTasks.map(t => [t.id, t]));
  const out: Segment[] = [];
  for (const a of day.tasks) {
    const task = byId.get(a.taskId);
    if (!task || a.hours <= 0) continue;
    const hue = (task.projectId && !task.isTeamWork && hues.get(task.projectId)) || NO_PROJECT_HUE;
    const deadline = deadlineState(task.dueDate, today, holidays);
    out.push({ taskId: a.taskId, hours: a.hours, task, hue, fill: segmentFill(hue, task.priority), deadline, rail: railStyle(deadline) });
  }
  return out.sort((x, y) => urgencyOrder(
    { id: x.taskId, overdue: x.task.overdue, priority: x.task.priority, dueDate: x.task.dueDate, projectPid: x.task.projectPid },
    { id: y.taskId, overdue: y.task.overdue, priority: y.task.priority, dueDate: y.task.dueDate, projectPid: y.task.projectPid },
  ));
}

export function DayCell({
  day, segments, focusProjectId, compact, today, maxSegments = 8, inert, cellWidth, tabIndex, dataRow, dataCol, onHover, onLeave, onClick,
}: {
  day: CapacityDay;
  /** null = no itemisation in the payload → plain fill; [] = a genuinely free day. */
  segments: Segment[] | null;
  /** When set, segments of every OTHER project fade — the legend's hover/pin. */
  focusProjectId?: string | null;
  /** The person panel's own strip: shorter cells. */
  compact?: boolean;
  today?: boolean;
  /**
   * How many segments the cell can show before the tail collapses into one "+n" stub. Each
   * segment is at least 6px wide, so a 40px cell at the 30-day range fits five and no more —
   * beyond that the extras were clipped silently and a light day looked full.
   */
  maxSegments?: number;
  /** A display-only strip (the person panel): not a tab stop. */
  inert?: boolean;
  /** The cell's rendered width in px, when the board has measured it — turns on labels inside segments. */
  cellWidth?: number;
  /** Roving tabindex: the board makes ONE cell tabbable and moves focus with the arrow keys. */
  tabIndex?: number;
  dataRow?: number;
  dataCol?: number;
  onHover?: (e: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => void;
  onLeave?: () => void;
  onClick?: () => void;
}) {
  const working = day.capacity > 0;
  const s = STATE_STYLE[day.state];
  const load = day.load;
  // The cell's own capacity: 8h for a day, the week's working hours for a rolled-up week cell.
  const cap = working ? day.capacity : DAILY_CAPACITY;
  const over = working && load > cap + 0.05;
  // Scale so a full day fills the track and an overloaded one compresses rather than clips —
  // every task stays visible, and the neutral edge says the day is over.
  const scale = Math.max(cap, load);
  const when = day.weekOf ? `Week of ${formatDate(day.weekOf, { month: 'short', day: 'numeric' })}` : formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' });
  const label = working
    ? `${when} · ${load}h of ${day.capacity}h${over ? ` · over by ${Math.round((load - cap) * 10) / 10}h` : ''}`
    : `${when} · ${day.note ?? s.label}`;
  const innerWidth = cellWidth ? Math.max(0, cellWidth - 4) : 0; // inset-0.5 on both sides

  const legacy = working && segments === null;
  const pendingLeave = day.state === 'LEAVE_PENDING';
  // The tail beyond the cell's capacity collapses into one stub; the hover lists everything.
  const shown = segments && segments.length > maxSegments ? segments.slice(0, maxSegments - 1) : segments;
  const hidden = segments && shown ? segments.length - shown.length : 0;
  const taskWord = segments ? ` · ${segments.length} ${segments.length === 1 ? 'task' : 'tasks'}` : '';

  return (
    <button
      type="button"
      aria-label={label + (working ? taskWord : '')}
      tabIndex={inert ? -1 : tabIndex}
      data-row={dataRow}
      data-col={dataCol}
      onMouseEnter={onHover}
      onFocus={onHover}
      onMouseLeave={onLeave}
      onBlur={onLeave}
      onClick={onClick}
      className={clsx(
        'relative w-full rounded-md border text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        compact ? 'h-7' : 'h-9',
        !working && s.cell,
        working && !pendingLeave && 'border-emerald-200',
        working && pendingLeave && s.cell,
        working && 'cursor-pointer hover:shadow-sm',
        !working && 'cursor-default',
        today && 'border-l-2 border-l-gray-900',
      )}
      style={{
        ...(working ? { backgroundColor: FREE_BASE.bg } : {}),
        ...(over ? { borderColor: OVER_COMMITTED, borderWidth: 2 } : {}),
        // The legacy fill, only when the API gave no itemisation: darker green = fuller day.
        ...(legacy ? { backgroundImage: `linear-gradient(90deg, rgba(5,150,105,0.35) ${Math.min(100, day.utilization * 100)}%, transparent ${Math.min(100, day.utilization * 100)}%)` } : {}),
      }}
    >
      {working && shown && shown.length > 0 && (
        <div className="absolute inset-0.5 flex gap-px overflow-hidden rounded-[3px]">
          {shown.map(seg => {
            const faded = !!focusProjectId && seg.task.projectId !== focusProjectId;
            const px = innerWidth * (seg.hours / scale);
            const text = px >= LABEL_MIN_PX ? segmentLabel(seg.task) : null;
            const hours = px >= LABEL_HOURS_MIN_PX ? `${Math.round(seg.hours * 10) / 10}h` : null;
            return (
              <div
                key={seg.taskId}
                className="relative h-full shrink-0 overflow-hidden rounded-[2px] transition-opacity"
                style={{
                  width: `max(6px, ${(seg.hours / scale) * 100}%)`,
                  backgroundColor: seg.fill,
                  ...textureStyle(seg.hue.texture),
                  boxShadow: SEGMENT_RING,
                  opacity: faded ? 0.25 : 1,
                }}
              >
                {text && (
                  <span
                    className="pointer-events-none absolute inset-x-0 top-0 truncate px-1 font-mono text-[9px] leading-[14px]"
                    style={{ color: textOnFill(seg.task.priority), bottom: seg.rail ? 3 : 0 }}
                  >
                    {text}{hours && <span className="opacity-80"> {hours}</span>}
                  </span>
                )}
                {seg.rail && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-[3px] border-t border-white"
                    style={{ background: seg.rail }}
                  />
                )}
              </div>
            );
          })}
          {hidden > 0 && (
            <div
              className="relative h-full shrink-0 rounded-[2px]"
              title={`+${hidden} more`}
              style={{ width: '6px', background: 'repeating-linear-gradient(45deg, #374151 0 2px, #ffffff 2px 4px)', boxShadow: SEGMENT_RING }}
            />
          )}
        </div>
      )}
      {/* Over 8h: a neutral corner mark, the same idiom as a spreadsheet note. Not red. */}
      {over && (
        <span className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent" style={{ borderTopColor: OVER_COMMITTED }} />
      )}
      {day.state === 'LEAVE' && <Plane size={11} className="absolute inset-0 m-auto text-purple-500" />}
      {pendingLeave && <Plane size={10} className={clsx('absolute top-1 text-purple-500', over ? 'left-1' : 'right-1')} />}
      {day.state === 'HOLIDAY' && <Flag size={11} className="absolute inset-0 m-auto text-amber-500" />}
    </button>
  );
}

/** The state legend for the retrospective (attendance) view, which has no segments. */
export function CapacityLegend({ states }: { states?: DayState[] } = {}) {
  const keys = states ?? (Object.keys(STATE_STYLE) as DayState[]);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
      {keys.map(st => (
        <span key={st} className="inline-flex items-center gap-1.5">
          <span className={clsx('h-2.5 w-2.5 rounded-sm', STATE_STYLE[st].dot)} />{STATE_STYLE[st].label}
        </span>
      ))}
    </div>
  );
}
