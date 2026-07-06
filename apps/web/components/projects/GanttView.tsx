'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { CalendarRange } from 'lucide-react';
import type { ApiTask, ApiProject } from '@/lib/api';
import { Avatar } from '@/components/Avatar';

const DAY_MS = 1000 * 60 * 60 * 24;
const ROW_HEIGHT = 44; // px
const HEADER_HEIGHT = 48; // px
const DAY_WIDTH = 24; // px per day on the timeline
const DEFAULT_BAR_DAYS = 7; // span for tasks that only have a due date
const BRAND = '#3d8de2';
const ACCENT = '#E8533A';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Parse a 'YYYY-MM-DD' (or ISO) string to a day-aligned Date, or null. */
function parseDay(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Whole-day difference (b - a). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Row = {
  task: ApiTask;
  start: Date;
  end: Date;
  color: string;
  /** true when the start was derived (task had no real startDate). */
  derivedStart: boolean;
};

export default function GanttView({ tasks, project }: { tasks: ApiTask[]; project: ApiProject }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Three scroll panes kept in sync: the left task list (vertical), the timeline
  // header (horizontal), and the timeline body (both axes — the source of truth).
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const didInit = useRef(false);

  const today = useMemo(() => startOfDay(new Date()), []);

  // Build a resolved row (with concrete start/end dates) for each task.
  const rows = useMemo<Row[]>(() => {
    const projectStart = parseDay(project.startDate);
    return tasks.map((task) => {
      const realStart = parseDay(task.startDate);
      const due = parseDay(task.dueDate);
      let start: Date;
      let end: Date;
      let derivedStart = false;

      if (realStart && due) {
        start = realStart;
        end = due < realStart ? realStart : due;
      } else if (realStart) {
        start = realStart;
        end = addDays(realStart, DEFAULT_BAR_DAYS);
      } else if (due) {
        derivedStart = true;
        start = addDays(due, -DEFAULT_BAR_DAYS);
        end = due;
      } else {
        derivedStart = true;
        start = projectStart ?? today;
        end = addDays(start, DEFAULT_BAR_DAYS);
      }

      return { task, start, end, color: task.currentStatus?.colorHex || BRAND, derivedStart };
    });
  }, [tasks, project.startDate, today]);

  // Timeline window: min/max of all task dates, padded; fall back to project dates.
  const { timelineStart, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    for (const r of rows) dates.push(r.start, r.end);
    const projStart = parseDay(project.startDate);
    const projEnd = parseDay(project.dueDate);
    if (projStart) dates.push(projStart);
    if (projEnd) dates.push(projEnd);
    dates.push(today);

    let min = dates[0];
    let max = dates[0];
    for (const d of dates) {
      if (d < min) min = d;
      if (d > max) max = d;
    }
    const paddedStart = addDays(min, -3);
    const snappedStart = new Date(paddedStart.getFullYear(), paddedStart.getMonth(), 1);
    const paddedEnd = addDays(max, 5);
    const span = Math.max(daysBetween(snappedStart, paddedEnd), 14);
    return { timelineStart: startOfDay(snappedStart), totalDays: span };
  }, [rows, project.startDate, project.dueDate, today]);

  const months = useMemo(() => {
    const segments: { label: string; offset: number; days: number }[] = [];
    const end = addDays(timelineStart, totalDays);
    let cursor = new Date(timelineStart);
    while (cursor < end) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const segStart = cursor > monthStart ? cursor : monthStart;
      const segEnd = nextMonth < end ? nextMonth : end;
      segments.push({
        label: `${MONTH_NAMES[segStart.getMonth()]} ${segStart.getFullYear()}`,
        offset: daysBetween(timelineStart, segStart),
        days: Math.max(daysBetween(segStart, segEnd), 1),
      });
      cursor = nextMonth;
    }
    return segments;
  }, [timelineStart, totalDays]);

  const weekLines = useMemo(() => {
    const lines: number[] = [];
    for (let d = 7; d < totalDays; d += 7) lines.push(d);
    return lines;
  }, [totalDays]);

  const timelineWidth = totalDays * DAY_WIDTH;
  const todayOffset = daysBetween(timelineStart, today);
  const showToday = todayOffset >= 0 && todayOffset <= totalDays;

  // Keep the three panes aligned. Body is the source of truth.
  const onBodyScroll = useCallback(() => {
    if (syncing.current || !bodyRef.current) return;
    syncing.current = true;
    if (leftRef.current) leftRef.current.scrollTop = bodyRef.current.scrollTop;
    if (headerRef.current) headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);
  const onLeftScroll = useCallback(() => {
    if (syncing.current || !leftRef.current) return;
    syncing.current = true;
    if (bodyRef.current) bodyRef.current.scrollTop = leftRef.current.scrollTop;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  // On first open, scroll so TODAY sits near the left edge — past is reached by
  // scrolling left, future by scrolling right.
  useEffect(() => {
    if (didInit.current || !bodyRef.current || rows.length === 0) return;
    didInit.current = true;
    const left = Math.max(0, (todayOffset - 2) * DAY_WIDTH);
    bodyRef.current.scrollLeft = left;
    if (headerRef.current) headerRef.current.scrollLeft = left;
  }, [rows.length, todayOffset]);

  // Click a task (left list) → bring its bar forward: center it and highlight it.
  const selectTask = useCallback((taskId: string) => {
    setSelectedId(taskId);
    const idx = rows.findIndex(r => r.task.id === taskId);
    const el = bodyRef.current;
    if (idx < 0 || !el) return;
    const row = rows[idx];
    const barLeft = daysBetween(timelineStart, row.start) * DAY_WIDTH;
    const barWidth = Math.max(daysBetween(row.start, row.end), 1) * DAY_WIDTH;
    el.scrollTo({
      left: Math.max(0, barLeft + barWidth / 2 - el.clientWidth / 2),
      top: Math.max(0, idx * ROW_HEIGHT - el.clientHeight / 2 + ROW_HEIGHT / 2),
      behavior: 'smooth',
    });
  }, [rows, timelineStart]);

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-10 text-center">
        <CalendarRange className="mb-3 h-10 w-10 text-gray-300" strokeWidth={1.5} />
        <p className="text-sm font-medium text-gray-700">No tasks to schedule yet</p>
        <p className="mt-1 text-xs text-gray-400">Add tasks with start or due dates to see them on the timeline.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: task names + assignees (vertical scroll synced with the body) */}
        <div className="flex w-60 shrink-0 flex-col border-r border-gray-200">
          <div className="flex shrink-0 items-end border-b border-gray-200 bg-gray-50 px-4 pb-2" style={{ height: HEADER_HEIGHT }}>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Task</span>
          </div>
          <div ref={leftRef} onScroll={onLeftScroll} className="flex-1 overflow-y-auto">
            {rows.map(({ task, color }) => {
              const assignee = task.assignees?.[0]?.user;
              const selected = selectedId === task.id;
              return (
                <button
                  key={task.id}
                  onClick={() => selectTask(task.id)}
                  className={`flex w-full items-center gap-2 border-b border-gray-100 px-4 text-left transition-colors ${selected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                  style={{ height: ROW_HEIGHT }}
                  onMouseEnter={() => setHovered(task.id)}
                  onMouseLeave={() => setHovered((h) => (h === task.id ? null : h))}
                  title="Click to locate on the timeline"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                  {assignee ? (
                    <Avatar user={assignee} size={24} className="shrink-0" />
                  ) : (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-500">?</div>
                  )}
                  <span className={`truncate text-sm ${selected ? 'font-semibold text-brand-700' : 'text-gray-800'}`} title={task.title}>{task.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right column: fixed header + scrollable body */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Month + week header (horizontal scroll synced with the body) */}
          <div ref={headerRef} className="shrink-0 overflow-x-hidden border-b border-gray-200 bg-gray-50" style={{ height: HEADER_HEIGHT }}>
            <div className="relative" style={{ height: HEADER_HEIGHT, width: timelineWidth }}>
              {months.map((m) => (
                <div key={`${m.label}-${m.offset}`} className="absolute top-0 flex items-center border-r border-gray-300 px-2" style={{ left: m.offset * DAY_WIDTH, width: m.days * DAY_WIDTH, height: '50%' }}>
                  <span className="truncate text-xs font-semibold text-gray-600">{m.label}</span>
                </div>
              ))}
              {weekLines.map((d) => (
                <div key={`wk-${d}`} className="absolute bottom-0 flex items-center justify-center border-l border-gray-200" style={{ left: d * DAY_WIDTH, width: 7 * DAY_WIDTH, height: '50%' }}>
                  <span className="text-[10px] text-gray-400">{formatDate(addDays(timelineStart, d)).replace(/, \d{4}$/, '')}</span>
                </div>
              ))}
              {showToday && (
                <div className="absolute top-0 bottom-0 z-10 border-l-2 border-dashed" style={{ left: todayOffset * DAY_WIDTH, borderColor: ACCENT }} />
              )}
            </div>
          </div>

          {/* Bars (the scroll source of truth) */}
          <div ref={bodyRef} onScroll={onBodyScroll} className="flex-1 overflow-auto">
            <div className="relative" style={{ width: timelineWidth }}>
              {months.slice(1).map((m) => (
                <div key={`div-${m.offset}`} className="absolute top-0 bottom-0 border-l border-gray-200" style={{ left: m.offset * DAY_WIDTH }} />
              ))}
              {weekLines.map((d) => (
                <div key={`gl-${d}`} className="absolute top-0 bottom-0 border-l border-dotted border-gray-100" style={{ left: d * DAY_WIDTH }} />
              ))}
              {showToday && (
                <div className="absolute top-0 bottom-0 z-10 border-l-2 border-dashed" style={{ left: todayOffset * DAY_WIDTH, borderColor: ACCENT }} />
              )}

              {rows.map(({ task, start, end, color, derivedStart }, idx) => {
                const offset = daysBetween(timelineStart, start);
                const span = Math.max(daysBetween(start, end), 1);
                const left = offset * DAY_WIDTH;
                const width = span * DAY_WIDTH;
                const progress = Math.max(0, Math.min(100, task.completionPercentage ?? 0));
                const isHovered = hovered === task.id;
                const selected = selectedId === task.id;

                return (
                  <div
                    key={task.id}
                    className={`relative border-b border-gray-100 transition-colors ${selected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                    style={{ height: ROW_HEIGHT }}
                    onMouseEnter={() => setHovered(task.id)}
                    onMouseLeave={() => setHovered((h) => (h === task.id ? null : h))}
                  >
                    <div
                      className="absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md transition-all"
                      style={{
                        left,
                        width,
                        height: selected ? 26 : 22,
                        backgroundColor: `${color}26`,
                        border: `1.5px solid ${color}`,
                        borderStyle: derivedStart ? 'dashed' : 'solid',
                        boxShadow: selected ? `0 0 0 3px ${color}66` : undefined,
                        zIndex: selected ? 20 : undefined,
                      }}
                    >
                      <div className="absolute left-0 top-0 h-full" style={{ width: `${progress}%`, backgroundColor: color, opacity: 0.85 }} />
                      <span className="pointer-events-none relative z-10 truncate px-2 text-[11px] font-medium" style={{ color: progress > 50 ? '#fff' : '#374151', textShadow: progress > 50 ? '0 0 3px rgba(0,0,0,0.35)' : 'none' }}>
                        {progress}%
                      </span>
                    </div>

                    {isHovered && (
                      <div className="pointer-events-none absolute z-30 w-56 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg" style={{ top: ROW_HEIGHT - 4, left: Math.min(left, timelineWidth - 232) }}>
                        <p className="mb-1 truncate text-sm font-semibold text-gray-900">{task.title}</p>
                        <div className="space-y-1 text-xs text-gray-600">
                          <p><span className="text-gray-400">Dates: </span>{formatDate(start)} – {formatDate(end)}{derivedStart && <span className="text-gray-400"> (est.)</span>}</p>
                          <p className="flex items-center gap-1.5"><span className="text-gray-400">Status: </span><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{task.currentStatus?.name ?? 'No status'}</p>
                          <p><span className="text-gray-400">Complete: </span>{progress}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer legend */}
      <div className="flex shrink-0 items-center gap-4 border-t border-gray-200 bg-gray-50 px-6 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm border border-gray-300 border-dashed" /><span className="text-xs text-gray-600">Estimated start</span></span>
        <span className="hidden items-center gap-1.5 sm:flex text-gray-400"><span className="text-xs">·  Click a task on the left to locate it</span></span>
        {showToday && (
          <span className="ml-auto flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed" style={{ borderColor: ACCENT }} /><span className="text-xs text-gray-600">Today</span></span>
        )}
      </div>
    </div>
  );
}
