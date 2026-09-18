'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { pidLabel } from '@/lib/mock-data';
import { api, type ApiTask, type ApiProject, type TaskGroup } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { Modal } from '@/components/ui/Modal';

/**
 * A client's tasks under the task group each sits in, in the groups' own order. A task with no
 * group belongs to the default one; one whose group is not listed goes last, under "Other".
 */
function tasksByGroup(tasks: ApiTask[], projectId: string, groups: TaskGroup[]) {
  const known = new Map(groups.map(g => [g.id, g]));
  const fallback = groups.find(g => g.isDefault) ?? null;
  const buckets = new Map<string, ApiTask[]>();
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

/** Attach a PID (client) + task to a buffer time-entry that was logged without one. */
export function AssignPidModal({ entryId, onClose, onDone }: { entryId: string; onClose: () => void; onDone: () => void }) {
  const { org, currentUser } = useOrg();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [error, setError] = useState('');

  const { data: projects = [], isLoading: lp } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id], queryFn: () => api.projects.list(org!.id), enabled: !!org?.id, staleTime: 30_000,
  });
  const { data: allTasks = [], isLoading: lt } = useQuery<ApiTask[]>({
    queryKey: ['tasks', projectId], queryFn: () => api.tasks.list(projectId), enabled: !!projectId,
  });
  // Only tasks you're assigned to — the server rejects logging/assigning time on others.
  const tasks = allTasks.filter(t => t.assignees?.some(a => a.userId === currentUser?.id));
  const selectedProject = projects.find(p => p.id === projectId);
  // The client's task groups, so those tasks are listed under the group each belongs to.
  const { data: groups } = useQuery<TaskGroup[]>({
    queryKey: ['task-groups', projectId], queryFn: () => api.taskLists.list(projectId), enabled: !!projectId, staleTime: 60_000,
  });
  const groupedTasks = groups ? tasksByGroup(tasks, projectId, groups) : null;

  const assign = useMutation({
    mutationFn: () => api.timesheets.assign(entryId, taskId),
    onSuccess: () => { onDone(); onClose(); },
    onError: e => setError(e instanceof Error ? e.message : 'Could not assign the PID.'),
  });

  return (
    <Modal
      title="Assign PID"
      subtitle="Attach this time entry to a client (PID) and task"
      size="md"
      onClose={onClose}
      footer={
        <div>
          {error && <p className="text-xs text-red-600 mb-2 text-right">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" form="assign-pid-form" disabled={assign.isPending || !taskId}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {assign.isPending ? 'Saving…' : 'Assign'}
            </button>
          </div>
        </div>
      }
    >
      <form id="assign-pid-form" onSubmit={e => { e.preventDefault(); if (taskId) assign.mutate(); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Client PID <span className="text-red-500">*</span></label>
          <select required value={projectId} onChange={e => { setProjectId(e.target.value); setTaskId(''); }}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white">
            <option value="">{lp ? 'Loading…' : projects.length === 0 ? 'You are not on any clients' : 'Select a client by its PID'}</option>
            {/* One PID can hold several rounds — show the round so the right one is picked. */}
            {projects.map(p => <option key={p.id} value={p.id}>{pidLabel(p.code, p.roundSeq)} — {p.title}</option>)}
          </select>
          {selectedProject && <p className="text-[11px] text-gray-500 mt-1">Type: <span className="font-medium text-gray-700">{selectedProject.projectType ?? '—'}</span></p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Task <span className="text-red-500">*</span></label>
          <select required value={taskId} onChange={e => setTaskId(e.target.value)} disabled={!projectId}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white disabled:bg-gray-50 disabled:text-gray-400">
            <option value="">{!projectId ? 'Pick a PID first' : lt ? 'Loading…' : tasks.length === 0 ? 'No tasks assigned to you here' : 'Select a task'}</option>
            {groupedTasks
              ? groupedTasks.map(g => (
                  <optgroup key={g.key} label={g.label}>
                    {g.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </optgroup>
                ))
              : tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  );
}
