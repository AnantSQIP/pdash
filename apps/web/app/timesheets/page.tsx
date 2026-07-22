'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Timer, Plus, Clock, DollarSign, Trash2, Loader, CalendarDays, type LucideIcon } from 'lucide-react';
import { api, type Timesheet } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { LogTimeStandaloneModal } from '@/components/timesheets/LogTimeStandaloneModal';

function fmtHours(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}

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
  const [billableFilter, setBillableFilter] = useState<'All' | 'Billable' | 'Non-billable'>('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // MY own entries across every project (the API scopes ?userId to self).
  const { data: entries = [], isLoading, isError } = useQuery<Timesheet[]>({
    queryKey: ['timesheets-mine', currentUser?.id],
    queryFn: () => api.timesheets.forUser(currentUser!.id),
    enabled: !!currentUser?.id,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['timesheets-mine', currentUser?.id] });
    // Logging/deleting recomputes Task.actualHours + project rollups server-side, so refresh
    // any task/project views too (react-query matches by key prefix).
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
  const day = (e: Timesheet) => String(e.date).slice(0, 10);

  const totalHours = entries.reduce((s, e) => s + e.hoursLogged, 0);
  const billableHours = entries.filter(e => e.billable).reduce((s, e) => s + e.hoursLogged, 0);
  const weekHours = entries.filter(e => day(e) >= weekAgo).reduce((s, e) => s + e.hoursLogged, 0);
  const monthHours = entries.filter(e => day(e) >= monthStart).reduce((s, e) => s + e.hoursLogged, 0);

  const filtered = entries
    .filter(e => (billableFilter === 'Billable' ? e.billable : billableFilter === 'Non-billable' ? !e.billable : true))
    .sort((a, b) => day(b).localeCompare(day(a)));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Timer size={20} className="text-brand-600" /> Timesheets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Log and review the hours you spend across your projects</p>
        </div>
        <button onClick={() => setShowLog(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
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

        {/* Filter */}
        <div className="flex items-center gap-1.5">
          {(['All', 'Billable', 'Non-billable'] as const).map(f => (
            <button key={f} onClick={() => setBillableFilter(f)}
              className={clsx('px-3 py-1 text-xs font-medium rounded-full transition-colors',
                billableFilter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {f}
            </button>
          ))}
        </div>

        {/* Entries */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-gray-400"><Loader size={20} className="animate-spin mr-2" /><span className="text-sm">Loading your timesheets…</span></div>
          )}
          {isError && <div className="py-12 text-center text-sm text-gray-400">Could not load your time entries.</div>}
          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Billable</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No time entries yet. Click “Log Time” to add one.</td></tr>
                  )}
                  {filtered.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{entry.task?.title ?? entry.issue?.title ?? '—'}</span>
                        {entry.issue && <span className="ml-2 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">technical issue</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="px-4 py-3"><span className="text-sm font-medium text-gray-700">{fmtHours(entry.hoursLogged)}</span></td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', entry.billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                          {entry.billable ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs"><span className="text-xs text-gray-500 truncate block" title={entry.notes ?? undefined}>{entry.notes ?? '—'}</span></td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteEntry(entry.id)} disabled={deletingId === entry.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50" title="Delete">
                          {deletingId === entry.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showLog && <LogTimeStandaloneModal onClose={() => setShowLog(false)} onSuccess={invalidate} />}
    </div>
  );
}
