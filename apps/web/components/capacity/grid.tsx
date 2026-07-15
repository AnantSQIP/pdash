'use client';

// Shared visual language for capacity grids, used by both the full Team Capacity board
// and the per-project availability tab so the two never drift apart.

import clsx from 'clsx';
import { Plane, Flag } from 'lucide-react';
import type { CapacityDay, DayState } from '@/lib/api';
import { formatDate } from '@/lib/date';

// Free reads GREEN (opportunity), overloaded reads RED (risk) — the two states a manager
// acts on. Busy/light are calm blues so the greens and reds pop.
export const STATE_STYLE: Record<DayState, { cell: string; label: string; dot: string }> = {
  FREE:       { cell: 'bg-emerald-100 hover:bg-emerald-200 border-emerald-200',   label: 'Free',       dot: 'bg-emerald-400' },
  LIGHT:      { cell: 'bg-sky-100 hover:bg-sky-200 border-sky-200',               label: 'Light',      dot: 'bg-sky-300' },
  BUSY:       { cell: 'bg-brand-500 hover:bg-brand-600 border-brand-600',         label: 'Busy',       dot: 'bg-brand-500' },
  LEAVE:      { cell: 'bg-purple-100 border-purple-200 bg-stripes-purple',        label: 'On leave',   dot: 'bg-purple-300' },
  HOLIDAY:    { cell: 'bg-amber-100 border-amber-200',                            label: 'Holiday',    dot: 'bg-amber-300' },
  WEEKEND:    { cell: 'bg-gray-50 border-gray-100',                               label: 'Weekend',    dot: 'bg-gray-200' },
  // Past (actual-attendance) states:
  PRESENT:    { cell: 'bg-emerald-200 hover:bg-emerald-300 border-emerald-300',   label: 'Present',    dot: 'bg-emerald-500' },
  ABSENT:     { cell: 'bg-red-100 border-red-200',                                label: 'Absent',     dot: 'bg-red-300' },
  COMPOFF:    { cell: 'bg-indigo-500 hover:bg-indigo-600 border-indigo-600',      label: 'Worked (comp-off)', dot: 'bg-indigo-500' },
};

export const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export function dayOfWeek(iso: string) { return new Date(`${iso}T00:00:00Z`).getUTCDay(); }
export function dayNum(iso: string) { return new Date(`${iso}T00:00:00Z`).getUTCDate(); }
export function isToday(iso: string) { return iso === new Date().toISOString().slice(0, 10); }

export function DayCell({ day, onClick }: { day: CapacityDay; onClick?: () => void }) {
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

/** The state legend, shared by the board and the project tab. Pass `states` to show a
 *  subset (forward vs. history views use different vocabularies). */
export function CapacityLegend({ states }: { states?: DayState[] } = {}) {
  const keys = states ?? (Object.keys(STATE_STYLE) as DayState[]);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
      {keys.map(s => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={clsx('w-2.5 h-2.5 rounded-sm', STATE_STYLE[s].dot)} />{STATE_STYLE[s].label}
        </span>
      ))}
    </div>
  );
}
