'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { api, type TimesheetCalendarDay } from '@/lib/api';
import { WEEKDAYS_SHORT } from '@/lib/date';

// Color key for each day's fill status. Graded: full 8h = green, 4–8h = amber, under 4h = red.
// Aligned with the attendance calendar's palette so the SAME meaning is the SAME colour everywhere:
// green = full/present, amber = partial/half, red = under-target/absent, blue = leave, purple =
// holiday, gray = weekend.
const STATUS_META: Record<TimesheetCalendarDay['status'], { label: string; cell: string; dot: string }> = {
  COMPLETE:   { label: 'Full (8h)',  cell: 'bg-green-50 border-green-200 text-green-700',    dot: 'bg-green-500' },
  PARTIAL:    { label: '4–8h',       cell: 'bg-amber-50 border-amber-200 text-amber-700',    dot: 'bg-amber-500' },
  LOW:        { label: 'Under 4h',   cell: 'bg-red-50 border-red-200 text-red-700',          dot: 'bg-red-500' },
  LEAVE:      { label: 'On leave',   cell: 'bg-blue-50 border-blue-200 text-blue-700',       dot: 'bg-blue-500' },
  HOLIDAY:    { label: 'Holiday',    cell: 'bg-purple-50 border-purple-200 text-purple-700', dot: 'bg-purple-500' },
  WEEKEND:    { label: 'Weekend',    cell: 'bg-gray-50 border-gray-200 text-gray-400',       dot: 'bg-gray-300' },
  FUTURE:     { label: 'Upcoming',   cell: 'bg-white border-gray-100 text-gray-300',         dot: 'bg-gray-200' },
};
const LEGEND: TimesheetCalendarDay['status'][] = ['COMPLETE', 'PARTIAL', 'LOW', 'LEAVE', 'HOLIDAY'];
const WEEKDAYS = WEEKDAYS_SHORT; // Monday-first, shared with every other calendar

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A month calendar showing whether each day's 8h (or half-day 4h) timesheet is filled, with an
 *  insights panel alongside. Days are clickable — the parent shows that day's logged detail. */
export function TimesheetCalendar({ selectedDate, onSelectDate }: { selectedDate?: string; onSelectDate?: (date: string) => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['ts-calendar', cursor.year, cursor.month],
    queryFn: () => api.timesheets.calendar(cursor.year, cursor.month),
    staleTime: 30_000,
  });

  const days = data?.days ?? [];
  const byDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days]);

  // Month insights — fill the space beside the grid with something useful.
  const stats = useMemo(() => {
    const s = { COMPLETE: 0, PARTIAL: 0, LOW: 0, LEAVE: 0, HOLIDAY: 0, logged: 0, target: 0 };
    for (const d of days) {
      if (d.status in s) (s as Record<string, number>)[d.status]++;
      s.logged += d.logged;
      if (d.status !== 'FUTURE') s.target += d.target;
    }
    return s;
  }, [days]);
  const pct = stats.target > 0 ? Math.min(100, Math.round((stats.logged / stats.target) * 100)) : 0;

  // Build the grid: pad to the first Monday.
  const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const lastDay = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const leadPad = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const cells: (string | null)[] = [...Array(leadPad).fill(null)];
  for (let i = 1; i <= lastDay; i++) cells.push(new Date(Date.UTC(cursor.year, cursor.month - 1, i)).toISOString().slice(0, 10));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const todayKey = new Date().toISOString().slice(0, 10);
  const move = (delta: number) => setCursor(c => {
    const m = c.month + delta;
    if (m < 1) return { year: c.year - 1, month: 12 };
    if (m > 12) return { year: c.year + 1, month: 1 };
    return { year: c.year, month: m };
  });

  const StatRow = ({ status, count }: { status: TimesheetCalendarDay['status']; count: number }) => (
    <div className="flex items-center justify-between text-xs">
      <span className="inline-flex items-center gap-2 text-gray-600">
        <span className={clsx('w-2.5 h-2.5 rounded-sm', STATUS_META[status].dot)} /> {STATUS_META[status].label}
      </span>
      <span className="font-semibold text-gray-800 tabular-nums">{count}</span>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><CalendarDays size={16} className="text-brand-600" /> Timesheet calendar</h3>
        <div className="flex items-center gap-0.5">
          <button onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium text-gray-700 w-32 text-center">{monthName}</span>
          <button onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_248px] gap-5">
        {/* Calendar grid — flexible tiles that fill the column (comfortable height, no dead space). */}
        <div>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((date, i) => {
              if (!date) return <div key={i} />;
              const cell = byDate.get(date);
              const meta = cell ? STATUS_META[cell.status] : STATUS_META.FUTURE;
              const day = parseInt(date.slice(8, 10), 10);
              const showHours = cell && cell.target > 0 && cell.status !== 'FUTURE';
              const isToday = date === todayKey;
              const isSelected = date === selectedDate;
              const compPending = cell?.compOff === 'PENDING';
              const compApproved = cell?.compOff === 'APPROVED';
              // Any undecided leave/WFH/comp-off on this day. The hours are still owed (nothing
              // is approved yet) — the dashed amber outline just says "you've asked about this".
              const pend = cell?.pending;
              return (
                <button key={i} type="button" onClick={() => onSelectDate?.(date)}
                  title={cell ? `${date} · ${meta.label}${cell.target > 0 ? ` · ${round1(cell.logged)}/${cell.target}h` : ''}${compApproved ? ' · comp-off (worked)' : ''}${compPending ? ' · comp-off pending approval' : ''}${pend ? ` · ${pend.label} (awaiting approval)` : ''}` : date}
                  className={clsx('relative min-h-[72px] rounded-lg border flex flex-col items-center justify-center px-1 py-1.5 transition-all hover:brightness-95 focus:outline-none', meta.cell,
                    pend && 'border-dashed border-amber-400',
                    isToday && !isSelected && 'ring-2 ring-brand-300 ring-offset-1',
                    isSelected && 'ring-2 ring-brand-600 ring-offset-1 shadow-sm')}>
                  <span className="text-[15px] font-bold leading-none">{day}{compPending && <span className="text-amber-600" title="Comp-off pending approval">*</span>}</span>
                  {showHours && <span className="text-[13px] font-semibold opacity-90 mt-1.5 tabular-nums">{round1(cell!.logged)}/{cell!.target}h</span>}
                  {compApproved && <span className="absolute bottom-1 right-1 text-[8px] font-bold text-indigo-500" title="Comp-off (worked)">CO</span>}
                  {pend && !compPending && <span className="absolute bottom-1 left-1 text-[8px] font-bold text-amber-600" title={pend.label}>REQ</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Insights panel — month summary + legend. */}
        <div className="xl:border-l xl:border-gray-100 xl:pl-5 flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">This month</p>
            <div className="flex items-end justify-between mb-1">
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{round1(stats.logged)}<span className="text-sm font-medium text-gray-400">h</span></p>
                <p className="text-[11px] text-gray-400 mt-1">of {round1(stats.target)}h target</p>
              </div>
              <span className={clsx('text-sm font-semibold tabular-nums', pct >= 100 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-500')}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-400')} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="space-y-1.5">
            <StatRow status="COMPLETE" count={stats.COMPLETE} />
            <StatRow status="PARTIAL" count={stats.PARTIAL} />
            <StatRow status="LOW" count={stats.LOW} />
            <StatRow status="LEAVE" count={stats.LEAVE} />
            {stats.HOLIDAY > 0 && <StatRow status="HOLIDAY" count={stats.HOLIDAY} />}
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed mt-auto">
            Target 8h per working day (Mon–Fri), 4h on an approved half-day. Green = full, amber = 4–8h, red = under 4h. Weekends, holidays and leave aren’t required.
          </p>
          {isLoading && <p className="text-[11px] text-gray-400">Loading…</p>}
        </div>
      </div>
    </div>
  );
}
