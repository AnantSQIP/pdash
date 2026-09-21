'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader } from 'lucide-react';
import { api } from '@/lib/api';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { toastError, toast } from '@/components/ui/Toast';

/**
 * Working on a task, from the one screen a person already has open: Finish it when it is done,
 * Reopen it if it was not. There is no timer — the stopwatch was retired, and hours are logged
 * for the whole day with the one Log time on My Tasks.
 */

/** Whole minutes, shown the way people say them. */
export function humanMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Finish: one click, and the task is done.
 *
 * Nothing is asked for. The hours this person has logged against the task teach the estimate of
 * how long that kind of task takes; nothing is filed automatically — time is always logged by the
 * person, from the one Log time on My Tasks. What happened is said afterwards, in the toast.
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
      const s = r.settle;
      const logged = s && s.trackedMinutes > 0 ? ` You have logged ${humanMinutes(s.trackedMinutes)} on it.` : '';
      toast(`Finished.${logged}`, 'success');
      // Nothing logged against it yet: say so once, while the work is fresh — the task stays on
      // the Log time sheet for two weeks after it is finished.
      if (s && s.settled && s.trackedMinutes === 0) {
        toast('No hours are logged on this task yet — add them with Log time.', 'info', { duration: 9000 });
      }
      onDone?.();
    },
    onError: e => toastError(e, 'Could not finish the task.'),
  });

  return (
    <button
      onClick={() => finish.mutate()}
      disabled={disabled || finish.isPending}
      title="Mark this done. Log its hours with Log time."
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
    >
      {finish.isPending ? <Loader size={12} className="animate-spin" /> : <Check size={12} />} Finish
    </button>
  );
}
