'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Timer, ClipboardList, Loader, Check, AlertTriangle } from 'lucide-react';
import { api, type OrgSummary, type TimeTrackingMode, type TimeModeChange } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { formatDateTimeIST } from '@/lib/date';

const FLOWS: {
  mode: TimeTrackingMode; title: string; icon: typeof Timer; blurb: string; bullets: string[];
}[] = [
  {
    mode: 'TIMER',
    title: 'Time it as you work',
    icon: Timer,
    blurb: 'A stopwatch on every task. Finishing one stops the clock, learns how long that kind of work takes, and files the day’s share to the timesheet.',
    bullets: ['Start, Pause and Resume on each task', 'Timesheets fill themselves from the clock', 'The firm learns its own estimates from what it measures'],
  },
  {
    mode: 'MANUAL',
    title: 'Write the day down',
    icon: ClipboardList,
    blurb: 'No stopwatch anywhere. A task is finished or reopened, and time is filled in once for the whole day against the tasks that were worked on.',
    bullets: ['One Log time for the whole day', 'Finish and Reopen on each task, nothing else', 'Estimates are learned from the hours people file'],
  },
];

/**
 * Which of the two time-recording flows the firm uses.
 *
 * Not a checkbox among the other org fields, and deliberately so: this decides what every person
 * sees on My Tasks tomorrow morning, and leaving the stopwatch has to stop the clocks that are
 * running as it goes. A setting with a consequence that large should look like a decision.
 */
export function TimeModeCard({ org }: { org: OrgSummary }) {
  const { can } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<TimeTrackingMode | null>(null);
  const [confirming, setConfirming] = useState<TimeTrackingMode | null>(null);

  const current: TimeTrackingMode = org.timeTrackingMode === 'MANUAL' ? 'MANUAL' : 'TIMER';
  const editable = can('user.manage_access');

  const { data: history = [] } = useQuery<TimeModeChange[]>({
    queryKey: ['time-mode-history', org.id],
    queryFn: () => api.orgs.timeModeHistory(org.id),
    enabled: editable,
    staleTime: 60_000,
  });

  async function apply(mode: TimeTrackingMode) {
    setConfirming(null);
    setBusy(mode);
    try {
      const res = await api.orgs.setTimeMode(org.id, mode);
      // Everything that renders differently per flow reads the org, so it all has to be re-read.
      await qc.invalidateQueries({ queryKey: ['orgs'] });
      await qc.invalidateQueries({ queryKey: ['time-mode-history', org.id] });
      if (!res.changed) {
        toast('That is already how time is recorded here.', 'success');
      } else if (res.timersClosed > 0) {
        toast(
          `Switched. ${res.timersClosed} running ${res.timersClosed === 1 ? 'clock was' : 'clocks were'} stopped and ${Math.round((res.minutesClosed / 60) * 10) / 10}h kept.`,
          'success',
        );
      } else {
        toast('Switched. Nothing was running, so nothing had to be stopped.', 'success');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change how time is recorded', 'error');
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">How time is recorded</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Applies to everybody. It changes what My Tasks shows and how timesheets get filled — nothing already recorded is altered.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FLOWS.map(f => {
          const active = current === f.mode;
          const Icon = f.icon;
          return (
            <div
              key={f.mode}
              className={clsx(
                'rounded-xl border p-4 transition-colors',
                active ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500' : 'border-gray-200',
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon size={16} className={active ? 'text-brand-600' : 'text-gray-400'} />
                <h3 className="text-sm font-semibold text-gray-900">{f.title}</h3>
                {active && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    <Check size={10} /> In use
                  </span>
                )}
              </div>
              <p className="text-[13px] leading-relaxed text-gray-600">{f.blurb}</p>
              <ul className="mt-2.5 space-y-1">
                {f.bullets.map(b => (
                  <li key={b} className="flex gap-1.5 text-[12px] text-gray-500">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-300" />{b}
                  </li>
                ))}
              </ul>
              {!active && editable && (
                <button
                  onClick={() => setConfirming(f.mode)}
                  disabled={!!busy}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-brand-700 ring-1 ring-inset ring-brand-600/30 hover:bg-brand-50 disabled:opacity-50"
                >
                  {busy === f.mode ? <Loader size={13} className="animate-spin" /> : null}
                  Use this instead
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!editable && (
        <p className="text-[12px] text-gray-400">Only an administrator can change this.</p>
      )}

      {history.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Previous changes</p>
          <ul className="space-y-1">
            {history.slice(0, 4).map(h => (
              <li key={h.id} className="text-[12px] tabular-nums text-gray-500">
                {formatDateTimeIST(h.changedAt)} · {h.fromMode === 'TIMER' ? 'timer' : 'written down'} → {h.toMode === 'TIMER' ? 'timer' : 'written down'}
                {h.timersClosed > 0 && (
                  <span className="text-gray-400"> · {h.timersClosed} {h.timersClosed === 1 ? 'clock' : 'clocks'} stopped, {Math.round((h.minutesClosed / 60) * 10) / 10}h kept</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirming(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">
              {confirming === 'MANUAL' ? 'Stop timing work?' : 'Start timing work?'}
            </h3>
            <div className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-gray-600">
              {confirming === 'MANUAL' ? (
                <>
                  <p>Everyone loses Start, Pause and Resume. Tasks can still be finished and reopened, and time is filled in once a day from My Tasks.</p>
                  <p className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-[12.5px] text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Any clock still running will be stopped now and its minutes kept. If they were left running, that is what stops them growing.
                  </p>
                </>
              ) : (
                <>
                  <p>Everyone gets a stopwatch on each task again, and finishing one will file the day’s share to their timesheet.</p>
                  <p>Hours already written down by hand stay exactly as they are.</p>
                </>
              )}
              <p className="text-[12.5px] text-gray-500">Nothing already recorded is changed either way — the two flows share one ledger.</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirming(null)} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={() => apply(confirming)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                {confirming === 'MANUAL' ? 'Switch to writing it down' : 'Switch to timing it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
