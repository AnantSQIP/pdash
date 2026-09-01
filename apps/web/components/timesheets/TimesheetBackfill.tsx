'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarClock, Check, X, Loader, Plus, ShieldCheck } from 'lucide-react';
import { api, type TimesheetBackdateRequest } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { toastError } from '@/components/ui/Toast';

const STATUS_BADGE: Record<TimesheetBackdateRequest['status'], string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  APPROVED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-100 text-red-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const name = (r: TimesheetBackdateRequest) => r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : 'Employee';

/** Backfill approval: request to fill 1–3-month-old days; Super Admins approve/reject. */
export function TimesheetBackfill() {
  const { isSuperAdmin } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fromDate: '', toDate: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const mine = useQuery({ queryKey: ['ts-backdates-mine'], queryFn: () => api.timesheets.backdates() });
  const pending = useQuery({
    queryKey: ['ts-backdates-pending'],
    queryFn: () => api.timesheets.pendingBackdates(),
    enabled: isSuperAdmin,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ['ts-backdates-mine'] });
    qc.invalidateQueries({ queryKey: ['ts-backdates-pending'] });
  }

  async function submit() {
    setError(null);
    if (!form.fromDate || !form.toDate) { setError('Pick a start and end date.'); return; }
    if (!form.reason.trim()) { setError('Add a short reason.'); return; }
    setBusy(true);
    try {
      await api.timesheets.requestBackdate({ fromDate: form.fromDate, toDate: form.toDate, reason: form.reason.trim() });
      setForm({ fromDate: '', toDate: '', reason: '' });
      setOpen(false);
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit the request.'); }
    finally { setBusy(false); }
  }

  async function decide(id: string, action: 'approve' | 'reject' | 'cancel') {
    setActing(id);
    try {
      if (action === 'approve') await api.timesheets.approveBackdate(id);
      else if (action === 'reject') await api.timesheets.rejectBackdate(id);
      else await api.timesheets.cancelBackdate(id);
      refresh();
    } catch (e) { toastError(e, 'Action failed.'); }
    finally { setActing(null); }
  }

  const myReqs = mine.data ?? [];
  const queue = pending.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <CalendarClock size={16} className="text-brand-600" /> Backfill approvals
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Days in the last month can be filled directly. Filling anything 1–3 months old needs a Super Admin’s approval.</p>
        </div>
        <button onClick={() => { setOpen(o => !o); setError(null); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100">
          <Plus size={13} /> Request backfill
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-600">From
              <input type="date" value={form.fromDate} onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-600">To
              <input type="date" value={form.toDate} onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
          </div>
          <label className="text-xs font-medium text-gray-600 block">Reason
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2}
              placeholder="Why do these days need to be filled late?"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm resize-none" />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={submit} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Submit request
            </button>
            <button onClick={() => { setOpen(false); setError(null); }} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Super Admin review queue */}
      {isSuperAdmin && queue.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><ShieldCheck size={13} /> To review ({queue.length})</p>
          {queue.map(r => (
            <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{name(r)} <span className="text-gray-400 font-normal">·</span> {fmt(r.fromDate)} – {fmt(r.toDate)}</p>
                <p className="text-xs text-gray-600 mt-0.5 break-words">{r.reason}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => decide(r.id, 'approve')} disabled={acting === r.id} title="Approve"
                  className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">
                  {acting === r.id ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                </button>
                <button onClick={() => decide(r.id, 'reject')} disabled={acting === r.id} title="Reject"
                  className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My own requests */}
      {myReqs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My requests</p>
          {myReqs.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-2.5">
              <div className="min-w-0">
                <p className="text-sm text-gray-800">{fmt(r.fromDate)} – {fmt(r.toDate)}</p>
                <p className="text-xs text-gray-500 truncate">{r.reason}{r.reviewNote ? ` — “${r.reviewNote}”` : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_BADGE[r.status])}>{r.status.toLowerCase()}</span>
                {r.status === 'PENDING' && (
                  <button onClick={() => decide(r.id, 'cancel')} disabled={acting === r.id}
                    className="text-[11px] text-gray-400 hover:text-red-500">{acting === r.id ? '…' : 'Cancel'}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
