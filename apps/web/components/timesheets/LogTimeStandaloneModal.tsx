'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, type ApiTask, type ApiProject } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';

/**
 * Log time from the standalone Timesheets module. Two options:
 *  • Project task — pick a PROJECT (PID) then a TASK within it. An "Assign PID later" toggle
 *    lets you log the hours now and attach the PID within a week (a "buffer" entry).
 *  • Other — miscellaneous NON-PROJECT time (admin, internal meetings, training): a titled
 *    entry, always non-billable, never tied to a project/task.
 */
type LogMode = 'task' | 'other';

const MODES: { key: LogMode; label: string }[] = [
  { key: 'task', label: 'Project task' },
  { key: 'other', label: 'Other' },
];

export function LogTimeStandaloneModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { org, currentUser } = useOrg();
  const [mode, setMode] = useState<LogMode>('task');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('');
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState('');
  // Buffer: log the hours now, attach the PID (task) within a week (Project-task option only).
  const [assignLater, setAssignLater] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isOther = mode === 'other';
  // Pickers show for a normal project-task entry — not while "assign PID later" is on.
  const showPickers = mode === 'task' && !assignLater;

  // Projects the actor may see (the API already scopes to their memberships).
  const { data: projects = [], isLoading: loadingProjects } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: !!org?.id && showPickers,
    staleTime: 30_000,
  });

  // Tasks of the chosen project — fetched only once a project is picked.
  const { data: tasks = [], isLoading: loadingTasks } = useQuery<ApiTask[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
    enabled: showPickers && !!projectId,
  });

  const selectedProject = projects.find(p => p.id === projectId);

  function pickProject(id: string) {
    setProjectId(id);
    setTaskId(''); // reset the task when the project changes
  }

  const canSubmit = !!hours && (!showPickers || !!taskId) && (!isOther || !!title.trim()) && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !hours || loading) return;
    if (showPickers && !taskId) return;
    if (isOther && !title.trim()) { setError('Please give this time a title.'); return; }
    const parsed = parseFloat(hours);
    if (isNaN(parsed) || parsed < 0.25 || parsed > 24) {
      setError('Hours must be between 0.25 and 24');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.timesheets.create({
        taskId: showPickers ? taskId : undefined,   // buffer/other omit the task
        category: isOther ? 'OTHER' : undefined,     // "OTHER" = non-project, non-billable
        title: isOther ? title.trim() : undefined,   // the label for a non-project entry
        date,
        hoursLogged: parsed,
        billable: isOther ? false : billable,        // "Other" time is always non-billable
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
      subtitle="Record hours against a task, or as other (non-project) time"
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
            <button type="submit" form="log-time-standalone-form" disabled={!canSubmit}
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
        {/* Two options: a project task, or other (non-project) time. */}
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(m => (
            <button
              key={m.key} type="button" onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
              className={clsx('px-2 py-2 text-sm font-medium rounded-lg border transition-colors',
                mode === m.key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ── PROJECT TASK ────────────────────────────────────────── */}
        {mode === 'task' && (
          <>
            {/* Assign PID later — a toggle inside the Project-task option (buffer entry). */}
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

            {showPickers && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Project ID (PID) <span className="text-red-500">*</span></label>
                  <select
                    required={showPickers} value={projectId} onChange={e => pickProject(e.target.value)}
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
                    required={showPickers} value={taskId} onChange={e => setTaskId(e.target.value)} disabled={!projectId}
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">{!projectId ? 'Pick a PID first' : loadingTasks ? 'Loading tasks…' : tasks.length === 0 ? 'No tasks in this project' : 'Select a task'}</option>
                    {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              </>
            )}
          </>
        )}

        {/* ── OTHER (non-project) ─────────────────────────────────── */}
        {isOther && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input
              type="text" required value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Team meeting, Training, Admin"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
            />
            <p className="text-[11px] text-gray-500 mt-1">Non-project time (admin, meetings, training) — always non-billable.</p>
          </div>
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
            type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder={isOther ? 'Any extra detail (optional)' : 'What did you work on?'}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
          />
        </div>

        {/* Billable — a fixed "non-billable" note for Other, a toggle otherwise. */}
        {isOther ? (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Billable</span>
              <p className="text-xs text-gray-400">Other (non-project) time can’t be billed</p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Non-billable</span>
          </div>
        ) : (
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
        )}
      </form>
    </Modal>
  );
}
