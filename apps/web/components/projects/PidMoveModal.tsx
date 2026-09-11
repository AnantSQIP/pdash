'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Check, Hash, Loader, Merge, Scissors, X } from 'lucide-react';
import { api, type PidMoveMode, type PidMoveTarget } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

/**
 * Changing the Project ID a piece of work is filed under.
 *
 * One modal for three operations, because to the person opening it they are one thought — "this
 * project's PID is wrong" — and which of the three it turns out to be depends on facts they
 * already know (is something else sharing this number, does the right number already exist) rather
 * than on a decision they want to make:
 *
 *   MOVE / SPLIT  — the project takes a number of its own: a freshly minted one, or one typed by
 *                   hand. Called a SPLIT when something else is sharing the number today, because
 *                   that is what leaving does to the projects left behind.
 *   MERGE         — the project moves under an existing number as its next round.
 *
 * WHY THIS SCREEN IS MOSTLY A PREVIEW
 *
 * A PID is on invoices, in client email, and in reports that have already been sent. Moving one is
 * not undone by moving it back: the number left behind is retired the moment it empties, and
 * retired numbers are never issued again — deliberately, because reissuing one would put two
 * unrelated matters under a single identifier. A move also renumbers OTHER people's projects: the
 * rounds left behind close ranks so that "project 2 of 3" goes on meaning something.
 *
 * None of that is visible in a number. So the modal asks the server what the move would do and
 * shows the answer — which number is given up, which is taken, whether the old one is retired, and
 * every other project whose round number changes — and the button stays disabled until that
 * question has been answered. Fewer clicks would be easy; being able to read the consequence is
 * what actually matters here.
 *
 * The preview comes from the SAME plan the move itself runs, so what is shown and what happens
 * cannot drift apart.
 */
export function PidMoveModal({ projectId, projectTitle, currentPid, onClose, onMoved }: {
  projectId: string;
  projectTitle: string;
  /** The PID the project carries now — shown before the preview lands. */
  currentPid: string | null;
  onClose: () => void;
  onMoved?: (toPid: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  /** OWN = take a number of its own; MERGE = move under another project's. */
  const [intent, setIntent] = useState<'OWN' | 'MERGE'>('OWN');
  /** For OWN: mint the next number, or use one typed by hand. */
  const [source, setSource] = useState<'MINT' | 'TYPED'>('MINT');
  const [typed, setTyped] = useState('');
  const [intoProjectId, setIntoProjectId] = useState('');

  // The typed PID is debounced before it is previewed: every keystroke of "SQ_26_27_0" is a
  // different, mostly nonsensical number, and previewing each one turns a considered decision into
  // a flicker of red error messages.
  const [debouncedTyped, setDebouncedTyped] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTyped(typed.trim()), 400);
    return () => clearTimeout(t);
  }, [typed]);

  const { data: targets = [], isLoading: loadingTargets } = useQuery({
    queryKey: ['pid-move-targets', projectId],
    queryFn: () => api.projects.pidMoveTargets(projectId),
    staleTime: 60_000,
  });

  /**
   * Whether anything else is filed under this project's number.
   *
   * Asked FIRST, and separately, because it decides which of the three operations leaving is: a
   * project that shares its number SPLITS out of the group, and one that does not is simply
   * REASSIGNED. The server refuses the wrong one on purpose ("there is nothing to split this
   * from" is worth being told), so guessing here and correcting on the response would flash a
   * refusal at somebody who had done nothing wrong.
   */
  const { data: group, isLoading: loadingGroup } = useQuery({
    queryKey: ['project-rounds', projectId],
    queryFn: () => api.projects.rounds(projectId),
  });
  const sharing = (group?.rounds.length ?? 1) > 1;
  const mode: PidMoveMode = intent === 'MERGE' ? 'MERGE' : sharing ? 'SPLIT' : 'REASSIGN';

  const pidArg = intent === 'OWN' && source === 'TYPED' ? debouncedTyped : undefined;
  const intoArg = intent === 'MERGE' ? intoProjectId : undefined;
  // Nothing to preview until the destination is actually chosen: a merge with no project picked,
  // or a typed number still being typed, would only produce an error the person has not earned yet.
  const ready = !loadingGroup
    && (intent === 'OWN' ? (source === 'MINT' || debouncedTyped.length > 0) : intoProjectId.length > 0);

  const { data: preview, isFetching, error } = useQuery({
    queryKey: ['pid-move-preview', projectId, mode, pidArg ?? '', intoArg ?? ''],
    queryFn: () => api.projects.pidMovePreview(projectId, { mode, pid: pidArg, intoProjectId: intoArg }),
    enabled: ready,
    retry: false,
  });

  const move = useMutation({
    mutationFn: () => {
      if (mode === 'MERGE') return api.projects.mergePid(projectId, { intoProjectId });
      if (mode === 'SPLIT') return api.projects.splitPid(projectId, pidArg);
      return api.projects.reassignPid(projectId, pidArg);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-rounds', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['pid-ledger'] });
      qc.invalidateQueries({ queryKey: ['pid-move-targets'] });
      toast(`Moved from ${r.fromPid} to ${r.toPid}`, 'success');
      onMoved?.(r.toPid);
      onClose();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not change the Project ID', 'error'),
  });

  const busy = move.isPending;
  const plan = preview && preview.ok ? preview : null;
  const refusal = preview && !preview.ok ? preview.message : null;
  const ok = plan !== null;
  // A malformed typed PID is rejected by the server as a plain error rather than a refusal, so it
  // arrives here instead of in the preview body. Both are the same thing to read.
  const problem = refusal ?? (error instanceof Error ? error.message : null);

  const fromPid = preview?.fromPid ?? currentPid;
  const chosenTarget: PidMoveTarget | undefined = useMemo(
    () => targets.find(t => t.rounds.some(r => r.id === intoProjectId)),
    [targets, intoProjectId],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Hash size={18} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Change Project ID</h2>
              <p className="text-xs text-gray-400 truncate">{projectTitle}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Where it stands today. Shown first because every decision below is relative to it. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Filed under now</h3>
            <div className="flex items-center gap-3 flex-wrap px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-200">
              <span className="font-mono text-sm font-semibold text-gray-900">{fromPid ?? 'No Project ID'}</span>
              {group && (
                <span className="text-xs text-gray-500">
                  {sharing
                    ? `project ${group.rounds.find(r => r.id === projectId)?.roundSeq ?? 1} of ${group.rounds.length} under this number`
                    : 'the only project under this number'}
                </span>
              )}
            </div>
          </section>

          {/* The destination. Two choices, because a third that did the same thing under a different
              name would only make the person wonder which one they wanted. */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Move it to</h3>

            <Choice
              selected={intent === 'OWN'}
              onSelect={() => setIntent('OWN')}
              icon={<Scissors size={15} />}
              title={sharing ? 'A Project ID of its own' : 'A different Project ID'}
              subtitle={sharing
                ? 'This project stops sharing its number. The ones left behind are renumbered.'
                : 'The number on this project is wrong and it should be filed under another one.'}
            >
              <div className="space-y-2 pt-1">
                <Radio
                  name="pid-source" checked={source === 'MINT'} onChange={() => setSource('MINT')}
                  label="Mint the next Project ID"
                  hint={preview?.mintPreview ? `Would issue ${preview.mintPreview}` : 'The next number in this financial year'}
                />
                <Radio
                  name="pid-source" checked={source === 'TYPED'} onChange={() => setSource('TYPED')}
                  label="Use a specific Project ID"
                  hint="A number that exists and has never been used"
                />
                {source === 'TYPED' && (
                  <input
                    autoFocus
                    value={typed}
                    onChange={e => setTyped(e.target.value.toUpperCase())}
                    placeholder="SQ_26_27_012"
                    className="w-full font-mono px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                )}
              </div>
            </Choice>

            <Choice
              selected={intent === 'MERGE'}
              onSelect={() => setIntent('MERGE')}
              icon={<Merge size={15} />}
              title="Under another project's Project ID"
              subtitle="Two numbers were issued for what is really one matter. This project becomes the next project under that number."
            >
              {loadingTargets ? (
                <p className="text-xs text-gray-400 py-1">Looking for Project IDs…</p>
              ) : targets.length === 0 ? (
                <p className="text-xs text-gray-500 py-1">
                  No other Project ID in this financial year holds live work, so there is nothing to merge under.
                </p>
              ) : (
                <select
                  value={intoProjectId}
                  onChange={e => setIntoProjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
                >
                  <option value="">Choose the project to file this under…</option>
                  {targets.map(t => (
                    <optgroup key={t.pid} label={`${t.pid}${t.client ? ` — ${t.client}` : ''}`}>
                      {t.rounds.map(r => (
                        <option key={r.id} value={r.id} disabled={r.id === projectId}>
                          {t.pid} · project {r.roundSeq} — {r.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {chosenTarget && (
                <p className="text-[11px] text-gray-500 pt-1.5">
                  {chosenTarget.pid} already holds {chosenTarget.rounds.length}{' '}
                  {chosenTarget.rounds.length === 1 ? 'project' : 'projects'}
                  {chosenTarget.client ? ` for ${chosenTarget.client}` : ''}.
                </p>
              )}
            </Choice>
          </section>

          {/* The consequence. The reason this modal exists. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">What will happen</h3>

            {!ready ? (
              <p className="text-sm text-gray-400 px-3.5 py-3 rounded-xl border border-dashed border-gray-200">
                Choose where the project should go.
              </p>
            ) : problem ? (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-red-50 border border-red-100">
                <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{problem}</p>
              </div>
            ) : isFetching || !plan ? (
              <p className="flex items-center gap-2 text-sm text-gray-400 px-3.5 py-3">
                <Loader size={14} className="animate-spin" /> Working out what this would do…
              </p>
            ) : (
              <div className="space-y-3 px-3.5 py-3.5 rounded-xl bg-brand-50/60 border border-brand-100">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono text-sm text-gray-500 line-through">{plan.fromPid}</span>
                  <ArrowRight size={14} className="text-gray-400" />
                  <span className="font-mono text-sm font-semibold text-gray-900">{plan.toPid}</span>
                  {plan.mintsNewPid && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white text-brand-700 border border-brand-200">
                      newly minted
                    </span>
                  )}
                </div>

                <ul className="space-y-1.5 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <Check size={15} className="text-brand-600 shrink-0 mt-0.5" />
                    <span>
                      {plan.mode === 'MERGE'
                        ? <>&ldquo;{projectTitle}&rdquo; becomes <strong>project {plan.newRoundSeq} of {plan.targetTotal}</strong> under {plan.toPid}.</>
                        : <>&ldquo;{projectTitle}&rdquo; becomes the <strong>first and only project</strong> under {plan.toPid}.</>}
                    </span>
                  </li>

                  <li className="flex gap-2">
                    <Check size={15} className="text-brand-600 shrink-0 mt-0.5" />
                    {plan.retiresFromPid ? (
                      <span>
                        <strong className="font-mono">{plan.fromPid}</strong> is left holding nothing and is{' '}
                        <strong>retired</strong>. It stays in the PID ledger and is never issued to anything else.
                      </span>
                    ) : (
                      <span>
                        <strong className="font-mono">{plan.fromPid}</strong> keeps {plan.sourceRemaining}{' '}
                        {plan.sourceRemaining === 1 ? 'project' : 'projects'} and stays in use.
                      </span>
                    )}
                  </li>

                  <li className="flex gap-2">
                    <Check size={15} className="text-brand-600 shrink-0 mt-0.5" />
                    <span>Tasks, timesheets, files and staffing stay with this project — only the number changes.</span>
                  </li>
                </ul>

                {/* Other people's projects. Renumbering is how "project 2 of 3" stays true, but it
                    is still somebody else's record changing, so it is listed by name. */}
                {(plan.sourceRenumber.length > 0 || plan.targetRenumber.length > 0) && (
                  <div className="pt-1 border-t border-brand-100">
                    <p className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-amber-500" />
                      {plan.affectedCount} other {plan.affectedCount === 1 ? 'project is' : 'projects are'} renumbered
                    </p>
                    <ul className="space-y-1">
                      {[...plan.sourceRenumber, ...plan.targetRenumber].map(c => (
                        <li key={c.id} className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="truncate max-w-[16rem]">{c.title || c.id}</span>
                          <span className="text-gray-400 shrink-0">project {c.from} → {c.to}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button
            onClick={onClose} disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => move.mutate()}
            disabled={!ok || busy || isFetching}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader size={14} className="animate-spin" /> : <Hash size={14} />}
            {busy ? 'Moving…' : plan ? `Move to ${plan.toPid}` : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One destination option: a card that is also a radio, with its own settings folded inside it. */
function Choice({ selected, onSelect, icon, title, subtitle, children }: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={clsx(
        'rounded-xl border px-3.5 py-3 cursor-pointer transition-colors',
        selected ? 'border-brand-300 bg-brand-50/40' : 'border-gray-200 hover:bg-gray-50',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={clsx('mt-0.5 shrink-0', selected ? 'text-brand-600' : 'text-gray-400')}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm font-medium', selected ? 'text-gray-900' : 'text-gray-700')}>{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          {selected && <div onClick={e => e.stopPropagation()} className="mt-2.5">{children}</div>}
        </div>
      </div>
    </div>
  );
}

function Radio({ name, checked, onChange, label, hint }: {
  name: string; checked: boolean; onChange: () => void; label: string; hint: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-brand-600" />
      <span className="min-w-0">
        <span className="block text-sm text-gray-800">{label}</span>
        <span className="block text-[11px] text-gray-500">{hint}</span>
      </span>
    </label>
  );
}
