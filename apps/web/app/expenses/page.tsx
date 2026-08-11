'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Receipt, Plus, Check, X, Loader, Banknote, Paperclip } from 'lucide-react';
import { api, type Expense } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import { DateField } from '@/components/ui/DateField';

/**
 * Expenses, in the shape the team reads in TeamNest: a status card and an approved-total card
 * across the top, then one table — Expense Details, Additional Details, Category, Amount,
 * Request on, Status.
 */

const CATEGORIES = ['TRAVEL', 'MEALS', 'SUPPLIES', 'SOFTWARE', 'ACCOMMODATION', 'CLIENT', 'OTHER'] as const;
const CAT_LABEL: Record<string, string> = {
  TRAVEL: 'Travel', MEALS: 'Meals', SUPPLIES: 'Supplies', SOFTWARE: 'Software',
  ACCOMMODATION: 'Accommodation', CLIENT: 'Client', OTHER: 'Other',
};
const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200', APPROVED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-red-100 text-red-600 border-red-200', REIMBURSED: 'bg-brand-100 text-brand-700 border-brand-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
};
/** The buckets the status card counts, in TeamNest's order. */
const BUCKETS = [
  { key: 'PENDING', label: 'Pending', tone: '#f59e0b' },
  { key: 'APPROVED', label: 'Approved', tone: '#16a34a' },
  { key: 'REJECTED', label: 'Rejected', tone: '#dc2626' },
  { key: 'REIMBURSED', label: 'Reimbursed', tone: '#3d8de2' },
] as const;

function title(s: string) { return s.charAt(0) + s.slice(1).toLowerCase(); }
function money(e: Expense) { return `${e.currency} ${e.amount.toLocaleString('en-IN')}`; }
const inYear = (iso: string, y: number) => new Date(iso).getFullYear() === y;

type Tab = 'mine' | 'review';

export default function ExpensesPage() {
  const { can } = usePermissions();
  const canReview = can('expense.view.organization');
  const [tab, setTab] = useState<Tab>('mine');

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Receipt size={20} className="text-brand-600" /> Expenses</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record business expenses and request reimbursement.</p>
        <div className="flex items-center gap-1 mt-4">
          {([['mine', 'My expenses'], ...(canReview ? [['review', 'Review']] : [])] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap', tab === t ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>{label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {tab === 'mine' ? <MyExpenses /> : <ReviewExpenses />}
      </div>
    </div>
  );
}

function MyExpenses() {
  const qc = useQueryClient();
  // refetchOnWindowFocus: an approval happens in someone ELSE's session, so this list must
  // re-read when the claimant comes back to the tab — otherwise it shows PENDING for 20s
  // after the money was already agreed.
  const { data: rows = [] } = useQuery<Expense[]>({
    queryKey: ['expenses-mine'], queryFn: () => api.expenses.mine(),
    staleTime: 20_000, refetchOnWindowFocus: true,
  });
  const [show, setShow] = useState(false);
  const year = new Date().getFullYear();

  const thisYear = useMemo(() => rows.filter(r => inYear(r.createdAt, year)), [rows, year]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of thisYear) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [thisYear]);
  // "Approved" here means the money is agreed — whether or not it has been paid out yet.
  const approvedTotal = useMemo(
    () => thisYear.filter(r => r.status === 'APPROVED' || r.status === 'REIMBURSED').reduce((s, r) => s + r.amount, 0),
    [thisYear],
  );
  const paidTotal = useMemo(
    () => thisYear.filter(r => r.status === 'REIMBURSED').reduce((s, r) => s + r.amount, 0),
    [thisYear],
  );

  async function cancel(id: string) {
    try { await api.expenses.cancel(id); qc.invalidateQueries({ queryKey: ['expenses-mine'] }); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not cancel.'); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expenses Request Status for <year> */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Expenses Request Status for {year}</h3>
            <button onClick={() => setShow(true)} className="text-xs font-medium text-brand-700 hover:underline">New expense</button>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {BUCKETS.map(b => (
                <div key={b.key} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3 text-center">
                  <p className="text-2xl font-bold tabular-nums" style={{ color: b.tone }}>{counts[b.key] ?? 0}</p>
                  <p className="text-[11px] font-medium text-gray-500 mt-0.5">{b.label}</p>
                </div>
              ))}
            </div>
            {thisYear.length === 0 && <p className="text-sm text-gray-300 text-center mt-4">Nothing claimed this year</p>}
          </div>
        </div>

        {/* Approved Expenses for <year> */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Approved Expenses for {year}</h3>
          </div>
          <div className="p-5">
            <p className="text-3xl font-bold text-gray-900 tabular-nums">₹{approvedTotal.toLocaleString('en-IN')}</p>
            <p className="text-xs text-gray-400 mt-1">approved across {thisYear.filter(r => r.status === 'APPROVED' || r.status === 'REIMBURSED').length} claim(s)</p>
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
              <div>
                <p className="text-lg font-bold text-brand-700 tabular-nums">₹{paidTotal.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-gray-400">reimbursed to date</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-600 tabular-nums">₹{(approvedTotal - paidTotal).toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-gray-400">approved, not yet paid</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShow(true)} className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700"><Plus size={15} /> New expense</button>
      </div>

      <ExpenseTable rows={rows} onCancel={cancel} />

      {show && <NewExpenseModal onClose={() => setShow(false)} onDone={() => { setShow(false); qc.invalidateQueries({ queryKey: ['expenses-mine'] }); }} />}
    </div>
  );
}

// ── The table, in TeamNest's column order ─────────────────────────────────────
function ExpenseTable({ rows, onCancel }: { rows: Expense[]; onCancel?: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center text-sm text-gray-300">No expenses yet</div>;
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
              <th className="px-5 py-2.5 font-semibold">Expense Details</th>
              <th className="px-3 py-2.5 font-semibold">Additional Details</th>
              <th className="px-3 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
              <th className="px-3 py-2.5 font-semibold">Request on</th>
              <th className="px-5 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(e => (
              <tr key={e.id} className="hover:bg-gray-50/60 align-top">
                <td className="px-5 py-3 max-w-[280px]">
                  <p className="text-gray-800 break-words">{e.description}</p>
                  {e.receipt && (
                    <a href={e.receipt.fileUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline mt-0.5 max-w-full">
                      <Paperclip size={11} className="shrink-0" /> <span className="truncate">{e.receipt.name}</span>
                    </a>
                  )}
                </td>
                <td className="px-3 py-3 text-gray-500 text-xs">
                  <span className="block">Spent on {format(new Date(e.spentOn), 'dd MMM yyyy')}</span>
                  {e.reviewNote && <span className="block mt-0.5 text-gray-400">Note: {e.reviewNote}</span>}
                  {e.reimbursedAt && <span className="block mt-0.5 text-brand-600">Paid {format(new Date(e.reimbursedAt), 'dd MMM yyyy')}</span>}
                </td>
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{CAT_LABEL[e.category] ?? e.category}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">{money(e)}</td>
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{format(new Date(e.createdAt), 'dd MMM yyyy')}</td>
                <td className="px-5 py-3 whitespace-nowrap">
                  <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border', STATUS_STYLE[e.status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>{title(e.status)}</span>
                  {onCancel && e.status === 'PENDING' && (
                    <button onClick={() => onCancel(e.id)} className="block text-xs text-gray-400 hover:text-red-600 mt-1">Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── New expense ───────────────────────────────────────────────────────────────
function NewExpenseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ category: 'TRAVEL', amount: '', spentOn: today, description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setErr('Enter a valid amount.'); return; }
    if (!form.description.trim()) { setErr('Add a short description.'); return; }
    setBusy(true);
    try {
      // The receipt goes up first — a claim that references a failed upload is worse than no claim.
      let receiptDocumentId: string | undefined;
      if (file) receiptDocumentId = (await api.documents.upload(file)).id;
      await api.expenses.submit({
        category: form.category, amount, currency: 'INR',
        spentOn: form.spentOn, description: form.description.trim(), receiptDocumentId,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not submit the expense.'); }
    finally { setBusy(false); }
  }

  const label = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1';
  const input = 'w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">New Expense</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={label}>Category <span className="text-red-500">*</span></label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={clsx(input, 'bg-white')}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Amount (INR) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 1000" className={input} />
            </div>
            <div>
              <label className={label}>Spent On <span className="text-red-500">*</span></label>
              <DateField type="date" value={form.spentOn} max={today} onChange={e => setForm(f => ({ ...f, spentOn: e.target.value }))} className={input} />
            </div>
          </div>
          <div>
            <label className={label}>Expense Details <span className="text-red-500">*</span></label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Cab to client site — Patent X filing" className={input} />
          </div>
          <div>
            <label className={label}>Receipt</label>
            <label className="flex items-center gap-2 text-sm border border-dashed border-gray-300 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-gray-50">
              <Paperclip size={14} className="text-gray-400 shrink-0" />
              <span className="truncate text-gray-600">{file ? file.name : 'Attach the bill or receipt'}</span>
              <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && <button onClick={() => setFile(null)} className="text-[11px] text-gray-400 hover:text-red-600 mt-1">Remove</button>}
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
          <button onClick={onClose} className="text-sm px-3.5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-white">Cancel</button>
          <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            {busy && <Loader size={14} className="animate-spin" />} Submit for reimbursement
          </button>
        </div>
      </div>
    </div>
  );
}

/** Org-wide totals for approvers. The cards on "My expenses" count only the viewer's own
 *  claims, so an admin who approves everyone else's saw nothing change after approving. */
function OrgExpenseSummary() {
  const { data: all = [] } = useQuery<Expense[]>({
    queryKey: ['expenses-org', ''], queryFn: () => api.expenses.forOrg(undefined),
    staleTime: 15_000, refetchOnWindowFocus: true,
  });
  const year = new Date().getFullYear();
  const thisYear = useMemo(() => all.filter(r => inYear(r.createdAt, year)), [all, year]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of thisYear) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [thisYear]);
  const approvedTotal = useMemo(
    () => thisYear.filter(r => r.status === 'APPROVED' || r.status === 'REIMBURSED').reduce((s, r) => s + r.amount, 0),
    [thisYear],
  );
  const awaitingPayout = useMemo(
    () => thisYear.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0),
    [thisYear],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Everyone&apos;s expenses in {year}</h3>
      </div>
      <div className="p-5 grid grid-cols-2 sm:grid-cols-6 gap-3">
        {BUCKETS.map(b => (
          <div key={b.key} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3 text-center">
            <p className="text-2xl font-bold tabular-nums" style={{ color: b.tone }}>{counts[b.key] ?? 0}</p>
            <p className="text-[11px] font-medium text-gray-500 mt-0.5">{b.label}</p>
          </div>
        ))}
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3 text-center">
          <p className="text-lg font-bold text-gray-900 tabular-nums">₹{approvedTotal.toLocaleString('en-IN')}</p>
          <p className="text-[11px] font-medium text-gray-500 mt-0.5">Approved value</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3 text-center">
          <p className="text-lg font-bold text-amber-600 tabular-nums">₹{awaitingPayout.toLocaleString('en-IN')}</p>
          <p className="text-[11px] font-medium text-gray-500 mt-0.5">Awaiting payout</p>
        </div>
      </div>
    </div>
  );
}

function ReviewExpenses() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canApprove = can('expense.approve');
  const [filter, setFilter] = useState('PENDING');
  const { data: rows = [] } = useQuery<Expense[]>({ queryKey: ['expenses-org', filter], queryFn: () => api.expenses.forOrg(filter || undefined), staleTime: 15_000 });
  const [busyId, setBusyId] = useState('');

  async function act(fn: () => Promise<unknown>) {
    setBusyId('working');
    try {
      await fn();
      // Both lists render the same expense — refresh the personal one too, or the
      // overview cards keep the pre-approval counts.
      qc.invalidateQueries({ queryKey: ['expenses-org'] });
      qc.invalidateQueries({ queryKey: ['expenses-mine'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    }
    catch (e) { alert(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusyId(''); }
  }

  return (
    <div className="space-y-4">
      <OrgExpenseSummary />
      <div className="flex items-center gap-1.5 flex-wrap">
        {['PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED', ''].map(s => (
          <button key={s || 'ALL'} onClick={() => setFilter(s)} className={clsx('text-xs font-medium px-2.5 py-1.5 rounded-lg', filter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{s ? title(s) : 'All'}</button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-2.5 font-semibold">Employee</th>
                <th className="px-3 py-2.5 font-semibold">Expense Details</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
                <th className="px-3 py-2.5 font-semibold">Request on</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-300">Nothing here 🎉</td></tr>}
              {rows.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/60 align-top">
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Avatar user={e.user} size={28} />
                      <span className="text-gray-800 truncate">{e.user?.firstName} {e.user?.lastName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 max-w-[260px]">
                    <p className="text-gray-700 break-words">{e.description}</p>
                    <span className="block text-[11px] text-gray-400 mt-0.5">Spent on {format(new Date(e.spentOn), 'dd MMM yyyy')}</span>
                    {e.receipt && (
                      <a href={e.receipt.fileUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline mt-0.5 max-w-full">
                        <Paperclip size={11} className="shrink-0" /> <span className="truncate">{e.receipt.name}</span>
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{CAT_LABEL[e.category] ?? e.category}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">{money(e)}</td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{format(new Date(e.createdAt), 'dd MMM yyyy')}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border', STATUS_STYLE[e.status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>{title(e.status)}</span>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {canApprove && e.status === 'PENDING' && (
                        <>
                          <button onClick={() => act(() => api.expenses.approve(e.id))} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"><Check size={12} /> Approve</button>
                          <button onClick={() => act(() => api.expenses.reject(e.id, window.prompt('Reason for rejecting (optional):') ?? undefined))} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"><X size={12} /> Reject</button>
                        </>
                      )}
                      {canApprove && e.status === 'APPROVED' && (
                        <button onClick={() => act(() => api.expenses.reimburse(e.id))} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50"><Banknote size={12} /> Mark reimbursed</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
