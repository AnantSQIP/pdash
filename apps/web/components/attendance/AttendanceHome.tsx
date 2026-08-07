'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { CalendarDays, ListOrdered, ShieldCheck, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import type { AttendanceMonth, AttendanceDay, Holiday, RegularizationRequest } from '@/lib/api';
import { WEEKDAYS_SHORT, monthLeadPad } from '@/lib/date';

/**
 * Attendance laid out the way the team reads it in TeamNest: a calendar, a log of what the clock
 * recorded, and a status view putting what was RECORDED next to what was REQUESTED.
 *
 * The log's Overtime and Deficit columns are derived here rather than stored, because a day's
 * expected hours depend on what kind of day it was — a half-day of leave owes four hours, a
 * holiday owes none, and a full working day owes eight.
 */

const FULL_DAY_HOURS = 8;
const HALF_DAY_HOURS = 4;

/** What the person was expected to put in on this day. Nothing is owed on a day off. */
function targetHours(d: AttendanceDay): number {
  if (d.status === 'HOLIDAY' || d.status === 'WEEKEND' || d.status === 'ON_LEAVE') return 0;
  if (d.status === 'HALF_DAY') return HALF_DAY_HOURS;
  return FULL_DAY_HOURS;
}

const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Present', ABSENT: 'Absent', HALF_DAY: 'Half Day', ON_LEAVE: 'On Leave',
  HOLIDAY: 'Holiday', WEEKEND: 'Weekly Off', LATE: 'Late', NONE: 'Not Marked',
};
const STATUS_TONE: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700 border-green-200',
  WFH: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  ABSENT: 'bg-red-100 text-red-700 border-red-200',
  HALF_DAY: 'bg-amber-100 text-amber-700 border-amber-200',
  ON_LEAVE: 'bg-blue-100 text-blue-700 border-blue-200',
  HOLIDAY: 'bg-purple-100 text-purple-700 border-purple-200',
  WEEKEND: 'bg-gray-100 text-gray-500 border-gray-200',
  LATE: 'bg-orange-100 text-orange-700 border-orange-200',
  NONE: 'bg-gray-50 text-gray-400 border-gray-200',
};
/** A worked-from-home day is still present, but it is labelled as its own thing everywhere. */
function displayStatus(d: { status: string; workMode?: string }): string {
  const worked = d.status === 'PRESENT' || d.status === 'HALF_DAY' || d.status === 'LATE';
  return worked && d.workMode === 'WFH' ? 'WFH' : d.status;
}
function statusLabel(d: { status: string; workMode?: string }): string {
  const key = displayStatus(d);
  return key === 'WFH' ? (d.status === 'HALF_DAY' ? 'Half Day (WFH)' : 'Work From Home') : (STATUS_LABEL[key] ?? key);
}

const TABS = [
  { id: 'calendar', label: 'Attendance Calendar', icon: CalendarDays },
  { id: 'log', label: 'Attendance Log', icon: ListOrdered },
  { id: 'status', label: 'Attendance Status', icon: ShieldCheck },
] as const;
type TabId = (typeof TABS)[number]['id'];

const hhmm = (s?: string | null) =>
  s ? new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
const hrs = (n: number) => (n === 0 ? '—' : `${n.toFixed(2)} h`);

export function AttendanceHome({ month, holidays, regularizations, year, monthNum, onShiftMonth, onPickDay }: {
  month?: AttendanceMonth;
  holidays: Holiday[];
  regularizations: RegularizationRequest[];
  year: number;
  monthNum: number;
  onShiftMonth: (delta: number) => void;
  onPickDay: (dateKey: string) => void;
}) {
  const [tab, setTab] = useState<TabId>('calendar');
  const monthStart = new Date(year, monthNum - 1, 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-2 flex-wrap">
        <div className="flex overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={clsx('inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
        {/* One month control for all three tabs — they are three readings of the same month. */}
        <div className="flex items-center gap-1 px-2 py-2">
          <button onClick={() => onShiftMonth(-1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Previous month"><ChevronLeft size={17} /></button>
          <span className="text-sm font-semibold text-gray-800 w-32 text-center">{format(monthStart, 'MMMM yyyy')}</span>
          <button onClick={() => onShiftMonth(1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Next month"><ChevronRight size={17} /></button>
        </div>
      </div>

      {tab === 'calendar' && <AttendanceCalendar month={month} holidays={holidays} year={year} monthNum={monthNum} onPickDay={onPickDay} />}
      {tab === 'log' && <AttendanceLog month={month} />}
      {tab === 'status' && <AttendanceStatus month={month} regularizations={regularizations} onPickDay={onPickDay} />}
    </div>
  );
}

// ── Attendance Calendar ───────────────────────────────────────────────────────
function AttendanceCalendar({ month, holidays, year, monthNum, onPickDay }: {
  month?: AttendanceMonth; holidays: Holiday[]; year: number; monthNum: number; onPickDay: (k: string) => void;
}) {
  const byDay = useMemo(() => new Map((month?.days ?? []).map(d => [d.date.slice(0, 10), d])), [month]);
  const holidayNames = useMemo(() => new Map(holidays.map(h => [h.date.slice(0, 10), h.name])), [holidays]);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const lead = monthLeadPad(year, monthNum - 1);
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS_SHORT.map(d => <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const key = `${year}-${String(monthNum).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          const rec = byDay.get(key);
          const future = key > todayKey;
          const tone = rec && !future
            ? (STATUS_TONE[displayStatus(rec)] ?? STATUS_TONE.NONE)
            : 'bg-white border-gray-100 text-gray-300';
          const holiday = holidayNames.get(key);
          return (
            <button key={key} onClick={() => onPickDay(key)} title={rec ? statusLabel(rec) : holiday ?? ''}
              className={clsx('aspect-square rounded-lg border p-1.5 flex flex-col text-left overflow-hidden hover:ring-2 hover:ring-brand-400 transition-shadow',
                tone, key === todayKey && 'ring-2 ring-brand-500 ring-offset-1')}>
              <span className="text-xs font-semibold leading-none">{i + 1}</span>
              {rec && !future && (
                <>
                  <span className="mt-auto text-[9px] font-medium leading-tight truncate">{statusLabel(rec)}</span>
                  {rec.totalHours != null && rec.totalHours > 0 && (
                    <span className="text-[9px] leading-tight opacity-75 tabular-nums">{rec.totalHours.toFixed(1)}h</span>
                  )}
                </>
              )}
              {/* Something asked for but not yet decided — shown so the day does not look settled. */}
              {rec?.pending && <span className="mt-auto text-[9px] leading-tight text-amber-600 truncate">● {rec.pending.label}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-gray-100">
        {['PRESENT', 'WFH', 'HALF_DAY', 'ON_LEAVE', 'ABSENT', 'LATE', 'HOLIDAY', 'WEEKEND'].map(k => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className={clsx('w-3 h-3 rounded border', STATUS_TONE[k])} />
            {k === 'WFH' ? 'Work From Home' : STATUS_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Attendance Log ────────────────────────────────────────────────────────────
function AttendanceLog({ month }: { month?: AttendanceMonth }) {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  // Only days that have happened — a log of the future is noise.
  const rows = useMemo(
    () => (month?.days ?? []).filter(d => d.date.slice(0, 10) <= todayKey).slice().reverse(),
    [month, todayKey],
  );
  const totals = useMemo(() => rows.reduce((a, d) => {
    const worked = d.totalHours ?? 0;
    const target = targetHours(d);
    a.worked += worked;
    a.overtime += Math.max(0, worked - target);
    a.deficit += Math.max(0, target - worked);
    return a;
  }, { worked: 0, overtime: 0, deficit: 0 }), [rows]);

  if (rows.length === 0) return <p className="px-5 py-12 text-center text-sm text-gray-300">Nothing recorded this month yet</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
            <th className="px-5 py-2.5 font-semibold">Date</th>
            <th className="px-3 py-2.5 font-semibold">In Time</th>
            <th className="px-3 py-2.5 font-semibold">Out Time</th>
            <th className="px-3 py-2.5 font-semibold text-right">Hours Worked</th>
            <th className="px-3 py-2.5 font-semibold text-right">Overtime Hours</th>
            <th className="px-3 py-2.5 font-semibold text-right">Deficit Hours</th>
            <th className="px-5 py-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(d => {
            const worked = d.totalHours ?? 0;
            const target = targetHours(d);
            const over = Math.max(0, worked - target);
            const short = Math.max(0, target - worked);
            const dt = new Date(`${d.date.slice(0, 10)}T00:00:00`);
            return (
              <tr key={d.date} className="hover:bg-gray-50/60">
                <td className="px-5 py-2.5 whitespace-nowrap">
                  <span className="text-gray-800">{format(dt, 'dd MMM yyyy')}</span>
                  <span className="block text-[11px] text-gray-400">{format(dt, 'EEEE')}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{hhmm(d.checkIn)}</td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{hhmm(d.checkOut)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{hrs(worked)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{over > 0 ? <span className="text-green-600 font-medium">{over.toFixed(2)} h</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{short > 0 ? <span className="text-red-600 font-medium">{short.toFixed(2)} h</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-5 py-2.5 whitespace-nowrap">
                  <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border', STATUS_TONE[displayStatus(d)] ?? STATUS_TONE.NONE)}>
                    {statusLabel(d)}
                  </span>
                  {d.isRegularized && <span className="ml-1.5 text-[10px] text-gray-400" title="This day was regularised">(reg.)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-semibold text-gray-700">
            <td className="px-5 py-2.5" colSpan={3}>Month total</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{totals.worked.toFixed(2)} h</td>
            <td className="px-3 py-2.5 text-right tabular-nums text-green-700">{totals.overtime.toFixed(2)} h</td>
            <td className="px-3 py-2.5 text-right tabular-nums text-red-700">{totals.deficit.toFixed(2)} h</td>
            <td className="px-5 py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Attendance Status: what was recorded vs what was requested ────────────────
function AttendanceStatus({ month, regularizations, onPickDay }: {
  month?: AttendanceMonth; regularizations: RegularizationRequest[]; onPickDay: (k: string) => void;
}) {
  const byDay = useMemo(() => new Map((month?.days ?? []).map(d => [d.date.slice(0, 10), d])), [month]);
  // Newest first, and only requests that belong to the month on screen.
  const rows = useMemo(() => {
    const days = new Set(byDay.keys());
    return regularizations
      .filter(r => days.has(r.date.slice(0, 10)))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [regularizations, byDay]);

  if (rows.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-gray-400">No regularisation raised for this month.</p>
        <p className="text-xs text-gray-400 mt-1">
          If a punch is missing or wrong, open the day on the calendar and raise a request — it will appear here
          with the recorded and requested values side by side.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          {/* Two header rows: each fact is shown as recorded and as requested, so the reviewer
              can see exactly what would change without opening anything. */}
          <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
            <th rowSpan={2} className="px-5 py-2 font-semibold text-left align-bottom">Date</th>
            <th colSpan={2} className="px-3 py-1.5 font-semibold text-center border-l border-gray-200">In Time</th>
            <th colSpan={2} className="px-3 py-1.5 font-semibold text-center border-l border-gray-200">Out Time</th>
            <th colSpan={2} className="px-3 py-1.5 font-semibold text-center border-l border-gray-200">Attendance</th>
            <th rowSpan={2} className="px-5 py-2 font-semibold text-left align-bottom border-l border-gray-200">Status</th>
          </tr>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
            <th className="px-3 py-1.5 font-medium text-left border-l border-gray-200">Recorded</th>
            <th className="px-3 py-1.5 font-medium text-left">Requested</th>
            <th className="px-3 py-1.5 font-medium text-left border-l border-gray-200">Recorded</th>
            <th className="px-3 py-1.5 font-medium text-left">Requested</th>
            <th className="px-3 py-1.5 font-medium text-left border-l border-gray-200">Recorded</th>
            <th className="px-3 py-1.5 font-medium text-left">Requested</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => {
            const key = r.date.slice(0, 10);
            const rec = byDay.get(key);
            const dt = new Date(`${key}T00:00:00`);
            const cell = (recorded: string, requested: string) => requested !== '—' && requested !== recorded;
            return (
              <tr key={r.id} className="hover:bg-gray-50/60 align-top">
                <td className="px-5 py-2.5 whitespace-nowrap">
                  <button onClick={() => onPickDay(key)} className="text-left hover:text-brand-700">
                    <span className="text-gray-800">{format(dt, 'dd MMM yyyy')}</span>
                    <span className="block text-[11px] text-gray-400">{format(dt, 'EEEE')}</span>
                  </button>
                  <span className="block text-[11px] text-gray-400 mt-0.5 max-w-[180px] truncate" title={r.reason}>{r.reason}</span>
                </td>

                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap border-l border-gray-100">{hhmm(rec?.checkIn)}</td>
                <td className={clsx('px-3 py-2.5 whitespace-nowrap', cell(hhmm(rec?.checkIn), hhmm(r.requestedCheckIn)) ? 'text-brand-700 font-medium' : 'text-gray-400')}>
                  {hhmm(r.requestedCheckIn)}
                </td>

                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap border-l border-gray-100">{hhmm(rec?.checkOut)}</td>
                <td className={clsx('px-3 py-2.5 whitespace-nowrap', cell(hhmm(rec?.checkOut), hhmm(r.requestedCheckOut)) ? 'text-brand-700 font-medium' : 'text-gray-400')}>
                  {hhmm(r.requestedCheckOut)}
                </td>

                <td className="px-3 py-2.5 whitespace-nowrap border-l border-gray-100">
                  <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border', rec ? (STATUS_TONE[displayStatus(rec)] ?? STATUS_TONE.NONE) : STATUS_TONE.NONE)}>
                    {rec ? statusLabel(rec) : 'Not Marked'}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700">
                    <Pencil size={10} /> {STATUS_LABEL[r.requestedStatus] ?? r.requestedStatus}
                  </span>
                </td>

                <td className="px-5 py-2.5 whitespace-nowrap border-l border-gray-100">
                  <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border',
                    r.status === 'APPROVED' ? 'bg-green-100 text-green-700 border-green-200'
                      : r.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : r.status === 'REJECTED' ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200')}>
                    {r.status}
                  </span>
                  {r.reviewNote && <span className="block text-[11px] text-gray-400 mt-0.5 max-w-[160px] truncate" title={r.reviewNote}>{r.reviewNote}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
