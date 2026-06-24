'use client';

import clsx from 'clsx';

type GanttTask = {
  id: string;
  title: string;
  assignee: string;
  assigneeColor: string;
  start: string; // 'YYYY-MM-DD'
  end: string;   // 'YYYY-MM-DD'
  statusColor: string;
  milestone?: string;
  progress: number; // 0-100
};

const GANTT_TASKS: GanttTask[] = [
  { id: 't1', title: 'Define information architecture', assignee: 'SA', assigneeColor: 'bg-orange-500', start: '2026-06-01', end: '2026-06-15', statusColor: '#16a34a', milestone: 'Phase 1', progress: 100 },
  { id: 't2', title: 'Create wireframes', assignee: 'CP', assigneeColor: 'bg-pink-500', start: '2026-06-10', end: '2026-07-01', statusColor: '#3d8de2', milestone: 'Phase 1', progress: 60 },
  { id: 't3', title: 'Design component library', assignee: 'CP', assigneeColor: 'bg-pink-500', start: '2026-06-20', end: '2026-07-15', statusColor: '#64748b', milestone: 'Phase 1', progress: 20 },
  { id: 't4', title: 'Implement responsive navbar', assignee: 'BT', assigneeColor: 'bg-blue-500', start: '2026-07-01', end: '2026-07-28', statusColor: '#64748b', milestone: undefined, progress: 0 },
  { id: 't5', title: 'SEO audit', assignee: 'AK', assigneeColor: 'bg-green-500', start: '2026-07-15', end: '2026-08-05', statusColor: '#64748b', milestone: undefined, progress: 0 },
  { id: 't6', title: 'Performance benchmark', assignee: 'BT', assigneeColor: 'bg-blue-500', start: '2026-06-15', end: '2026-07-10', statusColor: '#7c3aed', milestone: 'Phase 1', progress: 75 },
];

// Timeline: June 1 – August 31, 2026 = 92 days
const TIMELINE_START = new Date('2026-06-01');
const TIMELINE_END = new Date('2026-08-31');
const TOTAL_DAYS = 92;

const MONTHS = [
  { label: 'June 2026', days: 30, startDay: 0 },
  { label: 'July 2026', days: 31, startDay: 30 },
  { label: 'August 2026', days: 31, startDay: 61 },
];

const STATUS_LEGEND = [
  { label: 'Open', color: '#64748b' },
  { label: 'In Progress', color: '#3d8de2' },
  { label: 'In Review', color: '#7c3aed' },
  { label: 'Closed', color: '#16a34a' },
];

function dayOffset(dateStr: string): number {
  const date = new Date(dateStr);
  const diff = Math.floor((date.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.min(diff, TOTAL_DAYS));
}

function todayOffset(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function pct(days: number): string {
  return `${((days / TOTAL_DAYS) * 100).toFixed(3)}%`;
}

// Group tasks by milestone for section headers
function buildRows(): Array<{ type: 'milestone'; label: string } | { type: 'task'; task: GanttTask }> {
  const rows: Array<{ type: 'milestone'; label: string } | { type: 'task'; task: GanttTask }> = [];
  const seen = new Set<string>();

  for (const task of GANTT_TASKS) {
    if (task.milestone && !seen.has(task.milestone)) {
      seen.add(task.milestone);
      rows.push({ type: 'milestone', label: task.milestone });
    }
    rows.push({ type: 'task', task });
  }

  return rows;
}

const ROW_HEIGHT = 44; // px
const HEADER_HEIGHT = 48; // px

export default function GanttView() {
  const rows = buildRows();
  const todayPct = todayOffset();
  const showToday = todayPct >= 0 && todayPct <= TOTAL_DAYS;

  // Week lines: every 7 days starting from day 7
  const weekLines: number[] = [];
  for (let d = 7; d < TOTAL_DAYS; d += 7) {
    weekLines.push(d);
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: task names */}
        <div className="w-60 shrink-0 border-r border-gray-200 flex flex-col">
          {/* Header spacer */}
          <div
            className="shrink-0 border-b border-gray-200 bg-gray-50 flex items-end px-4 pb-2"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</span>
          </div>

          {/* Task name rows */}
          <div className="flex-1 overflow-y-auto">
            {rows.map((row, i) => {
              if (row.type === 'milestone') {
                return (
                  <div
                    key={`m-${row.label}-${i}`}
                    className="flex items-center px-4 bg-gray-100 border-b border-gray-200"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{row.label}</span>
                  </div>
                );
              }

              const { task } = row;
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-4 border-b border-gray-100 hover:bg-gray-50"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className={clsx(
                      'w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
                      task.assigneeColor
                    )}
                  >
                    {task.assignee}
                  </div>
                  <span className="text-sm text-gray-800 truncate">{task.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: timeline */}
        <div className="flex-1 overflow-auto">
          {/* Month + week header */}
          <div
            className="relative border-b border-gray-200 bg-gray-50 shrink-0"
            style={{ height: HEADER_HEIGHT, minWidth: 700 }}
          >
            {/* Month labels */}
            {MONTHS.map((m) => (
              <div
                key={m.label}
                className="absolute top-0 flex items-start justify-start pt-2 px-3 border-r border-gray-300"
                style={{
                  left: pct(m.startDay),
                  width: pct(m.days),
                  height: '50%',
                }}
              >
                <span className="text-xs font-semibold text-gray-600">{m.label}</span>
              </div>
            ))}

            {/* Week number ticks in lower half */}
            {weekLines.map((d) => (
              <div
                key={d}
                className="absolute bottom-0 border-l border-gray-200"
                style={{ left: pct(d), height: '50%' }}
              />
            ))}

            {/* Today marker in header */}
            {showToday && (
              <div
                className="absolute top-0 bottom-0 border-l-2 border-red-400"
                style={{ left: pct(todayPct), borderStyle: 'dashed' }}
              />
            )}
          </div>

          {/* Task bars */}
          <div className="relative" style={{ minWidth: 700 }}>
            {/* Month divider lines */}
            {MONTHS.slice(1).map((m) => (
              <div
                key={m.label}
                className="absolute top-0 bottom-0 border-l border-gray-200"
                style={{ left: pct(m.startDay) }}
              />
            ))}

            {/* Week grid lines */}
            {weekLines.map((d) => (
              <div
                key={d}
                className="absolute top-0 bottom-0 border-l border-gray-100"
                style={{ left: pct(d), borderStyle: 'dotted' }}
              />
            ))}

            {/* Today line */}
            {showToday && (
              <div
                className="absolute top-0 bottom-0 z-10"
                style={{
                  left: pct(todayPct),
                  borderLeft: '2px dashed #f87171',
                }}
              />
            )}

            {/* Rows */}
            {rows.map((row, i) => {
              if (row.type === 'milestone') {
                return (
                  <div
                    key={`mb-${row.label}-${i}`}
                    className="bg-gray-100 border-b border-gray-200"
                    style={{ height: ROW_HEIGHT }}
                  />
                );
              }

              const { task } = row;
              const startDay = dayOffset(task.start);
              const endDay = dayOffset(task.end);
              const barWidth = Math.max(endDay - startDay, 1);

              return (
                <div
                  key={task.id}
                  className="relative border-b border-gray-100 hover:bg-gray-50"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Task bar */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
                    style={{
                      left: pct(startDay),
                      width: pct(barWidth),
                      height: 20,
                      backgroundColor: task.statusColor + '33',
                      border: `1.5px solid ${task.statusColor}`,
                    }}
                    title={`${task.title} (${task.progress}%)`}
                  >
                    {/* Progress fill */}
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${task.progress}%`,
                        backgroundColor: task.statusColor,
                        opacity: 0.85,
                      }}
                    />
                  </div>

                  {/* Progress label */}
                  {task.progress > 0 && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-xs font-medium pointer-events-none z-10"
                      style={{
                        left: `calc(${pct(startDay)} + 6px)`,
                        color: '#fff',
                        textShadow: '0 0 3px rgba(0,0,0,0.4)',
                      }}
                    >
                      {task.progress}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 border-t border-gray-200 px-6 py-3 flex items-center gap-6 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-2">Status</span>
        {STATUS_LEGEND.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-xs text-gray-600">{s.label}</span>
          </div>
        ))}
        {showToday && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="w-5 border-t-2 border-red-400" style={{ borderStyle: 'dashed' }} />
            <span className="text-xs text-gray-600">Today</span>
          </div>
        )}
      </div>
    </div>
  );
}
