'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Lock, Info, Search } from 'lucide-react';
import clsx from 'clsx';

import { api, type UserSummary, type ProjectTypeDef, type PatentOption } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { DateField } from '@/components/ui/DateField';
import { fullName } from '@/lib/avatar';

interface NewProjectModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  createdBy?: string;
}

export function NewProjectModal({ onClose, onSuccess, createdBy = 'system' }: NewProjectModalProps) {
  const { org, currentUser, users } = useOrg();
  const { can } = usePermissions();
  // Someone who cannot approve projects is REQUESTING one: they must nominate the
  // manager who will own and approve it. Approvers manage their own by default.
  const canApprove = can('project.approve');
  const canSetClientDue = can('deadline.view.client');
  // Clients/patents are confidential — only patent.view holders (Super Admin by default) see them.
  const canSeePatents = can('patent.view');

  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState('');
  const [patentIds, setPatentIds] = useState<string[]>([]);
  const [patentSearch, setPatentSearch] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [clientDueDate, setClientDueDate] = useState('');
  const [managerId, setManagerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Only people who can approve projects are valid managers — anyone else would leave
  // the request stranded with nobody able to approve it. The server re-validates.
  const { data: eligible = [] } = useQuery({
    queryKey: ['eligible-managers', org?.id],
    queryFn: () => api.projects.eligibleManagers(),
    enabled: !!org?.id && !canApprove,
    staleTime: 5 * 60_000,
  });
  const managerOptions = useMemo(
    () => eligible.filter(u => u.id !== currentUser?.id),
    [eligible, currentUser],
  );

  // Project types + their auto-created task templates (static catalog from the API).
  const { data: projectTypes = [] } = useQuery<ProjectTypeDef[]>({
    queryKey: ['project-types'],
    queryFn: () => api.projects.types(),
    staleTime: Infinity,
  });
  const selectedType = projectTypes.find(t => t.value === projectType);

  // Patent HANDLES (the pickable "Patent ID"). No client details are shown here — just the
  // handles. The project's client is derived from the selected patents server-side.
  const { data: patentOptions = [] } = useQuery<PatentOption[]>({
    queryKey: ['patent-options-all'], queryFn: () => api.patents.options(),
    enabled: canSeePatents, staleTime: 30_000,
  });
  const { data: pidPreview } = useQuery({
    queryKey: ['next-pid'], queryFn: () => api.projects.nextPid(), staleTime: 10_000,
  });

  // Filter handles by the search box — needed when there are many patents.
  const filteredPatents = useMemo(() => {
    const q = patentSearch.trim().toLowerCase();
    return q ? patentOptions.filter(p => p.handle.toLowerCase().includes(q)) : patentOptions;
  }, [patentOptions, patentSearch]);

  function togglePatent(id: string) {
    setPatentIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canApprove && !managerId) {
      setError('Choose the project manager who should approve and own this project.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.projects.create({
        title,
        projectType: projectType || undefined,
        patentIds: patentIds.length ? patentIds : undefined,
        description: description || undefined,
        priority,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        clientDueDate: (canSetClientDue && clientDueDate) ? clientDueDate : undefined,
        managerId: managerId || undefined,
        createdBy,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{canApprove ? 'New Project' : 'Request a Project'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {canApprove ? 'Fill in the details to create a project' : 'Your project manager must approve it before work starts'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {!canApprove && (
            <div className="flex items-start gap-2 text-xs text-brand-800 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
              <Info size={14} className="mt-0.5 shrink-0 text-brand-500" />
              <span>
                This is a <b>project request</b>. It stays pending until the manager you nominate approves it —
                they then own the project and you join as a member.
              </span>
            </div>
          )}

          {/* Auto-assigned Project ID (PID) — read-only preview; the final ID is set on save. */}
          {pidPreview?.pid && (
            <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50/60 px-3.5 py-2.5">
              <p className="text-sm font-medium text-brand-800">Project ID (PID)</p>
              <span className="text-sm font-semibold text-brand-700 font-mono">{pidPreview.pid}</span>
            </div>
          )}

          {/* Project TYPE — selecting a patent-analysis type auto-creates its standard tasks. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Project Type <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={projectType}
              onChange={e => setProjectType(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
            >
              <option value="">Select a type…</option>
              {projectTypes.map(t => (
                <option key={t.value} value={t.value} disabled={t.comingSoon}>
                  {t.label}{t.comingSoon ? ' — coming soon' : ''}
                </option>
              ))}
            </select>
            {selectedType && (
              <div className="mt-2">
                <p className="text-[11px] text-gray-400">{selectedType.description}</p>
                {selectedType.tasks && selectedType.tasks.length > 0 && (
                  <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2">
                    <p className="text-xs font-medium text-brand-800 mb-1">
                      Creates {selectedType.tasks.length} tasks in “{selectedType.taskListName}”:
                    </p>
                    <ol className="list-decimal list-inside space-y-0.5 text-xs text-brand-700">
                      {selectedType.tasks.map((t, i) => <li key={i}>{t}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Patent IDs — pick the handles to link. A search box helps when there are many. */}
          {canSeePatents && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Patent IDs
                {patentIds.length > 0 && <span className="ml-1 text-xs font-normal text-brand-600">· {patentIds.length} selected</span>}
              </label>
              {patentOptions.length === 0 ? (
                <p className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-2.5">No patents registered yet.</p>
              ) : (
                <div className="rounded-lg border border-gray-300 overflow-hidden">
                  <div className="relative border-b border-gray-100">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={patentSearch}
                      onChange={e => setPatentSearch(e.target.value)}
                      placeholder="Search patent ID…"
                      className="w-full pl-8 pr-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                    {filteredPatents.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-400">No patents match “{patentSearch}”.</p>
                    ) : filteredPatents.map(p => (
                      <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={patentIds.includes(p.id)}
                          onChange={() => togglePatent(p.id)}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm font-mono text-gray-700">{p.handle}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Project Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Invalidity — Acme Patent US1234567"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this project about?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition resize-none"
            />
          </div>

          {/* Project manager — required for a requester who cannot approve. */}
          {!canApprove && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Project Manager (approver) <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={managerId}
                onChange={e => setManagerId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
              >
                <option value="">Select a manager…</option>
                {managerOptions.map(u => (
                  <option key={u.id} value={u.id}>{fullName(u)}{u.designation ? ` — ${u.designation}` : ''}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                They&apos;ll be notified to review your request. Only people with project-approval rights can be chosen.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
              <DateField
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
              />
            </div>
          </div>

          {/* Deadline(s). Someone who can't set the client date sees just "Deadline". */}
          <div className={clsx('grid gap-4', canSetClientDue ? 'grid-cols-2' : 'grid-cols-1')}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Deadline
                {canSetClientDue && <span className="ml-1 text-xs font-normal text-gray-400">· the team&apos;s date</span>}
              </label>
              <DateField
                type="date"
                value={dueDate}
                max={clientDueDate || undefined}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
              />
            </div>
            {canSetClientDue && (
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1.5 flex items-center gap-1">
                  <Lock size={11} /> Client Deadline
                </label>
                <DateField
                  type="date"
                  value={clientDueDate}
                  min={dueDate || undefined}
                  onChange={e => setClientDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-amber-300 bg-amber-50/40 rounded-lg focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !projectType || (!canApprove && !managerId)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {canApprove ? 'Creating...' : 'Submitting...'}
                </span>
              ) : (
                <>
                  <Plus size={15} />
                  {canApprove ? 'Create Project' : 'Submit Request'}
                </>
              )}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </form>
      </div>
    </div>
  );
}
