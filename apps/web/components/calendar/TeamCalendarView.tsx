'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader, Users, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
import { api, type FreeBusy, type UserSummary, type Holiday, type CalendarEvent } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';
import { useOrg } from '@/lib/org-context';
import { EVENT_COLORS } from '@/lib/calendar-colors';
import { WEEKDAYS_LETTER, weekdayIndex } from '@/lib/date';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const NAME_W = 220; // px for the frozen member column

// How many days each span shows, ALWAYS starting from the day you're looking at (or the anchor you
// paged to). A team schedule answers "who is around now / next" — so it never opens in the past;
// use the ‹ › arrows to look back.
const SPANS: { id: string; label: string; days: number }[] = [
  { id: '7', label: '1 week', days: 7 },
  { id: '14', label: '2 weeks', days: 14 },
  { id: '30', label: '1 month', days: 30 },
  { id: '90', label: '3 months', days: 90 },
];

// One cell size — wide enough to READ the event text. (A "Compact" mode existed but it made events
// unreadable, which was the original complaint; long spans are handled by paging instead.)
const CELL_W = 132;
const ROW_H = 64;

/** Chip colour per availability kind — same palette the rest of the calendar uses. */
const KIND_COLOR: Record<string, string> = {
  LEAVE: EVENT_COLORS.LEAVE,
  WFH: EVENT_COLORS.WFH,
  COMPOFF: EVENT_COLORS.COMPOFF,
  MEETING: EVENT_COLORS.MEETING,
};
const kindColor = (k?: string) => KIND_COLOR[k ?? 'MEETING'] ?? EVENT_COLORS.EVENT;

/**
 * Team Calendar — the whole team's schedule: one row per person, one column per day.
 *
 * It ALWAYS starts on the day you are viewing (today by default) and runs forward for the chosen
 * span — a team schedule answers "who is around now and next", so it must never open weeks in the
 * past. Use ‹ › to page a whole span back/forward and "Today" to return.
 *
 * The date header row and the member column are frozen (sticky) inside the calendar's own scroll
 * box. Above the roster sits a COMPANY row: holidays and org-wide events, visible to everyone —
 * previously the team view showed only per-person blocks, so a public holiday in the middle of the
 * window looked like an ordinary working day nobody had booked.
 *
 * Personal detail stays private: the server sends availability blocks WITHOUT the leave type,
 * reason, or meeting title. Chips are coloured by kind and marked when a request is still pending.
 */
export function TeamCalendarView({ users }: { users: UserSummary[] }) {
  const [spanId, setSpanId] = useState('14');
  // `anchor` is the FIRST day shown. Starts at today; the ‹ › buttons page it, "Today" resets it.
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const CELL = CELL_W;

  const spanDays = Number(SPANS.find(s => s.id === spanId)?.days ?? 14);
  const from = anchor;
  const to = useMemo(() => addDays(anchor, spanDays - 1), [anchor, spanDays]);
  const onToday = dayKey(anchor) === dayKey(startOfDay(new Date()));

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) out.push(new Date(d));
    return out;
  }, [from, to]);

  const roster = useMemo(
    () => [...users].sort((a, b) => fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase())),
    [users],
  );
  const userIds = useMemo(() => roster.map(u => u.id), [roster]);
  const { org } = useOrg();
  const orgId = org?.id;

  const fromISO = from.toISOString();
  const toISO = addDays(to, 1).toISOString();
  const { data: freeBusy = [], isLoading } = useQuery<FreeBusy[]>({
    queryKey: ['team-freebusy', userIds.join(','), fromISO, toISO],
    queryFn: () => api.events.freeBusy(userIds, fromISO, toISO),
    enabled: userIds.length > 0,
    staleTime: 30_000,
  });

  // Company holidays for every year the window touches (a 3-month span can straddle Dec/Jan).
  const years = useMemo(
    () => [...new Set([from.getFullYear(), to.getFullYear()])],
    [from, to],
  );
  const { data: holidayGroups = [] } = useQuery<Holiday[][]>({
    queryKey: ['team-holidays', orgId, years.join(',')],
    queryFn: () => Promise.all(years.map(y => api.leave.holidays(orgId!, y))),
    enabled: !!orgId,
    staleTime: 300_000,
  });
  const holidayByDay = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidayGroups.flat()) m.set(String(h.date).slice(0, 10), h);
    return m;
  }, [holidayGroups]);

  // Org-wide happenings: all-day calendar entries that belong to nobody in particular
  // (company events, announcements). Personal leave/WFH rows are excluded — they belong to
  // the member rows, not the company row.
  const { data: orgEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['team-org-events', orgId, dayKey(from), dayKey(to)],
    queryFn: () => api.events.list(orgId!, fromISO, toISO),
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const companyByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    const PERSONAL = new Set(['LEAVE', 'WFH', 'COMPOFF']);
    for (const e of orgEvents) {
      if (PERSONAL.has(e.type) || e.pending) continue;
      if (e.attendees && e.attendees.length > 0) continue; // targeted at specific people
      const start = new Date(e.startDate);
      const end = new Date(e.endDate ?? e.startDate);
      for (let d = startOfDay(start); d <= end; d = addDays(d, 1)) {
        const k = dayKey(d);
        (m.get(k) ?? m.set(k, []).get(k)!).push(e);
      }
    }
    return m;
  }, [orgEvents]);

  const byUserDay = useMemo(() => {
    const map = new Map<string, FreeBusy['busy']>();
    for (const f of freeBusy) {
      for (const b of f.busy) {
        for (let d = new Date(b.start); dayKey(d) <= dayKey(new Date(b.end)); d = addDays(d, 1)) {
          const k = `${f.userId}|${dayKey(d)}`;
          (map.get(k) ?? map.set(k, []).get(k)!).push(b);
        }
      }
    }
    return map;
  }, [freeBusy]);

  const todayKey = dayKey(new Date());
  const hasCompanyRow = holidayByDay.size > 0 || companyByDay.size > 0;

  const headCell = 'sticky top-0 z-20 bg-gray-50 border-b border-r border-gray-200';
  const nameCell = 'sticky left-0 z-10 bg-white border-r border-gray-200';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
        <Users size={16} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-800">Team calendar</h3>
        <span className="text-xs text-gray-400">· {roster.length} people</span>
        {isLoading && <Loader size={14} className="animate-spin text-gray-400" />}

        {/* Navigation: the view ALWAYS starts at the anchor day (today by default). Page back/forward
            a span at a time; "Today" jumps back to now. */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setAnchor(a => addDays(a, -spanDays))} title="Earlier"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={15} /></button>
            <span className="text-xs font-medium text-gray-700 min-w-[150px] text-center">
              {from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {to.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => setAnchor(a => addDays(a, spanDays))} title="Later"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={15} /></button>
            <button onClick={() => setAnchor(startOfDay(new Date()))} disabled={onToday}
              className="ml-1 px-2.5 py-1 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40 disabled:cursor-default">
              Today
            </button>
          </div>

          {/* How many days to show, starting from the anchor. */}
          <select value={spanId} onChange={e => setSpanId(e.target.value)} title="How many days to show"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-brand-400">
            {SPANS.map(s => <option key={s.id} value={s.id}>Show {s.label}</option>)}
          </select>
        </div>
      </div>

      {/* ONE scroll box (both axes). The header row (sticky top) and member column (sticky left)
          stay frozen inside it — the date bar no longer scrolls away. */}
      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="border-collapse" style={{ width: NAME_W + days.length * CELL }}>
          <thead>
            <tr>
              <th className={clsx(headCell, 'left-0 z-30 text-left px-4')} style={{ width: NAME_W, minWidth: NAME_W }}>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Member</span>
              </th>
              {days.map((d, i) => {
                const k = dayKey(d);
                const isToday = k === todayKey;
                const wknd = d.getDay() === 0 || d.getDay() === 6;
                const hol = holidayByDay.get(k);
                const showMonth = d.getDate() === 1 || i === 0;
                return (
                  <th key={k} title={hol ? `${hol.name} — company holiday` : undefined}
                    className={clsx(headCell, 'px-0 py-2 text-center align-bottom',
                      wknd && 'bg-gray-100', hol && 'bg-red-50', isToday && 'bg-brand-100')}
                    style={{ width: CELL, minWidth: CELL }}>
                    <div className="h-4 text-[11px] font-bold text-brand-600 leading-none">{showMonth ? `${MONTHS[d.getMonth()]}` : ''}</div>
                    <div className="text-[11px] text-gray-400 leading-none mt-0.5">{WEEKDAYS_LETTER[weekdayIndex(d)]}</div>
                    <div className={clsx('text-[16px] font-semibold leading-tight',
                      hol ? 'text-red-700' : isToday ? 'text-brand-700' : 'text-gray-600')}>{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Company row — holidays and org-wide events, the same for everybody. */}
            {hasCompanyRow && (
              <tr className="bg-gray-50/60">
                <td className={clsx(nameCell, 'px-3 py-2 border-b-2 border-gray-200 bg-gray-50')} style={{ width: NAME_W, minWidth: NAME_W }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0">
                      <Building2 size={14} className="text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">Company</p>
                      <p className="text-[11px] text-gray-400 truncate">Holidays &amp; org-wide</p>
                    </div>
                  </div>
                </td>
                {days.map(d => {
                  const k = dayKey(d);
                  const hol = holidayByDay.get(k);
                  const evs = companyByDay.get(k) ?? [];
                  const isToday = k === todayKey;
                  const title = [hol && `${hol.name} — company holiday`, ...evs.map(e => e.title)].filter(Boolean).join('\n') || undefined;
                  return (
                    <td key={k} title={title}
                      className={clsx('border-b-2 border-r border-gray-200 align-top p-1',
                        hol && 'bg-red-50', isToday && 'ring-1 ring-inset ring-brand-200')}
                      style={{ width: CELL, minWidth: CELL, height: 44 }}>
                      <div className="flex flex-col gap-0.5 h-full overflow-hidden">
                        {hol && (
                          <span className="rounded px-1.5 py-1 text-[11px] font-semibold leading-tight truncate text-white"
                            style={{ backgroundColor: EVENT_COLORS.HOLIDAY }}>
                            {hol.name}
                          </span>
                        )}
                        {evs.slice(0, hol ? 1 : 2).map(e => (
                          <span key={e.id} className="rounded px-1.5 py-1 text-[11px] leading-tight truncate text-white"
                            style={{ backgroundColor: EVENT_COLORS[(e.type as keyof typeof EVENT_COLORS)] ?? EVENT_COLORS.EVENT }}>
                            {e.title}
                          </span>
                        ))}
                        {evs.length > (hol ? 1 : 2) && (
                          <span className="text-[10px] text-gray-400 px-1">+{evs.length - (hol ? 1 : 2)} more</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}

            {roster.map(u => (
              <tr key={u.id} className="hover:bg-gray-50/40">
                <td className={clsx(nameCell, 'px-3 py-2 border-b border-gray-100')} style={{ width: NAME_W, minWidth: NAME_W }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar user={u} size={28} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{fullName(u)}</p>
                      {u.designation && <p className="text-[11px] text-gray-400 truncate">{u.designation}</p>}
                    </div>
                  </div>
                </td>
                {days.map(d => {
                  const k = dayKey(d);
                  const items = byUserDay.get(`${u.id}|${k}`) ?? [];
                  const allDay = items.find(b => b.allDay);
                  const timed = items.filter(b => !b.allDay);
                  const wknd = d.getDay() === 0 || d.getDay() === 6;
                  const hol = holidayByDay.get(k);
                  const isToday = k === todayKey;
                  const title = items.length
                    ? `${fullName(u)} · ${k}\n` + items.map(b => `${b.allDay ? 'All day' : fmtTime(b.start)} — ${b.title}`).join('\n')
                    : undefined;
                  return (
                    <td key={k} title={title}
                      className={clsx('border-b border-r border-gray-100 align-top relative p-1',
                        wknd && !allDay && 'bg-gray-50',
                        hol && !allDay && 'bg-red-50/50',
                        isToday && 'ring-1 ring-inset ring-brand-200')}
                      style={{ width: CELL, minWidth: CELL, height: ROW_H }}>
                      {/* Entries as readable chips — the whole point of the wider cell. A PENDING
                          request is hollow (dashed outline) so it never reads as agreed. */}
                      <div className="flex flex-col gap-0.5 h-full overflow-hidden">
                        {allDay && (
                          <span
                            className={clsx('rounded px-1.5 py-1 text-[11px] font-medium leading-tight truncate',
                              allDay.pending ? 'border border-dashed bg-white' : 'text-white')}
                            style={allDay.pending
                              ? { borderColor: kindColor(allDay.kind), color: kindColor(allDay.kind) }
                              : { backgroundColor: kindColor(allDay.kind) }}>
                            {allDay.title}
                          </span>
                        )}
                        {timed.slice(0, allDay ? 1 : 2).map((b, i) => (
                          <span key={i} className="rounded px-1.5 py-1 text-[11px] leading-tight truncate text-white"
                            style={{ backgroundColor: kindColor(b.kind) }}>
                            <span className="tabular-nums font-medium">{fmtTime(b.start)}</span> {b.title}
                          </span>
                        ))}
                        {timed.length > (allDay ? 1 : 2) && (
                          <span className="text-[10px] text-gray-400 px-1">+{timed.length - (allDay ? 1 : 2)} more</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {roster.length === 0 && (
              <tr><td colSpan={days.length + 1} className="px-4 py-10 text-center text-sm text-gray-400">No team members to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-x-4 gap-y-1.5 flex-wrap">
        {([['Leave', EVENT_COLORS.LEAVE], ['WFH', EVENT_COLORS.WFH], ['Comp-off', EVENT_COLORS.COMPOFF],
           ['Meeting', EVENT_COLORS.MEETING], ['Holiday', EVENT_COLORS.HOLIDAY]] as const).map(([label, c]) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />{label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-gray-400" />Requested (awaiting approval)
        </span>
        <span className="text-[11px] text-gray-400">
          Starts on the day you&apos;re viewing — use ‹ › to look back or ahead. Personal detail (leave type, reason, meeting title) stays private.
        </span>
      </div>
    </div>
  );
}
