'use client';

// "Today, so far" — what the clock recorded, what the timesheet has, and what the day still owes.
//
// Filing the timesheet is a condition of punching out. That rule is only fair if the arithmetic
// is visible while there is still time to do something about it, rather than sprung on somebody
// at half past six. So it lives here, on the screen where the work is, with the one button that
// resolves it.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Clock, Loader, AlertTriangle } from 'lucide-react';
import { api, type DayStatus } from '@/lib/api';
import { toast, toastError } from '@/components/ui/Toast';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';

/** File every tracked-but-unfiled hour, one task at a time so a single refusal is not fatal. */
export async function fileTrackedTime(day: DayStatus): Promise<{ filed: number; failed: string[] }> {
  let filed = 0;
  const failed: string[] = [];
  for (const t of day.tracked) {
    if (t.unfiledHours < 0.25) continue;
    try {
      await api.timesheets.create({
        taskId: t.taskId, date: day.date, hoursLogged: t.unfiledHours, billable: true,
        notes: 'Tracked on My Tasks',
      });
      filed += t.unfiledHours;
    } catch (e) {
      failed.push(`${t.title}: ${e instanceof Error ? e.message : 'refused'}`);
    }
  }
  return { filed: Math.round(filed * 100) / 100, failed };
}

export function TrackedTodayBar({ day, onFiled }: { day: DayStatus; onFiled?: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  // Nothing owed and nothing tracked: a day off, or a day that has not started. Say nothing.
  if (day.target === 0 && day.trackedMinutes === 0 && day.logged === 0) return null;

  const canFile = day.unfiledHours >= 0.25;
  const done = day.complete;

  const file = async () => {
    setBusy(true);
    try {
      const { filed, failed } = await fileTrackedTime(day);
      invalidateTimesheetCaches(qc);
      qc.invalidateQueries({ queryKey: ['timer-today'] });
      if (filed > 0) toast(`${filed}h filed to today's timesheet.`, 'success');
      if (failed.length) toast(failed.join(' · '), 'warning', { duration: 12000 });
      if (!filed && !failed.length) toast('Nothing left to file.', 'info');
      onFiled?.();
    } catch (e) { toastError(e, 'Could not file the time.'); }
    finally { setBusy(false); }
  };

  return (
    <div className={clsx('flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2 text-[12.5px] sm:px-6',
      done ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70')}>
      <span className={clsx('inline-flex items-center gap-1.5 font-medium', done ? 'text-emerald-800' : 'text-amber-900')}>
        {done ? <Check size={14} /> : <Clock size={14} />}
        Today
      </span>
      <span className="tabular-nums text-gray-700">
        <span className="font-semibold text-gray-900">{day.logged}h</span> filed of {day.target}h
      </span>
      {day.trackedMinutes > 0 && (
        <span className="tabular-nums text-gray-600">
          {day.trackedHours}h on the clock
          {day.running > 0 && <span className="text-gray-500"> · {day.running} running</span>}
        </span>
      )}
      {!done && day.missing > 0 && (
        <span className="font-medium text-amber-900 tabular-nums">{day.missing}h still owed</span>
      )}
      {canFile && (
        <button
          onClick={file}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          title="File every tracked hour the timesheet has not got yet"
        >
          {busy ? <Loader size={12} className="animate-spin" /> : <Clock size={12} />}
          File {day.unfiledHours}h
        </button>
      )}
      {/* Several clocks at once record more hours than were lived. That is what was asked for,
          but it should never be a surprise at the door. */}
      {day.trackedHours > day.target + 1 && day.target > 0 && (
        <span className="inline-flex items-center gap-1 text-[11.5px] text-gray-500" title="Running several clocks at once records each of them in full">
          <AlertTriangle size={11} /> more on the clock than the day asks for
        </span>
      )}
    </div>
  );
}
