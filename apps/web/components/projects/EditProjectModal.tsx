'use client';

import { useState } from 'react';
import { X, Loader, Lock } from 'lucide-react';
import clsx from 'clsx';
import { api, type ApiProject } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { toUtcDay } from '@/lib/date';
import { PHASE_META, PRIORITY_META, type Phase, type Priority } from '@/lib/mock-data';

/**
 * Edit a project after it exists.
 *
 * Until this existed, a project's entire plan — its title, phase, priority and all three
 * dates — was fixed at creation, because the only thing the app ever sent to
 * PATCH /projects/:id was a completionPercentage the server ignores (progress is derived
 * from the tasks). A project booked against the wrong deadline could never be corrected.
 */
export function EditProjectModal({ project, onClose, onSaved }: {
  project: ApiProject;
  onClose: () => void;
  onSaved: (p: ApiProject) => void;
}) {
  const { toast } = useToast();
  const day = (v?: string | null) => (v ? toUtcDay(v) : '');

  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');
  const [priority, setPriority] = useState(project.priority ?? 'MEDIUM');
  const [projectPhase, setProjectPhase] = useState(project.projectPhase ?? 'PLANNING');
  const [startDate, setStartDate] = useState(day(project.startDate));
  const [dueDate, setDueDate] = useState(day(project.dueDate));
  const [clientDueDate, setClientDueDate] = useState(day(project.clientDueDate));
  const [saving, setSaving] = useState(false);

  // The server OMITS clientDueDate entirely unless this actor may see it, so the key's
  // presence is the exact permission signal — and it correctly includes a project manager
  // who does not hold the org-wide permission.
  const mayEditClientDue = 'clientDueDate' in project;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      // An emptied date is sent as null, which CLEARS it. Omitting the field would instead
      // leave the old value untouched.
      const updated = await api.projects.update(project.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        projectPhase,
        startDate: startDate || null,
        dueDate: dueDate || null,
        ...(mayEditClientDue ? { clientDueDate: clientDueDate || null } : {}),
      });
      onSaved(updated);
      toast('Project updated', 'success');
      onClose();
    } catch (err) {
      // The server owns the rules (who may set a client date; internal must not fall after
      // it), so just surface its reason.
      toast(err instanceof Error ? err.message : 'Could not save the project', 'error');
    } finally {
      setSaving(false);
    }
  }

  const input =
    'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition';

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Edit project</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={save} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required className={input} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className={clsx(input, 'resize-none')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phase</label>
              <select value={projectPhase} onChange={e => setProjectPhase(e.target.value)} className={input}>
                {(Object.keys(PHASE_META) as Phase[]).map(p => (
                  <option key={p} value={p}>{PHASE_META[p].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={input}>
                {(Object.keys(PRIORITY_META) as Priority[]).map(p => (
                  <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start date</label>
              <input
                type="date" value={startDate} max={dueDate || undefined}
                onChange={e => setStartDate(e.target.value)} className={input}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Deadline
                {mayEditClientDue && <span className="ml-1 text-xs font-normal text-gray-400">· the team&apos;s date</span>}
              </label>
              <input
                type="date" value={dueDate}
                min={startDate || undefined} max={clientDueDate || undefined}
                onChange={e => setDueDate(e.target.value)} className={input}
              />
            </div>
          </div>

          {mayEditClientDue && (
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-amber-700 mb-1.5">
                <Lock size={12} /> Client deadline
              </label>
              <input
                type="date" value={clientDueDate} min={dueDate || undefined}
                onChange={e => setClientDueDate(e.target.value)}
                className={clsx(input, 'border-amber-200 bg-amber-50/60 text-amber-900')}
              />
              <p className="text-xs text-gray-400 mt-1">
                Employees never receive this date — it is stripped from the API response, not just hidden.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {saving && <Loader size={14} className="animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
