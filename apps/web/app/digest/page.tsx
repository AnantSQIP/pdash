'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileBarChart, FolderPlus, CheckCircle2, ListChecks, CalendarCheck, AlertTriangle, Activity, Loader, Shield, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';

const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const pretty = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function Stat({ Icon, label, value, tint }: { Icon: typeof FolderPlus; label: string; value: number; tint: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tint}`}><Icon size={20} /></div>
      <div><p className="text-2xl font-bold text-gray-900 leading-none tabular-nums">{value}</p><p className="text-xs text-gray-500 mt-1">{label}</p></div>
    </div>
  );
}

export default function DigestPage() {
  const { can, isSuperAdmin, loading } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const isAdmin = isSuperAdmin || can('user.manage_access');

  const { data: report, isLoading } = useQuery({ queryKey: ['digest-report', date], queryFn: () => api.dailyDigest.report(date), enabled: isAdmin });
  const { data: schedule } = useQuery({ queryKey: ['digest-schedule'], queryFn: () => api.dailyDigest.getSchedule(), enabled: isAdmin });
  const [hour, setHour] = useState<number | null>(null);
  const effHour = hour ?? schedule?.hourIst ?? 22;

  async function saveHour() {
    try { await api.dailyDigest.setSchedule(effHour); qc.invalidateQueries({ queryKey: ['digest-schedule'] }); toast('Digest time updated', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not update the time', 'error'); }
  }

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Shield size={40} className="text-gray-300 mb-3" />
      <p className="text-gray-600 font-medium">Access restricted</p>
      <p className="text-sm text-gray-400 mt-1">The daily digest is available to administrators only.</p>
    </div>
  );

  const hh = (n: number) => `${String(n).padStart(2, '0')}:00`;

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><FileBarChart size={20} className="text-brand-600" /> Daily digest</h1>
          <p className="text-sm text-gray-500 mt-0.5">The day’s activity across the organization</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => shift(d, -1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
          <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
          <button onClick={() => setDate(d => shift(d, 1))} disabled={date >= new Date().toISOString().slice(0, 10)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        <p className="text-sm font-medium text-gray-700">{pretty(date)}</p>

        {/* Editable send time */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
          <Clock size={16} className="text-brand-600" />
          <span className="text-sm text-gray-700">Send the digest to admins daily at</span>
          <select value={effHour} onChange={e => setHour(Number(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hh(i)} IST</option>)}
          </select>
          <button onClick={saveHour} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700">Save</button>
          <button onClick={async () => { try { const r = await api.dailyDigest.send(); toast(`Digest sent to ${r.sent} admin(s)`, 'success'); } catch { toast('Could not send', 'error'); } }}
            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Send now</button>
        </div>

        {isLoading || !report ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={20} className="animate-spin mr-2" />Loading report…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Stat Icon={FolderPlus} label="Projects created" value={report.projectsCreated.length} tint="bg-brand-50 text-brand-600" />
              <Stat Icon={CheckCircle2} label="Projects completed" value={report.projectsCompleted.length} tint="bg-green-50 text-green-600" />
              <Stat Icon={ListChecks} label="Tasks completed" value={report.tasksCompleted} tint="bg-indigo-50 text-indigo-600" />
              <Stat Icon={CalendarCheck} label="Deadlines met" value={report.deadlinesMetToday} tint="bg-emerald-50 text-emerald-600" />
              <Stat Icon={AlertTriangle} label="Overdue tasks" value={report.overdueCount} tint="bg-red-50 text-red-600" />
              <Stat Icon={Activity} label="Active projects" value={report.activeProjects} tint="bg-amber-50 text-amber-600" />
            </div>

            <Section title="Projects created" isEmpty={report.projectsCreated.length === 0} empty="No projects were created.">
              {report.projectsCreated.map((p, i) => <Row key={i} left={p.code ?? 'PID pending'} right={p.title} />)}
            </Section>
            <Section title="Projects completed" isEmpty={report.projectsCompleted.length === 0} empty="No projects were completed.">
              {report.projectsCompleted.map((p, i) => <Row key={i} left={p.code ?? ''} right={p.title} />)}
            </Section>
            <Section title={`Overdue tasks (${report.overdueCount})`} isEmpty={report.overdueCount === 0} empty="Nothing overdue 🎉">
              {report.overdueSample.map((t, i) => <Row key={i} left={t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'} right={t.title} danger />)}
              {report.overdueCount > report.overdueSample.length && <p className="px-4 py-2 text-xs text-gray-400">+{report.overdueCount - report.overdueSample.length} more…</p>}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, empty, isEmpty, children }: { title: string; empty: string; isEmpty: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-800">{title}</h3></div>
      {isEmpty ? <p className="px-4 py-6 text-center text-sm text-gray-400">{empty}</p> : <div className="divide-y divide-gray-50">{children}</div>}
    </div>
  );
}
function Row({ left, right, danger }: { left: string; right: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className={`text-xs font-mono shrink-0 w-24 ${danger ? 'text-red-500' : 'text-gray-500'}`}>{left}</span>
      <span className="text-sm text-gray-800 truncate">{right}</span>
    </div>
  );
}
