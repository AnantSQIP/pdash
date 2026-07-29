'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader, Users } from 'lucide-react';
import { api, type FreeBusy, type UserSummary } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/**
 * Team Calendar — the whole team's week at a glance: one row per person, one column per day,
 * each cell showing that person's events / all-day blocks (meetings, leave, holidays surface via
 * the shared free/busy feed). Read-only overview; add/edit still happens in Month/Week.
 */
export function TeamCalendarView({ weekStart, users }: { weekStart: Date; users: UserSummary[] }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const roster = useMemo(
    () => [...users].sort((a, b) => fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase())),
    [users],
  );
  const userIds = useMemo(() => roster.map(u => u.id), [roster]);

  const fromISO = days[0].toISOString();
  const toISO = addDays(weekStart, 7).toISOString();
  const { data: freeBusy = [], isLoading } = useQuery<FreeBusy[]>({
    queryKey: ['team-freebusy', userIds.join(','), fromISO, toISO],
    queryFn: () => api.events.freeBusy(userIds, fromISO, toISO),
    enabled: userIds.length > 0,
    staleTime: 30_000,
  });

  const byUser = useMemo(() => new Map(freeBusy.map(f => [f.userId, f.busy])), [freeBusy]);
  const todayKey = dayKey(new Date());

  // Busy items for one user that fall on a given calendar day.
  function itemsFor(userId: string, day: Date) {
    const k = dayKey(day);
    return (byUser.get(userId) ?? [])
      .filter(b => dayKey(new Date(b.start)) <= k && k <= dayKey(new Date(b.end)))
      .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Users size={16} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-800">Team calendar</h3>
        <span className="text-xs text-gray-400">· {roster.length} people</span>
        {isLoading && <Loader size={14} className="animate-spin text-gray-400 ml-1" />}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* Header row: day names + dates */}
          <div className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
            <div className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Member</div>
            {days.map(d => {
              const isToday = dayKey(d) === todayKey;
              return (
                <div key={dayKey(d)} className={clsx('px-2 py-2 text-center border-l border-gray-100', isToday && 'bg-brand-50')}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">{DAY_LABELS[d.getDay()]}</p>
                  <p className={clsx('text-sm font-semibold', isToday ? 'text-brand-600' : 'text-gray-700')}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>

          {/* One row per member */}
          {roster.map(u => (
            <div key={u.id} className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
              <div className="px-4 py-2.5 flex items-center gap-2 min-w-0">
                <Avatar user={u} size={26} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{fullName(u)}</p>
                  {u.designation && <p className="text-[10px] text-gray-400 truncate">{u.designation}</p>}
                </div>
              </div>
              {days.map(d => {
                const items = itemsFor(u.id, d);
                const isToday = dayKey(d) === todayKey;
                return (
                  <div key={dayKey(d)} className={clsx('px-1.5 py-2 border-l border-gray-100 space-y-1 min-h-[52px]', isToday && 'bg-brand-50/40')}>
                    {items.length === 0 ? (
                      <span className="block text-center text-[11px] text-gray-200 pt-1.5">·</span>
                    ) : items.map((b, i) => (
                      <div key={i}
                        title={`${b.title}${b.allDay ? '' : ` · ${fmtTime(b.start)}`}`}
                        className={clsx('rounded-md px-1.5 py-1 text-[10px] leading-tight truncate',
                          b.allDay ? 'bg-violet-100 text-violet-700 font-medium' : 'bg-brand-100 text-brand-700')}>
                        {!b.allDay && <span className="tabular-nums opacity-80 mr-1">{fmtTime(b.start)}</span>}
                        {b.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
          {roster.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">No team members to show.</p>
          )}
        </div>
      </div>
      <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
        Purple = all-day (leave / holiday / out-of-office). Blue = timed events. Switch to Month or Week to add or edit.
      </p>
    </div>
  );
}
