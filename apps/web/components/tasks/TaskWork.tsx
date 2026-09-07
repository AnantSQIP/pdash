'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Check, Loader, Clock } from 'lucide-react';
import clsx from 'clsx';
import { api, type ClosingSummary, type RunningTimer } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { DateField } from '@/components/ui/DateField';
import { toastError, toast } from '@/components/ui/Toast';
import { formatDate, todayIST } from '@/lib/date';

/** Whole quarter-hours from minutes, rounded to the nearest — what a timesheet entry accepts. */
export function quarterHours(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4;
}

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
export function RunningTimerBar({ running, onStopped }: { running: RunningTimer; onStopped?: (taskId: string, minutes: number) => void }) {
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
      offerToLog(running!.taskId, r.minutes, onStopped);
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
/**
 * Stopping the clock is the moment the hours exist, so it is the moment to file them. The
 * toast carries the figure and one action; the dialog opens pre-filled if they take it.
 * Below a quarter-hour there is nothing a timesheet could record, so nothing is offered.
 */
function offerToLog(taskId: string, minutes: number, onStopped?: (taskId: string, minutes: number) => void) {
  const h = quarterHours(minutes);
  if (onStopped && h >= 0.25) {
    toast(`Stopped — ${humanMinutes(minutes)} on this task.`, 'success', {
      action: { label: `Log ${h}h to timesheet`, onClick: () => onStopped(taskId, minutes) },
      duration: 8000,
    });
  } else {
    toast(`Stopped — ${humanMinutes(minutes)} on this task.`, 'success');
  }
}

export function TimerButton({ taskId, running, disabled, onStopped }: { taskId: string; running: RunningTimer; disabled?: boolean; onStopped?: (taskId: string, minutes: number) => void }) {
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
    onSuccess: r => { refresh(); offerToLog(taskId, r.minutes, onStopped); },
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
      const learned = r.counted
        ? ` ${r.role.charAt(0) + r.role.slice(1).toLowerCase()} work of this kind now averages ${r.expectedHoursForMyRole}h over ${r.basedOnCompletions} ${r.basedOnCompletions === 1 ? 'completion' : 'completions'}.`
        : '';
      const ledger = r.timesheetHours > 0 ? ` ${r.timesheetHours}h added to your timesheet.` : '';
      toast(`Closed at ${r.myHours}h.${ledger}${learned}`, 'success');
      // The close itself succeeded; only the ledger needs a hand. Say so separately, and loudly.
      if (r.timesheetWarning) toast(r.timesheetWarning, 'warning', { duration: 12000 });
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


/**
 * Log time on a task, from the row it is on.
 *
 * Filing a timesheet used to mean leaving this screen: Timesheets → new entry → project → PID →
 * task → date → hours → save, for work you had just been looking at. This is the same entry with
 * everything it can know already filled in — the task, its project, today's date, and the hours
 * the timer counted — so the ordinary case is: check the number, save.
 *
 * The server keeps every rule it always had (assigned to the task, matter still open, the 16h
 * day, the backdating windows, no identical duplicate); its messages are shown as they come.
 */
export function LogTimeDialog({
  taskId, taskTitle, projectLabel, defaultHours, onClose, onDone,
}: {
  taskId: string;
  taskTitle: string;
  projectLabel?: string;
  /** Pre-fill, e.g. from a just-stopped timer. */
  defaultHours?: number;
  onClose: () => void;
  onDone: (hours: number, date: string) => void;
}) {
  const today = todayIST();
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState(defaultHours && defaultHours >= 0.25 ? String(defaultHours) : '');
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState('');

  const n = Number(hours);
  // The ledger's own limits: quarter-hours, at least one, at most a 16-hour day.
  const valid = hours.trim() !== '' && Number.isFinite(n) && n >= 0.25 && n <= 16 && !!date && date <= today;

  const submit = useMutation({
    mutationFn: () => api.timesheets.create({
      taskId, date, hoursLogged: n, billable,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }),
    onSuccess: () => {
      toast(`Logged ${n}h on ${formatDate(date)}.`, 'success');
      onDone(n, date);
    },
    onError: e => toastError(e, 'Could not log that time.'),
  });

  return (
    <Modal
      title="Log time"
      subtitle={projectLabel ? `${taskTitle} · ${projectLabel}` : taskTitle}
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
            {submit.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Log time
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lt-hours" className="mb-1.5 block text-[12.5px] font-medium text-gray-700">Hours</label>
            <input
              id="lt-hours" type="number" min={0.25} max={16} step={0.25}
              value={hours} onChange={e => setHours(e.target.value)} autoFocus
              className="w-full rounded-lg bg-white px-3 py-2 text-[14px] tabular-nums text-gray-900 ring-1 ring-inset ring-gray-950/[0.10] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="lt-date" className="mb-1.5 block text-[12.5px] font-medium text-gray-700">Date</label>
            <DateField
              id="lt-date" type="date" value={date} max={today} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg bg-white px-3 py-2 text-[13px] text-gray-900 ring-1 ring-inset ring-gray-950/[0.10] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
            />
          </div>
        </div>
        {hours.trim() !== '' && !(n >= 0.25 && n <= 16) && (
          <p className="-mt-2 text-[11.5px] text-red-600">Between a quarter of an hour and sixteen hours.</p>
        )}
        {defaultHours != null && defaultHours >= 0.25 && (
          <p className="-mt-2 flex items-center gap-1.5 text-[11.5px] text-gray-400">
            <Clock size={11} /> Pre-filled from your timer — correct it if that is not right.
          </p>
        )}
        <div>
          <label htmlFor="lt-notes" className="mb-1.5 block text-[12.5px] font-medium text-gray-700">
            Note <span className="font-normal text-gray-400">— optional</span>
          </label>
          <input
            id="lt-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000}
            placeholder="What this time went on"
            className="w-full rounded-lg bg-white px-3 py-2 text-[13px] text-gray-900 ring-1 ring-inset ring-gray-950/[0.10] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-gray-700">
          <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-brand-500" />
          Billable to the client
        </label>
      </div>
    </Modal>
  );
}
