'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Pause, Check, Loader, Clock, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { api, type RunningTimer } from '@/lib/api';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
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
 * Here it is Start and Finish. Nothing is typed and nothing is confirmed: the clock already
 * knows how long it took, and Finish files today's share of it.
 */

/** Whole minutes, shown the way people say them. */
export function humanMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Every clock that is running, counting up.
 *
 * Ticks locally rather than polling the server: each start time is known, so the elapsed figure
 * is arithmetic. A request a second per person would be a lot of traffic to tell somebody
 * something their own machine can work out.
 *
 * A list, because several clocks may run at once. When more than one does, it says so plainly —
 * an hour with three clocks running records three hours, which is what was asked for, but it
 * should never be a surprise at the end of the day.
 */
export function RunningTimersBar({ running, onPaused }: {
  running: RunningTimer[];
  onPaused?: (taskId: string, minutes: number) => void;
}) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running.length]);

  if (!running.length) return null;

  const pause = async (taskId: string) => {
    setBusyId(taskId);
    try {
      const r = await api.tasks.pauseTimer(taskId);
      qc.invalidateQueries({ queryKey: ['running-timer'] });
      qc.invalidateQueries({ queryKey: ['timer-today'] });
      qc.invalidateQueries({ queryKey: ['tasks-me'] });
      offerToLog(taskId, r.minutes, onPaused);
    } catch (e) { toastError(e, 'Could not pause the clock.'); }
    finally { setBusyId(''); }
  };

  return (
    <div className="rounded-xl bg-gray-900 text-white">
      {running.length > 1 && (
        <p className="flex items-center gap-1.5 border-b border-white/10 px-4 py-1.5 text-[11px] text-amber-300">
          <AlertTriangle size={11} />
          {running.length} clocks running — each records its own hours, so the day will total more than you were here.
        </p>
      )}
      <ul className="divide-y divide-white/10">
        {running.map(r => {
          const elapsed = Math.max(0, Math.floor((now - new Date(r.startedAt).getTime()) / 60_000));
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{r.task.title}</p>
                <p className="text-[11.5px] tabular-nums text-gray-400">Running · {humanMinutes(elapsed)}</p>
              </div>
              <button
                onClick={() => pause(r.taskId)}
                disabled={busyId === r.taskId}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-medium hover:bg-white/20 disabled:opacity-50"
              >
                {busyId === r.taskId ? <Loader size={13} className="animate-spin" /> : <Pause size={13} />} Pause
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Stopping the clock is the moment the hours exist, so it is the moment to file them. The
 * toast carries the figure and one action; the dialog opens pre-filled if they take it.
 * Below a quarter-hour there is nothing a timesheet could record, so nothing is offered.
 */
function offerToLog(taskId: string, minutes: number, onPaused?: (taskId: string, minutes: number) => void) {
  const h = quarterHours(minutes);
  if (onPaused && h >= 0.25) {
    toast(`Paused — ${humanMinutes(minutes)} on this task.`, 'success', {
      action: { label: `Log ${h}h to timesheet`, onClick: () => onPaused(taskId, minutes) },
      duration: 8000,
    });
  } else {
    toast(`Paused — ${humanMinutes(minutes)} on this task.`, 'success');
  }
}

/**
 * One clock, one button: Start, then Pause, then Resume.
 *
 * Starting no longer stops anything else. Several tasks may run at once, and the only way to
 * stop one is to pause or finish that task — so time can never be moved off a task by pressing
 * something on a different row, which is how hours used to end up on the wrong work.
 */
export function TimerButton({ taskId, running, hasTracked, disabled, onPaused }: {
  taskId: string;
  running: RunningTimer[];
  /** The clock has been on this task before, so the word is Resume rather than Start. */
  hasTracked?: boolean;
  disabled?: boolean;
  onPaused?: (taskId: string, minutes: number) => void;
}) {
  const qc = useQueryClient();
  const isThis = running.some(r => r.taskId === taskId);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['running-timer'] });
    qc.invalidateQueries({ queryKey: ['timer-today'] });
    qc.invalidateQueries({ queryKey: ['tasks-me'] });
  };
  const start = useMutation({
    mutationFn: () => api.tasks.startTimer(taskId),
    onSuccess: refresh,
    onError: e => toastError(e, 'Could not start the clock.'),
  });
  const pause = useMutation({
    mutationFn: () => api.tasks.pauseTimer(taskId),
    onSuccess: r => { refresh(); offerToLog(taskId, r.minutes, onPaused); },
    onError: e => toastError(e, 'Could not pause the clock.'),
  });
  const busy = start.isPending || pause.isPending;
  const label = isThis ? 'Pause' : hasTracked ? 'Resume' : 'Start';

  return (
    <button
      onClick={() => (isThis ? pause.mutate() : start.mutate())}
      disabled={disabled || busy}
      title={isThis ? 'Pause the clock — the time so far is kept' : hasTracked ? 'Pick this back up' : 'Start working on this'}
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40',
        isThis
          ? 'bg-gray-900 text-white hover:bg-gray-800'
          : 'text-gray-600 ring-1 ring-inset ring-gray-950/[0.08] hover:bg-gray-50',
      )}
    >
      {busy ? <Loader size={12} className="animate-spin" /> : isThis ? <Pause size={12} /> : <Play size={12} />}
      {label}
    </button>
  );
}

/**
 * Finish: one click, and the task is done.
 *
 * Nothing is asked for. The clock already knows how long it took, that figure teaches the
 * estimate, and today's share of it goes to the timesheet — so the person who did the work
 * types nothing, and the numbers still add up. What happened is said afterwards, in the toast,
 * where it can be read and ignored rather than filled in and guessed at.
 */
export function FinishButton({ taskId, disabled, onDone }: {
  taskId: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const finish = useMutation({
    mutationFn: () => api.tasks.finishTask(taskId),
    onSuccess: r => {
      invalidateTimesheetCaches(qc);
      qc.invalidateQueries({ queryKey: ['running-timer'] });
      qc.invalidateQueries({ queryKey: ['timer-today'] });
      const s = r.settle;
      const took = s && s.trackedMinutes > 0 ? ` It took ${humanMinutes(s.trackedMinutes)}.` : '';
      const filed = s && s.timesheetHours > 0 ? ` ${s.timesheetHours}h filed to today's timesheet.` : '';
      toast(`Finished.${took}${filed}`, 'success');
      // No time on the clock at all: say so once, rather than leaving somebody to find an empty
      // day at punch-out and wonder where their afternoon went.
      if (s && s.trackedMinutes === 0) {
        toast('The clock was never started on this task, so nothing was filed. Use Log time if you worked on it.', 'info', { duration: 9000 });
      }
      if (s?.timesheetWarning) toast(s.timesheetWarning, 'warning', { duration: 12000 });
      onDone?.();
    },
    onError: e => toastError(e, 'Could not finish the task.'),
  });

  return (
    <button
      onClick={() => finish.mutate()}
      disabled={disabled || finish.isPending}
      title="Mark this done. The clock stops and today's time is filed."
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
    >
      {finish.isPending ? <Loader size={12} className="animate-spin" /> : <Check size={12} />} Finish
    </button>
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
