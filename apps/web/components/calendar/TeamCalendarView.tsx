'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader, Users, ChevronLeft, ChevronRight } from 'lucide-react';
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

// Cell sizing. "Comfortable" is wide enough to READ the event text in each cell; "Compact" keeps
// long ranges scannable. Short ranges default to comfortable.
const SIZES = {
  comfortable: { cell: 132, row: 64, label: 'Comfortable' },
  compact: { cell: 56, row: 44, label: 'Compact' },
} as const;
type SizeKey = keyof typeof SIZES;

/**
 * Team Calendar — the whole team's schedule: one row per person, one column per day.
 *
 * It ALWAYS starts on the day you are viewing (today by default) and runs forward for the chosen
 * span — a team schedule answers "who is around now and next", so it must never open weeks in the
 * past. Use ‹ › to page a whole span back/forward and "Today" to return.
 *
 * The date header row and the member column are frozen (sticky) inside the calendar's own scroll
 * box. All-day blocks (leave / OOO) fill the cell; timed events show as chips (or a dot in Compact).
 */
export function TeamCalendarView({ users }: { users: UserSummary[] }) {
  const [spanId, setSpanId] = useState('14');
  const [size, setSize] = useState<SizeKey>('comfortable');
  // `anchor` is the FIRST day shown. Starts at today; the ‹ › buttons page it, "Today" resets it.
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const CELL = SIZES[size].cell;
  const ROW_H = SIZES[size].row;
  const roomy = size === 'comfortable';

  const spanDays = Number(SPANS.find(s => s.id === spanId)?.days ?? 14);
  const from = anchor;
  const to = useMemo(() => addDays(anchor, spanDays - 1), [anchor, spanDays]);
  const onToday = dayKey(anchor) === dayKey(startOfDay(new Date()));

  /** Switching to a long span in Comfortable would make an absurdly wide grid (90 × 132px ≈ 12000px),
   *  so drop to Compact automatically — the user can switch back if they really want it. */
  function chooseSpan(id: string) {
    setSpanId(id);
    if (Number(id) > 14) setSize('compact');
    else setSize('comfortable');
  }

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
          <select value={spanId} onChange={e => chooseSpan(e.target.value)} title="How many days to show"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-brand-400">
            {SPANS.map(s => <option key={s.id} value={s.id}>Show {s.label}</option>)}
          </select>

          {/* Cell size — comfortable shows the event text; compact fits longer spans. */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(Object.keys(SIZES) as SizeKey[]).map(k => (
              <button key={k} onClick={() => setSize(k)}
                className={clsx('px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  size === k ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {SIZES[k].label}
              </button>
            ))}
          </div>
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
                const isToday = dayKey(d) === todayKey;
                const wknd = d.getDay() === 0 || d.getDay() === 6;
                const showMonth = d.getDate() === 1 || i === 0;
                return (
                  <th key={dayKey(d)} className={clsx(headCell, 'px-0 py-2 text-center align-bottom', wknd && 'bg-gray-100', isToday && 'bg-brand-100')}
                    style={{ width: CELL, minWidth: CELL }}>
                    <div className={clsx('font-bold text-brand-600 leading-none', roomy ? 'h-4 text-[11px]' : 'h-3.5 text-[9px]')}>{showMonth ? `${MONTHS[d.getMonth()]}` : ''}</div>
                    <div className={clsx('text-gray-400 leading-none', roomy ? 'text-[11px] mt-0.5' : 'text-[9px]')}>{WD[d.getDay()]}</div>
                    <div className={clsx('font-semibold leading-tight', roomy ? 'text-[16px]' : 'text-[12px]', isToday ? 'text-brand-700' : 'text-gray-600')}>{d.getDate()}</div>
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
                      <p className={clsx('font-semibold text-gray-800 truncate', roomy ? 'text-sm' : 'text-xs')}>{fullName(u)}</p>
                      {u.designation && <p className={clsx('text-gray-400 truncate', roomy ? 'text-[11px]' : 'text-[10px]')}>{u.designation}</p>}
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
                      className={clsx('border-b border-r border-gray-100 align-top relative', wknd && !allDay && 'bg-gray-50', isToday && 'ring-1 ring-inset ring-brand-200', roomy ? 'p-1' : 'p-0')}
                      style={{ width: CELL, minWidth: CELL, height: ROW_H }}>
                      {roomy ? (
                        // Comfortable: show the actual entries as readable chips.
                        <div className="flex flex-col gap-0.5 h-full overflow-hidden">
                          {allDay && (
                            <span className="rounded px-1.5 py-1 bg-violet-100 text-violet-800 text-[11px] font-medium leading-tight truncate">
                              {allDay.title}
                            </span>
                          )}
                          {timed.slice(0, allDay ? 1 : 2).map((b, i) => (
                            <span key={i} className="rounded px-1.5 py-1 bg-brand-100 text-brand-800 text-[11px] leading-tight truncate">
                              <span className="tabular-nums font-medium">{fmtTime(b.start)}</span> {b.title}
                            </span>
                          ))}
                          {timed.length > (allDay ? 1 : 2) && (
                            <span className="text-[10px] text-gray-400 px-1">+{timed.length - (allDay ? 1 : 2)} more</span>
                          )}
                        </div>
                      ) : (
                        // Compact: the original fill + dot, for long ranges.
                        <>
                          {allDay && <div className="absolute inset-1 rounded bg-violet-200/80" />}
                          {timed.length > 0 && (
                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full bg-brand-500" style={{ width: 7, height: 7 }} />
                          )}
                        </>
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
        Starts on the day you&apos;re viewing — use ‹ › to look back or ahead, or <span className="font-medium">Today</span> to return. Purple = all-day block (leave / out-of-office) · blue = a timed event · shaded = weekend. Hover any cell for the full details.
      </p>
    </div>
  );
}
