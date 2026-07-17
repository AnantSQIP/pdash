'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Receipt, Plus, Check, X, Loader, Banknote } from 'lucide-react';
import { api, type Expense } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import { DateField } from '@/components/ui/DateField';

const CATEGORIES = ['TRAVEL', 'MEALS', 'SUPPLIES', 'SOFTWARE', 'ACCOMMODATION', 'CLIENT', 'OTHER'] as const;
const CAT_LABEL: Record<string, string> = {
  TRAVEL: 'Travel', MEALS: 'Meals', SUPPLIES: 'Supplies', SOFTWARE: 'Software',
  ACCOMMODATION: 'Accommodation', CLIENT: 'Client', OTHER: 'Other',
};
const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700', APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600', REIMBURSED: 'bg-brand-100 text-brand-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};
function title(s: string) { return s.charAt(0) + s.slice(1).toLowerCase(); }
function money(e: Expense) { return `${e.currency} ${e.amount.toLocaleString('en-IN')}`; }

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
  const { data: rows = [] } = useQuery<Expense[]>({ queryKey: ['expenses-mine'], queryFn: () => api.expenses.mine(), staleTime: 20_000 });
  const [show, setShow] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ category: 'TRAVEL', amount: '', currency: 'INR', spentOn: today, description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setErr('Enter a valid amount.'); return; }
    if (!form.description.trim()) { setErr('Add a short description.'); return; }
    setBusy(true);
    try {
      await api.expenses.submit({ category: form.category, amount, currency: form.currency, spentOn: form.spentOn, description: form.description.trim() });
      setShow(false); setForm({ category: 'TRAVEL', amount: '', currency: 'INR', spentOn: today, description: '' });
      qc.invalidateQueries({ queryKey: ['expenses-mine'] });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not submit the expense.'); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    try { await api.expenses.cancel(id); qc.invalidateQueries({ queryKey: ['expenses-mine'] }); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not cancel.'); }
  }

  const pending = rows.filter(r => r.status === 'PENDING').length;
  const reimbursed = rows.filter(r => r.status === 'REIMBURSED').reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-3">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5"><p className="text-lg font-bold text-gray-900">{pending}</p><p className="text-xs text-gray-400">Awaiting review</p></div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5"><p className="text-lg font-bold text-gray-900">₹{reimbursed.toLocaleString('en-IN')}</p><p className="text-xs text-gray-400">Reimbursed to date</p></div>
        </div>
        <button onClick={() => setShow(s => !s)} className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700"><Plus size={15} /> New expense</button>
      </div>

      {show && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Amount</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 1200" className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Currency</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white">
                {['INR', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Date</label>
              <DateField type="date" value={form.spentOn} max={today} onChange={e => setForm(f => ({ ...f, spentOn: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">What was it for?</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Cab to client site — Patent X filing" className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShow(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="text-sm font-medium px-3.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Submitting…' : 'Submit for reimbursement'}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <ul className="divide-y divide-gray-50">
          {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-gray-300">No expenses yet</li>}
          {rows.map(e => (
            <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{money(e)} · <span className="text-gray-500 font-normal">{CAT_LABEL[e.category] ?? e.category}</span></p>
                <p className="text-xs text-gray-400 truncate">{format(new Date(e.spentOn), 'MMM d, yyyy')} · {e.description}{e.reviewNote ? ` · Note: ${e.reviewNote}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[e.status] ?? 'bg-gray-100 text-gray-600')}>{title(e.status)}</span>
                {e.status === 'PENDING' && <button onClick={() => cancel(e.id)} className="text-xs text-gray-400 hover:text-red-600">Cancel</button>}
              </div>
            </li>
          ))}
        </ul>
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
    try { await fn(); qc.invalidateQueries({ queryKey: ['expenses-org'] }); }
    catch (e) { alert(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusyId(''); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {['PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED', ''].map(s => (
          <button key={s || 'ALL'} onClick={() => setFilter(s)} className={clsx('text-xs font-medium px-2.5 py-1.5 rounded-lg', filter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{s ? title(s) : 'All'}</button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <ul className="divide-y divide-gray-50">
          {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-gray-300">Nothing here 🎉</li>}
          {rows.map(e => (
            <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar user={e.user} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{e.user?.firstName} {e.user?.lastName} · {money(e)} · <span className="text-gray-500 font-normal">{CAT_LABEL[e.category] ?? e.category}</span></p>
                  <p className="text-xs text-gray-400 truncate">{format(new Date(e.spentOn), 'MMM d, yyyy')} · {e.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[e.status] ?? 'bg-gray-100 text-gray-600')}>{title(e.status)}</span>
                {canApprove && e.status === 'PENDING' && (
                  <>
                    <button onClick={() => act(() => api.expenses.approve(e.id))} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"><Check size={13} /> Approve</button>
                    <button onClick={() => act(() => api.expenses.reject(e.id, window.prompt('Reason for rejecting (optional):') ?? undefined))} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"><X size={13} /> Reject</button>
                  </>
                )}
                {canApprove && e.status === 'APPROVED' && (
                  <button onClick={() => act(() => api.expenses.reimburse(e.id))} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50"><Banknote size={13} /> Mark reimbursed</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
