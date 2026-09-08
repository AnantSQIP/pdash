'use client';

// The door, when the timesheet is not ready for it.
//
// A gate that only says "you owe five hours" is a gate people resent, because it hands them an
// errand at the moment they are trying to leave. So this one carries what it is asking for:
// every hour the clock recorded today that the timesheet has not got, per task, with one button
// that files all of it. On the ordinary day the whole rule costs one extra click.
//
// And it is never a trap. Somebody who falls ill at eleven cannot log eight hours honestly, so
// there is always a way through — it just leaves a reason on the day rather than a silence.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Clock, Loader, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { type PunchOutCheck } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { toast, toastError } from '@/components/ui/Toast';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { fileTrackedTime } from '@/components/tasks/TrackedTodayBar';
import { formatDate } from '@/lib/date';
import { pidLabel } from '@/lib/mock-data';

export function PunchOutGate({ check, onClose, onReady, onLeaveAnyway }: {
  check: PunchOutCheck;
  onClose: () => void;
  /** The timesheet is now full — punch out normally. */
  onReady: () => void;
  /** Leaving short, with a reason that is written onto the day. */
  onLeaveAnyway: (reason: string) => void;
}) {
  const qc = useQueryClient();
  const [day, setDay] = useState(check.day);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reason, setReason] = useState('');

  const canFile = day.unfiledHours >= 0.25;

  const fileAll = async () => {
    setBusy(true);
    try {
      const { filed, failed } = await fileTrackedTime(day);
      invalidateTimesheetCaches(qc);
      qc.invalidateQueries({ queryKey: ['timer-today'] });
      if (failed.length) toast(failed.join(' · '), 'warning', { duration: 12000 });
      if (filed > 0) {
        const logged = Math.round((day.logged + filed) * 100) / 100;
        const missing = Math.round(Math.max(0, day.target - logged) * 100) / 100;
        setDay({ ...day, logged, missing, complete: logged >= day.target, unfiledHours: 0, tracked: day.tracked.map(t => ({ ...t, filedHours: t.filedHours + t.unfiledHours, unfiledHours: 0 })) });
        toast(`${filed}h filed.`, 'success');
        if (logged >= day.target) onReady();
      }
    } catch (e) { toastError(e, 'Could not file the time.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      title="Your timesheet is not finished"
      subtitle={`${formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })} — ${day.logged}h of ${day.target}h filed`}
      size="md"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => setLeaving(v => !v)} className="text-[12.5px] font-medium text-gray-500 hover:text-gray-800">
            {leaving ? 'Back' : 'I have to leave now'}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
            {leaving ? (
              <button
                onClick={() => onLeaveAnyway(reason.trim())}
                disabled={reason.trim().length < 3}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
              >
                Punch out anyway
              </button>
            ) : day.complete ? (
              <button onClick={onReady} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Punch out</button>
            ) : (
              <button
                onClick={fileAll}
                disabled={!canFile || busy}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                {busy ? <Loader size={14} className="animate-spin" /> : <Clock size={14} />}
                File {day.unfiledHours}h and punch out
              </button>
            )}
          </div>
        </div>
      }
    >
      {leaving ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            You can go. The day will be recorded with {day.logged}h filed against the {day.target}h it asks for,
            and the reason below is written onto the day so nobody has to guess later.
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500">Why are you leaving early?</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={300}
              autoFocus
              placeholder="Unwell, family emergency, half day agreed with…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">A few words is enough. You can still fill the rest of the day later from Timesheets.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {day.missing}h of the day is still unaccounted for.
            {canFile
              ? ' The clock already recorded most of it — file it and the day is done.'
              : ' Nothing is waiting on the clock, so this needs a timesheet entry.'}
          </p>

          {day.tracked.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {day.tracked.map(t => (
                <li key={t.taskId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-gray-900">{t.title}</p>
                    <p className="truncate text-[11px] text-gray-500">
                      {t.projectPid ? <span className="font-mono">{pidLabel(t.projectPid, t.projectRound)} · </span> : null}
                      {t.project ?? 'Team space'}
                      {t.running && <span className="text-emerald-700"> · clock stopped just now</span>}
                    </p>
                  </div>
                  <span className={clsx('shrink-0 text-[12px] tabular-nums', t.unfiledHours >= 0.25 ? 'font-semibold text-gray-900' : 'text-gray-400')}>
                    {t.unfiledHours >= 0.25 ? `${t.unfiledHours}h to file` : `${t.filedHours}h filed`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {check.overTracked && (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              The clock recorded {day.trackedHours}h but you have been here {check.attendedHours}h — more than one timer was
              running at once. Check the hours before filing them.
            </p>
          )}

          {!canFile && (
            <Link href="/timesheets" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
              Open Timesheets <ArrowRight size={13} />
            </Link>
          )}
        </div>
      )}
    </Modal>
  );
}
