'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, X, Loader, Clock, Truck } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Marking a project complete is the one moment anyone actually knows two things the system can't
 * work out for itself: WHEN it reached the client, and what it REALLY cost. So the button asks
 * instead of guessing.
 *
 *  • Client delivery date — the DAY the work was handed over. Defaults to today (you are signing
 *    it off), but is editable because sign-off often lags delivery by a day or two. Date only:
 *    the hour a report went out is not something anyone reliably records.
 *  • Working hours — prefilled from logged timesheets, falling back to the sum of task estimates
 *    when nobody logged time. Editable: the number on paper is not always the number to keep.
 *  • Actual hours — typed by hand. Deliberately not derived; it exists precisely to capture the
 *    effort that never made it onto a timesheet.
 */
export function CompleteProjectModal({ projectId, projectTitle, onClose, onConfirm, busy }: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  onConfirm: (v: { clientDeliveryDate: string; workingHours: number; actualHours?: number }) => void;
  busy?: boolean;
}) {
  // A date input wants the LOCAL calendar day, not a UTC instant (which rolls over at
  // 05:30 IST and would offer "yesterday" to anyone signing off late in the evening).
  const todayLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const [delivery, setDelivery] = useState(todayLocal);
  const [working, setWorking] = useState('');
  const [actual, setActual] = useState('');
  const [touchedWorking, setTouchedWorking] = useState(false);

  const { data: hours, isLoading } = useQuery({
    queryKey: ['completion-hours', projectId],
    queryFn: () => api.projects.completionHours(projectId),
    staleTime: 30_000,
  });

  // Prefill once the suggestion lands — but never clobber a number the user has already typed.
  useEffect(() => {
    if (hours && !touchedWorking) setWorking(String(hours.suggested ?? 0));
  }, [hours, touchedWorking]);

  const source = !hours ? ''
    : hours.loggedHours > 0 ? `from ${hours.loggedHours}h logged on timesheets`
    : hours.estimatedHours > 0 ? `no time logged — using ${hours.estimatedHours}h of task estimates`
    : 'no logged time or estimates on this project';

  const workingNum = Number(working);
  const actualNum = actual.trim() === '' ? undefined : Number(actual);
  const valid = !!delivery
    && Number.isFinite(workingNum) && workingNum >= 0
    && (actualNum === undefined || (Number.isFinite(actualNum) && actualNum >= 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} className="text-green-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Complete project</h2>
              <p className="text-xs text-gray-400 truncate">{projectTitle}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Truck size={14} className="text-gray-400" /> Client delivery date <span className="text-red-500">*</span>
            </label>
            <input
              type="date" value={delivery} onChange={e => setDelivery(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">When the work actually reached the client — not necessarily today.</p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Clock size={14} className="text-gray-400" /> Working hours <span className="text-red-500">*</span>
            </label>
            <input
              type="number" min={0} step="0.5" value={working}
              onChange={e => { setTouchedWorking(true); setWorking(e.target.value); }}
              placeholder="0"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {isLoading ? 'Working out the logged hours…' : source ? `Prefilled ${source}. Change it if that isn't right.` : ''}
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Clock size={14} className="text-gray-400" /> Actual hours
            </label>
            <input
              type="number" min={0} step="0.5" value={actual} onChange={e => setActual(e.target.value)}
              placeholder="What it really took"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              The effort the project genuinely consumed, including anything never logged. Leave blank if you don&apos;t know.
            </p>
          </div>

          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            Completing locks the project&apos;s work. Its Project ID is kept, and it can be re-initialized later for a
            returning client under the same PID.
          </p>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => onConfirm({
              // Store the chosen DAY. Noon UTC, so the date can never slide backwards or
              // forwards a day when it is later read in another timezone.
              clientDeliveryDate: new Date(`${delivery}T12:00:00.000Z`).toISOString(),
              workingHours: workingNum,
              ...(actualNum !== undefined ? { actualHours: actualNum } : {}),
            })}
            disabled={busy || !valid}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? <Loader size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark complete
          </button>
          <button onClick={onClose} disabled={busy} className="px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
