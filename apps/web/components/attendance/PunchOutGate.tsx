'use client';

// The door, when the timesheet is not ready for it.
//
// A gate that only says "you owe five hours" is a gate people resent, because it hands them an
// errand at the moment they are trying to leave. So this one carries the errand with it: Log time
// opens the same day sheet as My Tasks, already on today, and saving a full day lets them out.
//
// And it is never a trap. Somebody who falls ill at eleven cannot log eight hours honestly, so
// there is always a way through — it just leaves a reason on the day rather than a silence.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { api, type PunchOutCheck } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { toastError } from '@/components/ui/Toast';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { DaySheet } from '@/components/tasks/DaySheet';
import { formatDate } from '@/lib/date';

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
  const [sheet, setSheet] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reason, setReason] = useState('');

  /** After the sheet saves, ask the server again — it is the one that decides the door. */
  const recheck = async () => {
    invalidateTimesheetCaches(qc);
    try {
      const fresh = await api.attendance.punchOutCheck();
      setDay(fresh.day);
      if (fresh.day.complete) onReady();
    } catch (e) { toastError(e, 'Could not check the timesheet again.'); }
  };

  return (
    <>
      <Modal
        title="Your timesheet is not finished"
        subtitle={`${formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })} — ${day.logged}h of ${day.target}h logged`}
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
                  onClick={() => setSheet(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <Clock size={14} /> Log time
                </button>
              )}
            </div>
          </div>
        }
      >
        {leaving ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You can go. The day will be recorded with {day.logged}h logged against the {day.target}h it asks for,
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
              <p className="mt-1 text-[11px] text-gray-400">A few words is enough. You can still log the rest of the day later from My Tasks.</p>
            </div>
          </div>
        ) : day.complete ? (
          <p className="text-sm text-gray-600">The day is logged. You can punch out.</p>
        ) : (
          <p className="text-sm text-gray-600">
            {day.missing}h of the day is still unaccounted for. Log it now — the sheet lists the work you
            were planned on today and anything you finished recently — and you can punch out.
          </p>
        )}
      </Modal>
      {sheet && (
        <DaySheet initialDate={day.date} onClose={() => setSheet(false)} onSaved={recheck} />
      )}
    </>
  );
}
