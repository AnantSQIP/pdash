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

const CELL = 40;    // px per day column (bigger than before)
const NAME_W = 200; // px for the frozen member column

const RANGES: { id: string; label: string; back: number; ahead: number }[] = [
  { id: 'q', label: '1 mo back · 3 mo ahead', back: 1, ahead: 3 },
  { id: 'half', label: '1 mo back · 6 mo ahead', back: 1, ahead: 6 },
  { id: 'month', label: 'This month', back: 0, ahead: 0 },
  { id: 'week', label: 'This week', back: 0, ahead: 0 },
];

/**
 * Team Calendar — the whole team's schedule on a scrollable, spreadsheet-style timeline: one row per
 * person, one column per day. The date header row and the member column are FROZEN (sticky) inside
 * the calendar's own scroll box, so they stay in view however you scroll — the fix for the header
 * that used to scroll away. All-day blocks (leave / OOO) fill the cell; timed events show a dot.
 */
export function TeamCalendarView({ users }: { users: UserSummary[] }) {
  const [rangeId, setRangeId] = useState('q');

  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date());
    if (rangeId === 'week') {
      const dow = (today.getDay() + 6) % 7;
      const mon = addDays(today, -dow);
      return { from: mon, to: addDays(mon, 6) };
    }
    if (rangeId === 'month') return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
    const r = RANGES.find(x => x.id === rangeId)!;
    return { from: startOfDay(addMonths(today, -r.back)), to: startOfDay(addMonths(today, r.ahead)) };
  }, [rangeId]);

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

  const fromISO = from.toISOString();
  const toISO = addDays(to, 1).toISOString();
  const { data: freeBusy = [], isLoading } = useQuery<FreeBusy[]>({
    queryKey: ['team-freebusy', userIds.join(','), fromISO, toISO],
    queryFn: () => api.events.freeBusy(userIds, fromISO, toISO),
    enabled: userIds.length > 0,
    staleTime: 30_000,
  });

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

  const headCell = 'sticky top-0 z-20 bg-gray-50 border-b border-r border-gray-200';
  const nameCell = 'sticky left-0 z-10 bg-white border-r border-gray-200';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
        <Users size={16} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-800">Team calendar</h3>
        <span className="text-xs text-gray-400">· {roster.length} people</span>
        {isLoading && <Loader size={14} className="animate-spin text-gray-400" />}
        <select value={rangeId} onChange={e => setRangeId(e.target.value)}
          className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-brand-400">
          {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
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
                const isToday = dayKey(d) === todayKey;
                const wknd = d.getDay() === 0 || d.getDay() === 6;
                const showMonth = d.getDate() === 1 || i === 0;
                return (
                  <th key={dayKey(d)} className={clsx(headCell, 'px-0 py-1.5 text-center align-bottom', wknd && 'bg-gray-100', isToday && 'bg-brand-100')}
                    style={{ width: CELL, minWidth: CELL }}>
                    <div className="h-3.5 text-[9px] font-bold text-brand-600 leading-none">{showMonth ? `${MONTHS[d.getMonth()]}` : ''}</div>
                    <div className="text-[9px] text-gray-400 leading-none">{WD[d.getDay()]}</div>
                    <div className={clsx('text-[12px] font-semibold leading-tight', isToday ? 'text-brand-700' : 'text-gray-600')}>{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {roster.map(u => (
              <tr key={u.id} className="hover:bg-gray-50/40">
                <td className={clsx(nameCell, 'px-3 py-2 border-b border-gray-100')} style={{ width: NAME_W, minWidth: NAME_W }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar user={u} size={28} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{fullName(u)}</p>
                      {u.designation && <p className="text-[10px] text-gray-400 truncate">{u.designation}</p>}
                    </div>
                  </div>
                </td>
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
                    <td key={dayKey(d)} title={title}
                      className={clsx('border-b border-r border-gray-50 p-0 h-11 relative', wknd && !allDay && 'bg-gray-50', isToday && 'ring-1 ring-inset ring-brand-200')}
                      style={{ width: CELL, minWidth: CELL }}>
                      {allDay && <div className="absolute inset-1 rounded bg-violet-200/80" />}
                      {timed.length > 0 && (
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full bg-brand-500" style={{ width: 7, height: 7 }} />
                      )}
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
      <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
        Purple = all-day block (leave / out-of-office) · blue dot = a timed event · shaded = weekend. The date row and the member column stay put while you scroll. Hover a cell for details.
      </p>
    </div>
  );
}
