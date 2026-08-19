'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { X, Loader, Archive, Pencil, Check, RotateCcw, Info, AlertTriangle } from 'lucide-react';
import { api, type LedgerDetail } from '@/lib/api';
import { formatHours, formatMoney } from '@/lib/ledger-format';
import { formatDate } from '@/lib/date';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/**
 * One client's ledger: the derived totals, the projects they came from, and the figures a Super
 * Admin has stated on top.
 *
 * Showing the projects is the point of the panel. A client-level total nobody can decompose is a
 * number people either trust blindly or ignore; listing the projects behind it means a figure
 * that looks wrong can be chased down to the project that made it wrong.
 */
export function ClientLedgerPanel({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery<LedgerDetail>({
    queryKey: ['client-ledger', clientId],
    queryFn: () => api.clientLedger.detail(clientId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['client-ledger', clientId] });
    qc.invalidateQueries({ queryKey: ['client-ledger'] });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="bg-gray-50 w-full max-w-2xl h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        {isLoading || !data ? (
          <div className="p-10 text-center text-sm text-gray-400"><Loader className="animate-spin inline mr-2" size={16} />Loading…</div>
        ) : (
          <>
            <div className="bg-white px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 sticky top-0 z-10">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span className="font-mono">{data.code}</span>
                  {data.name && <span className="font-sans font-normal text-gray-500 truncate">{data.name}</span>}
                  {data.archivedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                      <Archive size={10} /> Archived
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Client since {formatDate(data.createdAt)}</p>
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded shrink-0"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* ── The derived figures ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric label="Projects" value={String(data.derived.projectCount)} sub={`${data.derived.activeProjectCount} live`} />
                <Metric label="Patents" value={String(data.patentCount)} />
                <Metric
                  label="Billable"
                  value={formatHours(data.effective.billableHours)}
                  sub={data.effective.billableHoursSource === 'override'
                    ? `stated · derived ${formatHours(data.derived.billableHours)}`
                    : undefined}
                  highlight={data.effective.billableHoursSource === 'override'}
                  alert={data.effective.stale}
                />
                <Metric label="Non-billable" value={formatHours(data.derived.nonBillableHours)} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric label="Total hours" value={formatHours(data.derived.totalHours)} />
                <Metric label="People" value={String(data.derived.contributorCount)} />
                <Metric label="First logged" value={data.derived.firstLoggedAt ? String(data.derived.firstLoggedAt).slice(0, 10) : '—'} />
                <Metric label="Last logged" value={data.derived.lastLoggedAt ? String(data.derived.lastLoggedAt).slice(0, 10) : '—'} />
              </div>

              {/* ── Stated figures ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Stated figures</h3>
                  {!editing && (
                    <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
                      <Pencil size={12} /> {data.override ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>
                {editing ? (
                  <OverrideForm data={data} onDone={() => { setEditing(false); invalidate(); }} onCancel={() => setEditing(false)} />
                ) : data.override ? (
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex flex-wrap gap-x-8 gap-y-2">
                      <Stated label="Billable hours" value={data.override.billableHours == null ? null : formatHours(data.override.billableHours)} />
                      <Stated label="Value" value={data.override.amount == null ? null : formatMoney(data.override.amount, data.override.currency)} />
                    </div>
                    {data.override.note && <p className="text-sm text-gray-600">{data.override.note}</p>}
                    {/* The difference between a write-down someone chose and a number the work
                        has since moved past. Only shown when there is a snapshot to compare to. */}
                    {data.effective.stale && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        <span>
                          <b>Out of date.</b> The data said {formatHours(data.override.derivedHoursWhenSet)} when this was
                          stated; it now says {formatHours(data.derived.billableHours)} — {formatHours(Math.abs(data.effective.driftHours ?? 0))} of
                          work has landed since. Restate the figure or clear it.
                        </span>
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Stated by {data.override.updatedByName ?? 'someone no longer listed'} on {formatDate(data.override.updatedAt)}
                    </p>
                  </div>
                ) : (
                  <div className="px-4 py-3 flex items-start gap-2.5">
                    <Info size={14} className="text-gray-300 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-500">
                      Nothing stated. The hours above are measured from timesheets; no monetary value can be
                      derived, because no rate or agreed fee is recorded anywhere in this system. Add one here
                      if you want the ledger to carry it.
                    </p>
                  </div>
                )}
              </div>

              {/* ── The projects behind the numbers ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Projects</h3>
                </div>
                {data.projects.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-gray-400 text-center">No projects for this client yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                          <th className="px-4 py-2 font-medium">PID</th>
                          <th className="px-3 py-2 font-medium">Project</th>
                          <th className="px-3 py-2 font-medium">Phase</th>
                          <th className="px-3 py-2 font-medium text-right">Billable</th>
                          <th className="px-3 py-2 font-medium text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.projects.map(p => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.code ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-800">{p.title}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">{p.projectPhase}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatHours(p.billableHours)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatHours(p.totalHours)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The override form.
 *
 * Blanking a field CLEARS the stated figure rather than leaving it alone — that is the only way
 * back to the derived number, so the form sends an explicit null for an empty box.
 */
function OverrideForm({ data, onDone, onCancel }: { data: LedgerDetail; onDone: () => void; onCancel: () => void }) {
  const [hours, setHours] = useState(data.override?.billableHours?.toString() ?? '');
  const [amount, setAmount] = useState(data.override?.amount?.toString() ?? '');
  const [currency, setCurrency] = useState(data.override?.currency ?? 'INR');
  const [note, setNote] = useState(data.override?.note ?? '');
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () => api.clientLedger.setOverride(data.id, {
      billableHours: hours.trim() === '' ? null : Number(hours),
      amount: amount.trim() === '' ? null : Number(amount),
      currency,
      note: note.trim() === '' ? null : note.trim(),
    }),
    onSuccess: onDone,
    onError: e => setErr(msg(e)),
  });

  const invalid = (v: string) => v.trim() !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0);
  const blocked = invalid(hours) || invalid(amount);

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Billable hours</label>
          <input
            value={hours} onChange={e => setHours(e.target.value)} inputMode="decimal"
            placeholder={`Derived: ${data.derived.billableHours}`}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg tabular-nums focus:outline-none focus:border-brand-500"
          />
          <p className="text-[11px] text-gray-400 mt-1">Leave blank to use the derived {formatHours(data.derived.billableHours)}.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
          <div className="flex gap-2">
            <select
              value={currency} onChange={e => setCurrency(e.target.value)}
              className="px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 4750000"
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg tabular-nums focus:outline-none focus:border-brand-500"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Nothing derives this — it is stated or it is absent.</p>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Why these figures</label>
        <textarea
          rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={500}
          placeholder="e.g. Capped per the Q2 retainer — 190h written off."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-brand-500"
        />
      </div>
      {blocked && <p className="text-xs text-red-600">Figures must be positive numbers.</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-400 flex items-center gap-1">
          <RotateCcw size={11} /> Clearing both figures removes the statement entirely.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => { setErr(''); save.mutate(); }} disabled={save.isPending || blocked}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, highlight, alert }: {
  label: string; value: string; sub?: string; highlight?: boolean; alert?: boolean;
}) {
  return (
    <div className={clsx('bg-white rounded-xl border px-3 py-2.5',
      alert ? 'border-red-200 bg-red-50/40' : highlight ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200')}>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-base font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
      {sub && <p className={clsx('text-[10px] mt-0.5', alert ? 'text-red-600' : highlight ? 'text-amber-600' : 'text-gray-400')}>{sub}</p>}
    </div>
  );
}

function Stated({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 tabular-nums">
        {value ?? <span className="font-normal text-gray-300">not stated</span>}
      </p>
    </div>
  );
}
