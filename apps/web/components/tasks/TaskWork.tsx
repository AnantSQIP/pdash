'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Check, Loader, Clock } from 'lucide-react';
import clsx from 'clsx';
import { api, type ClosingSummary, type RunningTimer } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { toastError, toast } from '@/components/ui/Toast';

/**
 * Working on a task, from the one screen a person already has open.
 *
 * Closing a task and recording the time used to be two errands in two modules — open the
 * project, find the task, change the status, then go to Timesheets, start an entry, pick the
 * project, pick the task, pick the date, type the hours, save. Twelve interactions and two
 * page loads, for one task, every day.
 *
 * Here it is Start, Stop, confirm.
 */

/** Whole minutes, shown the way people say them. */
export function humanMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * The clock, counting up.
 *
 * Ticks locally rather than polling the server: the start time is known, so the elapsed
 * figure is arithmetic. A request a second per person would be a lot of traffic to tell
 * somebody something their own machine can work out.
 */
export function RunningTimerBar({ running }: { running: RunningTimer }) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const stop = useMutation({
    mutationFn: () => api.tasks.stopTimer(running!.taskId),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['running-timer'] });
      qc.invalidateQueries({ queryKey: ['tasks-me'] });
      toast(`Stopped — ${humanMinutes(r.minutes)} recorded on this task.`, 'success');
    },
    onError: e => toastError(e, 'Could not stop the timer.'),
  });

  if (!running) return null;
  const elapsed = Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 60_000));

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{running.task.title}</p>
        <p className="text-[11.5px] text-gray-400 tabular-nums">Running · {humanMinutes(elapsed)}</p>
      </div>
      <button
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-medium hover:bg-white/20 disabled:opacity-50"
      >
        {stop.isPending ? <Loader size={13} className="animate-spin" /> : <Square size={13} />} Stop
      </button>
    </div>
  );
}

/** Start / Stop for one task row. */
export function TimerButton({ taskId, running, disabled }: { taskId: string; running: RunningTimer; disabled?: boolean }) {
  const qc = useQueryClient();
  const isThis = running?.taskId === taskId;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['running-timer'] });
    qc.invalidateQueries({ queryKey: ['tasks-me'] });
  };
  const start = useMutation({
    mutationFn: () => api.tasks.startTimer(taskId),
    onSuccess: r => {
      refresh();
      // Say plainly that the previous task was stopped — a silent switch is how people end
      // up with hours on the wrong task.
      if (!r.resumed && running) toast(`Started. “${running.task.title}” was stopped.`, 'info');
    },
    onError: e => toastError(e, 'Could not start the timer.'),
  });
  const stop = useMutation({
    mutationFn: () => api.tasks.stopTimer(taskId),
    onSuccess: r => { refresh(); toast(`Stopped — ${humanMinutes(r.minutes)} on this task.`, 'success'); },
    onError: e => toastError(e, 'Could not stop the timer.'),
  });
  const busy = start.isPending || stop.isPending;

  return (
    <button
      onClick={() => (isThis ? stop.mutate() : start.mutate())}
      disabled={disabled || busy}
      title={isThis ? 'Stop the clock' : 'Start working on this'}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40',
        isThis
          ? 'bg-gray-900 text-white hover:bg-gray-800'
          : 'text-gray-600 ring-1 ring-inset ring-gray-950/[0.08] hover:bg-gray-50',
      )}
    >
      {busy ? <Loader size={12} className="animate-spin" /> : isThis ? <Square size={12} /> : <Play size={12} />}
      {isThis ? 'Stop' : 'Start'}
    </button>
  );
}

/**
 * Closing a task.
 *
 * The hours box is pre-filled from the timer but editable, and the edited figure is what is
 * kept. A timer left running would otherwise poison the expectation for every future task of
 * this kind, and nobody reads intent as well as the person who did the work.
 */
export function CompleteTaskDialog({
  taskId, onClose, onDone, closedStatusId,
}: {
  taskId: string;
  onClose: () => void;
  onDone: () => void;
  closedStatusId?: string;
}) {
  const [hours, setHours] = useState<string>('');
  const [touched, setTouched] = useState(false);

  const { data: summary, isLoading } = useQuery<ClosingSummary>({
    queryKey: ['closing-summary', taskId],
    queryFn: () => api.tasks.closingSummary(taskId),
    refetchOnMount: 'always',
  });

  // Pre-fill once, from the timer. Never overwrite what the person has typed.
  useEffect(() => {
    if (summary && !touched) setHours(String(summary.suggestedHours || ''));
  }, [summary, touched]);

  const submit = useMutation({
    mutationFn: () => api.tasks.completeWithHours(taskId, Number(hours), closedStatusId),
    onSuccess: r => {
      toast(
        r.counted
          ? `Closed at ${r.myHours}h. ${r.role.toLowerCase()} work of this kind now averages ${r.expectedHoursForMyRole}h over ${r.basedOnCompletions}.`
          : `Closed at ${r.myHours}h.`,
        'success',
      );
      onDone();
    },
    onError: e => toastError(e, 'Could not close the task.'),
  });

  const n = Number(hours);
  const valid = hours.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 999;
  const overExpected = summary?.expectedHoursForMyRole != null && valid && n > summary.expectedHoursForMyRole;

  return (
    <Modal
      title="Close this task"
      subtitle={summary?.title}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => submit.mutate()}
            disabled={!valid || submit.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {submit.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Close task
          </button>
        </div>
      }
    >
      {isLoading || !summary ? (
        <p className="py-6 text-center text-[13px] text-gray-400">
          <Loader size={14} className="mr-2 inline animate-spin" /> Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="hours" className="mb-1.5 block text-[12.5px] font-medium text-gray-700">
              How long did your part take?
            </label>
            <div className="flex items-center gap-2">
              <input
                id="hours"
                type="number" min={0} max={999} step={0.25}
                value={hours}
                onChange={e => { setTouched(true); setHours(e.target.value); }}
                className="w-28 rounded-lg bg-white px-3 py-2 text-[14px] tabular-nums text-gray-900 ring-1 ring-inset ring-gray-950/[0.10] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
              />
              <span className="text-[13px] text-gray-500">hours</span>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-gray-400">
              <Clock size={11} />
              Your timer recorded {humanMinutes(summary.trackedMinutes)}. Correct it if that is not right —
              what you enter here is what is kept.
            </p>
          </div>

          {/* What this kind of work usually takes, and on how much evidence. */}
          <div className="rounded-lg bg-gray-50 px-3.5 py-3 text-[12.5px] ring-1 ring-inset ring-gray-950/[0.05]">
            {summary.expectedHoursForMyRole == null ? (
              <p className="text-gray-500">
                Nothing like this has been timed yet, so your figure sets the first expectation for
                <span className="font-medium text-gray-700"> {summary.role.toLowerCase()}</span> work on this task.
              </p>
            ) : (
              <>
                <p className="text-gray-600">
                  <span className="font-medium text-gray-900 tabular-nums">{summary.expectedHoursForMyRole}h</span>
                  {' '}is what {summary.role.toLowerCase()} work on this task usually takes, over{' '}
                  <span className="tabular-nums">{summary.basedOnCompletions}</span>{' '}
                  {summary.basedOnCompletions === 1 ? 'completion' : 'completions'}.
                </p>
                {summary.expectedHoursForTask != null && summary.expectedHoursForTask !== summary.expectedHoursForMyRole && (
                  <p className="mt-1 text-gray-500">
                    The whole task, across every role, usually takes{' '}
                    <span className="tabular-nums">{summary.expectedHoursForTask}h</span>.
                  </p>
                )}
                {overExpected && (
                  <p className="mt-1.5 text-amber-700">
                    That is longer than usual — worth a note on the task while it is fresh.
                  </p>
                )}
              </>
            )}
            {summary.basedOnCompletions === 1 && (
              <p className="mt-1.5 text-gray-400">Based on a single completion, so treat it lightly.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
