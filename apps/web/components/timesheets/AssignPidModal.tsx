'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type ApiTask, type ApiProject } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { Modal } from '@/components/ui/Modal';

/** Attach a PID (project) + task to a buffer time-entry that was logged without one. */
export function AssignPidModal({ entryId, onClose, onDone }: { entryId: string; onClose: () => void; onDone: () => void }) {
  const { org } = useOrg();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [error, setError] = useState('');

  const { data: projects = [], isLoading: lp } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id], queryFn: () => api.projects.list(org!.id), enabled: !!org?.id, staleTime: 30_000,
  });
  const { data: tasks = [], isLoading: lt } = useQuery<ApiTask[]>({
    queryKey: ['tasks', projectId], queryFn: () => api.tasks.list(projectId), enabled: !!projectId,
  });
  const selectedProject = projects.find(p => p.id === projectId);

  const assign = useMutation({
    mutationFn: () => api.timesheets.assign(entryId, taskId),
    onSuccess: () => { onDone(); onClose(); },
    onError: e => setError(e instanceof Error ? e.message : 'Could not assign the PID.'),
  });

  return (
    <Modal
      title="Assign PID"
      subtitle="Attach this time entry to a project (PID) and task"
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Project ID (PID) <span className="text-red-500">*</span></label>
          <select required value={projectId} onChange={e => { setProjectId(e.target.value); setTaskId(''); }}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white">
            <option value="">{lp ? 'Loading…' : projects.length === 0 ? 'You are not on any projects' : 'Select a project by its PID'}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{(p.code ?? 'PID pending')} — {p.title}</option>)}
          </select>
          {selectedProject && <p className="text-[11px] text-gray-500 mt-1">Project type: <span className="font-medium text-gray-700">{selectedProject.projectType ?? '—'}</span></p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Task <span className="text-red-500">*</span></label>
          <select required value={taskId} onChange={e => setTaskId(e.target.value)} disabled={!projectId}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white disabled:bg-gray-50 disabled:text-gray-400">
            <option value="">{!projectId ? 'Pick a PID first' : lt ? 'Loading…' : tasks.length === 0 ? 'No tasks in this project' : 'Select a task'}</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  );
}
