'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader } from 'lucide-react';
import { api } from '@/lib/api';
import { toast, toastError } from '@/components/ui/Toast';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';

/**
 * The small grey "Non-billable" mark shown beside a task wherever its time is logged or listed.
 * Billable is the default, so only the exception is marked — a row of "Billable" chips would say
 * nothing and crowd the ones that matter.
 */
export function NonBillableChip({ className }: { className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center whitespace-nowrap rounded-full bg-gray-100 px-1.5 py-px text-[10.5px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200', className)}
      title="Time logged on this task is non-billable"
    >
      Non-billable
    </span>
  );
}

/**
 * Billable / non-billable for one task.
 *
 * Anybody on the task's client or staffed on it may change it; the server decides, and says so if
 * not. Changing it re-marks the time already logged on the task, which is said in the toast so it
 * is never a surprise in a report.
 */
export function BillableToggle({ taskId, billable, disabled, onChanged }: {
  taskId: string;
  billable: boolean;
  disabled?: boolean;
  onChanged?: (billable: boolean) => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(billable);
  const [busy, setBusy] = useState(false);

  async function flip() {
    const next = !value;
    setBusy(true);
    setValue(next); // optimistic; put back on failure
    try {
      const r = await api.tasks.setBillable(taskId, next);
      const moved = r.entriesUpdated > 0
        ? ` ${r.entriesUpdated} logged ${r.entriesUpdated === 1 ? 'entry was' : 'entries were'} re-marked to match.`
        : '';
      toast(`${next ? 'Billable' : 'Non-billable'} now.${moved}`, 'success');
      invalidateTaskCaches(qc);
      invalidateTimesheetCaches(qc);
      onChanged?.(next);
    } catch (e) {
      setValue(!next);
      toastError(e, 'Could not change whether this task is billable.');
    } finally { setBusy(false); }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={flip}
      disabled={disabled || busy}
      title={value ? 'Billable — click to mark this task non-billable' : 'Non-billable — click to mark this task billable'}
      className="group inline-flex items-center gap-2 rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        value ? 'bg-emerald-500' : 'bg-gray-300',
      )}>
        <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', value ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      <span className={clsx('font-medium', value ? 'text-emerald-700' : 'text-gray-600')}>
        {value ? 'Billable' : 'Non-billable'}
      </span>
      {busy && <Loader size={12} className="animate-spin text-gray-400" />}
    </button>
  );
}
