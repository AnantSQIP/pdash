'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiTask, type ApiProject } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';

/**
 * Log time from the standalone Timesheets module. Unlike the per-project LogTimeModal,
 * there is no ambient project here, so the person picks a PROJECT first, then a TASK within
 * it. Only projects they are staffed on (what the API returns) are selectable, and only
 * that project's tasks — which is also what the server enforces on create.
 */
export function LogTimeStandaloneModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { org, currentUser } = useOrg();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('');
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState('');
  // Buffer: log the hours now, attach the PID (task) within a week.
  const [assignLater, setAssignLater] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Projects the actor may see (the API already scopes to their memberships).
  const { data: projects = [], isLoading: loadingProjects } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
  });

  // Tasks of the chosen project — fetched only once a project is picked.
  const { data: tasks = [], isLoading: loadingTasks } = useQuery<ApiTask[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
    enabled: !!projectId,
  });

  const selectedProject = projects.find(p => p.id === projectId);

  function pickProject(id: string) {
    setProjectId(id);
    setTaskId(''); // reset the task when the project changes
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !hours) return;
    if (!assignLater && !taskId) return;
    const parsed = parseFloat(hours);
    if (isNaN(parsed) || parsed < 0.25 || parsed > 24) {
      setError('Hours must be between 0.25 and 24');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.timesheets.create({
        taskId: assignLater ? undefined : taskId, // omit → buffer entry, assign the PID later
        date,
        hoursLogged: parsed,
        billable,
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log time');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Log Time"
      subtitle="Record hours against a task on one of your projects"
      size="md"
      onClose={onClose}
      footer={
        <div>
          {error && <p className="text-xs text-red-600 mb-2 text-right">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" form="log-time-standalone-form" disabled={loading || !hours || (!assignLater && !taskId)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                : 'Log Time'}
            </button>
          </div>
        </div>
      }
    >
      <form id="log-time-standalone-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Buffer: log now, attach the PID (task) within a week. */}
        <label className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-3.5 py-2.5 cursor-pointer">
          <span className="min-w-0 mr-3">
            <span className="text-sm font-medium text-amber-800">Assign PID later</span>
            <span className="block text-[11px] text-amber-600">Log the hours now and attach the Project ID within a week.</span>
          </span>
          <button
            type="button" role="switch" aria-checked={assignLater} aria-label="Assign PID later"
            onClick={() => setAssignLater(v => !v)}
            className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${assignLater ? 'bg-amber-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${assignLater ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>

        {!assignLater && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project ID (PID) <span className="text-red-500">*</span></label>
              <select
                required={!assignLater} value={projectId} onChange={e => pickProject(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
              >
                <option value="">{loadingProjects ? 'Loading projects…' : projects.length === 0 ? 'You are not on any projects' : 'Select a project by its PID'}</option>
                {projects.map(p => <option key={p.id} value={p.id}>{(p.code ?? 'PID pending')} — {p.title}</option>)}
              </select>
              {selectedProject && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Project type: <span className="font-medium text-gray-700">{selectedProject.projectType ?? '—'}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Task <span className="text-red-500">*</span></label>
              <select
                required={!assignLater} value={taskId} onChange={e => setTaskId(e.target.value)} disabled={!projectId}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{!projectId ? 'Pick a PID first' : loadingTasks ? 'Loading tasks…' : tasks.length === 0 ? 'No tasks in this project' : 'Select a task'}</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date <span className="text-red-500">*</span></label>
            <DateField
              type="date" required value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Hours <span className="text-red-500">*</span></label>
            <input
              type="number" required min="0.25" max="24" step="0.25" value={hours}
              onChange={e => setHours(e.target.value)} placeholder="e.g. 2.5"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
          <input
            type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you work on?"
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-700">Billable</span>
            <p className="text-xs text-gray-400">You decide whether this time is billable</p>
          </div>
          <button
            type="button" role="switch" aria-checked={billable} aria-label="Billable"
            onClick={() => setBillable(prev => !prev)}
            className={`relative h-5 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${billable ? 'bg-brand-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${billable ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
