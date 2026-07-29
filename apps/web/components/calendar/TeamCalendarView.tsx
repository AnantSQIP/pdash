'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader, Users } from 'lucide-react';
import { api, type FreeBusy, type UserSummary } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CELL = 34; // px per day column
const NAME_W = 176; // px for the sticky person column

// How far back / ahead each range preset spans (months), anchored on today.
const RANGES: { id: string; label: string; back: number; ahead: number }[] = [
  { id: 'q', label: '1 mo back · 3 mo ahead', back: 1, ahead: 3 },
  { id: 'half', label: '1 mo back · 6 mo ahead', back: 1, ahead: 6 },
  { id: 'month', label: 'This month', back: 0, ahead: 0 },
  { id: 'week', label: 'This week', back: 0, ahead: 0 },
];

/**
 * Team Calendar — the team's schedule across a multi-month window on a scrollable timeline: one row
 * per person, one column per day. All-day blocks (leave / holiday / OOO) render as filled cells,
 * timed events as a dot. Read-only overview; add/edit stays in Month/Week.
 */
export function TeamCalendarView({ users }: { users: UserSummary[] }) {
  const [rangeId, setRangeId] = useState('q');

  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date());
    if (rangeId === 'week') {
      const dow = (today.getDay() + 6) % 7; // Mon=0
      const mon = addDays(today, -dow);
      return { from: mon, to: addDays(mon, 6) };
    }
    if (rangeId === 'month') {
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
    }
    const r = RANGES.find(x => x.id === rangeId)!;
    return { from: startOfDay(addMonths(today, -r.back)), to: startOfDay(addMonths(today, r.ahead)) };
  }, [rangeId]);

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) out.push(new Date(d));
    return out;
  }, [from, to]);

  // Month header spans (label + how many day-columns it covers within the range).
  const monthSpans = useMemo(() => {
    const spans: { label: string; count: number }[] = [];
    for (const d of days) {
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const last = spans[spans.length - 1];
      if (last && last.label === label) last.count++;
      else spans.push({ label, count: 1 });
    }
    return spans;
  }, [days]);

  const roster = useMemo(
    () => [...users].sort((a, b) => fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase())),
    [users],
  );
  const userIds = useMemo(() => roster.map(u => u.id), [roster]);

  const fromISO = from.toISOString();
  const toISO = addDays(to, 1).toISOString();
  const { data: freeBusy = [], isLoading } = useQuery<FreeBusy[]>({
    queryKey: ['team-freebusy', userIds.join(','), fromISO, toISO],
    queryFn: () => api.events.freeBusy(userIds, fromISO, toISO),
    enabled: userIds.length > 0,
    staleTime: 30_000,
  });

  // Index each user's busy items by the calendar day(s) they cover.
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
  const gridW = NAME_W + days.length * CELL;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
        <Users size={16} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-800">Team calendar</h3>
        <span className="text-xs text-gray-400">· {roster.length} people</span>
        {isLoading && <Loader size={14} className="animate-spin text-gray-400" />}
        <select
          value={rangeId}
          onChange={e => setRangeId(e.target.value)}
          className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-brand-400"
        >
          {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <div style={{ width: gridW }}>
          {/* Month header */}
          <div className="flex border-b border-gray-100 bg-gray-50">
            <div className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200 shrink-0" style={{ width: NAME_W }} />
            {monthSpans.map((m, i) => (
              <div key={i} className="text-[11px] font-semibold text-gray-500 px-2 py-1.5 border-r border-gray-100 shrink-0 truncate" style={{ width: m.count * CELL }}>
                {m.label}
              </div>
            ))}
          </div>

          {/* Day header */}
          <div className="flex border-b border-gray-200 bg-gray-50/70">
            <div className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200 shrink-0 flex items-center px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wide" style={{ width: NAME_W }}>Member</div>
            {days.map(d => {
              const wknd = d.getDay() === 0 || d.getDay() === 6;
              const isToday = dayKey(d) === todayKey;
              return (
                <div key={dayKey(d)} className={clsx('shrink-0 text-center py-1 border-r border-gray-100', wknd && 'bg-gray-100/60', isToday && 'bg-brand-100')} style={{ width: CELL }}>
                  <p className="text-[9px] text-gray-400 leading-none">{WD[d.getDay()]}</p>
                  <p className={clsx('text-[11px] font-semibold leading-tight', isToday ? 'text-brand-700' : 'text-gray-600')}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>

          {/* Person rows */}
          {roster.map(u => (
            <div key={u.id} className="flex border-b border-gray-100 last:border-0 hover:bg-gray-50/40">
              <div className="sticky left-0 z-10 bg-white border-r border-gray-200 shrink-0 flex items-center gap-2 px-3 py-2" style={{ width: NAME_W }}>
                <Avatar user={u} size={24} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{fullName(u)}</p>
                  {u.designation && <p className="text-[9px] text-gray-400 truncate">{u.designation}</p>}
                </div>
              </div>
              {days.map(d => {
                const items = byUserDay.get(`${u.id}|${dayKey(d)}`) ?? [];
                const allDay = items.find(b => b.allDay);
                const timed = items.filter(b => !b.allDay);
                const wknd = d.getDay() === 0 || d.getDay() === 6;
                const isToday = dayKey(d) === todayKey;
                const title = items.length
                  ? `${fullName(u)} · ${dayKey(d)}\n` + items.map(b => `${b.allDay ? 'All day' : fmtTime(b.start)} — ${b.title}`).join('\n')
                  : undefined;
                return (
                  <div key={dayKey(d)} title={title}
                    className={clsx('shrink-0 h-9 border-r border-gray-50 flex items-center justify-center relative',
                      wknd && !allDay && 'bg-gray-50', isToday && 'ring-1 ring-inset ring-brand-300')}>
                    {allDay && <div className="absolute inset-1 rounded bg-violet-200/80" />}
                    {timed.length > 0 && (
                      <span className={clsx('relative z-10 rounded-full', allDay ? 'bg-violet-600' : 'bg-brand-500')}
                        style={{ width: 6, height: 6 }} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {roster.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-400">No team members to show.</p>}
        </div>
      </div>
      <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
        Purple = all-day block (leave / out-of-office) · blue dot = a timed event · shaded = weekend. Hover a cell for details. Scroll sideways to see the full range.
      </p>
    </div>
  );
}
