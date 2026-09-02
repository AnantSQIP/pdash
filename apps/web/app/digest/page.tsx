'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FileBarChart, FolderPlus, CheckCircle2, ListChecks, CalendarCheck, AlertTriangle, Activity,
  Loader, Shield, Clock, ChevronLeft, ChevronRight, ChevronDown, Timer, CalendarClock, Users,
  Truck, ExternalLink, Download, FolderKanban, CheckSquare, CircleDot,
} from 'lucide-react';
import { api, type DigestDetail, type DigestProject, type DigestTask, type DigestPersonHours } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateIST, formatDateTimeIST } from '@/lib/date';
import { projectTypeLabel, pidLabel } from '@/lib/mock-data';
import { digestCsv } from './export';

const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const pretty = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const hrs = (n: number | null | undefined) => (n == null ? '—' : `${n}h`);

const PRIORITY_TINT: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-100',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  LOW: 'bg-gray-50 text-gray-500 border-gray-200',
};

/** A number that opens. Every stat on this page is a door, not a full stop. */
function Stat({ Icon, label, value, tint, active, onClick, sub }: {
  Icon: typeof FolderPlus; label: string; value: number; tint: string;
  active?: boolean; onClick?: () => void; sub?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={clsx('text-left bg-white rounded-xl border p-4 flex items-center gap-3 w-full transition-all',
        onClick && 'hover:border-brand-400 hover:shadow-sm cursor-pointer',
        active ? 'border-brand-500 ring-2 ring-brand-100' : 'border-gray-200')}
    >
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', tint)}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 mt-1 truncate">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </Tag>
  );
}

/** A project, expanded to everything known about it, with links out to the real thing. */
function ProjectCardRow({ p }: { p: DigestProject }) {
  return (
    <div className="px-4 py-3 hover:bg-gray-50/60">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href={`/projects/${p.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline inline-flex items-center gap-1.5">
            {p.title} <ExternalLink size={12} className="text-gray-300" />
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <span className="text-[11px] font-mono font-bold text-brand-700">{pidLabel(p.pid, p.roundSeq)}</span>
            {p.type && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{projectTypeLabel(p.type)}</span>}
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.phase}</span>
            <span className={clsx('text-[11px] px-1.5 py-0.5 rounded-full border', PRIORITY_TINT[p.priority] ?? PRIORITY_TINT.LOW)}>{p.priority}</span>
            {p.client && <span className="text-[11px] text-gray-500">· {p.client}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} />
          </div>
          <span className="text-xs font-semibold text-gray-700 tabular-nums w-9 text-right">{p.progress}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-1.5 mt-2.5 text-[11px]">
        <div><span className="text-gray-400">Start</span><p className="text-gray-800">{p.startDate ? formatDate(p.startDate) : '—'}</p></div>
        <div><span className="text-gray-400">Deadline</span><p className="text-gray-800">{p.dueDate ? formatDate(p.dueDate) : '—'}</p></div>
        <div><span className="text-gray-400">Client deadline</span><p className="text-gray-800">{p.clientDueDate ? formatDate(p.clientDueDate) : '—'}</p></div>
        <div><span className="text-gray-400">Delivered</span><p className="text-gray-800">{p.clientDeliveryDate ? formatDateIST(p.clientDeliveryDate) : '—'}</p></div>
        <div><span className="text-gray-400">Working hrs</span><p className="text-gray-800">{hrs(p.workingHours)}</p></div>
        <div><span className="text-gray-400">Actual hrs</span><p className="text-gray-800">{hrs(p.actualHours)}</p></div>
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-2 text-[11px]">
        <span className="text-gray-400">Tasks <span className="text-gray-700 font-medium">{p.taskCount}</span></span>
        {p.managers.length > 0 && (
          <span className="text-gray-400">
            PM{p.managers.length > 1 ? 's' : ''}{' '}
            {p.managers.map(m => (
              <Link key={m.id} href={`/users/${m.id}`} className="text-gray-700 font-medium hover:text-brand-600 hover:underline mr-1">{m.name}</Link>
            ))}
          </span>
        )}
        {p.members.length > 0 && (
          <span className="text-gray-400 inline-flex items-center gap-1 flex-wrap">
            <Users size={11} />
            {p.members.map(m => (
              <Link key={m.id} href={`/users/${m.id}`}
                className="px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 hover:border-brand-300 hover:text-brand-600">
                {m.name}<span className="text-gray-400"> · {m.role}</span>
              </Link>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/** A task with its project, its owners and their individual hours + dates. */
function TaskCardRow({ t, showOverdue }: { t: DigestTask; showOverdue?: boolean }) {
  return (
    <div className="px-4 py-2.5 hover:bg-gray-50/60">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-900">{t.title}</span>
          <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px]">
            {t.project ? (
              <Link href={`/projects/${t.project.id}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                <span className="font-mono font-bold">{pidLabel(t.project.pid, t.project.roundSeq)}</span>
                <span className="text-gray-600">{t.project.title}</span>
                <ExternalLink size={10} className="text-gray-300" />
              </Link>
            ) : <span className="text-gray-400">No project</span>}
            {t.project?.type && <span className="px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{projectTypeLabel(t.project.type)}</span>}
            <span className={clsx('px-1.5 py-0.5 rounded-full border', PRIORITY_TINT[t.priority] ?? PRIORITY_TINT.LOW)}>{t.priority}</span>
            {t.status && <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.status}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 text-[11px]">
          <p className={clsx('font-medium', showOverdue && t.daysOverdue > 0 ? 'text-red-600' : 'text-gray-600')}>
            {t.dueDate ? formatDate(t.dueDate) : 'no deadline'}
          </p>
          {showOverdue && t.daysOverdue > 0 && <p className="text-red-500">{t.daysOverdue} day{t.daysOverdue === 1 ? '' : 's'} overdue</p>}
          {(t.estimatedHours != null || t.actualHours != null) && (
            <p className="text-gray-400">{t.estimatedHours != null ? `${t.estimatedHours}h est` : ''}{t.estimatedHours != null && t.actualHours != null ? ' · ' : ''}{t.actualHours != null ? `${t.actualHours}h actual` : ''}</p>
          )}
        </div>
      </div>
      {t.assignees.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {t.assignees.map(a => (
            <Link key={a.id} href={`/users/${a.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] text-gray-700 hover:border-brand-300 hover:text-brand-600">
              <span className="font-medium">{a.name}</span>
              <span className="text-gray-400">· {a.role}</span>
              {a.estimatedHours != null && <span className="text-gray-400">· {a.estimatedHours}h</span>}
              {a.dueDate && <span className="text-gray-400">· {formatDate(a.dueDate)}</span>}
            </Link>
          ))}
        </div>
      ) : <p className="mt-1.5 text-[11px] text-gray-400">Nobody staffed.</p>}
    </div>
  );
}

/** One person's day: total hours, and every entry behind that total. */
function PersonHoursRow({ p }: { p: DigestPersonHours }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 text-left">
        <ChevronDown size={14} className={clsx('text-gray-400 shrink-0 transition-transform', !open && '-rotate-90')} />
        <div className="min-w-0 flex-1">
          <Link href={`/users/${p.id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-gray-900 hover:text-brand-600 hover:underline">{p.name}</Link>
          {p.designation && <span className="text-[11px] text-gray-400 ml-2">{p.designation}</span>}
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{p.entries.length} entr{p.entries.length === 1 ? 'y' : 'ies'}</span>
        <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0 w-16 text-right">{p.hours}h</span>
        <span className="text-[11px] text-emerald-600 tabular-nums shrink-0 w-20 text-right">{p.billableHours}h billable</span>
      </button>
      {open && (
        <div className="bg-gray-50/60 px-4 py-2 space-y-1.5 border-t border-gray-100">
          {p.entries.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="font-semibold text-gray-700 tabular-nums w-10 shrink-0">{e.hours}h</span>
              <div className="min-w-0">
                {e.project ? (
                  <Link href={`/projects/${e.project.id}`} className="text-brand-700 hover:underline">
                    <span className="font-mono font-bold">{pidLabel(e.project.pid, e.project.roundSeq)}</span> <span className="text-gray-600">{e.project.title}</span>
                  </Link>
                ) : <span className="text-gray-400">No project</span>}
                {e.task && <span className="text-gray-500"> · {e.task.title}</span>}
                {e.notes && <p className="text-gray-400 mt-0.5">{e.notes}</p>}
              </div>
              {!e.billable && <span className="ml-auto text-gray-400 shrink-0">non-billable</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, empty, children }: {
  title: string; count: number; empty: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{count}</span>
      </div>
      {count === 0
        ? <p className="px-4 py-6 text-center text-sm text-gray-400">{empty}</p>
        : <div className="divide-y divide-gray-50">{children}</div>}
    </div>
  );
}

export default function DigestPage() {
  const { isSuperAdmin, loading } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [openSection, setOpenSection] = useState<string | null>(null);

  const { data: d, isLoading } = useQuery<DigestDetail>({
    queryKey: ['digest-detail', date], queryFn: () => api.dailyDigest.detail(date), enabled: isSuperAdmin,
    // Opened to see current state, and everything on it is written by work done on OTHER
    // screens. With only the global 30s stale window, arriving here inside that window
    // rendered the cached copy and the change you just made appeared to be missing.
    refetchOnMount: 'always',
  });
  const { data: schedule } = useQuery({ queryKey: ['digest-schedule'], queryFn: () => api.dailyDigest.getSchedule(), enabled: isSuperAdmin , refetchOnMount: 'always' });
  const [hour, setHour] = useState<number | null>(null);
  const effHour = hour ?? schedule?.hourIst ?? 22;

  async function saveHour() {
    try { await api.dailyDigest.setSchedule(effHour); qc.invalidateQueries({ queryKey: ['digest-schedule'] }); toast('Digest time updated', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not update the time', 'error'); }
  }

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  // Super Admin only — matches the server-side gate in daily-digest.module.
  if (!isSuperAdmin) return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Shield size={40} className="text-gray-300 mb-3" />
      <p className="text-gray-600 font-medium">Access restricted</p>
      <p className="text-sm text-gray-400 mt-1">The daily digest is available to Super Admins only.</p>
    </div>
  );

  const hh = (n: number) => `${String(n).padStart(2, '0')}:00`;
  const toggle = (k: string) => setOpenSection(s => (s === k ? null : k));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><FileBarChart size={20} className="text-brand-600" /> Daily digest</h1>
          <p className="text-sm text-gray-500 mt-0.5">The day&apos;s activity across the organization — every number opens.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => d && digestCsv(d)} disabled={!d}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={() => setDate(x => shift(x, -1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
          <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
          <button onClick={() => setDate(x => shift(x, 1))} disabled={date >= today} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-40"><ChevronRight size={16} /></button>
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
          <button onClick={async () => {
            try {
              const r = await api.dailyDigest.send();
              // Sending writes today's digest record — the detail panel below is now stale.
              qc.invalidateQueries({ queryKey: ['digest-detail'] });
              // A zero has two very different causes, and "sent to 0 admin(s)" hid both.
              if (r.sent > 0) {
                toast(`Digest sent to ${r.sent} admin${r.sent === 1 ? '' : 's'}`, 'success');
              } else if (r.admins === 0) {
                toast('Nobody can receive the digest — it goes to Super Admins and Admins, and none were found.', 'error');
              } else {
                toast(`Today's digest already went to all ${r.admins} admin(s).`, 'success');
              }
            } catch (e) { toast(e instanceof Error ? e.message : 'Could not send', 'error'); }
          }}
            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Send now</button>
        </div>

        {isLoading || !d ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={20} className="animate-spin mr-2" />Loading report…</div>
        ) : (
          <>
            {/* Every tile toggles the section behind it — no number here is a dead end. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat Icon={FolderPlus} label="Projects created" value={d.projectsCreated.length} tint="bg-brand-50 text-brand-600"
                active={openSection === 'created'} onClick={() => toggle('created')} />
              <Stat Icon={CheckCircle2} label="Projects completed" value={d.projectsCompleted.length} tint="bg-green-50 text-green-600"
                active={openSection === 'completed'} onClick={() => toggle('completed')} />
              <Stat Icon={ListChecks} label="Tasks completed" value={d.tasksCompleted.length} tint="bg-indigo-50 text-indigo-600"
                active={openSection === 'tasks'} onClick={() => toggle('tasks')} />
              <Stat Icon={CalendarCheck} label="Deadlines met" value={d.deadlinesMet.length} tint="bg-emerald-50 text-emerald-600"
                active={openSection === 'met'} onClick={() => toggle('met')} />
              <Stat Icon={AlertTriangle} label="Overdue tasks" value={d.overdue.length} tint="bg-red-50 text-red-600"
                active={openSection === 'overdue'} onClick={() => toggle('overdue')} />
              <Stat Icon={CalendarClock} label="Due next 5 working days" value={d.upcomingTotal} tint="bg-orange-50 text-orange-600"
                sub={d.lookaheadDays.length ? `${dayLabel(d.lookaheadDays[0])} – ${dayLabel(d.lookaheadDays[d.lookaheadDays.length - 1])}` : undefined} />
              <Stat Icon={Timer} label="Hours logged" value={d.totals.hoursLogged} tint="bg-cyan-50 text-cyan-700"
                active={openSection === 'hours'} onClick={() => toggle('hours')}
                sub={`${d.totals.billableHours}h billable · ${d.totals.peopleWhoLogged} people`} />
              <Stat Icon={Activity} label="Active projects" value={d.totals.activeProjects} tint="bg-amber-50 text-amber-600" />
            </div>

            <UpcomingPanel days={d.upcoming} total={d.upcomingTotal} />

            {openSection === 'created' && (
              <Section title="Projects created" count={d.projectsCreated.length} empty="No projects were created.">
                {d.projectsCreated.map(p => <ProjectCardRow key={p.id} p={p} />)}
              </Section>
            )}
            {openSection === 'completed' && (
              <Section title="Projects completed" count={d.projectsCompleted.length} empty="No projects were completed.">
                {d.projectsCompleted.map(p => <ProjectCardRow key={p.id} p={p} />)}
              </Section>
            )}
            {openSection === 'tasks' && (
              <Section title="Tasks completed" count={d.tasksCompleted.length} empty="No tasks were closed.">
                {d.tasksCompleted.map(t => <TaskCardRow key={t.id} t={t} />)}
              </Section>
            )}
            {openSection === 'met' && (
              <Section title="Deadlines met" count={d.deadlinesMet.length} empty="Nothing was due today.">
                {d.deadlinesMet.map(t => <TaskCardRow key={t.id} t={t} />)}
              </Section>
            )}
            {openSection === 'overdue' && (
              <Section title="Overdue tasks" count={d.overdue.length} empty="Nothing overdue 🎉">
                {d.overdue.map(t => <TaskCardRow key={t.id} t={t} showOverdue />)}
              </Section>
            )}
            {openSection === 'hours' && (
              <Section title="Hours logged, by person" count={d.hoursByPerson.length} empty="Nobody logged time.">
                {d.hoursByPerson.map(p => <PersonHoursRow key={p.id} p={p} />)}
              </Section>
            )}

            {/* Completed projects always get their delivery record on show — it is the thing an
                admin looks up after the fact. */}
            {d.projectsCompleted.length > 0 && openSection !== 'completed' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Truck size={15} className="text-green-600" />
                  <h3 className="text-sm font-semibold text-gray-800">Delivered on this day</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {d.projectsCompleted.map(p => <ProjectCardRow key={p.id} p={p} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Coming up — next 5 working days ───────────────────────────────────────────
// The old version stacked full detail cards under a thin grey strip, five days deep, which read
// as one undifferentiated wall. This gives each day its own card with a date rail, and each item
// one tidy line that still carries the whole story: what it is, which project and PID, priority,
// deadline, hours and who is on it — every one of them a working link.

const UP_PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500', HIGH: 'bg-orange-500', MEDIUM: 'bg-amber-400', LOW: 'bg-gray-300',
};

/** "Today" / "Tomorrow" / "Mon" — people navigate the near future by name, not by date. */
function relativeDay(dateKey: string): string | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateKey}T00:00:00`);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : null;
}

function UpcomingPanel({ days, total }: { days: DigestDetail['upcoming']; total: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <CalendarClock size={15} className="text-orange-500" />
        <h3 className="text-sm font-semibold text-gray-800">Coming up</h3>
        <span className="text-[11px] text-gray-400">next 5 working days</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">{total}</span>
        <span className="ml-auto text-[11px] text-gray-400">Weekends and holidays are skipped</span>
      </div>

      {total === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-400">Nothing due in the next five working days.</p>
      ) : (
        <div className="p-3 sm:p-4 space-y-2.5">
          {days.map(day => {
            const count = day.projects.length + day.tasks.length;
            const rel = relativeDay(day.date);
            const dt = new Date(`${day.date}T00:00:00`);
            return (
              <div key={day.date}
                className={clsx('rounded-xl border overflow-hidden',
                  count === 0 ? 'border-gray-100 bg-gray-50/40' : 'border-gray-200 bg-white')}>
                <div className="flex items-stretch">
                  {/* Date rail — the day is read at a glance, not parsed out of a sentence. */}
                  <div className={clsx('w-16 sm:w-20 shrink-0 flex flex-col items-center justify-center py-3 border-r',
                    count === 0 ? 'bg-gray-50 border-gray-100' : rel === 'Today' ? 'bg-orange-50 border-orange-100' : 'bg-gray-50/80 border-gray-100')}>
                    <span className={clsx('text-[10px] font-semibold uppercase tracking-wide',
                      rel === 'Today' ? 'text-orange-600' : 'text-gray-400')}>
                      {dt.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </span>
                    <span className={clsx('text-2xl font-bold leading-tight tabular-nums',
                      count === 0 ? 'text-gray-300' : rel === 'Today' ? 'text-orange-700' : 'text-gray-800')}>
                      {dt.getDate()}
                    </span>
                    <span className="text-[10px] text-gray-400">{dt.toLocaleDateString('en-IN', { month: 'short' })}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="px-3 sm:px-4 py-2 flex items-center gap-2 flex-wrap border-b border-gray-50">
                      {rel && (
                        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                          rel === 'Today' ? 'bg-orange-100 text-orange-700' : 'bg-brand-50 text-brand-700')}>{rel}</span>
                      )}
                      <span className="text-xs font-medium text-gray-500">
                        {count === 0 ? 'Clear'
                          : [day.projects.length && `${day.projects.length} project${day.projects.length === 1 ? '' : 's'}`,
                             day.tasks.length && `${day.tasks.length} task${day.tasks.length === 1 ? '' : 's'}`]
                            .filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    {count === 0 ? (
                      <p className="px-3 sm:px-4 py-3 text-xs text-gray-400">Nothing due.</p>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {day.projects.map(p => <UpcomingProject key={p.id} p={p} />)}
                        {day.tasks.map(t => <UpcomingTask key={t.id} t={t} />)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Small shared bits so a project row and a task row line up with each other. */
function PidChip({ pid, roundSeq }: { pid: string | null; roundSeq?: number }) {
  if (!pid) return null;
  return <span className="text-[11px] font-mono font-bold text-brand-700 shrink-0">{pidLabel(pid, roundSeq)}</span>;
}
function PersonChip({ id, name, note }: { id: string; name: string; note?: string }) {
  return (
    <Link href={`/users/${id}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] text-gray-700 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/40 transition-colors">
      <span className="font-medium">{name}</span>
      {note && <span className="text-gray-400">· {note}</span>}
    </Link>
  );
}

function UpcomingProject({ p }: { p: DigestProject }) {
  return (
    <li className="px-3 sm:px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
      <div className="flex items-start gap-2.5">
        <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5" title="Project deadline">
          <FolderKanban size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link href={`/projects/${p.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline">
              {p.title}
            </Link>
            <PidChip pid={p.pid} roundSeq={p.roundSeq} />
            <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', UP_PRIORITY_DOT[p.priority] ?? UP_PRIORITY_DOT.LOW)} title={`${p.priority} priority`} />
            <span className="text-[11px] text-gray-400">{p.priority.toLowerCase()}</span>
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-[11px] text-gray-500">
            {p.type && <span className="text-indigo-600">{projectTypeLabel(p.type)}</span>}
            <span>{p.phase}</span>
            {p.client && <span>{p.client}</span>}
            <span>{p.taskCount} task{p.taskCount === 1 ? '' : 's'}</span>
            {p.clientDueDate && <span>client {formatDate(p.clientDueDate)}</span>}
            {(p.workingHours != null || p.actualHours != null) && (
              <span>{p.workingHours != null ? `${p.workingHours}h working` : ''}{p.workingHours != null && p.actualHours != null ? ' · ' : ''}{p.actualHours != null ? `${p.actualHours}h actual` : ''}</span>
            )}
          </div>
          {(p.managers.length > 0 || p.members.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {p.managers.map(m => <PersonChip key={m.id} id={m.id} name={m.name} note="PM" />)}
              {p.members.map(m => <PersonChip key={m.id} id={m.id} name={m.name} note={m.role} />)}
            </div>
          )}
        </div>
        {/* Progress sits on the right where the eye can compare it down the column. */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-gray-600 tabular-nums w-8 text-right">{p.progress}%</span>
        </div>
      </div>
    </li>
  );
}

function UpcomingTask({ t }: { t: DigestTask }) {
  return (
    <li className="px-3 sm:px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
      <div className="flex items-start gap-2.5">
        <span className="w-6 h-6 rounded-md bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 mt-0.5" title="Task deadline">
          <CheckSquare size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            {/* A task has no page of its own — everywhere in the app it opens its project. */}
            {t.project ? (
              <Link href={`/projects/${t.project.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-600 hover:underline">
                {t.title}
              </Link>
            ) : <span className="text-sm font-medium text-gray-900">{t.title}</span>}
            <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', UP_PRIORITY_DOT[t.priority] ?? UP_PRIORITY_DOT.LOW)} title={`${t.priority} priority`} />
            <span className="text-[11px] text-gray-400">{t.priority.toLowerCase()}</span>
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-[11px] text-gray-500">
            {t.project ? (
              <Link href={`/projects/${t.project.id}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                <PidChip pid={t.project.pid} roundSeq={t.project.roundSeq} />
                <span>{t.project.title}</span>
                <ExternalLink size={9} className="text-gray-300" />
              </Link>
            ) : <span className="text-gray-400">No project</span>}
            {t.project?.type && <span className="text-indigo-600">{projectTypeLabel(t.project.type)}</span>}
            {t.status && <span>{t.status}</span>}
            {(t.estimatedHours != null || t.actualHours != null) && (
              <span>{t.estimatedHours != null ? `${t.estimatedHours}h est` : ''}{t.estimatedHours != null && t.actualHours != null ? ' · ' : ''}{t.actualHours != null ? `${t.actualHours}h actual` : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {t.assignees.length > 0 ? t.assignees.map(a => (
              <PersonChip key={a.id} id={a.id} name={a.name}
                note={[a.role, a.estimatedHours != null ? `${a.estimatedHours}h` : null].filter(Boolean).join(' · ')} />
            )) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                <CircleDot size={10} /> Nobody staffed
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
