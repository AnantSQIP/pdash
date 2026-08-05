'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, Pencil, Check, X, Loader, CalendarRange, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { api, type PidRound } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/date';
import { projectTypeLabel } from '@/lib/mock-data';
import { PHASE_META } from '@/lib/mock-data';

/**
 * One project under a PID, drawn as a collapsible card.
 *
 * A PID that a returning client keeps coming back to holds several of these, so each card has to
 * say — without being opened — which piece of work it is and when it ran. Hence the label on the
 * left and the start–end dates on the right of the top bar, both editable in place: renaming a
 * round shouldn't mean a trip to the edit-project screen.
 *
 * These are DATES THE WORK RUNS BETWEEN, not a deadline. The deadline (and the client deadline)
 * stay where they were, on the project itself.
 */
export function RoundCard({ round, index, total, defaultOpen, canEdit, children }: {
  round: PidRound;
  index: number;
  total: number;
  defaultOpen?: boolean;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(round.title);
  const [start, setStart] = useState(round.startDate?.slice(0, 10) ?? '');
  const [end, setEnd] = useState(round.dueDate?.slice(0, 10) ?? '');
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: () => api.projects.update(round.id, {
      title: title.trim(),
      startDate: start || null,
      dueDate: end || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-rounds'] });
      qc.invalidateQueries({ queryKey: ['project', round.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
      toast('Project updated', 'success');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not save', 'error'),
  });

  function cancel() {
    setTitle(round.title);
    setStart(round.startDate?.slice(0, 10) ?? '');
    setEnd(round.dueDate?.slice(0, 10) ?? '');
    setEditing(false);
  }

  const phase = PHASE_META[round.projectPhase as keyof typeof PHASE_META];
  const finished = round.projectPhase === 'COMPLETED' || round.projectPhase === 'CLOSED';

  return (
    <div className={clsx('rounded-xl border bg-white overflow-hidden transition-colors',
      finished ? 'border-gray-200' : 'border-brand-200')}>
      {/* Top bar: label + phase on the left, the dates it runs between on the right. */}
      <div className={clsx('flex items-center gap-3 px-4 py-3 border-b flex-wrap',
        finished ? 'bg-gray-50 border-gray-100' : 'bg-brand-50/60 border-brand-100')}>
        <button onClick={() => setOpen(o => !o)} className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0" title={open ? 'Collapse' : 'Expand'}>
          <ChevronDown size={16} className={clsx('transition-transform', !open && '-rotate-90')} />
        </button>

        {editing ? (
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save.mutate(); if (e.key === 'Escape') cancel(); }}
            autoFocus
            className="flex-1 min-w-[160px] px-2 py-1 text-sm font-semibold border border-brand-400 rounded focus:outline-none"
          />
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[11px] font-bold text-gray-400 shrink-0">
              {total > 1 ? `Project ${index + 1} of ${total}` : 'Project'}
            </span>
            <Link href={`/projects/${round.id}`} className="text-sm font-semibold text-gray-900 truncate hover:text-brand-600 hover:underline inline-flex items-center gap-1">
              {round.title}<ExternalLink size={11} className="text-gray-300 shrink-0" />
            </Link>
            {round.projectType && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                {projectTypeLabel(round.projectType)}
              </span>
            )}
            <span className={clsx('text-[11px] px-2 py-0.5 rounded-full shrink-0', phase?.bg ?? 'bg-gray-100', phase?.text ?? 'text-gray-600')}>
              {phase?.label ?? round.projectPhase}
            </span>
          </div>
        )}

        {/* Dates the work runs between — explicitly NOT the deadline. */}
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="text-xs border border-gray-300 rounded px-1.5 py-1" title="Start date" />
              <span className="text-gray-300 text-xs">–</span>
              <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)}
                className="text-xs border border-gray-300 rounded px-1.5 py-1" title="End date" />
              <button onClick={() => save.mutate()} disabled={save.isPending || !title.trim()}
                className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50" title="Save">
                {save.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button onClick={cancel} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="Cancel"><X size={14} /></button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-600" title="The dates this project runs between (not its deadline)">
                <CalendarRange size={13} className="text-gray-400" />
                {round.startDate || round.dueDate ? (
                  <>
                    <span className="font-medium">{round.startDate ? formatDate(round.startDate) : '—'}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-medium">{round.dueDate ? formatDate(round.dueDate) : '—'}</span>
                  </>
                ) : <span className="text-gray-400">No dates set</span>}
              </span>
              <span className="text-xs text-gray-400 tabular-nums">{round.completionPercentage}%</span>
              {canEdit && (
                <button onClick={() => setEditing(true)} className="p-1 text-gray-400 hover:text-brand-600 rounded" title="Rename / change dates">
                  <Pencil size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {open && <div>{children}</div>}
    </div>
  );
}
