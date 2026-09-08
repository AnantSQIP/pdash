'use client';

// The board's key: which colour is which project, what the four depths mean, what the rails
// mean, and the day states that are not drawn as segments.
//
// The project chips are the one interactive thing here. Hovering one previews that project
// alone (every other project's segments fade); clicking pins it; Escape or a second click
// clears. With more than seven projects on a board two of them share a hue, and this is how the
// reader tells them apart in one gesture.

import { useEffect, useMemo, useState } from 'react';
import { Plane, Flag } from 'lucide-react';
import type { CapacityRow } from '@/lib/api';
import { type ProjectHue, NO_PROJECT_HUE, FREE_BASE, OVER_COMMITTED, RAIL, textureStyle } from '@/lib/project-colors';
import { pidLabel } from '@/lib/mock-data';

const RAMP = ['#3d3d3d', '#595959', '#808080', '#a8a8a8'];
const RAMP_LABEL = ['Critical', 'High', 'Medium', 'Low'];

export function BoardLegend({
  rows, hues, focusProjectId, onFocus, defaultPinned = null,
}: {
  rows: CapacityRow[];
  hues: Map<string, ProjectHue>;
  focusProjectId: string | null;
  onFocus: (projectId: string | null) => void;
  /** Start with this project pinned — the parent must seed its focus state with the same id. */
  defaultPinned?: string | null;
}) {
  const [pinned, setPinned] = useState<string | null>(defaultPinned);

  // Every project with at least one open task on the board, by PID.
  const projects = useMemo(() => {
    const m = new Map<string, { id: string; pid: string | null; round?: number; title: string }>();
    for (const r of rows) for (const t of r.openTasks) {
      if (!t.projectId || t.isTeamWork || m.has(t.projectId)) continue;
      m.set(t.projectId, { id: t.projectId, pid: t.projectPid ?? null, round: t.projectRound, title: t.project ?? '' });
    }
    return [...m.values()].sort((a, b) => (a.pid ?? '~').localeCompare(b.pid ?? '~') || a.title.localeCompare(b.title));
  }, [rows]);

  useEffect(() => {
    if (!pinned) return;
    // Escape clears the pin — unless a dialog is open, in which case Escape is the dialog's.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setPinned(null); onFocus(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned, onFocus]);

  // The pin lives in the parent's focus state; if this legend goes away (range change, past
  // view) the board must not stay faded with nothing left on screen to clear it.
  useEffect(() => () => onFocus(null), [onFocus]);
  // And if the parent clears the focus (a range or project change), the pin goes with it —
  // otherwise the chip stays pressed while nothing on the board is faded, and hover-preview
  // stays disabled.
  useEffect(() => { if (pinned && focusProjectId !== pinned) setPinned(null); }, [focusProjectId, pinned]);

  const hasTeamWork = useMemo(() => rows.some(r => r.openTasks.some(t => t.isTeamWork)), [rows]);

  const preview = (id: string | null) => { if (!pinned) onFocus(id); };
  const pin = (id: string) => {
    const next = pinned === id ? null : id;
    setPinned(next);
    onFocus(next);
  };

  if (rows.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-[11px] text-gray-600 rounded-b-xl">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Projects */}
        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {projects.map(p => {
              const hue = hues.get(p.id);
              const active = focusProjectId === p.id;
              const faded = !!focusProjectId && !active;
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => preview(p.id)}
                  onMouseLeave={() => preview(null)}
                  onClick={() => pin(p.id)}
                  aria-pressed={pinned === p.id}
                  title={`${p.pid ? pidLabel(p.pid, p.round) + ' · ' : ''}${p.title}${pinned === p.id ? ' — pinned; click or press Escape to clear' : ' — click to pin'}`}
                  className="inline-flex max-w-[240px] items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-opacity hover:bg-white"
                  style={{ opacity: faded ? 0.4 : 1, ...(pinned === p.id ? { boxShadow: `inset 0 0 0 1px ${hue?.ring ?? '#d1d5db'}`, backgroundColor: hue?.tint } : {}) }}
                >
                  <span className="h-2.5 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: hue?.medium ?? '#6b7280', ...textureStyle(hue?.texture ?? 'none') }} />
                  {p.pid && <span className="font-mono text-[10.5px] text-gray-500">{pidLabel(p.pid, p.round)}</span>}
                  <span className="truncate text-gray-700">{p.title}</span>
                </button>
              );
            })}
            {hasTeamWork && (
              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 text-gray-600" title="Work in a team space — no client matter, no PID">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: NO_PROJECT_HUE.medium }} />Team space
              </span>
            )}
          </div>
        )}

        <span className="hidden h-4 w-px bg-gray-200 sm:block" />

        {/* Priority depth */}
        <div className="inline-flex items-center gap-1.5" title="Within a project's colour, darker means more urgent">
          {RAMP.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-3.5 rounded-sm" style={{ backgroundColor: c }} />
              <span className="text-gray-500">{RAMP_LABEL[i]}</span>
            </span>
          ))}
        </div>

        <span className="hidden h-4 w-px bg-gray-200 sm:block" />

        {/* Deadline rails */}
        <span className="inline-flex items-center gap-1.5">
          <span className="relative h-2.5 w-3.5 rounded-sm bg-gray-400">
            <span className="absolute inset-x-0 bottom-0 h-[3px] border-t border-white" style={{ background: RAIL.overdue }} />
          </span>Overdue / due today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative h-2.5 w-3.5 rounded-sm bg-gray-400">
            <span className="absolute inset-x-0 bottom-0 h-[3px] border-t border-white" style={{ background: `repeating-linear-gradient(90deg, ${RAIL.dueSoon} 0 3px, #fff 3px 5px)` }} />
          </span>Due in ≤2 working days
        </span>

        <span className="hidden h-4 w-px bg-gray-200 sm:block" />

        {/* Day states */}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border" style={{ backgroundColor: FREE_BASE.bg, borderColor: FREE_BASE.border }} />Free = unallocated hours</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-sm bg-purple-100 text-purple-500"><Plane size={8} /></span>Leave</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-purple-400" />Leave pending</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-sm bg-amber-100 text-amber-500"><Flag size={8} /></span>Holiday</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gray-100" />Weekend</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative mb-1 h-2.5 w-3.5 rounded-sm border" style={{ backgroundColor: FREE_BASE.bg, borderColor: FREE_BASE.border }}>
            <span className="absolute inset-x-0 h-[2px] rounded-full" style={{ bottom: -4, backgroundColor: OVER_COMMITTED }} />
          </span>More than 8h that day
        </span>

        <span className="ml-auto text-gray-400">Label inside a bar = the PID's serial · black line under a day = more than 8h planned · red rail = that task is late</span>
      </div>
    </div>
  );
}
