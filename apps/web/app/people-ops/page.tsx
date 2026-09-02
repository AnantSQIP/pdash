'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, CalendarClock, Check, DoorOpen, Loader, ShieldAlert, UserCheck, X,
} from 'lucide-react';
import { api, type Handover, type LifecycleBoard, type LifecyclePerson } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { formatDate } from '@/lib/date';

/**
 * People Operations — probation, confirmation and leaving.
 *
 * Deliberately narrow. A firm of twenty-eight does not need an HR suite, and an HR Specialist who
 * knows everyone by name gains nothing from a headcount chart. This screen answers the two
 * questions a spreadsheet is genuinely bad at: who is due for confirmation, and what is somebody
 * still holding on the day they leave.
 */

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed:      { label: 'Confirmed',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'on-probation': { label: 'On probation',  cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  due:            { label: 'Due',           cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue:        { label: 'Overdue',       cls: 'bg-red-50 text-red-700 border-red-200' },
  unknown:        { label: 'No joining date', cls: 'bg-gray-50 text-gray-400 border-gray-200' },
};

export default function PeopleOpsPage() {
  const { can, loading } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [handoverFor, setHandoverFor] = useState<LifecyclePerson | null>(null);
  const [editing, setEditing] = useState<LifecyclePerson | null>(null);

  const { data, isLoading } = useQuery<LifecycleBoard>({
    queryKey: ['lifecycle-board'],
    queryFn: () => api.lifecycle.board(),
    enabled: can('user.update'),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['lifecycle-board'] });

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!can('user.update')) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <ShieldAlert className="mx-auto text-gray-300 mb-3" size={28} />
        <p className="text-sm text-gray-500">People operations is limited to HR and administrators.</p>
      </div>
    );
  }

  const c = data?.counts;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl font-bold text-gray-900">People Operations</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Probation and confirmation, and what somebody is still holding when they leave.
        </p>
      </header>

      {c && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="People" value={c.total} />
          <Stat label="Confirmed" value={c.confirmed} />
          <Stat label="On probation" value={c.onProbation} />
          <Stat label="Due / overdue" value={c.due + c.overdue} alert={c.due + c.overdue > 0} />
          <Stat label="Serving notice" value={c.onNotice} />
        </div>
      )}

      {/* Nothing tenure-based works without a joining date, so this is stated at the top rather
          than left for somebody to work out from an empty probation column. */}
      {!!data?.missingJoiningDate.length && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <b>{data.missingJoiningDate.length} {data.missingJoiningDate.length === 1 ? 'person has' : 'people have'} no joining date.</b>{' '}
            Probation cannot be worked out for them, and leave is granted in full rather than
            pro-rated. They are listed under <span className="font-medium">Probation &amp; confirmation</span>{' '}
            marked <span className="font-medium">No joining date</span> — open anyone to set it.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400"><Loader className="animate-spin inline mr-2" size={16} />Loading…</div>
      ) : (
        <>
          <Section
            title="Probation"
            icon={CalendarClock}
            empty="Everyone is confirmed."
            rows={data?.probation ?? []}
            render={p => (
              <Row key={p.id} person={p} onEdit={() => setEditing(p)}>
                <span className="text-xs text-gray-500 tabular-nums">
                  {p.probationEndsOn ? `ends ${formatDate(p.probationEndsOn)}` : '—'}
                  {p.daysToProbationEnd != null && p.probationStatus !== 'confirmed' && (
                    <span className={clsx('ml-1.5', p.daysToProbationEnd < 0 ? 'text-red-600' : 'text-gray-400')}>
                      ({p.daysToProbationEnd < 0
                        ? `${Math.abs(p.daysToProbationEnd)}d overdue`
                        : `in ${p.daysToProbationEnd}d`})
                    </span>
                  )}
                </span>
                <ConfirmButton person={p} onDone={refresh} />
              </Row>
            )}
          />

          <Section
            title="Leaving"
            icon={DoorOpen}
            empty="Nobody is serving notice."
            rows={data?.leaving ?? []}
            render={p => (
              <Row key={p.id} person={p} onEdit={() => setEditing(p)}>
                <span className="text-xs text-gray-500 tabular-nums">
                  last day {p.lastWorkingDay ? formatDate(p.lastWorkingDay) : '—'}
                  {p.daysToLastWorkingDay != null && (
                    <span className="ml-1.5 text-gray-400">
                      ({p.daysToLastWorkingDay < 0 ? 'passed' : `in ${p.daysToLastWorkingDay}d`})
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setHandoverFor(p)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Handover
                </button>
              </Row>
            )}
          />
        </>
      )}

      {editing && <PersonPanel person={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {handoverFor && <HandoverPanel person={handoverFor} onClose={() => setHandoverFor(null)} onDone={refresh} />}
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={clsx('rounded-xl border px-3 py-2.5 bg-white', alert ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200')}>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={clsx('text-lg font-bold tabular-nums mt-0.5', alert ? 'text-amber-700' : 'text-gray-900')}>{value}</p>
    </div>
  );
}

function Section({ title, icon: Icon, rows, render, empty }: {
  title: string; icon: typeof CalendarClock; rows: LifecyclePerson[];
  render: (p: LifecyclePerson) => React.ReactNode; empty: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Icon size={15} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <span className="text-xs text-gray-400">{rows.length}</span>
      </div>
      {rows.length === 0
        ? <p className="px-4 py-6 text-sm text-gray-400 text-center">{empty}</p>
        : <ul className="divide-y divide-gray-50">{rows.map(render)}</ul>}
    </div>
  );
}

function Row({ person, children, onEdit }: { person: LifecyclePerson; children: React.ReactNode; onEdit: () => void }) {
  const s = STATUS[person.probationStatus] ?? STATUS.unknown;
  return (
    <li className="px-4 py-3 flex items-center gap-3 flex-wrap hover:bg-gray-50">
      <Avatar user={person} size={32} />
      <button onClick={onEdit} className="min-w-0 text-left flex-1">
        <span className="block text-sm font-medium text-gray-900 truncate">{fullName(person)}</span>
        <span className="block text-xs text-gray-400 truncate">{person.designation}</span>
      </button>
      <span className={clsx('text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border', s.cls)}>
        {s.label}
      </span>
      {children}
    </li>
  );
}

function ConfirmButton({ person, onDone }: { person: LifecyclePerson; onDone: () => void }) {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: () => api.lifecycle.confirm(person.id, {}),
    onSuccess: () => { onDone(); toast(`${person.firstName} confirmed.`, 'success'); },
    onError: e => toast(msg(e), 'error'),
  });
  if (person.probationStatus === 'confirmed') return null;
  return (
    <button
      onClick={() => m.mutate()} disabled={m.isPending}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
    >
      {m.isPending ? <Loader size={11} className="animate-spin" /> : <UserCheck size={12} />} Confirm
    </button>
  );
}

/** Set the joining date / probation, or record a resignation. */
function PersonPanel({ person, onClose, onSaved }: { person: LifecyclePerson; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [joining, setJoining] = useState(person.joiningDate?.slice(0, 10) ?? '');
  const [months, setMonths] = useState(person.probationMonths?.toString() ?? '');
  const [resign, setResign] = useState(person.resignationDate?.slice(0, 10) ?? '');
  const [notice, setNotice] = useState(person.noticeDays?.toString() ?? '');
  const [reason, setReason] = useState(person.exitReason ?? '');
  const [err, setErr] = useState('');

  const saveProbation = useMutation({
    mutationFn: () => api.lifecycle.setProbation(person.id, {
      ...(joining ? { joiningDate: joining } : {}),
      ...(months !== '' ? { probationMonths: Number(months) } : {}),
    }),
    onSuccess: () => { onSaved(); toast('Saved.', 'success'); },
    onError: e => setErr(msg(e)),
  });
  const saveResign = useMutation({
    mutationFn: () => api.lifecycle.resign(person.id, {
      resignationDate: resign,
      ...(notice !== '' ? { noticeDays: Number(notice) } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    }),
    onSuccess: () => { onSaved(); toast('Resignation recorded.', 'success'); },
    onError: e => setErr(msg(e)),
  });

  return (
    <Drawer title={fullName(person)} subtitle={person.designation ?? ''} onClose={onClose}>
      <div className="p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Joining &amp; probation</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Joining date" type="date" value={joining} onChange={setJoining} />
            <Field label="Probation (months)" value={months} onChange={setMonths} placeholder="6" />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Probation ends {joining ? formatDate(new Date(new Date(joining).setMonth(new Date(joining).getMonth() + (Number(months) || 6))).toISOString()) : '—'}.
            Calculated from these two, so correcting a joining date moves it.
          </p>
          <button
            onClick={() => { setErr(''); saveProbation.mutate(); }} disabled={saveProbation.isPending}
            className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {saveProbation.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Resignation</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Resignation date" type="date" value={resign} onChange={setResign} />
            <Field label="Notice (days)" value={notice} onChange={setNotice} placeholder="60" />
          </div>
          <Field label="Reason" value={reason} onChange={setReason} placeholder="Optional" />
          <p className="text-[11px] text-gray-400 mt-1.5">
            The last working day is worked out from the notice period, so the two cannot disagree.
          </p>
          <button
            onClick={() => { setErr(''); saveResign.mutate(); }}
            disabled={saveResign.isPending || !resign}
            className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            {saveResign.isPending ? <Loader size={13} className="animate-spin" /> : <DoorOpen size={13} />} Record resignation
          </button>
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Drawer>
  );
}

/** What the person is still holding — the thing a checklist cannot produce. */
function HandoverPanel({ person, onClose, onDone }: { person: LifecyclePerson; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Handover>({
    queryKey: ['handover', person.id],
    queryFn: () => api.lifecycle.handover(person.id),
  });
  const complete = useMutation({
    mutationFn: () => api.lifecycle.completeExit(person.id),
    onSuccess: () => { onDone(); onClose(); toast('Handover signed off.', 'success'); },
    onError: e => toast(msg(e), 'error'),
  });

  return (
    <Drawer title={`Handover — ${fullName(person)}`} subtitle={person.lastWorkingDay ? `Last day ${formatDate(person.lastWorkingDay)}` : ''} onClose={onClose}>
      {isLoading || !data ? (
        <p className="p-10 text-center text-sm text-gray-400"><Loader className="animate-spin inline mr-2" size={16} />Loading…</p>
      ) : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.summary.items.map(i => (
              <div key={i.key} className={clsx('rounded-lg border px-3 py-2 flex items-center justify-between',
                i.count > 0 && i.blocking ? 'border-red-200 bg-red-50/50' : 'border-gray-200')}>
                <span className="text-xs text-gray-600">{i.label}</span>
                <span className={clsx('text-sm font-bold tabular-nums',
                  i.count > 0 && i.blocking ? 'text-red-700' : 'text-gray-900')}>{i.count}</span>
              </div>
            ))}
          </div>

          {data.projectsManaged.length > 0 && (
            <List title="Projects they manage — these need a new owner" items={data.projectsManaged.map(p =>
              `${p.code ?? 'no PID'} · ${p.title}`)} tone="red" />
          )}
          {data.clientsOwned.length > 0 && (
            <List title="Clients in their name" items={data.clientsOwned.map(c => `${c.code}${c.name ? ` · ${c.name}` : ''}`)} tone="red" />
          )}
          {data.openTasks.length > 0 && (
            <List title="Open tasks" items={data.openTasks.slice(0, 15).map(t =>
              `${t.title}${t.project ? ` — ${t.project.code ?? t.project.title}` : ''}`)} tone="red" />
          )}
          {data.unsubmittedTime.length > 0 && (
            <List title="Time logged with no PID attached" items={data.unsubmittedTime.slice(0, 10).map(t =>
              `${String(t.date).slice(0, 10)} · ${t.hoursLogged}h${t.notes ? ` · ${t.notes}` : ''}`)} tone="amber" />
          )}

          <div className="pt-3 border-t border-gray-100">
            {data.summary.clearToRelease ? (
              <p className="text-xs text-emerald-700 mb-2.5">
                Nothing is left that needs a new owner.
              </p>
            ) : (
              <p className="text-xs text-red-700 mb-2.5">
                <b>{data.summary.blockingCount} item{data.summary.blockingCount === 1 ? '' : 's'}</b> still need
                reassigning before this can be signed off.
              </p>
            )}
            <button
              onClick={() => complete.mutate()}
              disabled={complete.isPending || !data.summary.clearToRelease}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40"
            >
              {complete.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Sign off handover
            </button>
            <p className="text-[11px] text-gray-400 mt-2">
              Signing off records that the handover is done. It does not close the account — losing
              access and finishing the handover are different days, so they are separate actions.
            </p>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: 'red' | 'amber' }) {
  return (
    <div>
      <h4 className={clsx('text-[11px] uppercase tracking-wide font-semibold mb-1',
        tone === 'red' ? 'text-red-700' : 'text-amber-700')}>{title}</h4>
      <ul className="text-xs text-gray-700 space-y-0.5">
        {items.map((t, i) => <li key={i} className="truncate">· {t}</li>)}
      </ul>
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="bg-gray-50 w-full max-w-lg h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="bg-white px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 sticky top-0 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded shrink-0"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="mt-2">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
      />
    </div>
  );
}
