'use client';

// The board's totals: one per person at the end of the row, one per day under the header.
//
// Capacity tools that people actually use (Float, Jira's capacity view, ClickUp's workload)
// all put allocated-vs-available directly beside the schedule, in three bands — under, at,
// over — rather than a single alarm. The bands here are the same three the board already draws
// in its cells: green while there is room, amber as a day fills, and the black of the line under
// an over-planned day for "over", never red (red on this board means a task is late).

import clsx from 'clsx';
import type { CapacityRow, CapacityDay } from '@/lib/api';
import { OVER_COMMITTED } from '@/lib/project-colors';

export type Unit = 'hours' | 'percent';

/** under → at → over, on the same thresholds the day cells use. */
export function loadBand(load: number, capacity: number): 'under' | 'at' | 'over' | 'none' {
  if (capacity <= 0) return 'none';
  const u = load / capacity;
  if (u > 1.006) return 'over';
  if (u >= 0.75) return 'at';
  return 'under';
}

const BAND_FILL: Record<ReturnType<typeof loadBand>, string> = {
  under: '#34d399',       // emerald-400
  at: '#fbbf24',          // amber-400
  over: OVER_COMMITTED,   // the cell edge's neutral
  none: '#e5e7eb',
};

export type DayTotal = {
  date: string;
  /** Hours planned across everyone with a working day. */
  load: number;
  /** Hours available across everyone with a working day (8 each). */
  capacity: number;
  /** People with a working day. */
  working: number;
  /** People with a working day and under a quarter loaded. */
  free: number;
  /** People over their day. */
  over: number;
};

/** Column totals — the team's load on each day of the window. */
export function teamTotals(rows: CapacityRow[]): DayTotal[] {
  const first = rows[0]?.days ?? [];
  return first.map((_, i) => {
    let load = 0, capacity = 0, working = 0, free = 0, over = 0;
    for (const r of rows) {
      const d: CapacityDay | undefined = r.days[i];
      if (!d || d.capacity <= 0) continue;
      working++; load += d.load; capacity += d.capacity;
      if (d.utilization <= 0.25) free++;
      if (d.load > d.capacity + 0.05) over++;
    }
    return { date: first[i].date, load: Math.round(load * 10) / 10, capacity, working, free, over };
  });
}

function pct(load: number, capacity: number) { return capacity > 0 ? Math.round((load / capacity) * 100) : 0; }

/**
 * The whole window, across everybody on the board: hours planned, hours available, and the share
 * one is of the other.
 *
 * "39h allocated out of 800" is two numbers a reader has to divide in their head, and the answer —
 * 5% — is the thing being asked. It lives here, beside the per-day and per-person totals, so it is
 * derived from exactly the same capacity figure those are; computed a second time somewhere else
 * it would eventually disagree with the bars underneath it, and then neither number is believed.
 */
export type WindowTotal = {
  load: number;
  capacity: number;
  /**
   * The share of capacity planned, 0–100+, or NULL when there is no capacity to be a share of.
   * A percentage of nothing is undefined, not zero: a week that is entirely holiday has no hours
   * to allocate, and printing "0%" there would report a fully idle organisation when in fact
   * nobody was due in at all. The UI shows a dash. (Printing it as a number at all would have to
   * be NaN or Infinity, which is how a division like this usually reaches a screen.)
   */
  pct: number | null;
};

export function windowTotal(rows: CapacityRow[]): WindowTotal {
  let load = 0, capacity = 0;
  for (const r of rows) { load += r.committedHours; capacity += r.capacityHours; }
  return {
    load: Math.round(load),
    capacity: Math.round(capacity),
    pct: capacity > 0 ? Math.round((load / capacity) * 100) : null,
  };
}

/** "39h of 800h · 5%" — both, always: the hours are what you act on, the share is the health. */
export function windowTotalText(t: WindowTotal): string {
  return `${t.load}h of ${t.capacity}h · ${t.pct === null ? '—' : `${t.pct}%`}`;
}

/** The words under the number, saying what the share is of. */
export function windowTotalHint(t: WindowTotal): string {
  return t.pct === null
    ? 'No working hours in this window — nobody is due in, so there is no share to report'
    : `${t.pct}% of the team's available hours in this window are allocated — ${t.load}h planned of ${t.capacity}h`;
}

/** One day's team total: a fill bar in the band's colour, the number beneath when the column is wide enough. */
export function DayTotalCell({ t, unit, wide }: { t: DayTotal; unit: Unit; wide: boolean }) {
  const band = loadBand(t.load, t.capacity);
  const ratio = t.capacity > 0 ? Math.min(1, t.load / t.capacity) : 0;
  const label = t.capacity === 0 ? '' : unit === 'percent' ? `${pct(t.load, t.capacity)}%` : `${Math.round(t.load)}h`;
  const title = t.capacity === 0
    ? 'Nobody working'
    : `Team · ${t.load}h of ${t.capacity}h planned (${pct(t.load, t.capacity)}%) · ${t.free} of ${t.working} free${t.over ? ` · ${t.over} over` : ''}`;
  return (
    <div className="flex flex-col items-center gap-0.5" title={title} aria-label={title}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/80">
        {t.capacity > 0 && <div className="h-full rounded-full" style={{ width: `${Math.max(ratio > 0 ? 6 : 0, ratio * 100)}%`, backgroundColor: BAND_FILL[band] }} />}
      </div>
      {wide && <span className={clsx('text-[9px] leading-none tabular-nums', band === 'over' ? 'font-semibold text-gray-900' : 'text-gray-500')}>{label}</span>}
    </div>
  );
}

/**
 * A person's total for the window: planned vs available as a bar in the band's colour, the words
 * beside it in hours or percent. Hours over capacity extend past the bar's end as a dark tail, so
 * "120%" and "over by 8h" are both readable at a glance.
 */
export function RowSummary({ row, unit, highlightHours }: {
  row: CapacityRow;
  unit: Unit;
  /** Hours of the window that belong to one project (the project tab) — drawn as a darker band inside the bar. */
  highlightHours?: number;
}) {
  const band = loadBand(row.committedHours, row.capacityHours);
  const ratio = row.capacityHours > 0 ? row.committedHours / row.capacityHours : 0;
  const shown = Math.min(1, ratio);
  const overTail = Math.min(0.5, Math.max(0, ratio - 1));
  const hi = highlightHours && row.capacityHours > 0 ? Math.min(shown, highlightHours / row.capacityHours) : 0;
  const words = unit === 'percent'
    ? `${row.utilization}% used`
    : `${row.committedHours}h of ${row.capacityHours}h`;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-end gap-1.5">
        <span className={clsx('text-[11px] font-medium tabular-nums', band === 'over' ? 'text-gray-900' : band === 'at' ? 'text-amber-700' : 'text-gray-600')}>{words}</span>
      </div>
      <div className="mt-1 flex h-1.5 w-full items-stretch overflow-hidden rounded-full bg-gray-200/80" title={`${row.committedHours}h planned of ${row.capacityHours}h · ${row.freeHours}h free${row.overCommittedHours > 0.05 ? ` · ${row.overCommittedHours}h over on some days` : ''}${highlightHours != null ? ` · ${Math.round(highlightHours * 10) / 10}h on this project` : ''}`}>
        <div className="relative h-full rounded-full" style={{ width: `${shown * 100}%`, backgroundColor: BAND_FILL[band] }}>
          {hi > 0 && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(hi / shown) * 100}%`, backgroundColor: 'rgba(17,24,39,0.45)' }} />}
        </div>
        {overTail > 0 && <div className="h-full" style={{ width: `${overTail * 100}%`, backgroundColor: OVER_COMMITTED }} />}
      </div>
    </div>
  );
}
