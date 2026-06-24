'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const EVENTS = [
  { date: '2026-06-01', title: 'Apollo kickoff', type: 'milestone', color: '#3d8de2' },
  { date: '2026-06-10', title: 'Design Brief due', type: 'task', color: '#3d8de2' },
  { date: '2026-06-15', title: 'Phase 1 start', type: 'milestone', color: '#7c3aed' },
  { date: '2026-06-18', title: 'Wireframes review', type: 'task', color: '#fe841f' },
  { date: '2026-06-20', title: 'Component lib', type: 'task', color: '#3d8de2' },
  { date: '2026-06-24', title: 'Sprint 1 end', type: 'milestone', color: '#3d8de2' },
  { date: '2026-06-28', title: 'Brand guidelines', type: 'task', color: '#3d8de2' },
  { date: '2026-07-01', title: 'Phase 1 deadline', type: 'milestone', color: '#ef4444' },
  { date: '2026-07-10', title: 'Benchmark done', type: 'task', color: '#16a34a' },
  { date: '2026-07-15', title: 'Wireframes due', type: 'task', color: '#fe841f' },
  { date: '2026-07-22', title: 'Component lib done', type: 'task', color: '#3d8de2' },
  { date: '2026-07-28', title: 'Navbar done', type: 'task', color: '#3d8de2' },
  { date: '2026-08-05', title: 'SEO audit due', type: 'task', color: '#3d8de2' },
  { date: '2026-08-15', title: 'Apollo deadline', type: 'milestone', color: '#ef4444' },
];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TODAY = '2026-06-24';

type FilterType = 'All' | 'Tasks' | 'Milestones';

function getMonthGrid(year: number, month: number) {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: string; inMonth: boolean }[] = [];

  // Days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    cells.push({ date: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, inMonth: false });
  }

  // Days in current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
      inMonth: true,
    });
  }

  // Days from next month to fill 6 rows (42 cells)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 1 : month + 2;
    const y = month === 11 ? year + 1 : year;
    cells.push({ date: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, inMonth: false });
  }

  return cells;
}

export default function CalendarPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5); // June = 5 (0-indexed)
  const [filter, setFilter] = useState<FilterType>('All');

  const cells = getMonthGrid(year, month);

  const filteredEvents = EVENTS.filter(e => {
    if (filter === 'Tasks') return e.type === 'task';
    if (filter === 'Milestones') return e.type === 'milestone';
    return true;
  });

  const eventsByDate: Record<string, typeof EVENTS> = {};
  filteredEvents.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Upcoming this week: June 24–30
  const upcomingEvents = EVENTS.filter(e => e.date >= '2026-06-24' && e.date <= '2026-06-30');

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-0.5">Task and milestone schedule</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* Filter pills */}
          <div className="flex gap-2">
            {(['All','Tasks','Milestones'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800 w-24 text-center">
              {MONTHS[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAY_NAMES.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7">
            {cells.map((cell, idx) => {
              const dayNum = parseInt(cell.date.split('-')[2], 10);
              const isToday = cell.date === TODAY;
              const events = eventsByDate[cell.date] || [];
              const visible = events.slice(0, 2);
              const overflow = events.length - visible.length;
              const isLastRow = idx >= 35;
              const isLastCol = (idx % 7) === 6;

              return (
                <div
                  key={cell.date}
                  className={`min-h-24 p-1.5 ${cell.inMonth ? 'bg-white' : 'bg-gray-50'} ${
                    !isLastRow ? 'border-b border-gray-100' : ''
                  } ${!isLastCol ? 'border-r border-gray-100' : ''}`}
                >
                  {/* Day number */}
                  <div className="flex justify-end mb-1">
                    {isToday ? (
                      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-brand-600 text-white text-xs font-semibold">
                        {dayNum}
                      </span>
                    ) : (
                      <span className={`text-xs font-medium ${cell.inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                        {dayNum}
                      </span>
                    )}
                  </div>

                  {/* Events */}
                  <div className="space-y-0.5">
                    {visible.map(e => (
                      <div
                        key={e.date + e.title}
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white truncate"
                        style={{ backgroundColor: e.color }}
                        title={e.title}
                      >
                        {e.title}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="text-[10px] text-gray-400 pl-1">+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming This Week */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Upcoming This Week</h2>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-400">No events this week.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingEvents.map(e => (
                <li key={e.date + e.title} className="flex items-center gap-3">
                  <div
                    className="w-1 h-8 rounded-full shrink-0"
                    style={{ backgroundColor: e.color }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{e.title}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' '}
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        e.type === 'milestone' ? 'bg-brand-100 text-brand-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {e.type === 'milestone' ? 'Milestone' : 'Task'}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
