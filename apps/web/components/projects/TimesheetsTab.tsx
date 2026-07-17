'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Clock, DollarSign, Users, Trash2, Loader } from 'lucide-react';
import { api, type Timesheet, type ApiTask, type ApiProject } from '@/lib/api';
import { LogTimeModal } from './LogTimeModal';
import { Avatar } from '@/components/Avatar';

function fmtHours(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}

export default function TimesheetsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [showLogModal, setShowLogModal] = useState(false);
  const [billableFilter, setBillableFilter] = useState<'All' | 'Billable' | 'Non-billable'>('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: entries = [], isLoading, isError } = useQuery<Timesheet[]>({
    queryKey: ['timesheets', projectId],
    queryFn: () => api.timesheets.forProject(projectId),
  });

  const { data: tasks = [] } = useQuery<ApiTask[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
  });

  // The project's billable decision (set by an admin) — when made, timesheets inherit it
  // and the per-entry billable toggle is hidden from the person logging time.
  const { data: project } = useQuery<ApiProject>({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
    staleTime: 30_000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['timesheets', projectId] });
    // L30: logging/deleting time recomputes Task.actualHours + project rollup server-side.
    qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
  }

  async function deleteEntry(id: string) {
    if (!window.confirm('Delete this time entry?')) return;
    setDeletingId(id);
    try {
      await api.timesheets.delete(id);
      invalidate();
    } catch {} finally { setDeletingId(null); }
  }

  const filtered = entries.filter(e => {
    if (billableFilter === 'Billable') return e.billable;
    if (billableFilter === 'Non-billable') return !e.billable;
    return true;
  });

  const totalHours = entries.reduce((s, e) => s + e.hoursLogged, 0);
  const billableHours = entries.filter(e => e.billable).reduce((s, e) => s + e.hoursLogged, 0);
  const uniqueUserIds = [...new Set(entries.map(e => e.userId))];

  return (
    <div className="flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 -mx-6 mb-4 px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 flex-wrap">
        <button
          onClick={() => setShowLogModal(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0"
        >
          <Plus size={14} />
          Log Time
        </button>
        <div className="flex items-center gap-1.5 ml-auto">
          {(['All', 'Billable', 'Non-billable'] as const).map(f => (
            <button
              key={f}
              onClick={() => setBillableFilter(f)}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                billableFilter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
            <Clock size={18} className="text-brand-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Total Hours</p>
            <p className="text-xl font-bold text-gray-900">{fmtHours(totalHours)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <DollarSign size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Billable Hours</p>
            <p className="text-xl font-bold text-gray-900">{fmtHours(billableHours)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Users size={18} className="text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Contributors</p>
            <p className="text-xl font-bold text-gray-900">{uniqueUserIds.length}</p>
          </div>
        </div>
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={20} className="animate-spin mr-2" />
            <span className="text-sm">Loading timesheets...</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            Could not load time entries. Check API connection.
          </div>
        )}
        {!isLoading && !isError && (
          <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Billable</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    No time entries yet. Click "Log Time" to add one.
                  </td>
                </tr>
              )}
              {filtered.map(entry => {
                const fullName = `${entry.user.firstName} ${entry.user.lastName}`;
                const dateStr = new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{entry.task.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar user={entry.user} size={28} className="shrink-0" />
                        <span className="text-sm text-gray-700">{fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{dateStr}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">{fmtHours(entry.hoursLogged)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        entry.billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                      )}>
                        {entry.billable ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-xs text-gray-500 truncate block" title={entry.notes}>{entry.notes ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        disabled={deletingId === entry.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingId === entry.id
                          ? <Loader size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showLogModal && (
        <LogTimeModal
          projectId={projectId}
          tasks={tasks}
          projectBillable={project?.billable ?? null}
          onClose={() => setShowLogModal(false)}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}
