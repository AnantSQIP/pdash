'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Paperclip, FileText, Loader, Trash2, CalendarClock, TrendingUp } from 'lucide-react';
import { api, type Appraisal, type AppraisalHistory } from '@/lib/api';
import { formatDate } from '@/lib/date';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/**
 * The performance sheet — whatever document the review is actually held over.
 *
 * Opened as a blob rather than a plain link: the file sits behind the same authenticated route as
 * every other attachment, and a bare href would not carry the session.
 */
export function PerformanceSheet({ appraisal, canEdit, onChanged }: {
  appraisal: Appraisal; canEdit: boolean; onChanged: () => void;
}) {
  const [err, setErr] = useState('');
  const upload = useMutation({
    mutationFn: (file: File) => api.appraisals.uploadSheet(appraisal.id, file),
    onSuccess: () => { setErr(''); onChanged(); },
    onError: (e: unknown) => setErr(msg(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.appraisals.removeSheet(appraisal.id),
    onSuccess: () => { setErr(''); onChanged(); },
    onError: (e: unknown) => setErr(msg(e)),
  });

  async function open() {
    try {
      const blob = await api.appraisals.downloadSheet(appraisal.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setErr(msg(e)); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        <FileText size={14} className="text-gray-400" /> Performance sheet
      </h3>
      {appraisal.sheetDocumentId ? (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button onClick={open} className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
            <FileText size={13} /> {appraisal.sheetDocumentName || 'Open the sheet'}
          </button>
          {canEdit && (
            <button
              onClick={() => remove.mutate()} disabled={remove.isPending}
              className="p-1 rounded text-gray-300 hover:text-red-500" title="Remove the sheet"
            ><Trash2 size={12} /></button>
          )}
        </div>
      ) : (
        <p className="mt-1 text-xs text-gray-400">
          Nothing attached. This is the spreadsheet or document the review is worked through.
        </p>
      )}
      {canEdit && (
        <label className={clsx(
          'mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dashed rounded-lg cursor-pointer transition',
          upload.isPending ? 'border-brand-300 bg-brand-50/40 text-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400',
        )}>
          {upload.isPending ? <Loader size={12} className="animate-spin" /> : <Paperclip size={12} />}
          {upload.isPending ? 'Uploading…' : appraisal.sheetDocumentId ? 'Replace' : 'Attach a sheet'}
          <input
            type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f); (e.target as HTMLInputElement).value = ''; }}
          />
        </label>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/**
 * Step three of the flow. Shown to the reviewer once there is something to talk about.
 *
 * Booking it creates a real calendar event for both people, so it turns up beside every other
 * commitment instead of living as a date on a form nobody's diary knows about.
 */
export function ReviewCall({ appraisal, canSchedule, onChanged }: {
  appraisal: Appraisal; canSchedule: boolean; onChanged: () => void;
}) {
  const [when, setWhen] = useState('');
  const [err, setErr] = useState('');
  const schedule = useMutation({
    mutationFn: () => api.appraisals.scheduleReviewCall(appraisal.id, new Date(when).toISOString()),
    onSuccess: () => { setErr(''); setWhen(''); onChanged(); },
    onError: (e: unknown) => setErr(msg(e)),
  });

  const booked = appraisal.reviewCallAt;
  if (!booked && !canSchedule) return null;

  return (
    <div className={clsx('rounded-xl border p-4', booked ? 'bg-green-50/40 border-green-200' : 'bg-white border-gray-200')}>
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        <CalendarClock size={14} className={booked ? 'text-green-600' : 'text-gray-400'} /> Review call
      </h3>
      {booked ? (
        <p className="mt-1 text-sm text-gray-700">
          {new Date(booked).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          <span className="block text-[11px] text-gray-500 mt-0.5">In both calendars.</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-gray-400">Not booked yet.</p>
      )}
      {canSchedule && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={() => schedule.mutate()} disabled={!when || schedule.isPending}
            className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {schedule.isPending ? 'Booking…' : booked ? 'Move it' : 'Book the call'}
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/**
 * A person's rating history: every completed review, and a figure per financial year.
 *
 * The FY figure is the mean of that year's reviews — a half-yearly and an annual review in the
 * same year are two readings of one year, not two years.
 */
export function RatingHistory({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<AppraisalHistory>({
    queryKey: ['appraisal-history', userId], queryFn: () => api.appraisals.history(userId),
  });
  if (isLoading) return <p className="text-xs text-gray-400">Loading history…</p>;
  if (!data || (!data.reviews.length && !data.byFinancialYear.length)) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <TrendingUp size={14} className="text-gray-400" /> Rating history
        </h3>
        <p className="mt-1 text-xs text-gray-400">No completed reviews yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        <TrendingUp size={14} className="text-gray-400" /> Rating history
      </h3>
      {data.byFinancialYear.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {data.byFinancialYear.map(fy => (
            <div key={fy.fyLabel} className="rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-brand-700/70">FY {fy.fyLabel}</p>
              <p className="text-base font-bold text-gray-900 tabular-nums">
                {fy.rating}
                <span className="ml-1 text-[10px] font-normal text-gray-500">
                  from {fy.reviews} review{fy.reviews === 1 ? '' : 's'}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
      <ul className="mt-3 space-y-1.5">
        {data.reviews.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="text-gray-800">{r.cycle.name}</span>
              <span className="ml-2 text-[11px] text-gray-400">
                {r.cycle.cycleType === 'ANNUAL' ? 'Annual' : 'Half-yearly'}
                {r.cycle.periodEnd ? ` · to ${formatDate(r.cycle.periodEnd)}` : ''}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">
              <b className="text-gray-900">{r.overallRating ?? '—'}</b>
              <span className="ml-1.5 text-[11px] text-gray-400">
                self {r.selfRating ?? '—'} / mgr {r.managerRating ?? '—'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
