'use client';

/**
 * Settings → Workspace flow (docs/WORKSPACE_FLOWS.md, "Changing the flow").
 *
 * Which of the two ways of running the firm this organisation uses, and the only door between
 * them. Each flow's work is its own — every project/client row carries the flow it was made in —
 * so switching HIDES one flow's work and shows the other's; it converts nothing. What it does
 * change is the firm's settings (the flow, who holds Team Capacity, the time mode), and that is
 * still deliberate rather than a toggle: preflight, then a confirmation a person has to mean, then
 * the conversion itself, which checks that not one row of work moved before it commits.
 *
 * This card is the one screen that names a flow at all. It is behind user.manage_access, and the
 * people who reach it are the only people who know the two flows exist; nothing else in the app
 * says which flow a piece of work belongs to.
 *
 * The three steps are the API's, not this card's: `preflight` is the conversion run as a dry run
 * and rolled back, so what is listed here is exactly what will run. Nothing is computed twice.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Check, FolderKanban, Loader, ShieldCheck, Users } from 'lucide-react';
import { api, type ConversionReport, type OrgSummary, type WorkspaceFlow, type WorkspaceFlowState } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { formatDateTimeIST } from '@/lib/date';

const FLOWS: { flow: WorkspaceFlow; title: string; icon: typeof Users; blurb: string; bullets: string[] }[] = [
  {
    flow: 'PROJECTS',
    title: 'Projects',
    icon: FolderKanban,
    blurb: 'Work is a project with rounds under a PID. An authority mints the number and everyone else requests one from the pool.',
    bullets: [
      'PIDs, generated and requested',
      'The patent portal and its client ledger',
      'Time by stopwatch or by hand, your choice',
      'Billable decided on each time entry',
      'Team Capacity open to everybody',
    ],
  },
  {
    flow: 'CLIENTS',
    title: 'Clients',
    icon: Users,
    blurb: 'Work is a client, filed in a client group, holding task groups. The CID is issued the moment the client is created.',
    bullets: [
      'CIDs issued automatically, with a ledger',
      'No patent portal',
      'Time written down once a day',
      'Billable decided on the task; time follows it',
      'Team Capacity for the delivery ladder and HR, with task CRUD',
    ],
  },
];

export function WorkspaceFlowCard({ org }: { org: OrgSummary }) {
  const { can } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const editable = can('user.manage_access');

  const { data: state, isLoading } = useQuery<WorkspaceFlowState>({
    queryKey: ['workspace-flow', org.id],
    queryFn: () => api.orgs.workspaceFlow(org.id),
    enabled: editable,
    staleTime: 30_000,
  });

  // The conversion in progress: which flow, the preflight it produced, and what the person has
  // agreed to. Cleared on cancel and on success, so a second conversion starts from nothing.
  const [target, setTarget] = useState<WorkspaceFlow | null>(null);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [busy, setBusy] = useState<'preflight' | 'convert' | null>(null);
  const [typed, setTyped] = useState('');
  const [backup, setBackup] = useState(false);
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const current = state?.flow ?? (org.workspaceFlow === 'CLIENTS' ? 'CLIENTS' : 'PROJECTS');
  const inUse = state?.inUse.any ?? true;

  function close() {
    setTarget(null); setReport(null); setTyped(''); setBackup(false); setNote(''); setFailure(null);
  }

  async function beginPreflight(to: WorkspaceFlow) {
    setTarget(to); setReport(null); setTyped(''); setBackup(false); setNote(''); setFailure(null);
    setBusy('preflight');
    try {
      setReport(await api.orgs.workspaceFlowPreflight(org.id, to));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not work out what would change.');
    } finally { setBusy(null); }
  }

  async function convert() {
    if (!target) return;
    setBusy('convert'); setFailure(null);
    try {
      const done = await api.orgs.workspaceFlowConvert(org.id, { to: target, confirm: typed, backupTaken: backup, note: note.trim() || undefined });
      // The whole application changes shape. Everything cached was read under the old flow.
      await qc.invalidateQueries();
      toast(`Converted to ${done.to === 'CLIENTS' ? 'Clients' : 'Projects'}. Reload any other tab that is open.`, 'success');
      close();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'The conversion did not run. Nothing was changed.');
    } finally { setBusy(null); }
  }

  const blocked = (report?.blockers.length ?? 0) > 0;
  const ready = !!report && !blocked && (!inUse || backup) && typed === (state?.name ?? org.name);

  return (
    <div className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Workspace flow</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          How this firm runs. It decides what the work is called, how its number is issued, and which modules exist at all.
          Each flow keeps its own work: switching hides one flow’s projects or clients and shows the other’s, and switching back shows them again, unchanged.
          {state?.changedAt && <> Chosen {formatDateTimeIST(state.changedAt)}.</>}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FLOWS.map(f => {
          const active = current === f.flow;
          const Icon = f.icon;
          return (
            <div key={f.flow} className={clsx('rounded-xl border p-4 transition-colors', active ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500' : 'border-gray-200')}>
              <div className="mb-2 flex items-center gap-2">
                <Icon size={16} className={active ? 'text-brand-600' : 'text-gray-400'} />
                <h3 className="text-sm font-semibold text-gray-900">{f.title}</h3>
                {active && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    <Check size={10} /> In use
                  </span>
                )}
              </div>
              <p className="text-[13px] leading-relaxed text-gray-600">{f.blurb}</p>
              <ul className="mt-2.5 space-y-1">
                {f.bullets.map(b => (
                  <li key={b} className="flex gap-1.5 text-[12px] text-gray-500">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-300" />{b}
                  </li>
                ))}
              </ul>
              {!active && editable && state?.canConvert && (
                <button
                  onClick={() => beginPreflight(f.flow)}
                  disabled={!!busy}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-brand-700 ring-1 ring-inset ring-brand-600/30 hover:bg-brand-50 disabled:opacity-50"
                >
                  {busy === 'preflight' && target === f.flow ? <Loader size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                  Convert to {f.title}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editable && !isLoading && state && !state.canConvert && (
        <p className="text-[12px] text-gray-400">Only a Super Admin can change the workspace flow.</p>
      )}
      {!editable && <p className="text-[12px] text-gray-400">Only an administrator can see or change this.</p>}

      {(state?.history.length ?? 0) > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Conversions</p>
          <ul className="space-y-1">
            {state!.history.slice(0, 4).map(h => (
              <li key={h.id} className="text-[12px] tabular-nums text-gray-500">
                {formatDateTimeIST(h.changedAt)} · {h.fromFlow.toLowerCase()} → {h.toFlow.toLowerCase()} · {h.changedByName}
                {h.verified
                  ? <span className="ml-1 text-emerald-700">verified</span>
                  : <span className="ml-1 text-amber-700">not verified</span>}
                {h.note && <span className="text-gray-400"> · {h.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && close()} />
          <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                Convert this firm to {target === 'CLIENTS' ? 'Clients' : 'Projects'}
              </h3>
              <p className="mt-0.5 text-[13px] text-gray-500">
                This changes the firm’s settings, not its work. Everything below runs as one transaction, and it is checked before it commits. If a check fails, nothing changes.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {busy === 'preflight' && (
                <p className="flex items-center gap-2 text-[13px] text-gray-500"><Loader size={14} className="animate-spin" /> Working out what would change…</p>
              )}

              {report && (
                <>
                  <p className="text-[13px] text-gray-600">
                    {report.inUse
                      ? (() => {
                          const w = report.survey.work;
                          const leaving = report.from === 'CLIENTS' ? 'client' : 'project';
                          const arriving = report.to === 'CLIENTS' ? 'client' : 'project';
                          const kept = w.liveProjects[report.from];
                          const waiting = w.liveProjects[report.to];
                          return <>
                            The {kept} live {leaving}{kept === 1 ? '' : 's'} in use now, with {w.tasks[report.from]} tasks and {w.timesheets[report.from]} timesheet entries, stay exactly as they are — out of sight until the firm switches back.{' '}
                            {waiting
                              ? <>The {waiting} live {arriving}{waiting === 1 ? '' : 's'} kept from before will be in use again.</>
                              : <>There are no {arriving}s yet; the module starts empty.</>}
                          </>;
                        })()
                      : <>Nothing has been created yet, so there is nothing to hide — this is just the choice.</>}
                  </p>

                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">What would change</p>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                      {report.steps.map(s => (
                        <li key={s.key} className="flex items-start gap-3 px-3 py-2 text-[13px]">
                          <span className={clsx('w-10 shrink-0 text-right font-semibold tabular-nums', s.changed ? 'text-gray-900' : 'text-gray-300')}>{s.changed}</span>
                          <span className="text-gray-600">{s.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      What is checked afterwards {report.verification.ok
                        ? <span className="text-emerald-700">— all pass on the dry run</span>
                        : <span className="text-rose-700">— something does not hold</span>}
                    </p>
                    <ul className="space-y-1">
                      {report.verification.invariants.map(i => (
                        <li key={i.key} className="flex items-start gap-2 text-[12.5px]">
                          {i.ok
                            ? <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                            : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-rose-600" />}
                          <span className={i.ok ? 'text-gray-600' : 'text-rose-800'}>
                            {i.label}{!i.ok && <> — {i.found} found{i.examples?.length ? `: ${i.examples.slice(0, 5).join(', ')}` : ''}</>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {blocked && (
                    <div className="rounded-lg bg-rose-50 p-3 text-[12.5px] text-rose-900 ring-1 ring-inset ring-rose-200">
                      <p className="font-semibold">This cannot be converted as it stands:</p>
                      <ul className="mt-1 space-y-0.5">
                        {report.blockers.map(b => (
                          <li key={b.code}>· {b.message}{b.examples?.length ? ` (${b.examples.slice(0, 5).join(', ')})` : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!blocked && (
                    <div className="space-y-2.5 border-t border-gray-100 pt-3">
                      {inUse && (
                        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[12.5px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                          <input type="checkbox" checked={backup} onChange={e => setBackup(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                          <span>I have taken a backup of the database. This leaves every project and client as it is, but it moves permission grants and closes running clocks, and the way back from a decision you regret is the dump.</span>
                        </label>
                      )}
                      <div>
                        <label htmlFor="wf-confirm" className="block text-[12.5px] font-medium text-gray-700">
                          Type <span className="font-semibold text-gray-900">{state?.name ?? org.name}</span> to confirm
                        </label>
                        <input
                          id="wf-confirm" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off"
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="wf-note" className="block text-[12.5px] font-medium text-gray-700">Why (kept with the record)</label>
                        <input
                          id="wf-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {failure && (
                <p className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-900 ring-1 ring-inset ring-rose-200">{failure}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={close} disabled={busy === 'convert'} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancel</button>
              <button
                onClick={convert}
                disabled={!ready || !!busy}
                title={ready ? undefined : 'Read what would change, acknowledge the backup and type the name first.'}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === 'convert' ? <Loader size={14} className="animate-spin" /> : null}
                Convert to {target === 'CLIENTS' ? 'Clients' : 'Projects'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
