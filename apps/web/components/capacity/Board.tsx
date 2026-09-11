'use client';

// The capacity board itself — people × days, work drawn into each day — shared by the full Team
// Capacity page and the per-project Capacity tab so the two can never drift apart. The page and
// the tab own their filters, their data fetching and their panels; this owns everything inside
// the card: the day header with the team's load under each column, the rows with a total at the
// end of each, the legend, the hover card, the keyboard, and the "by week" roll-up.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Building2, Plus } from 'lucide-react';
import type { CapacityRow, CapacityDay, DayState } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { formatDate, todayIST } from '@/lib/date';
import { DOW, DayCell, dayOfWeek, dayNum, isToday, segmentsFor, projectsOf, holidaysOf, type Segment } from './grid';
import { BoardLegend } from './BoardLegend';
import { HoverCard, type HoverTarget, type HoverIntent } from './HoverCard';
import { assignProjectHues } from '@/lib/project-colors';
import { teamTotals, DayTotalCell, RowSummary, loadBand, windowTotal, windowTotalText, windowTotalHint, type Unit } from './totals';

export type BoardGroup = { key: string; label?: string; rows: CapacityRow[] };
export type Zoom = 'days' | 'weeks';

/** Human label for an office/branch grouping key. */
export const officeLabel = (o: string) => (o === 'GURGAON' ? 'Gurgaon' : o === 'JAIPUR' ? 'Jaipur' : o);

const COL_GAP = 4;       // the grid gap between day cells, px
const MIN_COL = 28;      // narrowest a day column may go before the board scrolls sideways
const NAME_W = 224;      // the member column (w-56)
const SUMMARY_W = 176;   // the totals column

/** Monday of the ISO week a `YYYY-MM-DD` day belongs to. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Roll a person's days up into weeks: hours summed per task, capacity summed over working days,
 * the state derived the way the API derives a day's. The cells are drawn by the same DayCell —
 * a week is just a wider box with more hours in it.
 */
function weeksOf(days: CapacityDay[], today: string): CapacityDay[] {
  const out: CapacityDay[] = [];
  let cur: (CapacityDay & { _tasks: Map<string, number>; _states: DayState[] }) | null = null;
  for (const d of days) {
    const wk = mondayOf(d.date);
    if (!cur || cur.weekOf !== wk) {
      if (cur) out.push(finish(cur));
      cur = { date: d.date, weekOf: wk, state: 'FREE', load: 0, capacity: 0, utilization: 0, free: 0, tasks: [], _tasks: new Map(), _states: [] };
    }
    cur.load += d.load; cur.capacity += d.capacity; cur._states.push(d.state);
    for (const t of d.tasks ?? []) cur._tasks.set(t.taskId, (cur._tasks.get(t.taskId) ?? 0) + t.hours);
  }
  if (cur) out.push(finish(cur));
  return out;

  function finish(w: NonNullable<typeof cur>): CapacityDay {
    const load = Math.round(w.load * 100) / 100;
    const tasks = [...w._tasks].map(([taskId, hours]) => ({ taskId, hours: Math.round(hours * 100) / 100 })).filter(t => t.hours > 0).sort((a, b) => b.hours - a.hours);
    const utilization = w.capacity > 0 ? load / w.capacity : 0;
    let state: DayState;
    if (w.capacity === 0) state = w._states.includes('LEAVE') ? 'LEAVE' : w._states.includes('HOLIDAY') ? 'HOLIDAY' : 'WEEKEND';
    else if (w._states.includes('LEAVE_PENDING')) state = 'LEAVE_PENDING';
    else state = utilization >= 0.75 ? 'BUSY' : utilization > 0.25 ? 'LIGHT' : 'FREE';
    const note = w.capacity === 0 ? (state === 'LEAVE' ? 'On leave all week' : state === 'HOLIDAY' ? 'Holiday' : 'No working days') : undefined;
    return { date: w.date, weekOf: w.weekOf, state, load, capacity: w.capacity, utilization: Math.round(utilization * 100) / 100, free: Math.round(Math.max(0, w.capacity - load) * 10) / 10, tasks, ...(note ? { note } : {}) };
  }
}

export function Board({
  allRows, groups, days, focusProjectId, onFocus, defaultPinnedProjectId = null, highlightProjectId,
  onSelectPerson, onAssign, emptyText, fill, hoverSuppressed,
}: {
  /** Every row in the payload: hues, holidays, the team totals and the legend come from ALL of them. */
  allRows: CapacityRow[];
  /** The rows to draw, already filtered, in groups (a single unlabelled group draws no group headers). */
  groups: BoardGroup[];
  days: number;
  focusProjectId: string | null;
  onFocus: (id: string | null) => void;
  defaultPinnedProjectId?: string | null;
  /** The project this board is scoped to: its share is marked inside each person's bar. */
  highlightProjectId?: string;
  onSelectPerson: (userId: string, focusDate?: string) => void;
  onAssign?: (row: CapacityRow) => void;
  emptyText: string;
  /** Fill the parent (the page) rather than size to content (a tab). */
  fill?: boolean;
  /** A panel or dialog is up: no hover card underneath it. */
  hoverSuppressed?: boolean;
}) {
  const today = todayIST();
  const [unit, setUnit] = useState<Unit>('hours');
  const [zoom, setZoom] = useState<Zoom>('days');
  const weeksAvailable = days >= 14;
  const effZoom: Zoom = weeksAvailable ? zoom : 'days';

  // Hues and holidays from the WHOLE payload, so a search or filter never reshuffles the colours.
  const hues = useMemo(() => assignProjectHues(projectsOf(allRows)), [allRows]);
  const holidays = useMemo(() => holidaysOf(allRows), [allRows]);

  // The columns for the current zoom, per person. Days come straight from the payload; weeks are
  // rolled up here. Both go through the same cells, hover and totals.
  const viewDays = useMemo(() => {
    const m = new Map<string, CapacityDay[]>();
    for (const r of allRows) m.set(r.userId, effZoom === 'weeks' ? weeksOf(r.days, today) : r.days);
    return m;
  }, [allRows, effZoom, today]);
  const header: CapacityDay[] = viewDays.get(allRows[0]?.userId ?? '') ?? [];
  const cols = header.length;

  // Every cell's segments, once per payload — not once per hover.
  const segmentsByKey = useMemo(() => {
    const m = new Map<string, Segment[] | null>();
    for (const r of allRows) for (const d of viewDays.get(r.userId) ?? []) m.set(`${r.userId}|${d.date}`, segmentsFor(r, d, hues, today, holidays));
    return m;
  }, [allRows, viewDays, hues, holidays, today]);

  // Team totals under the header, over the same columns.
  const totals = useMemo(() => teamTotals(allRows.map(r => ({ ...r, days: viewDays.get(r.userId) ?? r.days }))), [allRows, viewDays]);
  // Planned vs available across the whole window, and the share one is of the other. Derived in
  // totals.tsx alongside the day and row totals, so the headline can never drift from the bars.
  const windowLoad = useMemo(() => windowTotal(allRows), [allRows]);

  // The cell width, measured once from the header grid, decides whether labels fit in segments.
  const headerGridRef = useRef<HTMLDivElement | null>(null);
  const [cellWidth, setCellWidth] = useState(0);
  useEffect(() => {
    const el = headerGridRef.current;
    if (!el || cols === 0) return;
    const measure = () => setCellWidth(Math.max(0, (el.clientWidth - (cols - 1) * COL_GAP) / cols));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols]);
  // A cell fits five 6px segments at the 30-day range, eight at 14, a dozen at 7 or by week.
  const maxSegments = effZoom === 'weeks' ? 12 : days >= 30 ? 5 : days >= 14 ? 8 : 12;

  // Hover card: fixed to the viewport, so it must go the moment anything moves.
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hover) return;
    const close = () => setHover(null);
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', onKey); };
  }, [hover]);
  const beginHover = (t: HoverIntent) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    // The rect is read when the card is about to show, so 120ms of scrolling cannot leave the
    // card beside where the cell used to be.
    hoverTimer.current = setTimeout(() => {
      if (!t.el.isConnected) return;
      setHover({ row: t.row, day: t.day, segments: t.segments, rect: t.el.getBoundingClientRect() });
    }, 120);
  };
  const endHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHover(null);
  };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  useEffect(() => { if (hoverSuppressed) endHover(); }, [hoverSuppressed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Roving tabindex: one cell is the tab stop; the arrow keys move through the grid.
  const flat = useMemo(() => groups.flatMap(g => g.rows), [groups]);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const [tabCell, setTabCell] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  useEffect(() => { setTabCell(t => ({ r: Math.min(t.r, Math.max(0, flat.length - 1)), c: Math.min(t.c, Math.max(0, cols - 1)) })); }, [flat.length, cols]);
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!t.dataset.row) return;
    let r = Number(t.dataset.row), c = Number(t.dataset.col);
    switch (e.key) {
      case 'ArrowRight': c++; break;
      case 'ArrowLeft': c--; break;
      case 'ArrowDown': r++; break;
      case 'ArrowUp': r--; break;
      case 'Home': c = 0; break;
      case 'End': c = cols - 1; break;
      case 'PageDown': r = flat.length - 1; break;
      case 'PageUp': r = 0; break;
      default: return;
    }
    e.preventDefault();
    r = Math.max(0, Math.min(flat.length - 1, r)); c = Math.max(0, Math.min(cols - 1, c));
    setTabCell({ r, c });
    endHover();
    const next = rowsRef.current?.querySelector<HTMLButtonElement>(`button[data-row="${r}"][data-col="${c}"]`);
    next?.focus();
    next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } as const;
  const minWidth = NAME_W + cols * MIN_COL + (cols - 1) * COL_GAP + SUMMARY_W + 32;
  const wideCols = cellWidth >= 34;
  let rowIndex = -1;

  const weekLabel = (d: CapacityDay) => {
    if (!d.weekOf) return '';
    const idx = header.indexOf(d);
    const next = header[idx + 1];
    const endIso = next ? new Date(new Date(`${next.date}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10) : allRows[0]?.days[allRows[0].days.length - 1]?.date ?? d.date;
    return `${dayNum(d.date)}–${dayNum(endIso)} ${formatDate(endIso, { month: 'short' })}`;
  };
  const containsToday = (d: CapacityDay) => {
    if (!d.weekOf) return isToday(d.date);
    const idx = header.indexOf(d); const next = header[idx + 1];
    return d.date <= today && (!next || today < next.date);
  };

  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden', fill && 'flex-1 min-h-0')}>
      {/* Sideways scroll on narrow screens: the whole board keeps its column width instead of
          squeezing 14 days into 10px slivers. Rows scroll vertically inside it. */}
      <div className={clsx('flex flex-col overflow-x-auto', fill && 'flex-1 min-h-0')}>
        <div className={clsx('flex flex-col', fill && 'flex-1 min-h-0')} style={{ minWidth }}>
          {/* Day header — pinned outside the scroll area; scrollbar-gutter keeps its columns
              aligned with the cells below. */}
          <div className="border-b border-gray-200 bg-gray-50 shrink-0 rounded-t-xl overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
            <div className="flex items-end gap-3 px-4 pt-3 pb-1.5">
              <div className="w-56 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">Member</div>
              <div ref={headerGridRef} className="flex-1 grid gap-1" style={gridStyle}>
                {header.map(d => {
                  const holiday = d.state === 'HOLIDAY' && !d.weekOf;
                  const weekend = d.state === 'WEEKEND' && !d.weekOf;
                  const now = containsToday(d);
                  const monday = !d.weekOf && dayOfWeek(d.date) === 1;
                  return (
                    <div key={d.date}
                      title={d.weekOf ? `Week of ${formatDate(d.weekOf, { weekday: 'long', month: 'short', day: 'numeric' })}` : holiday ? `Holiday${d.note ? ` — ${d.note}` : ''}` : weekend ? 'Weekend' : formatDate(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                      className={clsx('text-center rounded-md py-0.5',
                        holiday && 'bg-amber-100',
                        weekend && 'bg-gray-100',
                        monday && !now && 'border-l border-gray-300',
                        now && 'bg-gray-900')}>
                      {d.weekOf ? (
                        <>
                          <div className={clsx('text-[9px] uppercase', now ? 'text-gray-300' : 'text-gray-400')}>week</div>
                          <div className={clsx('text-[11px] font-medium whitespace-nowrap', now ? 'text-white font-bold' : 'text-gray-600')}>{weekLabel(d)}</div>
                        </>
                      ) : (
                        <>
                          <div className={clsx('text-[9px] uppercase', now ? 'text-gray-300' : holiday ? 'text-amber-600' : 'text-gray-400')}>{DOW[dayOfWeek(d.date)]}</div>
                          <div className={clsx('text-[11px] font-medium', now ? 'text-white font-bold' : holiday ? 'text-amber-700' : 'text-gray-600')}>{dayNum(d.date)}</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="w-44 shrink-0 flex items-center justify-end gap-1.5">
                <Toggle value={unit} onChange={v => setUnit(v as Unit)} options={[['hours', 'h'], ['percent', '%']]} title="Show totals in hours or as a percentage of capacity" />
                {weeksAvailable && <Toggle value={effZoom} onChange={v => setZoom(v as Zoom)} options={[['days', 'Days'], ['weeks', 'Weeks']]} title="Zoom: one column per day, or one per week" />}
              </div>
            </div>
            {/* The team's load on each column: how crowded is the day, and how many are free. */}
            <div className="flex items-center gap-3 px-4 pb-2">
              <div className="w-56 shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">Team load</div>
              <div className="flex-1 grid gap-1 items-center" style={gridStyle}>
                {totals.map(t => <DayTotalCell key={t.date} t={t} unit={unit} wide={wideCols} />)}
              </div>
              {/* Hours AND share, together and always — not one or the other behind the h/%
                  toggle. "39h of 800h" is what you act on; "5%" is whether the firm is healthy,
                  and reading it used to mean doing the division yourself. */}
              <div className="w-44 shrink-0 text-right text-[10px] tabular-nums text-gray-500" title={windowTotalHint(windowLoad)}>
                {windowTotalText(windowLoad)}
                <span className={clsx('ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle', loadBand(windowLoad.load, windowLoad.capacity) === 'over' ? 'bg-gray-900' : loadBand(windowLoad.load, windowLoad.capacity) === 'at' ? 'bg-amber-400' : 'bg-emerald-400')} />
              </div>
            </div>
          </div>

          {/* Rows — the ONLY vertically scrolling region. */}
          <div ref={rowsRef} onKeyDown={onGridKey} className={clsx('divide-y divide-gray-50 overflow-y-auto', fill && 'flex-1 min-h-0')} style={{ scrollbarGutter: 'stable' }}>
            {flat.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400">{emptyText}</p>
            ) : groups.map(g => (
              <div key={g.key}>
                {g.label && (
                  <div className="sticky top-0 z-[5] flex items-center gap-1.5 px-4 py-1.5 bg-gray-100/95 backdrop-blur border-y border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <Building2 size={12} className="text-gray-400" />
                    {g.label}
                    <span className="normal-case font-normal text-gray-400">· {g.rows.length}</span>
                  </div>
                )}
                {g.rows.map(row => {
                  rowIndex++;
                  const r = rowIndex;
                  const rowDays = viewDays.get(row.userId) ?? row.days;
                  const mine = highlightProjectId
                    ? Math.round(rowDays.reduce((s, d) => s + (d.tasks ?? []).filter(t => row.openTasks.find(o => o.id === t.taskId)?.projectId === highlightProjectId).reduce((x, t) => x + t.hours, 0), 0) * 10) / 10
                    : undefined;
                  return (
                    <div key={row.userId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/70 transition-colors group">
                      <button onClick={() => onSelectPerson(row.userId)} className="w-56 shrink-0 flex items-center gap-2.5 text-left" title={`See ${row.name.split(' ')[0]}'s whole plan`}>
                        <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ').slice(1).join(' '), profilePhoto: row.profilePhoto }} size={30} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-brand-600 transition-colors">{row.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {row.designation ?? '—'}
                            {row.overdueCount > 0 && <span className="text-red-600"> · {row.overdueCount} overdue</span>}
                          </p>
                        </div>
                      </button>
                      <div className="flex-1 grid gap-1" style={gridStyle}>
                        {rowDays.map((d, c) => {
                          const segments = segmentsByKey.get(`${row.userId}|${d.date}`) ?? null;
                          return (
                            <DayCell
                              key={d.date} day={d} segments={segments} focusProjectId={focusProjectId} today={containsToday(d)} maxSegments={maxSegments}
                              cellWidth={cellWidth} tabIndex={tabCell.r === r && tabCell.c === c ? 0 : -1} dataRow={r} dataCol={c}
                              onHover={e => { if (!hoverSuppressed) beginHover({ row, day: d, segments, el: e.currentTarget }); }}
                              onLeave={endHover}
                              // A day opens the person's plan at that day. Adding work is the
                              // panel's job, where you can see what is already there first.
                              onClick={() => { endHover(); setTabCell({ r, c }); onSelectPerson(row.userId, d.date); }}
                            />
                          );
                        })}
                      </div>
                      <div className="w-44 shrink-0 flex items-center justify-end gap-2">
                        <div className="min-w-0 flex-1">
                          <RowSummary row={row} unit={unit} highlightHours={mine} />
                          <p className="mt-1 text-right text-[10px] tabular-nums text-gray-400">
                            {row.availableNow ? (
                              <span className="font-semibold text-emerald-600">Available now</span>
                            ) : row.nextFreeDate ? (
                              <span className="font-medium text-gray-600">Free {formatDate(row.nextFreeDate)}</span>
                            ) : (
                              // No day under a quarter loaded. If hours are still free, say that rather
                              // than "fully booked" beside "37h free" — the two read as a contradiction.
                              <span className="font-medium text-red-500">{row.freeHours > 0 ? 'No free day' : 'Fully booked'}</span>
                            )}
                            {' · '}{row.freeHours}h free
                            {row.overCommittedHours > 0.05 && <span className="ml-1 font-medium text-gray-900">· {row.overCommittedHours}h over</span>}
                            {mine != null && <span className="block text-gray-500">{mine}h on this project</span>}
                          </p>
                        </div>
                        {onAssign && (
                          <button
                            onClick={() => onAssign(row)}
                            title={`Assign a task to ${row.name}`}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-900 transition-colors shrink-0"
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <BoardLegend rows={allRows} hues={hues} focusProjectId={focusProjectId} onFocus={onFocus} defaultPinned={defaultPinnedProjectId} />

      {hover && !hoverSuppressed && <HoverCard target={hover} today={today} />}
    </div>
  );
}

function Toggle({ value, onChange, options, title }: { value: string; onChange: (v: string) => void; options: [string, string][]; title: string }) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-[10.5px] font-medium" role="group" title={title}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={clsx('rounded px-1.5 py-0.5 transition-colors', value === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800')}>
          {label}
        </button>
      ))}
    </div>
  );
}
