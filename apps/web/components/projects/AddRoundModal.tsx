'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { X, Loader, FolderPlus, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { DateField } from '@/components/ui/DateField';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';

const ROLES = ['MANAGER', 'MEMBER'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
// A returning client's next piece of work is usually starting now, but it can be booked ahead.
const PHASES: { value: string; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PLANNING', label: 'Planning' },
  { value: 'ON_HOLD', label: 'On hold' },
];

/**
 * Start ANOTHER project under an existing PID — the returning-client flow.
 *
 * Deliberately shorter than creating a project from scratch: the PID, the client and the office
 * carry over from the work already done for this client, so they are never asked for again and
 * cannot be contradicted here. What genuinely changes on a second engagement is what it is
 * called, what kind of work it is, when it runs, who staffs it, and how urgent it is.
 */
export function AddRoundModal({ fromProjectId, pid, onClose, onCreated }: {
  fromProjectId: string;
  pid: string;
  onClose: () => void;
  onCreated: (newProjectId: string) => void;
}) {
  const { users, currentUser } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [projectPhase, setProjectPhase] = useState<string>('ACTIVE');
  const [clientDueDate, setClientDueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [staff, setStaff] = useState<Record<string, string>>(
    currentUser ? { [currentUser.id]: 'MANAGER' } : {},
  );

  const { data: types = [] } = useQuery({
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: 300_000,
  });
  const selected = types.find(t => t.value === projectType);
  const presetTasks = selected?.tasks ?? [];

  const create = useMutation({
    mutationFn: () => api.projects.addRound(fromProjectId, {
      title: title.trim(),
      projectType: projectType || undefined,
      description: description.trim() || undefined,
      priority,
      projectPhase,
      clientDueDate: clientDueDate || null,
      startDate: startDate || null,
      endDate: endDate || null,
      members: Object.entries(staff).map(([userId, projectRole]) => ({ userId, projectRole })),
    }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['project-rounds'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['pid-ledger'] });
      toast(`Started "${p.title}" under ${pid}`, 'success');
      onCreated(p.id);
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not start the project', 'error'),
  });

  const roster = [...users].sort((a, b) => fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase()));
  const datesOk = !startDate || !endDate || endDate >= startDate;
  const valid = title.trim().length > 0 && datesOk;

  function toggle(userId: string) {
    setStaff(s => {
      const next = { ...s };
      if (next[userId]) delete next[userId];
      else next[userId] = 'MEMBER';
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={create.isPending ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <FolderPlus size={18} className="text-brand-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">New project</h2>
              <p className="text-xs text-gray-400">
                under <span className="font-mono font-bold text-brand-700">{pid}</span> — the client keeps the same Project ID
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={create.isPending} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Project name <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="e.g. Tesla EV Patent Landscape"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Project type</label>
            <select value={projectType} onChange={e => setProjectType(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
              <option value="">No preset workflow</option>
              {types.filter(t => !t.comingSoon).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {/* Same promise as creating a project: the type brings its standard task list with it. */}
            {presetTasks.length > 0 && (
              <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Creates {presetTasks.length} task{presetTasks.length === 1 ? '' : 's'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {presetTasks.slice(0, 8).map((t, i) => (
                    <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">{t}</span>
                  ))}
                  {presetTasks.length > 8 && <span className="text-[11px] text-gray-400">+{presetTasks.length - 8} more</span>}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start date</label>
              <DateField type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End date</label>
              <DateField type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
          </div>
          {!datesOk && <p className="text-xs text-red-600 -mt-2">The end date cannot be before the start date.</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Client deadline</label>
            <DateField type="date" value={clientDueDate} onChange={e => setClientDueDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            <p className="text-[11px] text-gray-400 mt-1">What was promised to the client. Visible to managers and admins only.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phase</label>
              <select value={projectPhase} onChange={e => setProjectPhase(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
                {PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Team <span className="text-gray-400 font-normal">— staffed for this project only</span>
            </label>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
              {roster.map(u => {
                const on = !!staff[u.id];
                return (
                  <div key={u.id} className={clsx('flex items-center gap-2 px-2.5 py-1.5', on && 'bg-brand-50/50')}>
                    <button type="button" onClick={() => toggle(u.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                        on ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white')}>
                        {on && <Check size={11} className="text-white" />}
                      </span>
                      <Avatar user={u} size={22} className="shrink-0" />
                      <span className="text-sm text-gray-800 truncate">{fullName(u)}</span>
                      {u.designation && <span className="text-[11px] text-gray-400 truncate hidden sm:inline">{u.designation}</span>}
                    </button>
                    {on && (
                      <select value={staff[u.id]} onChange={e => setStaff(s => ({ ...s, [u.id]: e.target.value }))}
                        className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white shrink-0">
                        {ROLES.map(r => <option key={r} value={r}>{r === 'MANAGER' ? 'Project Manager' : 'Member'}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              If nobody is set as Project Manager, you lead it.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="What is this piece of work?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={() => create.mutate()} disabled={create.isPending || !valid}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
            {create.isPending ? <Loader size={15} className="animate-spin" /> : <FolderPlus size={15} />} Create project
          </button>
          <button onClick={onClose} disabled={create.isPending}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
