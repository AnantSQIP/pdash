'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Bug, X, Loader, Trash2, Edit3, Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Issue, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { userInitials } from '@/lib/avatar';

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: 'bg-red-100',    text: 'text-red-700'    },
  MAJOR:    { bg: 'bg-orange-100', text: 'text-orange-700' },
  MINOR:    { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  TRIVIAL:  { bg: 'bg-gray-100',   text: 'text-gray-600'   },
};
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN:        { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  IN_PROGRESS: { bg: 'bg-purple-100', text: 'text-purple-700' },
  RESOLVED:    { bg: 'bg-green-100',  text: 'text-green-700'  },
  CLOSED:      { bg: 'bg-gray-100',   text: 'text-gray-500'   },
};

const AVATAR_COLORS = ['bg-brand-600','bg-purple-500','bg-pink-500','bg-slate-600','bg-green-500','bg-amber-500'];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function AddIssueModal({ projectId, users, onClose, onSuccess }: {
  projectId: string; users: UserSummary[];
  onClose: () => void; onSuccess: () => void;
}) {
  const { currentUser } = useOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MINOR');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      await api.issues.create({
        projectId, title, description: description.trim() || undefined,
        severity, reportedBy: currentUser.id,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <Bug size={18} className="text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Report Issue</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input required autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Steps to reproduce, expected vs actual behavior..."
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Severity</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white">
                {['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assignee</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white">
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading || !title}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</> : 'Create Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IssuesTab({ projectId }: { projectId: string }) {
  const { users } = useOrg();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);

  const { data: issues = [], isLoading, isError } = useQuery<Issue[]>({
    queryKey: ['issues', projectId],
    queryFn: () => api.issues.list(projectId),
  });

  function invalidate() { qc.invalidateQueries({ queryKey: ['issues', projectId] }); }

  async function deleteIssue(id: string) {
    if (!confirm('Delete this issue?')) return;
    setDeletingId(id);
    try { await api.issues.delete(id); invalidate(); }
    catch {} finally { setDeletingId(null); }
  }

  async function updateStatus(id: string, status: string) {
    try { await api.issues.update(id, { status }); invalidate(); }
    catch {} finally { setEditingStatusId(null); }
  }

  const filtered = statusFilter === 'All'
    ? issues
    : issues.filter(i => i.status === statusFilter);

  const STATUS_OPTIONS = ['All', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

  return (
    <div className="flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 -mx-6 mb-4 px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 flex-wrap">
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 shrink-0"
        >
          <Plus size={14} />
          Report Issue
        </button>

        <div className="flex items-center gap-1.5 ml-auto">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                statusFilter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {s === 'All' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Total Issues', count: issues.length,                          color: 'text-gray-700', bg: 'bg-gray-50'    },
          { label: 'Open',         count: issues.filter(i => i.status === 'OPEN').length,        color: 'text-blue-700',   bg: 'bg-blue-50'   },
          { label: 'In Progress',  count: issues.filter(i => i.status === 'IN_PROGRESS').length, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Resolved',     count: issues.filter(i => i.status === 'RESOLVED').length,    color: 'text-green-700',  bg: 'bg-green-50'  },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={clsx('rounded-xl border border-gray-200 p-4', bg)}>
            <p className={clsx('text-2xl font-bold', color)}>{count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Issues table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={20} className="animate-spin mr-2" />
            <span className="text-sm">Loading issues…</span>
          </div>
        )}
        {isError && (
          <div className="py-12 text-center text-sm text-gray-400">Could not load issues. Check API connection.</div>
        )}
        {!isLoading && !isError && (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Issue</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assignee</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reported by</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                  No issues found. Click "Report Issue" to add one.
                </td></tr>
              )}
              {filtered.map(issue => {
                const sev = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.MINOR;
                const st = STATUS_COLORS[issue.status] ?? STATUS_COLORS.OPEN;
                const reporter = issue.reporter;
                const assignee = issue.assignee;
                return (
                  <tr key={issue.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-start gap-2">
                        <Bug size={14} className="text-gray-400 mt-0.5 shrink-0" />
                        <span className="text-sm font-medium text-gray-900">{issue.title}</span>
                      </div>
                      {issue.description && (
                        <p className="text-xs text-gray-400 mt-0.5 ml-5 truncate">{issue.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', sev.bg, sev.text)}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingStatusId === issue.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            defaultValue={issue.status}
                            className="text-xs border border-gray-300 rounded px-1 py-0.5"
                            onChange={e => updateStatus(issue.id, e.target.value)}
                            autoFocus
                          >
                            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(s => (
                              <option key={s} value={s}>{s.replace('_', ' ')}</option>
                            ))}
                          </select>
                          <button onClick={() => setEditingStatusId(null)} className="p-0.5 text-gray-400 hover:text-gray-600">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingStatusId(issue.id)}
                          className={clsx('text-xs px-2 py-0.5 rounded-full font-medium hover:opacity-80 transition-opacity', st.bg, st.text)}
                        >
                          {issue.status.replace('_', ' ')}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assignee ? (
                        <div className="flex items-center gap-2">
                          <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0', avatarColor(`${assignee.firstName}${assignee.lastName}`))}>
                            {userInitials(assignee)}
                          </div>
                          <span className="text-xs text-gray-600">{assignee.firstName} {assignee.lastName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {reporter ? (
                        <div className="flex items-center gap-2">
                          <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0', avatarColor(`${reporter.firstName}${reporter.lastName}`))}>
                            {userInitials(reporter)}
                          </div>
                          <span className="text-xs text-gray-600">{reporter.firstName} {reporter.lastName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {issue.dueDate ? new Date(issue.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteIssue(issue.id)}
                        disabled={deletingId === issue.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        {deletingId === issue.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setShowAdd(true)}>
                <td colSpan={7} className="px-4 py-3">
                  <span className="text-sm text-gray-400 flex items-center gap-2"><Plus size={14} /> Report issue…</span>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddIssueModal
          projectId={projectId}
          users={users}
          onClose={() => setShowAdd(false)}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}
