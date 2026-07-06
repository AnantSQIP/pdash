'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  Clock, LogIn, LogOut, CalendarDays, Plane, Loader, Check, X, ChevronLeft, ChevronRight, Plus, Pencil,
} from 'lucide-react';
import {
  api, type Attendance, type AttendanceMonth, type LeaveBalance, type LeaveRequestItem, type LeaveType, type Holiday, type OrgAttendanceSummary,
} from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';

// ── status styling ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; dot: string; label: string }> = {
  PRESENT:  { bg: 'bg-green-50 border-green-200 text-green-700',  dot: 'bg-green-500',  label: 'Present' },
  ABSENT:   { bg: 'bg-red-50 border-red-200 text-red-700',        dot: 'bg-red-500',    label: 'Absent' },
  HALF_DAY: { bg: 'bg-amber-50 border-amber-200 text-amber-700',  dot: 'bg-amber-500',  label: 'Half day' },
  ON_LEAVE: { bg: 'bg-blue-50 border-blue-200 text-blue-700',     dot: 'bg-blue-500',   label: 'On leave' },
  HOLIDAY:  { bg: 'bg-purple-50 border-purple-200 text-purple-700', dot: 'bg-purple-500', label: 'Holiday' },
  WEEKEND:  { bg: 'bg-gray-50 border-gray-200 text-gray-400',     dot: 'bg-gray-300',   label: 'Weekend' },
  LATE:     { bg: 'bg-orange-50 border-orange-200 text-orange-700', dot: 'bg-orange-500', label: 'Late' },
  NONE:     { bg: 'bg-white border-dashed border-gray-200 text-gray-400', dot: 'bg-gray-300', label: 'Not marked' },
  FUTURE:   { bg: 'bg-white border-gray-100 text-gray-300',       dot: 'bg-gray-200',   label: '' },
};
const LEAVE_STATUS: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700', PENDING: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-500', DRAFT: 'bg-gray-100 text-gray-500',
};

function timeOf(s?: string | null) { return s ? new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'; }
function fmtElapsed(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Tab = 'overview' | 'leaves' | 'holidays' | 'team';

export default function AttendancePage() {
  const { org, currentUser } = useOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canTeam = can('attendance.view.organization');

  const [tab, setTab] = useState<Tab>('overview');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }; });
  const [busy, setBusy] = useState(false);
  const [regDate, setRegDate] = useState<string | null>(null);
  const year = new Date().getUTCFullYear();

  // ── queries ──
  const { data: today } = useQuery<Attendance | null>({ queryKey: ['attn-today', currentUser?.id], queryFn: () => api.attendance.today(), enabled: !!currentUser?.id, staleTime: 10_000 });
  const { data: month } = useQuery<AttendanceMonth>({ queryKey: ['attn-month', currentUser?.id, cursor.year, cursor.month], queryFn: () => api.attendance.myMonth(cursor.year, cursor.month), enabled: !!currentUser?.id, staleTime: 30_000 });
  const { data: balances = [] } = useQuery<LeaveBalance[]>({ queryKey: ['leave-balances', currentUser?.id], queryFn: () => api.leave.balances(), enabled: !!currentUser?.id, staleTime: 60_000 });
  const { data: myRequests = [] } = useQuery<LeaveRequestItem[]>({ queryKey: ['leave-mine', currentUser?.id], queryFn: () => api.leave.myRequests(), enabled: !!currentUser?.id, staleTime: 30_000 });
  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({ queryKey: ['leave-types', org?.id], queryFn: () => api.leave.types(org!.id), enabled: !!org?.id, staleTime: 5 * 60_000 });
  const { data: holidays = [] } = useQuery<Holiday[]>({ queryKey: ['holidays', org?.id, year], queryFn: () => api.leave.holidays(org!.id, year), enabled: !!org?.id, staleTime: 5 * 60_000 });

  const monthStart = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-01`;
  const monthEnd = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(new Date(cursor.year, cursor.month, 0).getDate()).padStart(2, '0')}`;
  const { data: orgSummary } = useQuery<OrgAttendanceSummary>({ queryKey: ['attn-org', org?.id, monthStart, monthEnd], queryFn: () => api.attendance.orgSummary(org!.id, monthStart, monthEnd), enabled: !!org?.id && canTeam && tab === 'team', staleTime: 30_000 });
  const { data: pending = [] } = useQuery<LeaveRequestItem[]>({ queryKey: ['leave-pending', org?.id], queryFn: () => api.leave.orgRequests(org!.id, 'PENDING'), enabled: !!org?.id && canTeam && tab === 'team', staleTime: 15_000 });

  // ── live timer while clocked-in ──
  const [, tick] = useState(0);
  useEffect(() => {
    if (today?.checkIn && !today?.checkOut) { const id = setInterval(() => tick(t => t + 1), 1000); return () => clearInterval(id); }
  }, [today?.checkIn, today?.checkOut]);

  function invalidate(...keys: string[]) { keys.forEach(k => qc.invalidateQueries({ queryKey: [k] })); }

  async function punch() {
    if (busy) return; setBusy(true);
    try { await api.attendance.punch(); invalidate('attn-today', 'attn-month', 'attn-org'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not record your punch.'); }
    finally { setBusy(false); }
  }

  const clockedIn = !!today?.checkIn && !today?.checkOut;
  const dayComplete = !!today?.checkIn && !!today?.checkOut; // clocked in AND out — locked for the day
  const elapsed = today?.checkIn ? Date.now() - new Date(today.checkIn).getTime() : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Clock size={20} className="text-brand-600" /> Attendance &amp; Leave</h1>
        <p className="text-sm text-gray-500 mt-0.5">Punch in/out, track leave balances, regularise and manage holidays</p>
        <div className="flex items-center gap-1 mt-4 overflow-x-auto">
          {([['overview', 'Overview'], ['leaves', 'Leaves'], ['holidays', 'Holidays'], ...(canTeam ? [['team', 'Team']] : [])] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0', tab === t ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>{label}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* ───────── OVERVIEW ───────── */}
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Punch card */}
              <div className="sm:col-span-2 lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Today · {format(new Date(), 'EEE, MMM d')}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{clockedIn ? fmtElapsed(elapsed) : (today?.checkOut ? 'Day complete' : 'Not clocked in')}</p>
                    <p className="text-xs text-gray-500 mt-1">In {timeOf(today?.checkIn)} · Out {timeOf(today?.checkOut)}{today?.totalHours != null ? ` · ${today.totalHours}h` : ''}</p>
                  </div>
                  <button onClick={punch} disabled={busy || dayComplete}
                    title={dayComplete ? 'You have clocked in and out — the day is complete.' : undefined}
                    className={clsx('inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed', dayComplete ? 'bg-gray-400' : clockedIn ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-600 hover:bg-brand-700')}>
                    {busy ? <Loader size={16} className="animate-spin" /> : dayComplete ? <Check size={16} /> : clockedIn ? <LogOut size={16} /> : <LogIn size={16} />}
                    {dayComplete ? 'Completed' : clockedIn ? 'Punch Out' : 'Punch In'}
                  </button>
                </div>
              </div>
              {/* Month summary */}
              <SummaryTile label="Present" value={month?.summary.present ?? 0} tint="bg-green-100 text-green-600" sub="this month" />
              <SummaryTile label="Attendance" value={`${month?.summary.attendanceRate ?? 0}%`} tint="bg-brand-50 text-brand-600" sub={`${month?.summary.onLeave ?? 0} on leave · ${month?.summary.absent ?? 0} absent`} />
            </div>

            {/* Monthly grid */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">{format(new Date(cursor.year, cursor.month - 1, 1), 'MMMM yyyy')}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCursor(c => c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
                  <button onClick={() => { const d = new Date(); setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }); }} className="px-2.5 py-1 text-xs rounded-lg bg-brand-50 text-brand-600 font-medium">Today</button>
                  <button onClick={() => setCursor(c => c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={16} /></button>
                </div>
              </div>
              <MonthGrid month={month} year={cursor.year} monthNum={cursor.month} onPick={setRegDate} />
              <p className="text-[11px] text-gray-400 mt-2">Tip: click a past day to regularise it (missed punch, WFH, client visit…).</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
                {['PRESENT', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'].map(s => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                    <span className={clsx('w-2.5 h-2.5 rounded-sm', STATUS_STYLE[s].dot)} />{STATUS_STYLE[s].label}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ───────── LEAVES ───────── */}
        {tab === 'leaves' && (
          <LeavesTab balances={balances} myRequests={myRequests} leaveTypes={leaveTypes}
            onChanged={() => invalidate('leave-mine', 'leave-balances', 'attn-month', 'attn-org')} busy={busy} setBusy={setBusy} />
        )}

        {/* ───────── HOLIDAYS ───────── */}
        {tab === 'holidays' && (
          <HolidayManager orgId={org?.id} year={year} holidays={holidays} canManage={can('holiday.manage')} />
        )}

        {/* ───────── TEAM (admin) ───────── */}
        {tab === 'team' && canTeam && (
          <TeamTab orgSummary={orgSummary} pending={pending} onReviewed={() => invalidate('leave-pending', 'attn-org')} />
        )}
      </div>

      {regDate && (
        <RegularizeModal
          date={regDate}
          onClose={() => setRegDate(null)}
          onSuccess={() => { setRegDate(null); invalidate('attn-month', 'attn-today', 'attn-org'); }}
        />
      )}
    </div>
  );
}

// ── Holidays list + (permission-gated) add/delete management ──────────────────
function HolidayManager({ orgId, year, holidays, canManage }: { orgId?: string; year: number; holidays: Holiday[]; canManage: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const inv = () => qc.invalidateQueries({ queryKey: ['holidays', orgId, year] });
  async function add() {
    if (!orgId || !name.trim() || !date) return;
    setBusy(true);
    try { await api.leave.createHoliday({ organizationId: orgId, name: name.trim(), date }); setName(''); setDate(''); inv(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed to add holiday'); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    try { await api.leave.removeHoliday(id); inv(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed to delete holiday'); }
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-2xl">
      <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Holidays · {year}</h3></div>
      <ul className="divide-y divide-gray-50">
        {holidays.length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-300">No holidays configured</li>}
        {holidays.map(h => (
          <li key={h.id} className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex flex-col items-center justify-center leading-none">
                <span className="text-[10px] uppercase">{format(new Date(h.date), 'MMM')}</span>
                <span className="text-sm font-bold">{format(new Date(h.date), 'd')}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{h.name}</p>
                <p className="text-xs text-gray-400">{format(new Date(h.date), 'EEEE')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{h.type}</span>
              {canManage && <button onClick={() => del(h.id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete holiday"><X size={14} /></button>}
            </div>
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Holiday name" className="flex-1 min-w-[8rem] px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
          <button disabled={busy || !name.trim() || !date} onClick={add} className="px-3 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Add</button>
        </div>
      )}
    </div>
  );
}

// ── small components ──────────────────────────────────────────────────────────────
function SummaryTile({ label, value, tint, sub }: { label: string; value: string | number; tint: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const REGULARIZABLE = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'NONE'];

function MonthGrid({ month, year, monthNum, onPick }: { month?: AttendanceMonth; year: number; monthNum: number; onPick?: (key: string) => void }) {
  const byDate = useMemo(() => new Map((month?.days ?? []).map(d => [d.date, d])), [month]);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstWeekday = new Date(Date.UTC(year, monthNum - 1, 1)).getUTCDay();
  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}` });

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>)}
      {cells.map((c, i) => {
        if (!c) return <div key={i} />;
        const rec = byDate.get(c.key);
        const st = STATUS_STYLE[rec?.status ?? 'FUTURE'] ?? STATUS_STYLE.FUTURE;
        const title = rec ? `${c.key}: ${STATUS_STYLE[rec.status]?.label ?? rec.status}${rec.totalHours ? ` · ${rec.totalHours}h` : ''}${rec.note ? ` · ${rec.note}` : ''}` : c.key;
        const canReg = !!onPick && REGULARIZABLE.includes(rec?.status ?? '');
        const cls = clsx('aspect-square rounded-lg border flex flex-col items-center justify-center relative', st.bg, canReg && 'cursor-pointer hover:ring-2 hover:ring-brand-300 transition');
        const inner = (
          <>
            <span className="text-sm font-medium">{c.day}</span>
            {rec?.totalHours != null && <span className="text-[9px] opacity-70">{rec.totalHours}h</span>}
            {rec?.isRegularized && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" title="Regularised" />}
          </>
        );
        return canReg
          ? <button key={i} type="button" title={`${title} · click to regularise`} onClick={() => onPick!(c.key)} className={cls}>{inner}</button>
          : <div key={i} title={title} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

// ── Regularize modal ──────────────────────────────────────────────────────────────
const REG_REASONS = ['Missed punch', 'Worked from home', 'Client visit', 'Device error', 'On duty / field work'];
const REG_STATUSES: { value: string; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'HALF_DAY', label: 'Half day' },
];

function RegularizeModal({ date, onClose, onSuccess }: { date: string; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('PRESENT');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (saving || !reason.trim()) return;
    setSaving(true); setError('');
    try {
      await api.attendance.regularizeDay({
        date,
        reason: reason.trim(),
        status,
        checkIn: checkIn ? `${date}T${checkIn}:00` : undefined,
        checkOut: checkOut ? `${date}T${checkOut}:00` : undefined,
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regularise');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center"><Pencil size={18} className="text-brand-600" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Regularise attendance</h2>
              <p className="text-xs text-gray-500">{format(new Date(`${date}T00:00:00`), 'EEEE, MMM d, yyyy')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mark as</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
              {REG_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">In (optional)</label>
              <input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Out (optional)</label>
              <input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REG_REASONS.map(r => (
                <button key={r} type="button" onClick={() => setReason(r)} className={clsx('text-[11px] px-2 py-1 rounded-full border', reason === r ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>{r}</button>
              ))}
            </div>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Explain the correction…" className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={submit} disabled={saving || !reason.trim()} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? <><Loader size={14} className="animate-spin" /> Saving…</> : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leaves tab ──────────────────────────────────────────────────────────────────
function LeavesTab({ balances, myRequests, leaveTypes, onChanged, busy, setBusy }: {
  balances: LeaveBalance[]; myRequests: LeaveRequestItem[]; leaveTypes: LeaveType[]; onChanged: () => void; busy: boolean; setBusy: (b: boolean) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });

  async function submit() {
    if (busy || !form.leaveType || !form.startDate || !form.endDate) return;
    setBusy(true);
    try { await api.leave.create(form); setShowForm(false); setForm({ leaveType: '', startDate: '', endDate: '', reason: '' }); onChanged(); } finally { setBusy(false); }
  }
  async function cancel(id: string) { setBusy(true); try { await api.leave.cancel(id); onChanged(); } finally { setBusy(false); } }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Balances */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Leave balance · {new Date().getUTCFullYear()}</h3>
          <button onClick={() => setShowForm(s => !s)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700"><Plus size={13} /> Request</button>
        </div>
        <div className="space-y-3">
          {balances.length === 0 && <p className="text-sm text-gray-300">No leave types configured</p>}
          {balances.map(b => (
            <div key={b.code}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-700">{b.name}</span>
                <span className="text-gray-400 text-xs">{b.remaining} / {b.quota} left</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.used / Math.max(1, b.quota)) * 100)}%`, backgroundColor: b.colorHex }} />
              </div>
            </div>
          ))}
        </div>
        {showForm && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2.5">
            <select value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white">
              <option value="">Select leave type…</option>
              {leaveTypes.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="text-sm border border-gray-200 rounded-lg px-2.5 py-2" />
              <input type="date" value={form.endDate} min={form.startDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="text-sm border border-gray-200 rounded-lg px-2.5 py-2" />
            </div>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason (optional)" className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2" />
            <div className="flex gap-2">
              <button onClick={submit} disabled={busy || !form.leaveType || !form.startDate || !form.endDate} className="flex-1 text-sm font-medium px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">Submit request</button>
              <button onClick={() => setShowForm(false)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* My requests */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">My leave requests</h3></div>
        <ul className="divide-y divide-gray-50">
          {myRequests.length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-300">No leave requests yet</li>}
          {myRequests.map(r => (
            <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Plane size={16} /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.leaveType} · {r.numDays} day{r.numDays > 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400">{format(new Date(r.startDate), 'MMM d')} – {format(new Date(r.endDate), 'MMM d')}{r.reason ? ` · ${r.reason}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', LEAVE_STATUS[r.status] ?? 'bg-gray-100 text-gray-500')}>{r.status}</span>
                {['PENDING', 'APPROVED'].includes(r.status) && <button onClick={() => cancel(r.id)} className="text-xs text-gray-400 hover:text-red-500">Cancel</button>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Team tab (admin) ──────────────────────────────────────────────────────────────
function TeamTab({ orgSummary, pending, onReviewed }: { orgSummary?: OrgAttendanceSummary; pending: LeaveRequestItem[]; onReviewed: () => void }) {
  const [busyId, setBusyId] = useState('');
  async function review(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    try { await (action === 'approve' ? api.leave.approve(id) : api.leave.reject(id)); onReviewed(); } finally { setBusyId(''); }
  }
  const rows = orgSummary?.rows ?? [];

  return (
    <div className="space-y-6">
      {/* Pending approvals */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Pending leave approvals</h3>
          {pending.length > 0 && <span className="text-[11px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">{pending.length}</span>}
        </div>
        <ul className="divide-y divide-gray-50">
          {pending.length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-300">No requests awaiting approval 🎉</li>}
          {pending.map(r => (
            <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar user={r.user} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.user?.firstName} {r.user?.lastName} · {r.leaveType} · {r.numDays}d</p>
                  <p className="text-xs text-gray-400">{format(new Date(r.startDate), 'MMM d')} – {format(new Date(r.endDate), 'MMM d')}{r.reason ? ` · ${r.reason}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => review(r.id, 'approve')} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"><Check size={13} /> Approve</button>
                <button onClick={() => review(r.id, 'reject')} disabled={!!busyId} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"><X size={13} /> Reject</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Org attendance summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <CalendarDays size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Team attendance · this month</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
              <th className="px-5 py-2.5">Member</th><th className="px-3 py-2.5">Present</th><th className="px-3 py-2.5">Absent</th>
              <th className="px-3 py-2.5">On leave</th><th className="px-3 py-2.5">Hours</th><th className="px-3 py-2.5 w-40">Attendance</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-300">No data</td></tr>}
              {rows.map(r => (
                <tr key={r.userId} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5"><div className="flex items-center gap-2">
                    <Avatar user={{ firstName: r.name.split(' ')[0], lastName: r.name.split(' ')[1], id: r.userId }} size={24} />
                    <span className="text-gray-800">{r.name}</span><span className="text-xs text-gray-400">{r.designation}</span>
                  </div></td>
                  <td className="px-3 py-2.5 text-green-600 font-medium">{r.present}</td>
                  <td className="px-3 py-2.5 text-red-500">{r.absent}</td>
                  <td className="px-3 py-2.5 text-blue-600">{r.onLeave}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.hoursLogged}h</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, r.attendanceRate)}%` }} /></div>
                      <span className="text-xs text-gray-500 w-9 text-right">{r.attendanceRate}%</span>
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
