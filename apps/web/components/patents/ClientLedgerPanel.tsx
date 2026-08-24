'use client';

import Link from 'next/link';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  X, Loader, Archive, Pencil, Check, RotateCcw, Info, AlertTriangle,
  Mail, Phone, Globe, MapPin, Building2, User as UserIcon, Clock, HelpCircle,
} from 'lucide-react';
import { api, type ClientProfile, type LedgerDetail, type LedgerProject } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { useOrg } from '@/lib/org-context';
import { fullName } from '@/lib/avatar';
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
  const [editingProfile, setEditingProfile] = useState(false);

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
                <p className="text-xs text-gray-400 mt-0.5">
                  Client since {formatDate(data.engagementStart ?? data.createdAt)}
                  {data.country && <> · {data.country}</>}
                  {data.industry && <> · {data.industry}</>}
                </p>
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
                {/* Value used to be absent unless somebody typed it. With a rate on the client it
                    is computed from the hours and moves with them, and the sub-line always says
                    which of the two it is — an estimate presented as an agreed sum is worse than
                    no figure at all. */}
                <Metric
                  label="Value"
                  value={data.effective.amount == null ? '—' : formatMoney(data.effective.amount, data.effective.currency)}
                  sub={
                    data.effective.amountSource === 'derived'
                      ? `${formatHours(data.effective.billableHours)} × ${data.effective.rate}/h`
                      : data.effective.amountSource === 'stated' ? 'stated' : 'no rate set'
                  }
                  highlight={data.effective.amountSource === 'stated'}
                />
                <Metric label="People" value={String(data.derived.contributorCount)} />
                <Metric label="Last logged" value={data.derived.lastLoggedAt ? String(data.derived.lastLoggedAt).slice(0, 10) : '—'} />
              </div>

              {/* ── Who the client is ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Client details</h3>
                  {!editingProfile && (
                    <button onClick={() => setEditingProfile(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                </div>
                {editingProfile
                  ? <ProfileForm data={data} onDone={() => { setEditingProfile(false); invalidate(); }} onCancel={() => setEditingProfile(false)} />
                  : <ProfileView data={data} onEdit={() => setEditingProfile(true)} />}
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
                            {/* The PID is the identifier people quote; making it the way through
                                to the work is the whole point of it being here. The ledger used
                                to be a dead end — a figure with no route to what produced it. */}
                            <td className="px-4 py-2 text-xs">
                              <PidCell project={p} />
                            </td>
                            <td className="px-3 py-2 text-gray-800">
                              <Link href={`/projects/${p.id}`} className="hover:text-brand-600">{p.title}</Link>
                            </td>
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

/**
 * The PID cell.
 *
 * It used to render a bare "—" for a project with no PID, which is the least useful thing it
 * could say: "no PID" has two entirely different causes and two entirely different next steps.
 * Either an authority has been asked and has not got to it, or nobody ever asked and the hours on
 * this project are one step away from reaching no client ledger at all. The dash covered both.
 */
function PidCell({ project }: { project: LedgerProject }) {
  if (project.code) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Link href={`/projects/${project.id}`} className="font-mono text-brand-600 hover:underline">
          {project.code}
        </Link>
        {(project.roundSeq ?? 1) > 1 && (
          // One PID can group several rounds. Two identical codes with nothing between them read
          // as a duplicated row rather than as round 1 and round 2.
          <span className="text-[10px] uppercase tracking-wide text-gray-400">R{project.roundSeq}</span>
        )}
      </span>
    );
  }
  const requested = project.pidStatus === 'requested';
  return (
    <Link
      href={`/projects/${project.id}`}
      title={requested
        ? 'A PID has been requested and is waiting on an authority.'
        : 'No PID has been requested. Until one is, this work has no identifier to quote.'}
      className={clsx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 border',
        requested
          ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
          : 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100')}
    >
      {requested ? <Clock size={10} /> : <AlertTriangle size={10} />}
      {requested ? 'PID pending' : 'No PID'}
    </Link>
  );
}

/** The client's own details, read-only. Empty is shown as empty rather than hidden. */
function ProfileView({ data, onEdit }: { data: LedgerDetail; onEdit: () => void }) {
  const rows: { icon: typeof Mail; label: string; value: React.ReactNode }[] = [
    { icon: UserIcon, label: 'Contact', value: data.contactName },
    { icon: Mail, label: 'Email', value: data.contactEmail
        ? <a href={`mailto:${data.contactEmail}`} className="text-brand-600 hover:underline">{data.contactEmail}</a> : null },
    { icon: Phone, label: 'Phone', value: data.contactPhone },
    { icon: Globe, label: 'Website', value: data.website
        ? <a href={data.website.startsWith('http') ? data.website : `https://${data.website}`}
             target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{data.website}</a> : null },
    { icon: Building2, label: 'Industry', value: data.industry },
    { icon: MapPin, label: 'Address', value: data.address },
  ];
  const filled = rows.filter(r => r.value);

  return (
    <div className="px-4 py-3 space-y-3">
      {filled.length === 0 ? (
        <div className="flex items-start gap-2.5">
          <Info size={14} className="text-gray-300 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-500">
            Nothing recorded about this client beyond its code.{' '}
            <button onClick={onEdit} className="font-medium text-brand-600 hover:text-brand-700">Add the details</button>{' '}
            — a rate here is what lets the ledger price the hours instead of waiting for someone to type a total.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {filled.map(r => (
            <div key={r.label} className="flex items-start gap-2 min-w-0">
              <r.icon size={13} className="text-gray-300 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{r.label}</p>
                <p className="text-sm text-gray-700 break-words">{r.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 border-t border-gray-50">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Rate</p>
          <p className="text-sm font-semibold text-gray-800 tabular-nums">
            {data.billingRate != null
              ? `${formatMoney(data.billingRate, data.billingCurrency ?? 'INR')} / hour`
              : <span className="font-normal text-gray-300">not set</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Account manager</p>
          {data.accountManager ? (
            <span className="inline-flex items-center gap-1.5 mt-0.5">
              <Avatar user={data.accountManager} size={18} />
              <span className="text-sm text-gray-700">{fullName(data.accountManager)}</span>
            </span>
          ) : <p className="text-sm text-gray-300">not set</p>}
        </div>
      </div>

      {data.notes && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{data.notes}</p>}
    </div>
  );
}

const CLIENT_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;

/**
 * Editing the client's own record.
 *
 * No passcode, unlike renaming a client in the patent portal. The step-up there guards ONE thing:
 * changing the CODE re-mints every patent handle, rewriting identifiers already quoted outside the
 * firm. A phone number does not do that, and asking for the passcode anyway is how people learn to
 * type it without reading — which is what makes it useless when it guards something real.
 */
function ProfileForm({ data, onDone, onCancel }: { data: LedgerDetail; onDone: () => void; onCancel: () => void }) {
  const { users } = useOrg();
  const [f, setF] = useState<ClientProfile>({
    contactName: data.contactName ?? '', contactEmail: data.contactEmail ?? '',
    contactPhone: data.contactPhone ?? '', website: data.website ?? '',
    country: data.country ?? '', address: data.address ?? '', industry: data.industry ?? '',
    notes: data.notes ?? '',
    billingRate: data.billingRate ?? null,
    billingCurrency: data.billingCurrency ?? 'INR',
    engagementStart: data.engagementStart ? String(data.engagementStart).slice(0, 10) : '',
    accountManagerId: data.accountManagerId ?? '',
  });
  const [rate, setRate] = useState(data.billingRate?.toString() ?? '');
  const [err, setErr] = useState('');
  const set = (k: keyof ClientProfile) => (v: string) => setF(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => api.clientLedger.setProfile(data.id, {
      // An empty box CLEARS the field — null, not '' — so the server can tell "cleared" from
      // "not sent". Sending '' would store a blank string that reads as set-but-empty.
      contactName: f.contactName?.trim() || null,
      contactEmail: f.contactEmail?.trim() || null,
      contactPhone: f.contactPhone?.trim() || null,
      website: f.website?.trim() || null,
      country: f.country?.trim() || null,
      address: f.address?.trim() || null,
      industry: f.industry?.trim() || null,
      notes: f.notes?.trim() || null,
      billingRate: rate.trim() === '' ? null : Number(rate),
      billingCurrency: f.billingCurrency,
      engagementStart: f.engagementStart ? f.engagementStart : null,
      accountManagerId: f.accountManagerId || null,
    }),
    onSuccess: onDone,
    onError: e => setErr(msg(e)),
  });

  const rateBad = rate.trim() !== '' && (!Number.isFinite(Number(rate)) || Number(rate) < 0);

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Contact person" value={f.contactName ?? ''} onChange={set('contactName')} placeholder="e.g. Priya Raman" />
        <Field label="Email" value={f.contactEmail ?? ''} onChange={set('contactEmail')} placeholder="name@company.com" type="email" />
        <Field label="Phone" value={f.contactPhone ?? ''} onChange={set('contactPhone')} placeholder="+1 613 555 0142" />
        <Field label="Website" value={f.website ?? ''} onChange={set('website')} placeholder="company.com" />
        <Field label="Country" value={f.country ?? ''} onChange={set('country')} placeholder="e.g. Canada" />
        <Field label="Industry" value={f.industry ?? ''} onChange={set('industry')} placeholder="e.g. Telecommunications" />
      </div>

      <Field label="Address" value={f.address ?? ''} onChange={set('address')} placeholder="Street, city" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
            Hourly rate
            <span title="Value on this ledger = billable hours × this rate, recomputed on every read.">
              <HelpCircle size={11} className="text-gray-300" />
            </span>
          </label>
          <div className="flex gap-2">
            <select
              value={f.billingCurrency} onChange={e => setF(p => ({ ...p, billingCurrency: e.target.value }))}
              className="px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
            >
              {CLIENT_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="e.g. 180"
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg tabular-nums focus:outline-none focus:border-brand-500"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Set this and the ledger prices the hours itself.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Client since</label>
          <input
            type="date" value={f.engagementStart ?? ''} onChange={e => set('engagementStart')(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
          <p className="text-[11px] text-gray-400 mt-1">When the relationship began, not when the row was created.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account manager</label>
          <select
            value={f.accountManagerId ?? ''} onChange={e => set('accountManagerId')(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
          >
            <option value="">Nobody named</option>
            {users.filter(u => u.status === 'ACTIVE').map(u => (
              <option key={u.id} value={u.id}>{fullName(u)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          rows={2} value={f.notes ?? ''} onChange={e => set('notes')(e.target.value)} maxLength={2000}
          placeholder="How we met them, who introduced us, anything a new account manager would need to know."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-brand-500"
        />
      </div>

      {rateBad && <p className="text-xs text-red-600">The rate must be a positive number.</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-400">
          Changing the code or the name is done in the patent portal — it re-mints every patent ID.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => { setErr(''); save.mutate(); }} disabled={save.isPending || rateBad}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
      />
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
