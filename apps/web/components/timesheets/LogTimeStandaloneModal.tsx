'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, type ApiTask, type ApiProject } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { pidLabel } from '@/lib/mock-data';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';

/**
 * Log time from the standalone Timesheets module. Two options:
 *  • Project task — always pick the project (by TITLE) and the TASK, so every entry records
 *    what it was for. The PID auto-fills from the project and is mandatory — UNLESS you turn
 *    on "Assign PID later" (the project's PID isn't minted yet), which just hides the PID
 *    field; the project + task are still chosen. The PID appears in the list once it exists.
 *  • Other — miscellaneous NON-PROJECT time (admin, meetings, training): a titled entry,
 *    always non-billable, never tied to a project/task.
 */
type LogMode = 'task' | 'call' | 'other';

const MODES: { key: LogMode; label: string }[] = [
  { key: 'task', label: 'Project task' },
  { key: 'call', label: 'Client call' },
  { key: 'other', label: 'Other' },
];

export function LogTimeStandaloneModal({ onClose, onSuccess, defaultDate }: { onClose: () => void; onSuccess: () => void; defaultDate?: string }) {
  const { org, currentUser } = useOrg();
  const [mode, setMode] = useState<LogMode>('task');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('');
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState('');
  // The project's PID isn't ready yet: hide the PID field + drop its requirement. The project
  // and task are STILL selected, so the entry still records what it's for.
  const [assignLater, setAssignLater] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isTask = mode === 'task';
  const isOther = mode === 'other';
  // A client call belongs to a MATTER, not to a task inside it — so it needs the PID and
  // nothing else. It is deliberately allowed on finished matters: clients ring about work
  // that closed last month, and that time still has to go somewhere.
  const isCall = mode === 'call';

  // Projects the actor may see (the API already scopes to their memberships).
  const { data: projects = [], isLoading: loadingProjects } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: !!org?.id && (isTask || isCall),
    staleTime: 30_000,
  });

  // Tasks of the chosen project — fetched only once a project is picked.
  const { data: allTasks = [], isLoading: loadingTasks } = useQuery<ApiTask[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
    enabled: isTask && !!projectId,
  });
  // You can only log time on tasks you're ASSIGNED to (the server enforces this) — so only
  // offer your own tasks, not every task in the project.
  const tasks = allTasks.filter(t => t.assignees?.some(a => a.userId === currentUser?.id));

  const selectedProject = projects.find(p => p.id === projectId);
  const pid = selectedProject?.code ?? '';       // the PID auto-fills from the chosen project
  const hasPid = !!pid;
  const needPid = isTask && !assignLater;         // PID is required unless "assign PID later" is on

  function pickProject(id: string) {
    setProjectId(id);
    setTaskId(''); // reset the task when the project changes
  }

  const canSubmit = !!hours
    && (!isTask || (!!projectId && !!taskId && (!needPid || hasPid)))  // project + task always; PID unless buffer
    && (!isCall || (!!projectId && !!title.trim()))                    // a call needs its PID and a subject
    && (!isOther || !!title.trim())
    && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !hours || loading) return;
    if (isTask) {
      if (!projectId || !taskId) return;
      if (needPid && !hasPid) { setError('This project has no PID yet — turn on “Assign PID later” to log without one.'); return; }
    }
    if (isCall && !projectId) { setError('Choose the PID this call was about.'); return; }
    if ((isOther || isCall) && !title.trim()) { setError('Please give this time a title.'); return; }
    const parsed = parseFloat(hours);
    if (isNaN(parsed) || parsed < 0.25 || parsed > 24) {
      setError('Hours must be between 0.25 and 24');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.timesheets.create({
        taskId: isTask ? taskId : undefined,        // the task records the project (+ PID when it exists)
        category: isOther ? 'OTHER' : isCall ? 'CLIENT_CALL' : undefined,
        projectId: isCall ? projectId : undefined,  // a call books straight to the PID
        title: isOther || isCall ? title.trim() : undefined,
        date,
        hoursLogged: parsed,
        billable: isOther ? false : billable,       // "Other" time is always non-billable
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
      subtitle="Record hours against a task, a client call, or other (non-project) time"
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
        {/* Three options: a task, a client call booked to a PID, or other non-project time. */}
        <div className="grid grid-cols-3 gap-2">
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
        {isTask && (
          <>
            {/* Assign PID later — hides only the PID field; project + task stay selectable. */}
            <label className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-3.5 py-2.5 cursor-pointer">
              <span className="min-w-0 mr-3">
                <span className="text-sm font-medium text-amber-800">Assign PID later</span>
                <span className="block text-[11px] text-amber-600">The project’s PID isn’t ready yet — still pick the project &amp; task; the PID attaches once it’s minted.</span>
              </span>
              <button
                type="button" role="switch" aria-checked={assignLater} aria-label="Assign PID later"
                onClick={() => setAssignLater(v => !v)}
                className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${assignLater ? 'bg-amber-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${assignLater ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </label>

            {/* Project title — always shown. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project title <span className="text-red-500">*</span></label>
              <select
                required value={projectId} onChange={e => pickProject(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
              >
                <option value="">{loadingProjects ? 'Loading projects…' : projects.length === 0 ? 'You are not on any projects' : 'Select a project'}</option>
                {/* A PID can hold several projects for a returning client, so the round has to be
                    on the option — otherwise two entries look identical and time lands on the wrong one. */}
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${pidLabel(p.code, p.roundSeq)} — ` : ''}{p.title}
                  </option>
                ))}
              </select>
            </div>

            {/* PID — auto-fills from the project; hidden while "Assign PID later" is on. */}
            {!assignLater && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">PID <span className="text-red-500">*</span></label>
                <input
                  type="text" readOnly value={pid}
                  placeholder={!projectId ? 'Select a project first' : 'This project has no PID yet — use “Assign PID later”'}
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed focus:outline-none"
                />
                {selectedProject?.projectType && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Project type: <span className="font-medium text-gray-700">{selectedProject.projectType}</span>
                  </p>
                )}
              </div>
            )}

            {/* Task — always shown. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Task <span className="text-red-500">*</span></label>
              <select
                required value={taskId} onChange={e => setTaskId(e.target.value)} disabled={!projectId}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{!projectId ? 'Pick a project first' : loadingTasks ? 'Loading tasks…' : tasks.length === 0 ? 'No tasks assigned to you here' : 'Select a task'}</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </>
        )}

        {/* ── CLIENT CALL — a PID and what the call was about, nothing else ───────── */}
        {isCall && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">PID <span className="text-red-500">*</span></label>
              <select
                value={projectId} onChange={e => setProjectId(e.target.value)} required
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500 transition"
              >
                <option value="">{loadingProjects ? 'Loading…' : 'Select the PID this call was about…'}</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} — ` : ''}{p.title}{p.projectPhase === 'COMPLETED' ? ' (completed)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Any PID, open or finished — a client can ring about work that closed months ago.
                No task needed, and you do not have to be staffed on it.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">What was the call about? <span className="text-red-500">*</span></label>
              <input
                type="text" required value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Client query on claim chart scope"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
              />
            </div>
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
