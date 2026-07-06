'use client';

import { useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';

interface AddTaskModalProps {
  projectId: string;
  taskListId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddTaskModal({ projectId, taskListId, onClose, onSuccess }: AddTaskModalProps) {
  const { currentUser, users } = useOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Fetch default open status so new tasks appear in the right column
      let defaultStatusId: string | undefined;
      try {
        const status = await api.workflows.defaultOpenStatus('workflow-default');
        defaultStatusId = status.id;
      } catch { /* proceed without status */ }

      await api.tasks.create({
        title,
        description: description || undefined,
        priority,
        dueDate: dueDate || undefined,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        projectId,
        taskListId,
        createdBy: currentUser?.id ?? 'system', // server derives the real creator from the cookie actor
        currentWorkflowStatusId: defaultStatusId,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
            <p className="text-sm text-gray-500 mt-0.5">Fill in the details to create a task</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text" required value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Implement login page"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Hours</label>
            <input type="number" min="0" step="0.5" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)}
              placeholder="e.g. 4"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Assignees {assigneeIds.length > 0 && <span className="text-gray-400 font-normal">({assigneeIds.length})</span>}
            </label>
            <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-1.5 space-y-0.5">
              {users.length === 0 && <p className="text-xs text-gray-400 px-1.5 py-1">No team members available</p>}
              {users.map(u => {
                const on = assigneeIds.includes(u.id);
                return (
                  <button type="button" key={u.id}
                    onClick={() => setAssigneeIds(prev => on ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                    className={clsx('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors',
                      on ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-700')}
                  >
                    <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      on ? 'bg-brand-600 border-brand-600' : 'border-gray-300')}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    {u.firstName} {u.lastName}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
                : <><Plus size={15} /> Create Task</>}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </form>
      </div>
    </div>
  );
}
