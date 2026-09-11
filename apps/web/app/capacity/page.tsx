'use client';

// Team Capacity — "who is busy, who is free, and when".
//
// Every person × every day across ALL projects. A working day is a green box; the work in it
// is drawn as segments — one per task, width = hours, hue = project, depth = priority, a rail
// when the deadline is close — so the green left showing is the free hours. Hover a day for
// what fills it; click a name (or a day) for the whole plan. The most available people sort
// to the top, and assigning into a free window is one click from the panel.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Users, Loader, CalendarRange, Sparkles, AlertTriangle, Gauge, X, Search, CalendarPlus,
  ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';

import { api, type TeamCapacity, type CapacityRow, type DayState, type ApiProject, type ApiTask, type CoverageRisks, type CoverageRisk, type TeamHistory, type HistoryRow } from '@/lib/api';

/** How often the board re-reads the server while it is on screen. */
const POLL_MS = 30_000;

import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { PersonPanel, ExtendMenu, type ExtendScope } from '@/components/capacity/PersonPanel';
import { Avatar } from '@/components/Avatar';
import { formatDate } from '@/lib/date';
import { STATE_STYLE, DOW, DayCell, dayOfWeek, dayNum, isToday, projectsOf, holidaysOf } from '@/components/capacity/grid';
import { Board, officeLabel } from '@/components/capacity/Board';
import { windowTotal, windowTotalText, windowTotalHint } from '@/components/capacity/totals';
import { LiveStatus } from '@/components/capacity/LiveStatus';
import { assignProjectHues } from '@/lib/project-colors';
import { todayIST, plural } from '@/lib/date';
import {
  resolveWindow, countWorkingDays, daysOf, weekdayOf, weekdayName, WEEKDAYS_IN_ORDER,
  type Weekday, type WindowChoice,
} from '@/lib/work-week';
import { pidLabel } from '@/lib/mock-data';
import { invalidateTaskCaches } from '@/lib/task-cache';

/**
 * The window the board plans over.
 *
 * It used to be a horizon and nothing else — N days, always beginning today — which is the wrong
 * shape for a firm that does its allocation on a Friday afternoon. Seven days taken on Friday the
 * 11th ran to Thursday the 17th and left out Friday the 18th, the one day the meeting was about.
 * So a window is now a START and a LENGTH: a work week, a rolling horizon, a chosen weekday, or a
 * date typed in. The arithmetic is in lib/work-week.ts, pure and tested; this file only chooses.
 */
type RangeKey = 'work-week' | 'next-work-week' | 'next-7' | 'next-14' | 'next-30' | 'from-weekday' | 'custom' | 'past-30';

/** Lengths the "starting on…" options offer. Five is a work week and the API's own floor. */
const LENGTH_OPTIONS = [5, 7, 14, 30];

/** Turn the picker's state into the window choice lib/work-week.ts resolves. */
function choiceFor(range: RangeKey, weekStartsOn: Weekday, start: string, length: number): WindowChoice {
  switch (range) {
    case 'work-week': return { mode: 'work-week', weekStartsOn };
    case 'next-work-week': return { mode: 'next-work-week', weekStartsOn };
    case 'next-7': return { mode: 'rolling', length: 7 };
    case 'next-30': return { mode: 'rolling', length: 30 };
    case 'from-weekday': return { mode: 'from-weekday', weekStartsOn, length };
    case 'custom': return { mode: 'custom', start, length };
    // 'past-30' draws the retrospective board instead, but the forward window still has to
    // resolve to something — the queries that use it are simply disabled.
    default: return { mode: 'rolling', length: 14 };
  }
}

/**
 * Which window the board opens on.
 *
 * The allocation exercise happens on a Friday and is about the week ahead, so from Friday to
 * Sunday the board opens on NEXT week and the rest of the time on this one. Landing on the window
 * somebody came to fill is the difference between a tool used in the meeting and one opened,
 * re-ranged, and then used in the meeting.
 */
function defaultRange(today: string): RangeKey {
  const wd = weekdayOf(today);
  return wd === 5 || wd === 6 || wd === 0 ? 'next-work-week' : 'work-week';
}

export default function CapacityPage() {
  const { org } = useOrg();
  const { can, loading: permLoading } = usePermissions();
  const qc = useQueryClient();
  const allowed = can('capacity.view');

  const [range, setRange] = useState<RangeKey>(() => defaultRange(todayIST()));
  // Which day a week begins on — the work-week modes and "starting on a weekday" both read it.
  // Monday here; the offices do not all keep the same weekend, and a board that cannot say so is
  // a board somebody keeps in a spreadsheet instead.
  const [weekStartsOn, setWeekStartsOn] = useState<Weekday>(1);
  const [customStart, setCustomStart] = useState('');
  const [customLength, setCustomLength] = useState(7);
  const [search, setSearch] = useState('');

  /**
   * Whether the sentence explaining the board is folded away.
   *
   * The board is the page; the header is the label on it. Explaining how to read a board is worth
   * a line the first few times somebody opens it and worth nothing on the hundredth, and this is a
   * screen the firm sits in front of every Friday. Folding it is remembered per browser for that
   * reason — it is a working preference, not a property of the data.
   *
   * The window dates and the allocation share are deliberately NOT folded. Which days you are
   * looking at is not a detail; every hour figure on the board is measured over it, and a board
   * that did not say so is exactly how the Friday window came to stop on a Thursday unnoticed.
   *
   * Read in an effect rather than during render: reading localStorage while rendering makes the
   * server and client disagree and React throws the markup away. Guarded, because a private window
   * throws on access.
   */
  const [capacityHeaderCollapsed, setCapacityHeaderCollapsed] = useState(false);
  useEffect(() => {
    try { setCapacityHeaderCollapsed(localStorage.getItem('pdash.capacityHeaderCollapsed') === '1'); } catch { /* storage blocked */ }
  }, []);
  function toggleCapacityHeader() {
    setCapacityHeaderCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('pdash.capacityHeaderCollapsed', next ? '1' : '0'); } catch { /* storage blocked */ }
      return next;
    });
  }
  const [dept, setDept] = useState('');
  const [projectId, setProjectId] = useState(''); // '' = whole org; else scope to a project's team
  // The selected PERSON, not a snapshot of their row: the panel then re-reads the row from the
  // latest payload, so an Extend done inside it is reflected without closing and reopening.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<{ row: CapacityRow; start?: string; due?: string } | null>(null);
  const [focusProjectId, setFocusProjectId] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string | undefined>();
  const today = todayIST();

  const isPast = range === 'past-30';
  const win = useMemo(
    () => resolveWindow(today, choiceFor(range, weekStartsOn, customStart, customLength)),
    [today, range, weekStartsOn, customStart, customLength],
  );
  const days = win.days;
  // `from` is sent only when the window does NOT start today, so the rolling options make exactly
  // the request they always made — same URL, same cache entry, same board.
  const from = win.start === today ? undefined : win.start;
  const histDays = 30;

  // Forward projected-capacity board (default). Disabled while viewing the past. When a project
  // is selected, scope the board to that project's members (auto-synced from ProjectMember).
  // Polled while the tab is visible (plus the app-wide refetch on focus/reconnect), so a task
  // assigned, closed or logged against anywhere shows here within the interval without a reload.
  const { data, isLoading: fwdLoading, dataUpdatedAt, isFetching, refetch } = useQuery<TeamCapacity>({
    queryKey: ['capacity', org?.id, win.start, days, projectId],
    queryFn: () => projectId ? api.capacity.forProject(projectId, days, from) : api.capacity.team(days, from),
    enabled: allowed && !!org?.id && !isPast,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });

  // Retrospective actual-attendance board (the "Past 30 days" option).
  const { data: history, isLoading: histLoading } = useQuery<TeamHistory>({
    queryKey: ['capacity-history', org?.id, histDays],
    queryFn: () => api.capacity.history(histDays),
    enabled: allowed && !!org?.id && isPast,
    staleTime: 60_000,
  });

  // Projects the manager can assign INTO (approved/active work).
  const { data: projects = [] } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: allowed && !!org?.id,
    staleTime: 60_000,
  });

  // Emergency-leave coverage: short-notice absences over HIGH/CRITICAL work. It is about what is
  // imminent, not about whichever window is on screen, so it keeps a fortnight's look-ahead at the
  // very least — tying it to the board's length meant that narrowing to a work week in order to
  // plan it silently hid the absences that make the plan wrong.
  const coverageDays = Math.max(14, days);
  const { data: coverage } = useQuery<CoverageRisks>({
    queryKey: ['coverage-risks', org?.id, coverageDays],
    queryFn: () => api.capacity.coverageRisks(coverageDays),
    enabled: allowed && !!org?.id && !isPast,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });

  const isLoading = isPast ? histLoading : fwdLoading;
  const fwdRows = data?.rows ?? [];
  // Hues come from the WHOLE payload, so a search or filter never reshuffles the colours.
  const hues = useMemo(() => assignProjectHues(projectsOf(fwdRows)), [fwdRows]);
  const holidays = useMemo(() => holidaysOf(fwdRows), [fwdRows]);
  const selected = useMemo(() => fwdRows.find(r => r.userId === selectedUserId) ?? null, [fwdRows, selectedUserId]);
  // A pinned project belongs to the board it was pinned on.
  useEffect(() => { setFocusProjectId(null); }, [win.start, win.days, projectId]);
  // What the window actually contains: how many of its days anybody can be given work on, and
  // how many of the team's hours are already spoken for. Both are read off the same payload the
  // grid below is drawn from, so the headline and the columns cannot disagree.
  const workingDays = useMemo(() => countWorkingDays(win, { holidays }), [win, holidays]);
  const holidaysInWindow = useMemo(() => daysOf(win).filter(d => holidays.has(d)).length, [win, holidays]);
  const allocation = useMemo(() => windowTotal(fwdRows), [fwdRows]);
  const histRows = history?.rows ?? [];
  const allRows: { name: string; department?: string }[] = isPast ? histRows : fwdRows;

  const departments = useMemo(
    () => [...new Set(allRows.map(r => r.department).filter(Boolean))].sort() as string[],
    [allRows],
  );
  const matches = (r: { name: string; department?: string }) =>
    (!search || r.name.toLowerCase().includes(search.toLowerCase())) && (!dept || r.department === dept);
  const visibleFwd = useMemo(() => fwdRows.filter(matches), [fwdRows, search, dept]);
  const visibleHist = useMemo(() => histRows.filter(matches), [histRows, search, dept]);

  // Group by office (Gurgaon, Jaipur, then anything else) ONLY when at least one person has an
  // office — otherwise a lone "Unassigned · 26" header is a label for nothing. Within a group the
  // server's order is kept: most available first, which is what the board promises.
  const groupedFwd = useMemo(() => {
    const ORDER = ['GURGAON', 'JAIPUR'];
    const anyOffice = visibleFwd.some(r => !!r.office);
    if (!anyOffice) return [{ office: '', rows: visibleFwd }];
    const byOffice = new Map<string, CapacityRow[]>();
    for (const r of visibleFwd) {
      const key = r.office || 'Unassigned';
      if (!byOffice.has(key)) byOffice.set(key, []);
      byOffice.get(key)!.push(r);
    }
    return [...byOffice.keys()]
      .sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.localeCompare(b);
      })
      .map(office => ({ office, rows: byOffice.get(office)! }));
  }, [visibleFwd]);

  // Forward headline numbers a manager acts on.
  const stats = useMemo(() => {
    const freeNow = fwdRows.filter(r => r.availableNow).length;
    const freeingSoon = fwdRows.filter(r => !r.availableNow && r.nextFreeDate).length;
    const spareHours = Math.round(fwdRows.reduce((s, r) => s + r.freeHours, 0));
    const overdue = fwdRows.reduce((s, r) => s + r.overdueCount, 0);
    return { freeNow, freeingSoon, spareHours, overdue };
  }, [fwdRows]);

  // Retrospective headline numbers.
  const histStats = useMemo(() => {
    const compoff = histRows.reduce((s, r) => s + r.compoff, 0);
    const present = histRows.reduce((s, r) => s + r.present, 0);
    const onLeave = histRows.reduce((s, r) => s + r.onLeave, 0);
    const absent = histRows.reduce((s, r) => s + r.absent, 0);
    return { compoff, present, onLeave, absent };
  }, [histRows]);


  if (permLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Users size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">You need the <code>capacity.view</code> permission to see team availability.</p>
      </div>
    );
  }

  const header = (isPast ? histRows[0]?.days : fwdRows[0]?.days) ?? [];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      {/* This header's height is a budget, and the board below is what it is taken from.
          Measured at 1440x732 it stood at 154px, with the first person's row at 313px — 43% of the
          window gone before one of 25 people was visible. The title, the window it covers and the
          allocation share now share ONE line instead of three stacked ones; the sentence explaining
          the board folds away; and the block padding came down from 16px to 10px. Nothing was
          dropped — the sentence is one click away and everything else is still on screen. */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2.5 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            {/* One line: what this is, what it covers, and how full it is. Three facts that are
                read together and were previously stacked, costing two rows to say. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5 shrink-0">
                <Gauge size={17} className="text-brand-600" /> Team Capacity
              </h1>
              {!isPast && fwdRows.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
                  {stats.freeNow} of {fwdRows.length} available now
                </span>
              )}
            </div>
            {!capacityHeaderCollapsed && (
              <p className="text-[13px] leading-snug text-gray-500 mt-0.5 max-w-3xl">
                Who is on what, when, and how much — across every project. Hover a day for what fills it; click a name for the whole plan.
              </p>
            )}
            {/* What this window IS — said in dates, because a length alone ("next 7 days") is
                exactly what let a Friday window quietly stop on the Thursday. The share beside it
                answers the question the two hour figures pose: 39h of 800h is 5%, and reading that
                off the board is how anybody sees at a glance whether the firm is booked or idle.
                It stays visible when the header is folded: which days you are looking at is not a
                detail, it is the thing every figure on the board is measured over. */}
            {!isPast && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
                  <CalendarRange size={13} className="text-gray-400" />
                  {formatDate(win.start, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' – '}
                  {formatDate(win.end, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="text-gray-400">
                  · {plural(workingDays, 'working day')}
                  {holidaysInWindow > 0 && ` · ${plural(holidaysInWindow, 'holiday')}`}
                </span>
                {fwdRows.length > 0 && (
                  <span
                    title={windowTotalHint(allocation)}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                      allocation.pct === null ? 'bg-gray-50 text-gray-500 ring-gray-300/40'
                        : allocation.pct > 100 ? 'bg-gray-900 text-white ring-gray-900/20'
                          : allocation.pct >= 75 ? 'bg-amber-50 text-amber-700 ring-amber-600/15'
                            : 'bg-brand-50 text-brand-700 ring-brand-600/15',
                    )}
                  >
                    <Gauge size={12} /> {windowTotalText(allocation)} allocated
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-40"
              />
            </div>
            {/* Project filter — scope the board to one project's team (forward view only). */}
            <select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={isPast}
              title={isPast ? 'Project filter applies to the forward view' : 'Filter by project team'}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white disabled:opacity-50 max-w-[180px]">
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.code ? `${pidLabel(p.code, p.roundSeq)} — ` : ''}{p.title}</option>)}
            </select>
            {departments.length > 0 && (
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                <option value="">All teams</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <select
              value={range}
              onChange={e => {
                const next = e.target.value as RangeKey;
                // A date field that opens blank is a date field nobody can see the window of.
                if (next === 'custom' && !customStart) setCustomStart(today);
                setRange(next);
              }}
              title="The window the board plans over"
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white font-medium text-gray-700"
            >
              <optgroup label="Work week">
                <option value="work-week">This work week</option>
                <option value="next-work-week">Next work week</option>
              </optgroup>
              <optgroup label="From today">
                <option value="next-7">Next 7 days</option>
                <option value="next-14">Next 14 days</option>
                <option value="next-30">Next 30 days</option>
              </optgroup>
              <optgroup label="Pick the start">
                <option value="from-weekday">Starting on a weekday…</option>
                <option value="custom">Starting on a date…</option>
              </optgroup>
              <optgroup label="Look back">
                <option value="past-30">Past 30 days</option>
              </optgroup>
            </select>
            {/* Which day the week — or the window — begins on. The work-week options read it as
                the first working day; "starting on a weekday" reads it as the start itself. */}
            {(range === 'work-week' || range === 'next-work-week' || range === 'from-weekday') && (
              <select
                value={weekStartsOn}
                onChange={e => setWeekStartsOn(Number(e.target.value) as Weekday)}
                title={range === 'from-weekday' ? 'Which day the window starts on' : 'Which day the work week starts on'}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700"
              >
                {WEEKDAYS_IN_ORDER.map(w => (
                  <option key={w} value={w}>
                    {range === 'from-weekday' ? `From ${weekdayName(w)}` : `Weeks start ${weekdayName(w)}`}
                  </option>
                ))}
              </select>
            )}
            {range === 'custom' && (
              <input
                type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                title="The first day of the window"
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700"
              />
            )}
            {(range === 'from-weekday' || range === 'custom') && (
              <select
                value={customLength}
                onChange={e => setCustomLength(Number(e.target.value))}
                title="How many days the window covers"
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700"
              >
                {LENGTH_OPTIONS.map(n => <option key={n} value={n}>{n} days</option>)}
              </select>
            )}
            {!isPast && <LiveStatus updatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={() => { refetch(); qc.invalidateQueries({ queryKey: ['coverage-risks'] }); }} intervalMs={POLL_MS} className="ml-1" />}
            {/* Last in the control row, and visually quieter than the filters: it changes how much
                of the header you see, not what the board is showing. */}
            <button
              onClick={toggleCapacityHeader}
              aria-expanded={!capacityHeaderCollapsed}
              title={capacityHeaderCollapsed
                ? 'Show the line explaining how to read this board'
                : 'Fold that line away and give the rows the space'}
              className="flex items-center gap-1 shrink-0 px-2 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors"
            >
              {capacityHeaderCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
              <span className="hidden sm:inline">{capacityHeaderCollapsed ? 'Show' : 'Hide'}</span>
            </button>
          </div>
        </div>

        {/* The forward board carries no tiles: free people are the green rows, overdue work is
            the red-railed segments, spare hours are the green left showing. The retrospective
            (attendance) view keeps its four, which the grid below cannot show. */}
        {isPast && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Kpi label="Comp-off candidates" value={histStats.compoff} Icon={CalendarPlus} tint="bg-indigo-100 text-indigo-700" hint="worked on a non-working day" />
            <Kpi label="Days present" value={histStats.present} Icon={Sparkles} tint="bg-emerald-100 text-emerald-700" hint="across the team, past 30 days" />
            <Kpi label="Days on leave" value={histStats.onLeave} Icon={CalendarRange} tint="bg-purple-100 text-purple-700" hint="approved leave taken" />
            <Kpi label="Days absent" value={histStats.absent} Icon={AlertTriangle} tint="bg-red-100 text-red-700" hint="working days with no attendance" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-3 sm:p-4 gap-3">
        {coverage && coverage.risks.length > 0 && (
          <CoveragePanel data={coverage} />
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" /> Building the availability map…
          </div>
        ) : allRows.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No active team members.</div>
        ) : isPast ? (
          // The retrospective (attendance) view: one state per day, no segments — its own card,
          // laid out like the board: a pinned date header above an independently scrolling body.
          <div className="bg-white rounded-xl border border-gray-200 flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-end gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0 rounded-t-xl overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className="w-56 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">Member</div>
              <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))` }}>
                {header.map(d => {
                  const holiday = d.state === 'HOLIDAY';
                  const weekend = d.state === 'WEEKEND';
                  return (
                    <div key={d.date}
                      title={holiday ? `Holiday${d.note ? ` — ${d.note}` : ''}` : weekend ? 'Weekend' : formatDate(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                      className={clsx('text-center rounded-md py-0.5',
                        holiday && 'bg-amber-100',
                        weekend && 'bg-gray-100',
                        isToday(d.date) && 'bg-gray-900')}>
                      <div className={clsx('text-[9px] uppercase', isToday(d.date) ? 'text-gray-300' : holiday ? 'text-amber-600' : 'text-gray-400')}>{DOW[dayOfWeek(d.date)]}</div>
                      <div className={clsx('text-[11px] font-medium', isToday(d.date) ? 'text-white font-bold' : holiday ? 'text-amber-700' : 'text-gray-600')}>{dayNum(d.date)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="w-40 shrink-0 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-50" style={{ scrollbarGutter: 'stable' }}>
              {visibleHist.length === 0
                ? <p className="px-4 py-10 text-center text-sm text-gray-400">No one matches those filters.</p>
                : visibleHist.map(row => <HistoryRowView key={row.userId} row={row} />)}
            </div>
            <div className="shrink-0 flex items-center gap-4 flex-wrap px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              {(['PRESENT', 'COMPOFF', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'ABSENT', 'NOT_MARKED'] as DayState[]).map(st => (
                <span key={st} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={clsx('w-2.5 h-2.5 rounded-sm', STATE_STYLE[st].dot)} />{STATE_STYLE[st].label}
                </span>
              ))}
              <span className="text-[11px] text-gray-400 ml-auto">Actual attendance over the past 30 days</span>
            </div>
          </div>
        ) : (
          <Board
            allRows={fwdRows}
            groups={groupedFwd.map(g => ({ key: g.office || 'all', label: g.office ? officeLabel(g.office) : undefined, rows: g.rows }))}
            days={days}
            focusProjectId={focusProjectId}
            onFocus={setFocusProjectId}
            onSelectPerson={(userId, date) => { setFocusDate(date); setSelectedUserId(userId); }}
            onAssign={row => setAssignTo({ row, start: row.nextFreeDate ?? undefined, due: row.nextFreeDate ?? undefined })}
            emptyText="No one matches those filters."
            fill
            hoverSuppressed={!!selected || !!assignTo}
          />
        )}
      </div>

      {/* Person drill-down */}
      {selected && (
        <PersonPanel
          row={selected} hues={hues} holidays={holidays} today={today} focusDate={focusDate}
          onClose={() => { setSelectedUserId(null); setFocusDate(undefined); }}
          onAssign={() => {
            const start = focusDate ?? selected.nextFreeDate ?? undefined;
            setAssignTo({ row: selected, start, due: start });
            setSelectedUserId(null); setFocusDate(undefined);
          }}
        />
      )}

      {/* Assign into their free window */}
      {assignTo && (
        <AssignTaskFlow
          row={assignTo.row}
          projects={projects}
          startDate={assignTo.start}
          dueDate={assignTo.due}
          onClose={() => setAssignTo(null)}
          onDone={() => {
            setAssignTo(null);
            invalidateTaskCaches(qc);
            // The coverage board reads its own key; a reassignment must not leave it stale.
            qc.invalidateQueries({ queryKey: ['coverage-risks'] });
          }}
        />
      )}
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────────
function Kpi({ label, value, Icon, tint, hint }: {
  label: string; value: string | number; Icon: typeof Users; tint: string; hint: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center shrink-0', tint)}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-[11px] text-gray-500 mt-1 truncate" title={hint}>{label}</p>
      </div>
    </div>
  );
}


// Emergency-leave coverage: who is on short-notice leave over HIGH/CRITICAL work, with
// one-click reassign to a free teammate or a deadline extension to buy time.
function CoveragePanel({ data }: { data: CoverageRisks }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canAssign = can('task.assign');
  const canTask = can('task.update');
  const canProject = can('project.update');
  const [busy, setBusy] = useState('');

  function refresh() {
    invalidateTaskCaches(qc);
    qc.invalidateQueries({ queryKey: ['coverage-risks'] });
  }

  /**
   * Hand the work to somebody else — for the days they are away, or for good.
   *
   * This used to call setAssignees, which REPLACES the seats on a task: it wiped the roles and
   * the per-person hours of everybody on it, and there was no way back when a leave was
   * cancelled. A cover is a record instead. The staffing is untouched, so withdrawing it puts
   * the plan back exactly as it was.
   */
  async function arrangeCover(taskId: string, risk: CoverageRisk, choice: string) {
    if (!choice) return;
    const sep = choice.indexOf(':');
    const mode = choice.slice(0, sep) as 'COVER' | 'HANDOVER';
    const toUserId = choice.slice(sep + 1);
    setBusy(taskId);
    try {
      await api.capacity.createCoverage({
        taskId, fromUserId: risk.userId, toUserId,
        fromDate: risk.startDate,
        // A cover ends when they are back; a handover has no end.
        toDate: mode === 'COVER' ? risk.endDate : null,
        mode,
        reason: `${risk.leaveType} leave`,
      });
      refresh();
      toast(
        mode === 'COVER'
          ? `Covered to ${formatDate(risk.endDate)} — it comes back to ${risk.name.split(' ')[0]} after that`
          : 'Handed over — the rest of this task is theirs now',
        'success',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not arrange cover', 'error');
    } finally { setBusy(''); }
  }

  async function extend(scope: ExtendScope, task: { id: string; projectId?: string }, iso: string, userId: string) {
    setBusy(task.id);
    try {
      if (scope === 'project') {
        if (!task.projectId) throw new Error('This task has no project.');
        await api.projects.update(task.projectId, { dueDate: iso });
      } else if (scope === 'task') {
        await api.tasks.update(task.id, { dueDate: iso });
      } else {
        await api.tasks.setAssigneeDeadline(task.id, userId, iso);
      }
      refresh();
      toast(scope === 'person' ? `Their deadline on this task moved to ${formatDate(iso)} — nobody else's changed` : `Deadline extended to ${formatDate(iso)}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not extend the deadline', 'error');
    } finally { setBusy(''); }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2 flex-wrap">
        <AlertTriangle size={16} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">Coverage at risk</h3>
        <span className="text-[11px] bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-medium">{data.risks.length}</span>
        <span className="text-xs text-amber-600/80 ml-1">short-notice leave over high-priority work — reassign or extend</span>
      </div>
      <div className="divide-y divide-gray-50">
        {data.risks.map(risk => (
          <div key={risk.leaveId} className="px-5 py-3">
            <div className="flex items-center gap-2.5 mb-2">
              <Avatar user={{ id: risk.userId, firstName: risk.name.split(' ')[0], lastName: risk.name.split(' ')[1], profilePhoto: risk.profilePhoto }} size={30} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{risk.name}</p>
                <p className="text-[11px] text-gray-400">
                  {risk.leaveType} leave · {formatDate(risk.startDate)}–{formatDate(risk.endDate)} · {risk.noticeDays}d notice
                </p>
              </div>
            </div>
            <div className="space-y-1.5 sm:pl-10">
              {risk.tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{t.title}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {t.projectId ? <Link href={`/projects/${t.projectId}`} className="hover:text-brand-600">{t.project}</Link> : '—'}
                      {' · '}{t.projectPriority}{' · '}
                      <span className={t.overdue ? 'text-red-500 font-medium' : ''}>{t.overdue ? 'overdue ' : 'due '}{formatDate(t.dueDate)}</span>
                      {' · '}{t.remainingHours}h left
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canTask && (
                      <ExtendMenu task={t} person={{ userId: risk.userId, name: risk.name }} canProject={canProject} disabled={busy === t.id}
                        onExtend={(scope, iso) => extend(scope, t, iso, risk.userId)} />
                    )}
                    {canAssign && (
                      <select
                        disabled={busy === t.id}
                        value=""
                        onChange={e => arrangeCover(t.id, risk, e.target.value)}
                        className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 max-w-[170px] text-gray-600 disabled:opacity-40"
                        title="Give this work to somebody else — while they are away, or for good"
                      >
                        <option value="">Give this to…</option>
                        {/* The two things you can mean by "somebody else does it": only while
                            they are out, or from now on. They are different decisions and the
                            old single Reassign could only ever express the second. */}
                        <optgroup label={`Cover ${formatDate(risk.startDate)}–${formatDate(risk.endDate)}, then back`}>
                          {data.suggestions.map(s => (
                            <option key={`c-${s.userId}`} value={`COVER:${s.userId}`}>{s.name.split(' ')[0]} · {s.freeHours}h free</option>
                          ))}
                        </optgroup>
                        <optgroup label="Hand over for good">
                          {data.suggestions.map(s => (
                            <option key={`h-${s.userId}`} value={`HANDOVER:${s.userId}`}>{s.name.split(' ')[0]} · {s.freeHours}h free</option>
                          ))}
                        </optgroup>
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// One person's row in the retrospective (past-30-days) view — read-only actual attendance,
// with the comp-off count surfaced so managers can see who worked on non-working days.
function HistoryRowView({ row }: { row: HistoryRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/70 transition-colors">
      <div className="w-56 shrink-0 flex items-center gap-2.5">
        <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ')[1], profilePhoto: row.profilePhoto }} size={30} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{row.name}</p>
          <p className="text-[11px] text-gray-400 truncate">{row.designation ?? '—'}</p>
        </div>
      </div>
      <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${row.days.length}, minmax(0, 1fr))` }}>
        {row.days.map(d => <DayCell key={d.date} day={d} segments={null} />)}
      </div>
      <div className="w-40 shrink-0 text-right">
        <p className="text-xs font-medium text-gray-700">{row.present} present · {row.absent} absent</p>
        <p className="text-[10px] text-gray-400">
          {row.onLeave} on leave
          {row.compoff > 0 && <span className="ml-1 text-indigo-600 font-semibold">· ⚑ {row.compoff} comp-off</span>}
        </p>
      </div>
    </div>
  );
}


/**
 * Assigning from the board: pick which project the work belongs to, then reuse the
 * normal AddTaskModal with the person and their free window pre-filled.
 */
/**
 * Single-person task allocation from the capacity board. You clicked ONE person, so this window
 * allocates a role on a task to THAT person only — there is no org-wide assignee picker. Flow:
 * pick a project → pick an existing task under it (or "＋ New task") → role + hours + deadline.
 * Existing task: the person is added to their role via setStaffing, preserving everyone else.
 * New task: a task is created and the person is placed in the role.
 */
function AssignTaskFlow({ row, projects, startDate, dueDate, onClose, onDone }: {
  row: CapacityRow; projects: ApiProject[]; startDate?: string; dueDate?: string;
  onClose: () => void; onDone: () => void;
}) {
  const NEW = '__new__';
  const { toast } = useToast();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');      // '' | existing id | NEW
  const [newTitle, setNewTitle] = useState('');
  const [role, setRole] = useState<'PM' | 'REVIEWER' | 'ANALYST'>('ANALYST');
  const [hours, setHours] = useState('');
  const [due, setDue] = useState(dueDate ?? '');
  // Prefilled from the day that was clicked on the board. It used to be shown in the header and
  // then thrown away for anything but a brand-new task; now it is the seat's start, so clicking
  // a free day and assigning into it puts the work on that day.
  const [start, setStart] = useState(startDate ?? '');
  const [perDay, setPerDay] = useState('');
  const [saving, setSaving] = useState(false);

  const assignable = projects.filter(p => !['ARCHIVED', 'CANCELLED'].includes(p.projectPhase));
  const { data: project } = useQuery<ApiProject>({ queryKey: ['project', projectId], queryFn: () => api.projects.get(projectId), enabled: !!projectId });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ApiTask[]>({ queryKey: ['project-tasks', projectId], queryFn: () => api.tasks.list(projectId), enabled: !!projectId });
  const taskList = project?.taskLists?.find(tl => tl.isDefault) ?? project?.taskLists?.[0];

  const roleLabel = role === 'PM' ? 'Project Manager' : role === 'REVIEWER' ? 'Reviewer' : 'Analyst';
  const canSubmit = !!projectId && (taskId === NEW ? !!newTitle.trim() && !!taskList : !!taskId) && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const entry = {
        userId: row.userId, role,
        estimatedHours: hours ? parseFloat(hours) : 0,
        dueDate: due || null,
        startDate: start || null,
        hoursPerDay: perDay ? parseFloat(perDay) : null,
      };
      if (taskId === NEW) {
        const created = await api.tasks.create({
          title: newTitle.trim(), projectId, taskListId: taskList!.id,
          createdBy: row.userId, startDate: start || undefined, dueDate: due || undefined,
        });
        await api.tasks.setStaffing(created.id, [entry]);
      } else {
        // Add this person to an EXISTING task without disturbing the current staffing. Every
        // other seat is re-sent exactly as it stands — including its own start and ceiling, which
        // would otherwise be wiped by the very act of adding somebody else to the task.
        const t = await api.tasks.get(taskId);
        const existing = (t.assignees ?? [])
          .filter(a => a.role && !(a.userId === row.userId && a.role === role))
          .map(a => ({
            userId: a.userId, role: a.role as 'PM' | 'REVIEWER' | 'ANALYST',
            estimatedHours: a.estimatedHours ?? 0,
            dueDate: a.dueDate ?? null,
            startDate: a.startDate ?? null,
            hoursPerDay: a.hoursPerDay ?? null,
          }));
        await api.tasks.setStaffing(taskId, [...existing, entry]);
      }
      toast(`Assigned ${row.name.split(' ')[0]} as ${roleLabel}`, 'success');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not assign the task', 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ')[1], profilePhoto: row.profilePhoto }} size={36} />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Assign a task to {row.name.split(' ')[0]}</h2>
              <p className="text-xs text-gray-500">{startDate ? `From ${formatDate(startDate)}` : 'Pick a project and task'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3.5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
            <select autoFocus value={projectId} onChange={e => { setProjectId(e.target.value); setTaskId(''); }}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
              <option value="">Select a project…</option>
              {assignable.map(p => <option key={p.id} value={p.id}>{p.code ? `${pidLabel(p.code, p.roundSeq)} · ` : ''}{p.title}</option>)}
            </select>
          </div>

          {projectId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task</label>
              <select value={taskId} onChange={e => setTaskId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
                <option value="">{tasksLoading ? 'Loading tasks…' : 'Select a task…'}</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                <option value={NEW}>＋ New task…</option>
              </select>
            </div>
          )}

          {taskId === NEW && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New task title</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Prior-art search"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
          )}

          {projectId && (taskId && (taskId !== NEW || newTitle.trim())) && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select value={role} onChange={e => setRole(e.target.value as 'PM' | 'REVIEWER' | 'ANALYST')}
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
                    <option value="PM">PM</option>
                    <option value="REVIEWER">Reviewer</option>
                    <option value="ANALYST">Analyst</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                  <input type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} placeholder="0"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                  <input type="date" value={due} onChange={e => setDue(e.target.value)}
                    className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              {/* The start is what puts the hours on a DAY. Without it the board can only spread
                  them between now and the deadline, which is why 7h due in 10 days used to show
                  as 0.7h every day instead of a day's work on the day it was meant to happen. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Starts</label>
                  <input type="date" value={start} max={due || undefined} onChange={e => setStart(e.target.value)}
                    className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours a day <span className="font-normal text-gray-400">· optional</span></label>
                  <input type="number" min="0" max="24" step="0.5" value={perDay} onChange={e => setPerDay(e.target.value)} placeholder="fills the day"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                {row.name.split(' ')[0]} will be added as <span className="font-medium">{roleLabel}</span>
                {due ? ` · due ${formatDate(due)}` : ''}.
                {start
                  ? ` Their ${hours || '0'}h are placed from ${formatDate(start)}${perDay ? `, at ${perDay}h a day` : ''}.`
                  : ' With no start date the hours are spread evenly up to the deadline.'}
              </p>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={submit} disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? <Loader size={14} className="animate-spin" /> : null} Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
