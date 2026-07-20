'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, AlertTriangle, X, Loader, Trash2, Receipt } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Issue } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import { DateField } from '@/components/ui/DateField';

// Technical issues / glitches. Raising one logs the time it cost as NON-BILLABLE time,
// so it shows up under the project's non-billable timesheets.
function RaiseIssueModal({ projectId, onClose, onSuccess }: {
  projectId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!title.trim()) return;
    if (hours && (isNaN(h) || h < 0 || h > 24)) { setError('Hours must be between 0 and 24'); return; }
    setLoading(true); setError('');
    try {
      await api.issues.create({ projectId, title: title.trim(), description: description.trim() || undefined, hours: hours ? h : undefined, date: date || undefined });
      onSuccess(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to raise the issue'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center"><AlertTriangle size={18} className="text-amber-500" /></div>
            <h2 className="text-lg font-semibold text-gray-900">Raise a technical issue</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            Hit a glitch, blocker or technical problem? Raise it here — the time it cost is logged as <b>non-billable</b>.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Issue <span className="text-red-500">*</span></label>
            <input required autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Build server outage blocked deploys"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What happened?</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Details, impact, how long it blocked you…"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Time it cost (hours)</label>
              <input type="number" step="0.25" min="0" max="24" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 1.5"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <DateField type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {loading ? <><Loader size={14} className="animate-spin" /> Raising…</> : 'Raise issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IssuesTab({ projectId }: { projectId: string }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: issues = [], isLoading, isError } = useQuery<Issue[]>({
    queryKey: ['issues', projectId],
    queryFn: () => api.issues.list(projectId),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['issues', projectId] });
    qc.invalidateQueries({ queryKey: ['timesheets', projectId] });
  };

  async function deleteIssue(id: string) {
    if (!confirm('Delete this issue and its non-billable time entry?')) return;
    setDeletingId(id);
    try { await api.issues.delete(id); invalidate(); }
    catch { /* ignore */ } finally { setDeletingId(null); }
  }

  const totalHours = issues.reduce((s, i) => s + (i.hours ?? 0), 0);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-3 -mx-6 mb-4 px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 flex-wrap">
        {can('issue.create') && (
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 shrink-0">
            <Plus size={14} /> Raise issue
          </button>
        )}
        <p className="text-xs text-gray-400 ml-auto">Technical issues log as non-billable time.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 max-w-md">
        <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
          <p className="text-2xl font-bold text-gray-700">{issues.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Issues raised</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 bg-amber-50">
          <p className="text-2xl font-bold text-amber-700">{totalHours}h</p>
          <p className="text-xs text-gray-500 mt-0.5">Non-billable time</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-400"><Loader size={20} className="animate-spin mr-2" /><span className="text-sm">Loading…</span></div>
        )}
        {isError && <div className="py-12 text-center text-sm text-gray-400">Could not load issues.</div>}
        {!isLoading && !isError && (
          <ul className="divide-y divide-gray-50">
            {issues.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-gray-400">No technical issues raised. Hit a glitch? Raise it above.</li>
            )}
            {issues.map(issue => (
              <li key={issue.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50">
                <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{issue.title}</p>
                  {issue.description && <p className="text-xs text-gray-400 mt-0.5">{issue.description}</p>}
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                    {issue.reporter && <span className="inline-flex items-center gap-1"><Avatar user={issue.reporter} size={16} /> {issue.reporter.firstName} {issue.reporter.lastName}</span>}
                    <span>· {new Date(issue.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                {issue.hours > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0" title="Logged as non-billable time">
                    <Receipt size={11} /> {issue.hours}h non-billable
                  </span>
                )}
                {can('issue.delete') && (
                  <button onClick={() => deleteIssue(issue.id)} disabled={deletingId === issue.id}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0">
                    {deletingId === issue.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && <RaiseIssueModal projectId={projectId} onClose={() => setShowAdd(false)} onSuccess={invalidate} />}
    </div>
  );
}
