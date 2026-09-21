'use client';

// What is still unresolved behind you.
//
// A day that ends without a punch-out is closed by the machine at 11:59 pm, and the person only
// finds out when a report disagrees with their memory weeks later. Same for a day whose timesheet
// was never filled. This says both the next morning, on the screens somebody already opens, and
// every line has the button that ends it — a short day opens the same Log time sheet as My Tasks,
// already on that date.
//
// A banner and not a dialog, deliberately: the first-login pop-up was removed for being in the
// way, and a strip that stays until the work is actually done is both harder to ignore and
// impossible to be blocked by.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, Clock, X } from 'lucide-react';
import { api, type CatchUp } from '@/lib/api';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { DaySheet } from '@/components/tasks/DaySheet';
import { formatDate } from '@/lib/date';
import { usePermissions } from '@/lib/permissions-context';

/** CLIENTS flow: auto-closed days and short days; a short day opens the Log time sheet on that date. */
export function ClientsCatchUpBanner() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  // The day whose Log time sheet is open, if any.
  const [logDay, setLogDay] = useState<string | null>(null);
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
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[13px] font-semibold text-amber-900">Some things behind you need finishing</p>

          {data.autoClosed.map(a => (
            <p key={a.date} className="text-[12.5px] text-amber-900">
              <Clock size={12} className="mr-1 inline shrink-0" />
              {formatDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} was closed at 11:59 pm
              {a.hours != null ? ` at ${a.hours}h` : ''} because you had not punched out.{' '}
              <Link href="/attendance" className="font-medium underline">Regularise it</Link> if you worked later.
            </p>
          ))}

          {data.days.map(d => (
            <div key={d.date} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-amber-900">
              <Clock size={12} className="shrink-0" />
              <span>
                <span className="font-medium">{formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>{' '}
                has {d.logged}h filed of {d.target}h.
              </span>
              <button
                onClick={() => setLogDay(d.date)}
                className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-2 py-0.5 text-[11.5px] font-medium text-white hover:bg-amber-950"
              >
                <Clock size={10} /> Log time
              </button>
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
      {logDay && (
        <DaySheet initialDate={logDay} onClose={() => setLogDay(null)} onSaved={refresh} />
      )}
    </div>
  );
}
