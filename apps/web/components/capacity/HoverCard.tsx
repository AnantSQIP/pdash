'use client';

// The hover card for one person-day on the capacity board.
//
// A portal to <body> at position:fixed, placed from the cell's getBoundingClientRect — not an
// absolute card inside the row. The rows live in an overflow-y-auto region inside a card with
// overflow-hidden, under sticky group headers with their own stacking context: an in-row card
// is clipped at the right edge and the bottom, and z-fights the headers. A fixed card has none
// of those problems, and never scrolls with the grid (the owner closes it on scroll instead).

import { useLayoutEffect, useState } from 'react';
import type { CapacityDay, CapacityRow } from '@/lib/api';
import { Portal } from '@/components/ui/Portal';
import { formatDate } from '@/lib/date';
import { daysOverdue, textureStyle } from '@/lib/project-colors';
import { DAILY_CAPACITY, type Segment } from './grid';
import { pidLabel } from '@/lib/mock-data';

const WIDTH = 320;
const GAP = 6;
const MAX_ROWS = 6;

export type HoverTarget = { row: CapacityRow; day: CapacityDay; segments: Segment[] | null; rect: DOMRect };
/** What a cell hands over on hover; the rect is read when the delay elapses, not now. */
export type HoverIntent = { row: CapacityRow; day: CapacityDay; segments: Segment[] | null; el: HTMLElement };

/** The words beside the colour: never rely on the rail alone. */
export function dueText(seg: Segment, today: string): { text: string; cls: string } {
  const due = seg.task.dueDate;
  if (!due) return { text: 'No deadline', cls: 'text-gray-400' };
  switch (seg.deadline) {
    case 'overdue': return { text: `Overdue ${daysOverdue(due, today)}d`, cls: 'text-red-700 font-medium' };
    // Red, like its rail: a deadline that is today is not "soon", it is now.
    case 'today':   return { text: 'Due today', cls: 'text-red-700 font-medium' };
    case 'soon':    return { text: `Due ${formatDate(due)}`, cls: 'text-amber-700' };
    default:        return { text: `Due ${formatDate(due)}`, cls: 'text-gray-500' };
  }
}

export function priorityWord(p: string | null | undefined): string {
  const v = (p ?? 'MEDIUM').toUpperCase();
  return v.charAt(0) + v.slice(1).toLowerCase();
}

export function HoverCard({ target, today }: { target: HoverTarget; today: string }) {
  // A callback ref held in state, not a useRef: Portal renders nothing on its first pass (it
  // waits for mount), so on the first commit the card element does not exist yet and a ref
  // would be null when the layout effect ran — leaving the card parked at -9999px. Putting
  // the element in state re-runs the placement the moment it actually exists.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH?: number } | null>(null);

  // Measure after first paint, then place: below the cell, flipped above if that overflows,
  // clamped to the viewport, and capped in height as a last resort.
  useLayoutEffect(() => {
    if (!el) return;
    const r = target.rect;
    const h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.min(Math.max(8, r.left), vw - WIDTH - 8);
    let top = r.bottom + GAP;
    let maxH: number | undefined;
    if (top + h > vh - 8) top = r.top - GAP - h;
    if (top < 8) { top = 8; maxH = vh - 16; }
    setPos({ left, top, maxH });
  }, [target, el]);

  const { row, day, segments } = target;
  const working = day.capacity > 0;
  const cap = working ? day.capacity : DAILY_CAPACITY;
  const over = working && day.load > cap + 0.05;
  const free = Math.max(0, cap - day.load);
  const when = day.weekOf
    ? `week of ${formatDate(day.weekOf, { day: 'numeric', month: 'short' })}`
    : formatDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' });
  const shown = (segments ?? []).slice(0, MAX_ROWS);
  const more = (segments?.length ?? 0) - shown.length;

  return (
    <Portal>
      <div
        ref={setEl}
        role="tooltip"
        className="pointer-events-none fixed z-[70] rounded-lg bg-white p-3 text-xs shadow-lg ring-1 ring-gray-200"
        style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxHeight: pos?.maxH, overflow: 'hidden' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-gray-900">{row.name.split(' ')[0]} · {when}</span>
          {working ? (
            over
              // Neutral, not red: red on this board means a task is late; too much on one day is the dark edge.
              ? <span className="font-semibold text-gray-900 tabular-nums">{day.load}h of {cap}h · over by {Math.round((day.load - cap) * 10) / 10}h</span>
              : day.load > 0
                ? <span className="text-gray-600 tabular-nums">{day.load}h of {cap}h · <span className="text-emerald-700">{Math.round(free * 10) / 10}h free</span></span>
                : <span className="font-medium text-emerald-700">{day.weekOf ? 'Free all week' : 'Free all day'}</span>
          ) : (
            <span className="text-gray-500">{day.note ?? day.state.toLowerCase().replace('_', ' ')}</span>
          )}
        </div>
        {day.state === 'LEAVE_PENDING' && day.note && (
          <p className="mt-0.5 text-[11px] text-purple-700">{day.note}</p>
        )}

        {shown.length > 0 && (
          <ul className="mt-2.5 space-y-2">
            {shown.map(seg => {
              const due = dueText(seg, today);
              const pid = seg.task.projectPid ? pidLabel(seg.task.projectPid, seg.task.projectRound) : null;
              return (
                <li key={seg.taskId} className="flex gap-2">
                  <span className="relative mt-0.5 h-2.5 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: seg.fill, ...textureStyle(seg.hue.texture) }}>
                    {seg.rail && <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: seg.rail }} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {pid && <span className="font-mono text-[10.5px] text-gray-500">{pid} · </span>}
                        <span className="text-gray-700">{seg.task.project ?? (seg.task.isTeamWork ? 'Team space' : '—')}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-gray-900">{Math.round(seg.hours * 10) / 10}h</span>
                    </div>
                    <p className="truncate font-medium text-gray-900">{seg.task.title}</p>
                    <p className="text-[11px] text-gray-500">
                      {priorityWord(seg.task.priority)} · <span className={due.cls}>{due.text}</span>
                      {seg.task.ownDeadline && <span className="text-gray-400"> (own{seg.task.taskDueDate ? `; task ${formatDate(seg.task.taskDueDate)}` : ''})</span>}
                      {' · '}{seg.task.remainingHours}h left
                    </p>
                    {seg.task.estimatedHours != null && (
                      <p className="text-[11px] text-gray-400 tabular-nums">
                        {seg.task.loggedHours ?? 0}h logged of {seg.task.estimatedHours}h estimated
                        {seg.task.overEstimate && <span className="text-amber-700"> · over the estimate</span>}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {more > 0 && <p className="mt-2 text-[11px] text-gray-500">+{more} more — click the name for the full plan</p>}
        {working && shown.length === 0 && segments && (
          <p className="mt-2 text-[11px] text-gray-400">Nothing scheduled — click for the plan; assign from there.</p>
        )}
      </div>
    </Portal>
  );
}
