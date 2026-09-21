'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, type ApiTask, type ApiProject, type TaskGroup, type TeamSpace, type TeamTask } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { cidLabel } from '@/lib/mock-data';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';
import { todayIST } from '@/lib/date';

/**
 * Log time from the standalone Timesheets module. Two options:
 *  • Client task — always pick the client (by TITLE) and the TASK, so every entry records
 *    what it was for. The client's CID is shown beside it, read-only: every client is given its
 *    CID when it is created, so there is nothing to wait for (the old "Assign PID later" switch
 *    existed only because a client could be created without one, and is gone with that state).
 *    The client's tasks are listed under their task groups.
 *  • Other — miscellaneous NON-CLIENT time (admin, meetings, training): a titled entry,
 *    always non-billable, never tied to a client/task.
 */
type LogMode = 'task' | 'call' | 'other';

/**
 * A client's tasks under the task group each sits in, in the groups' own order. Two groups made
 * from the same template hold tasks with the same titles, so a flat list could not tell them
 * apart. A task with no group belongs to the default one; one whose group is not listed goes
 * last, under "Other".
 */
function tasksByGroup<T extends Pick<ApiTask, 'projectTasks'>>(tasks: T[], projectId: string, groups: TaskGroup[]) {
  const known = new Map(groups.map(g => [g.id, g]));
  const fallback = groups.find(g => g.isDefault) ?? null;
  const buckets = new Map<string, T[]>();
  for (const t of tasks) {
    const listId = t.projectTasks?.find(pt => pt.projectId === projectId)?.taskListId ?? null;
    const g = listId ? known.get(listId) ?? null : fallback;
    const key = g ? g.id : '__other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }
  const out = [...groups]
    .sort((a, b) => a.sequence - b.sequence)
    .filter(g => buckets.has(g.id))
    .map(g => ({ key: g.id, label: g.status === 'COMPLETED' ? `${g.name} (completed)` : g.name, tasks: buckets.get(g.id)! }));
  if (buckets.has('__other')) out.push({ key: '__other', label: 'Other', tasks: buckets.get('__other')! });
  return out;
}

const MODES: { key: LogMode; label: string }[] = [
  { key: 'task', label: 'Client task' },
  { key: 'call', label: 'Client call' },
  { key: 'other', label: 'Other' },
];

/** CLIENTS flow: log time against a client task (its CID shown), a client call, or other time; a task's time follows the task's billable flag. */
export function ClientsLogTimeStandaloneModal({ onClose, onSuccess, defaultDate }: { onClose: () => void; onSuccess: () => void; defaultDate?: string }) {
  const { org, currentUser } = useOrg();
  const [mode, setMode] = useState<LogMode>('task');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate ?? todayIST());
  const [hours, setHours] = useState('');
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isTask = mode === 'task';
  const isOther = mode === 'other';
  // A client call belongs to a MATTER, not to a task inside it — so it needs the client and
  // nothing else. It is deliberately allowed on finished matters: clients ring about work
  // that closed last month, and that time still has to go somewhere.
  const isCall = mode === 'call';

  // Clients the actor may see (the API already scopes to their memberships).
  const { data: projects = [], isLoading: loadingProjects } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: !!org?.id && (isTask || isCall),
    staleTime: 30_000,
  });

  // Team spaces the actor is in. Internal work (HR, BD, operations) has no CID and no client,
  // but the hours are still worked and still have to go somewhere.
  const { data: teamSpaces = [] } = useQuery<TeamSpace[]>({
    queryKey: ['teams'], queryFn: () => api.teams.list(),
    enabled: isTask, staleTime: 30_000,
  });
  // The picker holds either a client id or a team id; this is which kind was chosen.
  const pickedTeam = teamSpaces.find(t => t.id === projectId);

  // Tasks of the chosen client — fetched only once a client is picked.
  const { data: allTasks = [], isLoading: loadingTasks } = useQuery<ApiTask[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
    enabled: isTask && !!projectId && !pickedTeam,
  });
  const { data: teamTasks = [], isLoading: loadingTeamTasks } = useQuery<TeamTask[]>({
    queryKey: ['team-tasks', projectId],
    queryFn: () => api.teams.tasks(projectId),
    enabled: isTask && !!pickedTeam,
  });
  // You can only log time on tasks you're ASSIGNED to (the server enforces this) — so only
  // offer your own tasks, not every task in the client.
  const tasks = pickedTeam
    ? teamTasks.filter(t => t.assignees?.some(a => a.userId === currentUser?.id))
        .map(t => ({ id: t.id, title: t.title })) as { id: string; title: string }[]
    : allTasks.filter(t => t.assignees?.some(a => a.userId === currentUser?.id))
        .map(t => ({ id: t.id, title: t.title }));
  // The client's task groups, so those tasks can be listed under the group each belongs to.
  const { data: groups } = useQuery<TaskGroup[]>({
    queryKey: ['task-groups', projectId],
    queryFn: () => api.taskLists.list(projectId),
    enabled: isTask && !!projectId && !pickedTeam,
    staleTime: 60_000,
  });
  // null = a flat list (a team space, or the groups have not loaded).
  const groupedTasks = useMemo(() => {
    if (pickedTeam || !groups) return null;
    const mine = allTasks.filter(t => t.assignees?.some(a => a.userId === currentUser?.id));
    return tasksByGroup(mine, projectId, groups);
  }, [pickedTeam, groups, allTasks, currentUser?.id, projectId]);

  const selectedProject = projects.find(p => p.id === projectId);
  const cid = selectedProject?.code ?? '';       // the CID shows beside the chosen client

  function pickProject(id: string) {
    setProjectId(id);
    setTaskId(''); // reset the task when the client changes
  }

  const canSubmit = !!hours
    && (!isTask || (!!projectId && !!taskId))                          // client + task always
    && (!isCall || (!!projectId && !!title.trim()))                    // a call needs its client and a subject
    && (!isOther || !!title.trim())
    && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !hours || loading) return;
    if (isTask) {
      if (!projectId || !taskId) return;
    }
    if (isCall && !projectId) { setError('Choose the client this call was about.'); return; }
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
        taskId: isTask ? taskId : undefined,        // the task records the client (and so its CID)
        category: isOther ? 'OTHER' : isCall ? 'CLIENT_CALL' : undefined,
        projectId: isCall ? projectId : undefined,  // a call books straight to the client
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
      subtitle="Record hours against a task, a client call, or other (non-client) time"
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
        {/* Three options: a task, a client call booked to a client, or other non-client time. */}
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

        {/* ── CLIENT TASK ─────────────────────────────────────────── */}
        {isTask && (
          <>
            {/* Client — always shown. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Client <span className="text-red-500">*</span></label>
              <select
                required value={projectId} onChange={e => pickProject(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
              >
                <option value="">{loadingProjects ? 'Loading clients…' : (projects.length === 0 && teamSpaces.length === 0) ? 'You are not on any clients' : 'Select a client'}</option>
                {/* A CID can hold several rounds for a returning client, so the round has to be
                    on the option — otherwise two entries look identical and time lands on the wrong one. */}
                <optgroup label="Clients">
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${cidLabel(p.code, p.roundSeq)} — ` : ''}{p.title}
                    </option>
                  ))}
                </optgroup>
                {/* Separated, not mixed in: internal work has no CID and is never billable, and
                    someone scanning this list must be able to tell the two apart at a glance. */}
                {teamSpaces.filter(t => !t.archivedAt).length > 0 && (
                  <optgroup label="Team spaces — internal, non-billable">
                    {teamSpaces.filter(t => !t.archivedAt).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* CID — shown from the client, read-only; absent for internal work, which has none by design. */}
            {!pickedTeam && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">CID</label>
                <input
                  type="text" readOnly value={cid}
                  aria-label="The client's CID"
                  placeholder={!projectId ? 'Select a client first' : '—'}
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed focus:outline-none"
                />
                {selectedProject?.projectType && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Type: <span className="font-medium text-gray-700">{selectedProject.projectType}</span>
                  </p>
                )}
              </div>
            )}

            {pickedTeam && (
              <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Internal team work — no CID, and recorded as non-billable. It still counts toward your
                capacity and your logged hours.
              </p>
            )}

            {/* Task — always shown. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Task <span className="text-red-500">*</span></label>
              <select
                required value={taskId} onChange={e => setTaskId(e.target.value)} disabled={!projectId}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{!projectId ? 'Pick a client first' : (loadingTasks || loadingTeamTasks) ? 'Loading tasks…' : tasks.length === 0 ? 'No tasks assigned to you here' : 'Select a task'}</option>
                {groupedTasks
                  ? groupedTasks.map(g => (
                      <optgroup key={g.key} label={g.label}>
                        {g.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </optgroup>
                    ))
                  : tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </>
        )}

        {/* ── CLIENT CALL — a client and what the call was about, nothing else ────── */}
        {isCall && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Client <span className="text-red-500">*</span></label>
              <select
                value={projectId} onChange={e => setProjectId(e.target.value)} required
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500 transition"
              >
                <option value="">{loadingProjects ? 'Loading…' : 'Select the client this call was about…'}</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} — ` : ''}{p.title}{p.projectPhase === 'COMPLETED' ? ' (completed)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Any client, open or finished — a client can ring about work that closed months ago.
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

        {/* ── OTHER (non-client) ──────────────────────────────────── */}
        {isOther && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input
              type="text" required value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Team meeting, Training, Admin"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
            />
            <p className="text-[11px] text-gray-500 mt-1">Non-client time (admin, meetings, training) — always non-billable.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date <span className="text-red-500">*</span></label>
            <DateField
              type="date" required value={date} max={todayIST()} onChange={e => setDate(e.target.value)}
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

        {/* Billable. Task time follows the TASK (set on the task, by anybody on its client or
            staffed on it) — so for a task this is a statement, not a choice. Other time is never
            billable, team-space time never is either, and a client call keeps its own switch. */}
        {(() => {
          const pickedTask = isTask && !pickedTeam ? allTasks.find(t => t.id === taskId) : undefined;
          const fixed: { label: string; why: string } | null =
            isOther ? { label: 'Non-billable', why: 'Other (non-client) time can’t be billed' }
              : isTask && pickedTeam ? { label: 'Non-billable', why: 'Internal team work is never billed' }
                : isTask && pickedTask ? { label: pickedTask.billable === false ? 'Non-billable' : 'Billable', why: 'Set on the task — change it on the task if it is wrong' }
                  : isTask ? { label: 'Set by the task', why: 'Pick the task — its time is billable unless the task is marked otherwise' }
                    : null;
          if (fixed) {
            return (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-700">Billable</span>
                  <p className="text-xs text-gray-400">{fixed.why}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${fixed.label === 'Billable' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{fixed.label}</span>
              </div>
            );
          }
          return (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">Billable</span>
                <p className="text-xs text-gray-400">Whether this call is billable to the client</p>
              </div>
              <button
                type="button" role="switch" aria-checked={billable} aria-label="Billable"
                onClick={() => setBillable(prev => !prev)}
                className={`relative h-5 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${billable ? 'bg-brand-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${billable ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          );
        })()}
      </form>
    </Modal>
  );
}
