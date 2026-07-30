'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Timer, Plus, Clock, DollarSign, Trash2, Loader, CalendarDays, KeyRound, CalendarClock, ChevronDown, type LucideIcon } from 'lucide-react';
import { api, type Timesheet } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { LogTimeStandaloneModal } from '@/components/timesheets/LogTimeStandaloneModal';
import { TimesheetCalendar } from '@/components/timesheets/TimesheetCalendar';
import { TimesheetBackfill } from '@/components/timesheets/TimesheetBackfill';
import { AssignPidModal } from '@/components/timesheets/AssignPidModal';

/** "Other" = miscellaneous non-project time — never a buffer to assign a PID to. */
const isOther = (e: Timesheet) => e.category === 'OTHER';
/** A buffer entry (logged without a PID) — no task/issue/project, and not "Other". */
const isUnassigned = (e: Timesheet) => !e.taskId && !e.issueId && !e.projectId && !isOther(e);
const bufferDaysLeft = (e: Timesheet): number | null =>
  e.createdAt ? Math.ceil((new Date(e.createdAt).getTime() + 7 * 86_400_000 - Date.now()) / 86_400_000) : null;

function fmtHours(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}
const dayOf = (e: Timesheet) => String(e.date).slice(0, 10);
const prettyDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function Tile({ label, value, tint, Icon }: { label: string; value: string; tint: string; Icon: LucideIcon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', tint)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function TimesheetsPage() {
  const { currentUser } = useOrg();
  const qc = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [assigning, setAssigning] = useState<Timesheet | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [showBackfill, setShowBackfill] = useState(false);

  // MY own entries across every project (the API scopes ?userId to self).
  const { data: entries = [], isLoading, isError } = useQuery<Timesheet[]>({
    queryKey: ['timesheets-mine', currentUser?.id],
    queryFn: () => api.timesheets.forUser(currentUser!.id),
    enabled: !!currentUser?.id,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['timesheets-mine', currentUser?.id] });
    // The fill calendar has its OWN query — refresh it too so a just-logged day updates live
    // (this was the "have to refresh to see it" bug).
    qc.invalidateQueries({ queryKey: ['ts-calendar'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['timesheets'] });
  }

  async function deleteEntry(id: string) {
    if (!window.confirm('Delete this time entry?')) return;
    setDeletingId(id);
    try { await api.timesheets.delete(id); invalidate(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not delete the entry.'); }
    finally { setDeletingId(null); }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const monthStart = `${todayKey.slice(0, 7)}-01`;

  const totalHours = entries.reduce((s, e) => s + e.hoursLogged, 0);
  const billableHours = entries.filter(e => e.billable).reduce((s, e) => s + e.hoursLogged, 0);
  const weekHours = entries.filter(e => dayOf(e) >= weekAgo).reduce((s, e) => s + e.hoursLogged, 0);
  const monthHours = entries.filter(e => dayOf(e) >= monthStart).reduce((s, e) => s + e.hoursLogged, 0);

  // Entries logged on the selected calendar day (the integrated "logs", replacing the old table).
  const dayEntries = useMemo(
    () => entries.filter(e => dayOf(e) === selectedDate).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [entries, selectedDate],
  );
  const dayTotal = dayEntries.reduce((s, e) => s + e.hoursLogged, 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Timer size={20} className="text-brand-600" /> Timesheets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Log your hours and click any day to see what you filled</p>
        </div>
        <button onClick={() => { setShowLog(true); }} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
          <Plus size={15} /> Log Time
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile label="This week"      value={fmtHours(weekHours)}     tint="bg-brand-50 text-brand-600"   Icon={Clock} />
          <Tile label="This month"     value={fmtHours(monthHours)}    tint="bg-indigo-50 text-indigo-600" Icon={CalendarDays} />
          <Tile label="Billable (all)" value={fmtHours(billableHours)} tint="bg-green-50 text-green-600"   Icon={DollarSign} />
          <Tile label="Total logged"   value={fmtHours(totalHours)}    tint="bg-amber-50 text-amber-600"   Icon={Timer} />
        </div>

        {/* Color-coded fill calendar — click a day to see/manage that day's entries below. */}
        <TimesheetCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

        {/* Selected-day detail — the integrated "logs" (no separate table). */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{prettyDate(selectedDate)}{selectedDate === todayKey && <span className="ml-2 text-[11px] font-medium text-brand-600">Today</span>}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'} · {fmtHours(dayTotal)} logged</p>
            </div>
            {selectedDate <= todayKey && (
              <button onClick={() => setShowLog(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100">
                <Plus size={13} /> Log for this day
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400"><Loader size={20} className="animate-spin mr-2" /><span className="text-sm">Loading…</span></div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-gray-400">Could not load your time entries.</div>
          ) : dayEntries.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              Nothing logged for this day.{selectedDate <= todayKey && ' Use “Log for this day” to add an entry.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {dayEntries.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50">
                  {/* PID / kind */}
                  <div className="w-28 shrink-0">
                    {entry.project?.code ? (
                      <>
                        <span className="text-xs font-mono font-semibold text-gray-800">{entry.project.code}</span>
                        {entry.projectType && <span className="block text-[10px] text-gray-400">{entry.projectType}</span>}
                      </>
                    ) : isOther(entry) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">Other</span>
                    ) : isUnassigned(entry) ? (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => setAssigning(entry)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-md hover:bg-brand-100 w-max">
                          <KeyRound size={11} /> Assign PID
                        </button>
                        {(() => { const d = bufferDaysLeft(entry); return d === null ? null : (
                          <span className={clsx('text-[10px] font-medium', d < 0 ? 'text-red-500' : d <= 2 ? 'text-amber-600' : 'text-gray-400')}>{d < 0 ? 'overdue' : `${d}d left`}</span>
                        ); })()}
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </div>
                  {/* Task + notes */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                      {entry.task?.title ?? entry.issue?.title ?? (isOther(entry) ? (entry.title ?? 'Non-project time') : 'Unassigned time')}
                      {entry.issue && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">technical issue</span>}
                    </p>
                    {entry.notes && <p className="text-xs text-gray-500 mt-0.5 break-words">{entry.notes}</p>}
                  </div>
                  {/* Hours + billable + delete */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmtHours(entry.hoursLogged)}</span>
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', entry.billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {entry.billable ? 'Billable' : 'Non-bill'}
                    </span>
                    <button onClick={() => deleteEntry(entry.id)} disabled={deletingId === entry.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50" title="Delete">
                      {deletingId === entry.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Backfill — low-prominence (rare): collapsed by default. */}
        <div>
          <button onClick={() => setShowBackfill(s => !s)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
            <CalendarClock size={13} /> Backfill an older month
            <ChevronDown size={13} className={clsx('transition-transform', showBackfill && 'rotate-180')} />
          </button>
          {showBackfill && <div className="mt-3"><TimesheetBackfill /></div>}
        </div>
      </div>

      {showLog && <LogTimeStandaloneModal defaultDate={selectedDate <= todayKey ? selectedDate : todayKey} onClose={() => setShowLog(false)} onSuccess={invalidate} />}
      {assigning && <AssignPidModal entryId={assigning.id} onClose={() => setAssigning(null)} onDone={invalidate} />}
    </div>
  );
}
