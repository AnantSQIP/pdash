'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Lock, Info } from 'lucide-react';
import clsx from 'clsx';

import { api, type UserSummary } from '@/lib/api';
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

  const [title, setTitle] = useState('');
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Project Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Website Redesign Q3"
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

          {/* Dual deadlines */}
          <div className={clsx('grid gap-4', canSetClientDue ? 'grid-cols-2' : 'grid-cols-1')}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Internal Deadline
                <span className="ml-1 text-xs font-normal text-gray-400">· the team&apos;s date</span>
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
                  <span className="text-xs font-normal text-amber-600/70">· managers only</span>
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
              disabled={loading || !title.trim() || (!canApprove && !managerId)}
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
