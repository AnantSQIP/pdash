'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { api, type TimesheetCalendarDay } from '@/lib/api';

// Color key for each day's fill status. Graded: full 8h = green, 4–8h = amber, under 4h = red.
const STATUS_META: Record<TimesheetCalendarDay['status'], { label: string; cell: string; dot: string }> = {
  COMPLETE:   { label: 'Full (8h)',      cell: 'bg-green-100 border-green-300 text-green-800',   dot: 'bg-green-500' },
  PARTIAL:    { label: '4–8h',           cell: 'bg-amber-100 border-amber-300 text-amber-800',   dot: 'bg-amber-500' },
  LOW:        { label: 'Under 4h',       cell: 'bg-red-100 border-red-300 text-red-700',         dot: 'bg-red-500' },
  LEAVE:      { label: 'On leave',       cell: 'bg-blue-50 border-blue-100 text-blue-600',       dot: 'bg-blue-400' },
  HOLIDAY:    { label: 'Holiday',        cell: 'bg-purple-50 border-purple-100 text-purple-600', dot: 'bg-purple-400' },
  WEEKEND:    { label: 'Weekend',        cell: 'bg-gray-50 border-gray-100 text-gray-400',       dot: 'bg-gray-300' },
  FUTURE:     { label: 'Upcoming',       cell: 'bg-white border-gray-100 text-gray-300',         dot: 'bg-gray-200' },
};
const ORDER: TimesheetCalendarDay['status'][] = ['COMPLETE', 'PARTIAL', 'LOW', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'FUTURE'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A month calendar showing whether each day's 8h (or half-day 4h) timesheet is filled. */
export function TimesheetCalendar() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });

  const { data, isLoading } = useQuery({
    queryKey: ['ts-calendar', cursor.year, cursor.month],
    queryFn: () => api.timesheets.calendar(cursor.year, cursor.month),
    staleTime: 30_000,
  });

  const byDate = new Map((data?.days ?? []).map(d => [d.date, d]));
  // Build the grid: pad to the first Monday.
  const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const lastDay = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const leadPad = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const cells: (string | null)[] = [...Array(leadPad).fill(null)];
  for (let i = 1; i <= lastDay; i++) cells.push(new Date(Date.UTC(cursor.year, cursor.month - 1, i)).toISOString().slice(0, 10));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const move = (delta: number) => setCursor(c => {
    const m = c.month + delta;
    if (m < 1) return { year: c.year - 1, month: 12 };
    if (m > 12) return { year: c.year + 1, month: 1 };
    return { year: c.year, month: m };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CalendarDays size={15} className="text-brand-600" /> Timesheet calendar</h3>
        <div className="flex items-center gap-0.5">
          <button onClick={() => move(-1)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><ChevronLeft size={15} /></button>
          <span className="text-xs font-medium text-gray-700 w-28 text-center">{monthName}</span>
          <button onClick={() => move(1)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500"><ChevronRight size={15} /></button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5 text-[10px] text-gray-500">
        {ORDER.map(s => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={clsx('w-2 h-2 rounded-sm', STATUS_META[s].dot)} /> {STATUS_META[s].label}
          </span>
        ))}
      </div>

      {/* Compact grid — capped width so the tiles stay small on wide screens. */}
      <div className="grid grid-cols-7 gap-1 max-w-md">
        {WEEKDAYS.map(w => <div key={w} className="text-center text-[9px] font-semibold text-gray-400 uppercase pb-0.5">{w}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const cell = byDate.get(date);
          const meta = cell ? STATUS_META[cell.status] : STATUS_META.FUTURE;
          const day = parseInt(date.slice(8, 10), 10);
          const showHours = cell && cell.target > 0 && cell.status !== 'FUTURE';
          return (
            <div key={i}
              title={cell ? `${date} · ${meta.label}${cell.target > 0 ? ` · ${cell.logged}/${cell.target}h` : ''}` : date}
              className={clsx('h-9 rounded-md border flex flex-col items-center justify-center leading-none', meta.cell)}>
              <span className="text-[11px] font-semibold">{day}</span>
              {showHours && <span className="text-[8px] opacity-80 mt-0.5">{cell!.logged}/{cell!.target}h</span>}
            </div>
          );
        })}
      </div>
      {isLoading && <p className="text-[11px] text-gray-400 mt-2">Loading…</p>}
      <p className="text-[10px] text-gray-400 mt-2.5">Target 8h per working day (Mon–Fri), 4h on an approved half-day. Green = full, amber = 4–8h, red = under 4h. Weekends, holidays and leave aren’t required.</p>
    </div>
  );
}
