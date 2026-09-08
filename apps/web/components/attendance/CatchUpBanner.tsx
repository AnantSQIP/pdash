'use client';

// What is still unresolved behind you.
//
// A day that ends without a punch-out is closed by the machine at 11:59 pm, and the person only
// finds out when a report disagrees with their memory weeks later. Same for a clock left running
// overnight, and for a day whose timesheet was never filled. This says all three the next
// morning, on the screens somebody already opens, and every line has the button that ends it.
//
// A banner and not a dialog, deliberately: the first-login pop-up was removed for being in the
// way, and a strip that stays until the work is actually done is both harder to ignore and
// impossible to be blocked by.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, Clock, Loader, Pause, ArrowRight, X } from 'lucide-react';
import { api, type CatchUp } from '@/lib/api';
import { toast, toastError } from '@/components/ui/Toast';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { fileTrackedTime } from '@/components/tasks/TrackedTodayBar';
import { formatDate } from '@/lib/date';
import { usePermissions } from '@/lib/permissions-context';

export function CatchUpBanner() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');
  // Hidden for this page view only. It comes back on the next load, and goes for good when the
  // days behind it are actually settled — a "dismiss" that outlives the problem is how the
  // problem survives.
  const [hidden, setHidden] = useState(false);

  const { data } = useQuery<CatchUp>({
    queryKey: ['catch-up'],
    queryFn: () => api.attendance.catchUp(),
    enabled: can('attendance.view.own'),
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  if (!data || data.clear || hidden) return null;

  const refresh = () => {
    invalidateTimesheetCaches(qc);
    qc.invalidateQueries({ queryKey: ['catch-up'] });
    qc.invalidateQueries({ queryKey: ['timer-today'] });
    qc.invalidateQueries({ queryKey: ['running-timer'] });
  };

  const stopClock = async (taskId: string) => {
    setBusy(taskId);
    try {
      const r = await api.tasks.pauseTimer(taskId);
      toast(`Clock stopped — ${Math.round((r.minutes / 60) * 10) / 10}h recorded. File it against the day it was worked.`, 'success', { duration: 9000 });
      refresh();
    } catch (e) { toastError(e, 'Could not stop the clock.'); }
    finally { setBusy(''); }
  };

  const fileDay = async (dayIndex: number) => {
    const day = data.days[dayIndex];
    setBusy(day.date);
    try {
      const { filed, failed } = await fileTrackedTime(day);
      if (filed > 0) toast(`${filed}h filed against ${formatDate(day.date)}.`, 'success');
      if (failed.length) toast(failed.join(' · '), 'warning', { duration: 12000 });
      if (!filed && !failed.length) toast('Nothing on the clock for that day — add it in Timesheets.', 'info');
      refresh();
    } catch (e) { toastError(e, 'Could not file the time.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[13px] font-semibold text-amber-900">Some things behind you need finishing</p>

          {data.running.map(r => (
            <div key={r.sessionId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-amber-900">
              <Pause size={12} className="shrink-0" />
              <span className="min-w-0">
                {r.capped ? (
                  <>
                    The clock was left running on <span className="font-medium">{r.title}</span> from{' '}
                    {formatDate(r.startedAt, { weekday: 'short', day: 'numeric', month: 'short' })} and stopped itself at{' '}
                    {r.hours}h. Check that figure before filing it.
                  </>
                ) : (
                  <>
                    The clock is still running on <span className="font-medium">{r.title}</span>, since{' '}
                    {formatDate(r.startedAt, { weekday: 'short', day: 'numeric', month: 'short' })}.
                  </>
                )}
              </span>
              {!r.capped && (
                <button
                  onClick={() => stopClock(r.taskId)}
                  disabled={busy === r.taskId}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-2 py-0.5 text-[11.5px] font-medium text-white hover:bg-amber-950 disabled:opacity-50"
                >
                  {busy === r.taskId ? <Loader size={10} className="animate-spin" /> : null} Stop it
                </button>
              )}
            </div>
          ))}

          {data.autoClosed.map(a => (
            <p key={a.date} className="text-[12.5px] text-amber-900">
              <Clock size={12} className="mr-1 inline shrink-0" />
              {formatDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} was closed at 11:59 pm
              {a.hours != null ? ` at ${a.hours}h` : ''} because you had not punched out.{' '}
              <Link href="/attendance" className="font-medium underline">Regularise it</Link> if you worked later.
            </p>
          ))}

          {data.days.map((d, i) => (
            <div key={d.date} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-amber-900">
              <Clock size={12} className="shrink-0" />
              <span>
                <span className="font-medium">{formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>{' '}
                has {d.logged}h filed of {d.target}h.
              </span>
              {d.unfiledHours >= 0.25 ? (
                <button
                  onClick={() => fileDay(i)}
                  disabled={busy === d.date}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-2 py-0.5 text-[11.5px] font-medium text-white hover:bg-amber-950 disabled:opacity-50"
                >
                  {busy === d.date ? <Loader size={10} className="animate-spin" /> : null} File {d.unfiledHours}h from the clock
                </button>
              ) : (
                <Link href="/timesheets" className="inline-flex items-center gap-0.5 font-medium underline">
                  Fill it <ArrowRight size={11} />
                </Link>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setHidden(true)}
          aria-label="Hide for now"
          title="Hide for now — it comes back until the days are settled"
          className={clsx('shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-100')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
