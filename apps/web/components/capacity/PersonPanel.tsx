'use client';

// The per-person capacity drill-down drawer — shows what someone is working on and lets
// you extend a task's or project's deadline to relieve their load. Shared by the full
// Team Capacity board and the per-project Capacity tab so the two never drift apart.

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { X, Plus, ArrowRight, Sparkles, CalendarRange, AlertTriangle, CalendarPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type CapacityRow } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/Avatar';
import { formatDate } from '@/lib/date';

// Extending a deadline spreads the same remaining work over more days, which lowers the
// assignee's daily occupancy — the lever to relieve someone who is overloaded or on leave.
const EXTEND_PRESETS: { label: string; days: number }[] = [
  { label: '+1 day', days: 1 }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 },
];

/** newDeadline = max(currentDue, today) + days, as an ISO string. Never moves a deadline
 *  into the past even if the current one is already overdue. */
function extendedISO(currentDue: string | null | undefined, days: number): string {
  const from = currentDue ? new Date(currentDue) : new Date();
  const base = new Date(Math.max(from.getTime(), Date.now()));
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

type ExtendTarget = { id: string; dueDate?: string | null; projectId?: string | null };

export function ExtendMenu({ task, canProject, disabled, onExtend }: {
  task: ExtendTarget;
  canProject: boolean;
  disabled: boolean;
  onExtend: (scope: 'task' | 'project', iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'task' | 'project'>('task');
  const [custom, setCustom] = useState('');
  const applyPreset = (days: number) => { onExtend(scope, extendedISO(task.dueDate, days)); setOpen(false); };
  const applyCustom = () => {
    if (!custom) return;
    onExtend(scope, new Date(`${custom}T00:00:00`).toISOString());
    setOpen(false); setCustom('');
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-brand-600 disabled:opacity-40"
        title="Extend the deadline to relieve the load"
      >
        <CalendarPlus size={12} /> Extend
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 w-56 bg-white rounded-lg border border-gray-200 shadow-lg p-3">
            {canProject && task.projectId && (
              <div className="flex gap-0.5 mb-2 bg-gray-100 rounded-md p-0.5 text-[11px] font-medium">
                <button onClick={() => setScope('task')} className={clsx('flex-1 py-1 rounded', scope === 'task' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>This task</button>
                <button onClick={() => setScope('project')} className={clsx('flex-1 py-1 rounded', scope === 'project' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}>Whole project</button>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mb-1.5">
              {scope === 'project' ? 'Push the project deadline' : 'Push this task’s deadline'}
            </p>
            <div className="flex gap-1 mb-2">
              {EXTEND_PRESETS.map(p => (
                <button key={p.days} onClick={() => applyPreset(p.days)}
                  className="flex-1 text-[11px] font-medium px-1.5 py-1.5 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input type="date" value={custom} onChange={e => setCustom(e.target.value)}
                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1.5" />
              <button onClick={applyCustom} disabled={!custom}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-gray-800 text-white hover:bg-black disabled:opacity-40">Set</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PersonPanel({ row, onClose, onAssign }: { row: CapacityRow; onClose: () => void; onAssign?: () => void }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busyTaskId, setBusyTaskId] = useState('');
  const canTask = can('task.update');
  const canProject = can('project.update');

  async function extend(scope: 'task' | 'project', task: CapacityRow['openTasks'][number], iso: string) {
    setBusyTaskId(task.id);
    try {
      if (scope === 'project') {
        if (!task.projectId) throw new Error('This task has no project.');
        await api.projects.update(task.projectId, { dueDate: iso });
      } else {
        await api.tasks.update(task.id, { dueDate: iso });
      }
      qc.invalidateQueries({ queryKey: ['capacity'] });
      qc.invalidateQueries({ queryKey: ['coverage-risks'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['project', task.projectId] });
      toast(`Deadline extended to ${formatDate(iso)}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not extend the deadline', 'error');
    } finally {
      setBusyTaskId('');
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar user={{ id: row.userId, firstName: row.name.split(' ')[0], lastName: row.name.split(' ')[1], profilePhoto: row.profilePhoto }} size={40} />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{row.name}</p>
              <p className="text-xs text-gray-400 truncate">{row.designation ?? '—'}{row.department ? ` · ${row.department}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-gray-100">
          {[
            { label: 'Free', value: `${row.freeHours}h`, cls: 'text-emerald-600' },
            { label: 'Committed', value: `${row.committedHours}h`, cls: 'text-brand-600' },
            { label: 'Utilisation', value: `${row.utilization}%`, cls: row.utilization > 100 ? 'text-red-600' : 'text-gray-800' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={clsx('text-lg font-bold leading-none', s.cls)}>{s.value}</p>
              <p className="text-[11px] text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 text-sm">
          {row.availableNow ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full text-xs font-medium">
              <Sparkles size={12} /> Available now
            </span>
          ) : row.nextFreeDate ? (
            <span className="inline-flex items-center gap-1.5 text-sky-700 bg-sky-50 border border-sky-100 px-2.5 py-1 rounded-full text-xs font-medium">
              <CalendarRange size={12} /> Frees up {formatDate(row.nextFreeDate)}
              {row.freeRunDays > 1 && ` · ${row.freeRunDays} days`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full text-xs font-medium">
              <AlertTriangle size={12} /> Fully booked in this window
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Open tasks ({row.openTasks.length})
          </p>
          {row.openTasks.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing assigned — completely free to take work.</p>
          ) : (
            <div className="space-y-2">
              {row.openTasks.map(t => (
                <div key={t.id} className={clsx('rounded-lg border p-3', t.overdue ? 'border-red-200 bg-red-50/40' : 'border-gray-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 leading-snug">{t.title}</p>
                    <span className="text-xs text-gray-400 shrink-0">{t.remainingHours}h left</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-wrap min-w-0">
                      {t.projectId
                        ? <Link href={`/projects/${t.projectId}`} className="hover:text-brand-600 truncate max-w-[140px]">{t.project}</Link>
                        : <span>—</span>}
                      <span>·</span>
                      <span>{t.completionPercentage}%</span>
                      {t.dueDate && (
                        <>
                          <span>·</span>
                          <span className={t.overdue ? 'text-red-500 font-medium' : ''}>
                            {t.overdue ? 'overdue ' : 'due '}{formatDate(t.dueDate)}
                          </span>
                        </>
                      )}
                    </div>
                    {canTask && (
                      <ExtendMenu task={t} canProject={canProject} disabled={busyTaskId === t.id}
                        onExtend={(scope, iso) => extend(scope, t, iso)} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {onAssign && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button
              onClick={onAssign}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus size={15} /> Assign a task to {row.name.split(' ')[0]}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
