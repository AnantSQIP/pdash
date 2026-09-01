'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  CalendarDays, ClipboardList, CalendarClock, Plus, X, Paperclip, Loader, Send, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  api, type LeaveBalance, type LeaveRequestItem, type LeaveType, type Holiday, type UserSummary,
} from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { DateField } from '@/components/ui/DateField';
import { WEEKDAYS_SHORT, monthLeadPad } from '@/lib/date';
import { toastError } from '@/components/ui/Toast';

/**
 * The Leaves home, laid out the way the team already knows it from TeamNest: two status cards
 * across the top, then three tabs — the calendar, the list of applications, and the planner.
 *
 * The shape is deliberately copied. People have been reading these same tables for years, so
 * moving the columns around would cost them more than any layout of ours would win back.
 */

const STATUS_PILL: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700 border-green-200',
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  DRAFT: 'bg-indigo-50 text-indigo-600 border-indigo-200',
};
/** The four request-status buckets the summary card counts, in TeamNest's order. */
const REQUEST_BUCKETS = [
  { key: 'PENDING', label: 'Pending', ring: '#f59e0b' },
  { key: 'APPROVED', label: 'Approved', ring: '#16a34a' },
  { key: 'REJECTED', label: 'Rejected', ring: '#dc2626' },
  { key: 'CANCELLED', label: 'Cancelled', ring: '#9ca3af' },
] as const;

const TABS = [
  { id: 'calendar', label: 'My Leaves Calendar', icon: CalendarDays },
  { id: 'status', label: 'Leaves Application Status', icon: ClipboardList },
  { id: 'planner', label: 'Leave Planner', icon: CalendarClock },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Leave only ever comes in half-day steps, so this needs one decimal place at most. */
function fmtDays(n: number): string {
  if (n === 0) return '0 days';
  if (n === 0.5) return 'half a day';
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${s} day${n === 1 ? '' : 's'}`;
}

/** "half day (morning)" / "1.5 days" for one request row. */
export function describeLeaveDays(r: { numDays: number; dayType?: string; halfPeriod?: string | null }): string {
  if (r.dayType === 'HALF') return `half day (${r.halfPeriod === 'SECOND' ? 'afternoon' : 'morning'})`;
  return fmtDays(r.numDays);
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const parseKey = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);
/** Every yyyy-MM-dd from start to end inclusive — a leave shows on all its days, not just the first. */
function daysBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const end = parseKey(endISO);
  for (const d = parseKey(startISO); d <= end; d.setDate(d.getDate() + 1)) out.push(dayKey(d));
  return out;
}

export function LeavesHome({ balances, myRequests, leaveTypes, holidays, onChanged, busy, setBusy }: {
  balances: LeaveBalance[];
  myRequests: LeaveRequestItem[];
  leaveTypes: LeaveType[];
  holidays: Holiday[];
  onChanged: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [tab, setTab] = useState<TabId>('calendar');
  const [apply, setApply] = useState<null | { plan: boolean }>(null);
  const [confirmCancel, setConfirmCancel] = useState<LeaveRequestItem | null>(null);
  const year = new Date().getFullYear();

  // A plan lives in the same table as an application, told apart by its DRAFT status. That keeps
  // "submit this plan" a status change rather than a copy between two half-identical models.
  const applications = useMemo(() => myRequests.filter(r => r.status !== 'DRAFT'), [myRequests]);
  const plans = useMemo(() => myRequests.filter(r => r.status === 'DRAFT'), [myRequests]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
    for (const r of applications) if (r.status in c) c[r.status]++;
    return c;
  }, [applications]);

  async function cancelRequest(r: LeaveRequestItem) {
    setBusy(true);
    try { await api.leave.cancel(r.id); setConfirmCancel(null); onChanged(); }
    catch (e) { toastError(e, 'Could not cancel the request.'); }
    finally { setBusy(false); }
  }

  async function submitPlan(r: LeaveRequestItem) {
    setBusy(true);
    try { await api.leave.submitPlan(r.id); onChanged(); }
    catch (e) { toastError(e, 'Could not submit the plan.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* ── the two status cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BalanceCard year={year} balances={balances} onApply={() => setApply({ plan: false })} />
        <RequestStatusCard year={year} counts={counts} total={applications.length} onSeeAll={() => setTab('status')} />
      </div>

      {/* ── tabs ─────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-2 flex-wrap">
          <div className="flex overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={clsx('inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                    tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 px-2 py-2">
            <button onClick={() => setApply({ plan: true })}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              <CalendarClock size={15} /> Plan Your Leave
            </button>
            <button onClick={() => setApply({ plan: false })}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700">
              <Plus size={15} /> Apply for Leave
            </button>
          </div>
        </div>

        {tab === 'calendar' && <LeavesCalendar requests={myRequests} holidays={holidays} />}
        {tab === 'status' && (
          <ApplicationStatusTable rows={applications} busy={busy} onCancel={setConfirmCancel} />
        )}
        {tab === 'planner' && (
          <PlannerTable rows={plans} busy={busy} onSubmit={submitPlan} onDrop={setConfirmCancel}
            onPlan={() => setApply({ plan: true })} />
        )}
      </div>

      {apply && (
        <ApplyLeaveModal
          plan={apply.plan}
          leaveTypes={leaveTypes}
          balances={balances}
          onClose={() => setApply(null)}
          onDone={() => { setApply(null); onChanged(); }}
        />
      )}
      {confirmCancel && (
        <CancelLeaveModal req={confirmCancel} busy={busy}
          onClose={() => setConfirmCancel(null)} onConfirm={() => cancelRequest(confirmCancel)} />
      )}
    </div>
  );
}

// ── Leaves Balance Status for <year> ──────────────────────────────────────────
function BalanceCard({ year, balances, onApply }: { year: number; balances: LeaveBalance[]; onApply: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Leaves Balance Status for {year}</h3>
        <button onClick={onApply} className="text-xs font-medium text-brand-700 hover:underline">Apply for Leave</button>
      </div>
      {balances.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-300">No leave types configured</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-2 font-semibold">Leave Type</th>
                <th className="px-3 py-2 font-semibold text-right">Eligible</th>
                <th className="px-3 py-2 font-semibold text-right">Availed</th>
                <th className="px-3 py-2 font-semibold text-right">Pending</th>
                <th className="px-5 py-2 font-semibold text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {balances.map(b => (
                <tr key={b.code} className="hover:bg-gray-50/60">
                  <td className="px-5 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.colorHex }} />
                      <span className="font-medium text-gray-800">{b.name}</span>
                    </span>
                    {/* Comp-off has no annual entitlement: its "Eligible" is what you earned by
                        working non-working days, so the row has to say so or the number reads
                        like a grant somebody gave you. */}
                    {b.isCompOff && (
                      <span className="block text-[11px] text-gray-400 mt-0.5 pl-4.5">
                        {b.quota === 0
                          ? 'You earn comp-off by working a weekend or holiday, then claiming it (Credit).'
                          : `Earned by working ${b.credits ?? 0} approved weekend/holiday${(b.credits ?? 0) === 1 ? '' : 's'} — not an annual grant.`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{b.quota}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{b.used}</td>
                  {/* Pending days are already out of Balance — showing them stops the card
                      claiming days that the next request would be refused for. */}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {b.pending ? <span className="text-amber-600 font-medium">{b.pending}</span> : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-gray-900">{b.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-50 leading-relaxed">
            <strong className="text-gray-500">Eligible</strong> is your entitlement for the year ·{' '}
            <strong className="text-gray-500">Availed</strong> is what has been approved and taken ·{' '}
            <strong className="text-gray-500">Pending</strong> is on requests still awaiting a decision ·{' '}
            <strong className="text-gray-500">Balance</strong> is what you can still book. Pending days are
            already out of Balance, because a day cannot be promised twice.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Leaves Request Status for <year> ──────────────────────────────────────────
function RequestStatusCard({ year, counts, total, onSeeAll }: {
  year: number; counts: Record<string, number>; total: number; onSeeAll: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Leaves Request Status for {year}</h3>
        <button onClick={onSeeAll} className="text-xs font-medium text-brand-700 hover:underline">View all</button>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {REQUEST_BUCKETS.map(b => (
            <div key={b.key} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums" style={{ color: b.ring }}>{counts[b.key] ?? 0}</p>
              <p className="text-[11px] font-medium text-gray-500 mt-0.5">{b.label}</p>
            </div>
          ))}
        </div>
        {/* One bar showing the mix, so the split reads at a glance without a chart library. */}
        {total > 0 && (
          <div className="mt-4">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
              {REQUEST_BUCKETS.map(b => {
                const n = counts[b.key] ?? 0;
                if (!n) return null;
                return <div key={b.key} style={{ width: `${(n / total) * 100}%`, backgroundColor: b.ring }} title={`${b.label}: ${n}`} />;
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">{total} request{total === 1 ? '' : 's'} this year</p>
          </div>
        )}
        {total === 0 && <p className="text-sm text-gray-300 text-center mt-4">No leave requested this year</p>}
      </div>
    </div>
  );
}

// ── My Leaves Calendar ────────────────────────────────────────────────────────
function LeavesCalendar({ requests, holidays }: { requests: LeaveRequestItem[]; holidays: Holiday[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });

  /** date -> the leave covering it. Approved wins over pending, which wins over a plan. */
  const byDay = useMemo(() => {
    const rank: Record<string, number> = { APPROVED: 3, PENDING: 2, DRAFT: 1 };
    const m = new Map<string, LeaveRequestItem>();
    for (const r of requests) {
      if (!(r.status in rank)) continue;
      for (const k of daysBetween(r.startDate, r.endDate)) {
        const cur = m.get(k);
        if (!cur || rank[r.status] > rank[cur.status]) m.set(k, r);
      }
    }
    return m;
  }, [requests]);
  const holidaySet = useMemo(() => new Map(holidays.map(h => [h.date.slice(0, 10), h.name])), [holidays]);

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = monthLeadPad(cursor.y, cursor.m);
  const shift = (delta: number) => setCursor(c => {
    const d = new Date(c.y, c.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><ChevronLeft size={17} /></button>
        <p className="text-sm font-semibold text-gray-800">{format(first, 'MMMM yyyy')}</p>
        <button onClick={() => shift(1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><ChevronRight size={17} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS_SHORT.map(d => <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const date = new Date(cursor.y, cursor.m, i + 1);
          const key = dayKey(date);
          const leave = byDay.get(key);
          const holiday = holidaySet.get(key);
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          const isToday = key === dayKey(now);
          const tone = leave
            ? leave.status === 'APPROVED' ? 'bg-blue-50 border-blue-200 text-blue-700'
              : leave.status === 'PENDING' ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-indigo-50 border-indigo-200 border-dashed text-indigo-600'
            : holiday ? 'bg-purple-50 border-purple-200 text-purple-700'
              : weekend ? 'bg-gray-50 border-gray-100 text-gray-300'
                : 'bg-white border-gray-100 text-gray-600';
          const title = leave
            ? `${leave.leaveType} · ${describeLeaveDays(leave)} · ${leave.status === 'DRAFT' ? 'PLANNED' : leave.status}`
            : holiday ?? '';
          return (
            <div key={key} title={title}
              className={clsx('aspect-square rounded-lg border p-1.5 flex flex-col overflow-hidden', tone, isToday && 'ring-2 ring-brand-500 ring-offset-1')}>
              <span className="text-xs font-semibold leading-none">{i + 1}</span>
              {leave && (
                <span className="mt-auto text-[9px] font-medium leading-tight truncate">
                  {leave.leaveType}{leave.dayType === 'HALF' ? ' ½' : ''}
                </span>
              )}
              {!leave && holiday && <span className="mt-auto text-[9px] leading-tight truncate">{holiday}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-gray-100">
        {[
          ['bg-blue-100 border-blue-300', 'Approved leave'],
          ['bg-amber-100 border-amber-300', 'Pending leave'],
          ['bg-indigo-100 border-indigo-300 border-dashed', 'Planned'],
          ['bg-purple-100 border-purple-300', 'Holiday'],
          ['bg-gray-100 border-gray-200', 'Weekend'],
        ].map(([cls, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className={clsx('w-3 h-3 rounded border', cls)} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Leaves Application Status ─────────────────────────────────────────────────
function ApplicationStatusTable({ rows, busy, onCancel }: {
  rows: LeaveRequestItem[]; busy: boolean; onCancel: (r: LeaveRequestItem) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <p className="px-5 py-12 text-center text-sm text-gray-300">No leave applications yet</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
            <th className="px-5 py-2.5 font-semibold">Leave applied for</th>
            <th className="px-3 py-2.5 font-semibold">Start Date</th>
            <th className="px-3 py-2.5 font-semibold">End Date</th>
            <th className="px-3 py-2.5 font-semibold">Reason</th>
            <th className="px-3 py-2.5 font-semibold">Supporting Docs</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
            <th className="px-5 py-2.5 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => (
            <Fragment key={r.id}>
              <tr className="hover:bg-gray-50/60 align-top">
                <td className="px-5 py-3">
                  <button onClick={() => setOpen(o => (o === r.id ? null : r.id))} className="text-left">
                    <span className="font-medium text-gray-800 hover:text-brand-700">{r.leaveType}</span>
                    <span className="block text-[11px] text-gray-400">{describeLeaveDays(r)}</span>
                  </button>
                </td>
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{format(parseKey(r.startDate), 'dd MMM yyyy')}</td>
                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{format(parseKey(r.endDate), 'dd MMM yyyy')}</td>
                <td className="px-3 py-3 text-gray-600 max-w-[220px] truncate" title={r.reason ?? ''}>{r.reason || '—'}</td>
                <td className="px-3 py-3">
                  {r.supportingDoc ? (
                    <a href={r.supportingDoc.fileUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline max-w-[160px]">
                      <Paperclip size={13} className="shrink-0" /> <span className="truncate">{r.supportingDoc.name}</span>
                    </a>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-3">
                  <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border', STATUS_PILL[r.status] ?? 'bg-gray-100 text-gray-500 border-gray-200')}>{r.status}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  {['PENDING', 'APPROVED'].includes(r.status) ? (
                    <button onClick={() => onCancel(r)} disabled={busy}
                      className="text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50">Cancel Leave</button>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
              </tr>
              {open === r.id && (
                <tr className="bg-gray-50/70">
                  <td colSpan={7} className="px-5 py-3">
                    <LeaveDetail r={r} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The fields that don't fit in a table row but matter when somebody actually needs them. */
function LeaveDetail({ r }: { r: LeaveRequestItem }) {
  const alt = r.alternateEmployee;
  const items: [string, string][] = [
    ['Leave choice', r.dayType === 'HALF' ? `Half day — ${r.halfPeriod === 'SECOND' ? 'second half' : 'first half'}` : 'Full day'],
    ['Days', fmtDays(r.numDays)],
    ['Alternate employee', alt ? `${alt.firstName ?? ''} ${alt.lastName ?? ''}`.trim() || alt.email : '—'],
    ['Alternate contact', r.alternateNumber || '—'],
    ['Alternate address', r.alternateAddress || '—'],
    ['Applied on', format(new Date(r.createdAt), 'dd MMM yyyy, h:mm a')],
    ...(r.reviewNote ? [['Reviewer note', r.reviewNote] as [string, string]] : []),
  ];
  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{k}</dt>
          <dd className="text-xs text-gray-700 mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Leave Planner ─────────────────────────────────────────────────────────────
function PlannerTable({ rows, busy, onSubmit, onDrop, onPlan }: {
  rows: LeaveRequestItem[]; busy: boolean;
  onSubmit: (r: LeaveRequestItem) => void; onDrop: (r: LeaveRequestItem) => void; onPlan: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-gray-400">Nothing planned yet.</p>
        <p className="text-xs text-gray-400 mt-1">Pencil in leave you intend to take — it uses no balance until you submit it.</p>
        <button onClick={onPlan} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          <CalendarClock size={15} /> Plan Your Leave
        </button>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
            <th className="px-5 py-2.5 font-semibold">Leave Planned for</th>
            <th className="px-3 py-2.5 font-semibold">Start Date</th>
            <th className="px-3 py-2.5 font-semibold">End Date</th>
            <th className="px-3 py-2.5 font-semibold">Leave Type</th>
            <th className="px-5 py-2.5 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-gray-50/60">
              <td className="px-5 py-3 text-gray-800">{r.reason || describeLeaveDays(r)}</td>
              <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{format(parseKey(r.startDate), 'dd MMM yyyy')}</td>
              <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{format(parseKey(r.endDate), 'dd MMM yyyy')}</td>
              <td className="px-3 py-3 text-gray-600">{r.leaveType}</td>
              <td className="px-5 py-3 text-right whitespace-nowrap">
                <button onClick={() => onSubmit(r)} disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:opacity-50">
                  <Send size={12} /> Apply now
                </button>
                <button onClick={() => onDrop(r)} disabled={busy}
                  className="ml-3 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50">
                  <Trash2 size={12} /> Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Apply for Leave / Plan Your Leave ─────────────────────────────────────────
// Leave is taken as a whole day or a half day. There is no smaller unit — an hourly option
// existed briefly and was withdrawn, because charging it pro-rata put fractions like 0.375 of
// a day into people's balances.
type LeaveChoice = 'FULL' | 'HALF';

function ApplyLeaveModal({ plan, leaveTypes, balances, onClose, onDone }: {
  plan: boolean; leaveTypes: LeaveType[]; balances: LeaveBalance[];
  onClose: () => void; onDone: () => void;
}) {
  const [f, setF] = useState({
    leaveType: '', choice: 'FULL' as LeaveChoice, startDate: '', endDate: '',
    halfPeriod: 'FIRST' as 'FIRST' | 'SECOND',
    alternateEmployeeId: '', alternateNumber: '', alternateAddress: '', reason: '',
    // Comp-off is two opposite things sharing one leave type, and they are named the way a
    // ledger names them: CREDIT puts a day in (you worked a weekend), DEBIT takes one out
    // (you avail it). Defaults to DEBIT — somebody in "Apply for Leave" is usually taking time off.
    compOffMode: 'DEBIT' as 'DEBIT' | 'CREDIT', compOffDate: '', projectRef: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only colleagues can stand in, so the picker needs the roster. It is small and cached.
  const { org } = useOrg();
  const { data: people = [] } = useQuery<UserSummary[]>({
    queryKey: ['users', org?.id], queryFn: () => api.users.list(org!.id), enabled: !!org?.id, staleTime: 300_000,
  });

  const single = f.choice !== 'FULL';
  const balance = balances.find(b => b.code === f.leaveType);
  const isCompOff = f.leaveType === 'CO';
  // Claiming a credit is a different form: it is about a day already worked, not a day off.
  const isClaim = isCompOff && f.compOffMode === 'CREDIT';
  const today = new Date().toISOString().slice(0, 10);

  const valid = isClaim
    ? !!f.compOffDate && !!f.reason.trim() && !!f.projectRef.trim()
    : !!f.leaveType && !!f.startDate && (single || !!f.endDate);

  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      // A credit claim is not a leave request at all — it is a claim on a day already worked,
      // which HR turns into a comp-off credit. Different endpoint, different rules.
      if (isClaim) {
        await api.leave.requestCompOff({
          workDate: f.compOffDate, reason: f.reason.trim(), projectRef: f.projectRef.trim(),
          dayType: f.choice === 'HALF' ? 'HALF' : 'FULL',
        });
        onDone();
        return;
      }
      // Upload first: if the file fails we should not leave a request pointing at nothing.
      let supportingDocId: string | undefined;
      if (file) supportingDocId = (await api.documents.upload(file)).id;
      await api.leave.create({
        leaveType: f.leaveType,
        startDate: f.startDate,
        endDate: single ? f.startDate : f.endDate,
        reason: f.reason.trim() || undefined,
        dayType: f.choice,
        halfPeriod: f.choice === 'HALF' ? f.halfPeriod : undefined,
        alternateEmployeeId: f.alternateEmployeeId || null,
        alternateNumber: f.alternateNumber.trim() || undefined,
        alternateAddress: f.alternateAddress.trim() || undefined,
        supportingDocId: supportingDocId ?? null,
        plan,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the request.');
    } finally { setSaving(false); }
  }

  const label = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1';
  const input = 'w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">
            {plan ? 'Plan Your Leave' : isClaim ? 'Claim Comp Off' : 'Apply for Leave'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {plan && !isClaim && (
            <p className="text-xs rounded-lg bg-indigo-50 text-indigo-700 px-3 py-2">
              A plan is pencilled in for your own reference. It uses no balance and goes to nobody for approval
              until you press <strong>Apply now</strong> on the planner.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Applying for <span className="text-red-500">*</span></label>
              <select value={f.leaveType} onChange={e => setF(v => ({ ...v, leaveType: e.target.value }))} className={clsx(input, 'bg-white')}>
                <option value="">Select leave type…</option>
                {leaveTypes.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
              {balance && (
                <p className="text-[11px] text-gray-400 mt-1">
                  {balance.isCompOff
                    ? `${balance.remaining} comp-off day(s) available to spend`
                    : `${balance.remaining} of ${balance.quota} remaining`}
                </p>
              )}
            </div>
            <div>
              <label className={label}>
                {isClaim ? 'How much did you work?' : 'Leave Choice'} <span className="text-red-500">*</span>
              </label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {([['FULL', 'Full Day'], ['HALF', 'Half Day']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setF(s => ({ ...s, choice: v }))}
                    className={clsx('flex-1 px-2 py-2 text-xs font-medium transition-colors',
                      f.choice === v ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                    {l}
                  </button>
                ))}
              </div>
              {isClaim && <p className="text-[11px] text-gray-400 mt-1">A half day worked earns half a day of comp-off.</p>}
            </div>
          </div>

          {/* Comp Off Request Type — earn a credit, or spend one. */}
          {isCompOff && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Comp Off Request Type <span className="text-red-500">*</span></label>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(plan ? ([['DEBIT', 'Debit']] as const) : ([['CREDIT', 'Credit'], ['DEBIT', 'Debit']] as const)).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setF(s => ({ ...s, compOffMode: v, choice: 'FULL' }))}
                      className={clsx('flex-1 px-2 py-2 text-xs font-medium transition-colors',
                        f.compOffMode === v ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {f.compOffMode === 'CREDIT'
                    ? 'Credit — you worked a weekend or holiday, so a day goes INTO your comp-off balance.'
                    : 'Debit — you avail a day OFF, taken OUT of the comp-off balance you already earned.'}
                </p>
              </div>
              {isClaim && (
                <div>
                  <label className={label}>Comp Off Request Date <span className="text-red-500">*</span></label>
                  <DateField type="date" value={f.compOffDate} max={today}
                    onChange={e => setF(v => ({ ...v, compOffDate: e.target.value }))} className={input} />
                  <p className="text-[11px] text-gray-400 mt-1">The weekend or holiday you actually worked.</p>
                </div>
              )}
            </div>
          )}

          {isClaim && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Project ID (PID) <span className="text-red-500">*</span></label>
                <input value={f.projectRef} onChange={e => setF(v => ({ ...v, projectRef: e.target.value }))}
                  placeholder="e.g. SQ_26_27_001" className={input} />
              </div>
              <div>
                <label className={label}>What did you work on? <span className="text-red-500">*</span></label>
                <input value={f.reason} onChange={e => setF(v => ({ ...v, reason: e.target.value }))}
                  placeholder="e.g. Client deadline — claim chart delivery" className={input} />
              </div>
            </div>
          )}

          {/* Dates. A half or hourly leave is one date, so the range collapses to a single field.
              A credit claim has no leave dates at all — its date is the day already worked. */}
          {isClaim ? null : single ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Leave Date <span className="text-red-500">*</span></label>
                <DateField type="date" value={f.startDate} onChange={e => setF(v => ({ ...v, startDate: e.target.value }))} className={input} />
              </div>
              {f.choice === 'HALF' && (
                <div>
                  <label className={label}>Which Half? <span className="text-red-500">*</span></label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    {([['FIRST', 'First Half'], ['SECOND', 'Second Half']] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setF(s => ({ ...s, halfPeriod: v }))}
                        className={clsx('flex-1 px-2 py-2 text-xs font-medium transition-colors',
                          f.halfPeriod === v ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Uses half a day of your balance.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Leave Start Date <span className="text-red-500">*</span></label>
                <DateField type="date" value={f.startDate} onChange={e => setF(v => ({ ...v, startDate: e.target.value }))} className={input} />
              </div>
              <div>
                <label className={label}>Leave End Date <span className="text-red-500">*</span></label>
                <DateField type="date" value={f.endDate} min={f.startDate} onChange={e => setF(v => ({ ...v, endDate: e.target.value }))} className={input} />
              </div>
            </div>
          )}

          <div className={clsx('pt-1 border-t border-gray-100', isClaim && 'hidden')}>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide pt-3 mb-2">While you are away</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Alternate Employee</label>
                <select value={f.alternateEmployeeId} onChange={e => setF(v => ({ ...v, alternateEmployeeId: e.target.value }))} className={clsx(input, 'bg-white')}>
                  <option value="">Nobody in particular</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Alternate Contact Number</label>
                <input value={f.alternateNumber} onChange={e => setF(v => ({ ...v, alternateNumber: e.target.value }))}
                  placeholder="e.g. +91 98765 43210" className={input} />
              </div>
            </div>
            <div className="mt-3">
              <label className={label}>Alternate Address</label>
              <input value={f.alternateAddress} onChange={e => setF(v => ({ ...v, alternateAddress: e.target.value }))}
                placeholder="Where you can be reached" className={input} />
            </div>
          </div>

          <div className={clsx('grid grid-cols-1 sm:grid-cols-2 gap-3', isClaim && 'hidden')}>
            <div>
              <label className={label}>Comment</label>
              <input value={f.reason} onChange={e => setF(v => ({ ...v, reason: e.target.value }))}
                placeholder="Reason for the leave" className={input} />
            </div>
            <div>
              <label className={label}>Supporting Document</label>
              <label className="flex items-center gap-2 text-sm border border-dashed border-gray-300 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-gray-50">
                <Paperclip size={14} className="text-gray-400 shrink-0" />
                <span className="truncate text-gray-600">{file ? file.name : 'Attach a file'}</span>
                <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {file && (
                <button onClick={() => setFile(null)} className="text-[11px] text-gray-400 hover:text-red-600 mt-1">Remove</button>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
          <button onClick={onClose} className="text-sm px-3.5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-white">Cancel</button>
          <button onClick={save} disabled={!valid || saving}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            {saving && <Loader size={14} className="animate-spin" />} {plan ? 'Save Plan' : isClaim ? 'Submit Claim' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cancel Leave ──────────────────────────────────────────────────────────────
function CancelLeaveModal({ req, busy, onClose, onConfirm }: {
  req: LeaveRequestItem; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const planned = req.status === 'DRAFT';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">{planned ? 'Remove Plan' : 'Cancel Leave'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded"><X size={18} /></button>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-600">
            {planned ? 'Remove this planned leave?' : 'Cancel this leave request?'}
          </p>
          <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-sm">
            <p className="font-medium text-gray-800">{req.leaveType} · {describeLeaveDays(req)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {format(parseKey(req.startDate), 'dd MMM yyyy')} – {format(parseKey(req.endDate), 'dd MMM yyyy')}
            </p>
          </div>
          {req.status === 'APPROVED' && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
              This leave is already approved — cancelling returns the days to your balance and clears the
              day from your attendance and the team calendar.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
          <button onClick={onClose} className="text-sm px-3.5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-white">Keep it</button>
          <button onClick={onConfirm} disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            {busy && <Loader size={14} className="animate-spin" />} {planned ? 'Remove' : 'Cancel Leave'}
          </button>
        </div>
      </div>
    </div>
  );
}
