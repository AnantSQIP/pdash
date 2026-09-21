'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Check, Hash, Loader, Merge, Scissors, X } from 'lucide-react';
import { api, type CidMoveMode, type CidMoveTarget } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

/**
 * Changing the CID a client is filed under.
 *
 * One dialog for three operations, because to the person opening it they are one thought — "this
 * client's CID should change" — and which of the three it turns out to be depends on facts they
 * already know (is something else sharing this number, does the right number already exist) rather
 * than on a decision they want to make:
 *
 *   REASSIGN / SPLIT — the client takes the NEXT CID, issued fresh. Called a SPLIT when something
 *                      else is sharing the number today, because that is what leaving does to the
 *                      clients left behind. A number is never typed in: CIDs are only ever issued in
 *                      sequence, and a number that holds nothing (retired, merged, purged) is never
 *                      taken over.
 *   MERGE            — the client moves under an existing CID as its next round.
 *
 * WHY THIS SCREEN IS MOSTLY A PREVIEW
 *
 * A CID is on invoices, in client email, and in reports that have already been sent. Moving one is
 * not undone by moving it back: the number left behind is retired the moment it empties (merged
 * numbers point at the one they went into), and retired numbers are never issued again. A move
 * also renumbers OTHER clients' rounds so that "client 2 of 3" goes on meaning something. So the
 * dialog asks the server what the move would do and shows the answer, and the button stays
 * disabled until that question has been answered. The preview comes from the SAME plan the move
 * itself runs, and every move is written to the CID ledger.
 */
export function CidMoveModal({ projectId, projectTitle, currentCid, onClose, onMoved }: {
  projectId: string;
  projectTitle: string;
  /** The CID the client carries now — shown before the preview lands. */
  currentCid: string | null;
  onClose: () => void;
  onMoved?: (toCid: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  /** OWN = take the next CID; MERGE = move under another client's. */
  const [intent, setIntent] = useState<'OWN' | 'MERGE'>('OWN');
  const [intoProjectId, setIntoProjectId] = useState('');

  const { data: targets = [], isLoading: loadingTargets } = useQuery({
    queryKey: ['cid-move-targets', projectId],
    queryFn: () => api.projects.cidMoveTargets(projectId),
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
  const mode: CidMoveMode = intent === 'MERGE' ? 'MERGE' : sharing ? 'SPLIT' : 'REASSIGN';

  const intoArg = intent === 'MERGE' ? intoProjectId : undefined;
  // Nothing to preview until the destination is actually chosen: a merge with no client picked
  // would only produce an error the person has not earned yet.
  const ready = !loadingGroup && (intent === 'OWN' || intoProjectId.length > 0);

  const { data: preview, isFetching, error } = useQuery({
    queryKey: ['cid-move-preview', projectId, mode, intoArg ?? ''],
    queryFn: () => api.projects.cidMovePreview(projectId, { mode, intoProjectId: intoArg }),
    enabled: ready,
    retry: false,
  });

  const move = useMutation({
    mutationFn: () => {
      if (mode === 'MERGE') return api.projects.mergeCid(projectId, { intoProjectId });
      if (mode === 'SPLIT') return api.projects.splitCid(projectId);
      return api.projects.reassignCid(projectId);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-rounds', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['cid-ledger'] });
      qc.invalidateQueries({ queryKey: ['cid-move-targets'] });
      toast(`Moved from ${r.fromCid} to ${r.toCid}`, 'success');
      onMoved?.(r.toCid);
      onClose();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not change the CID', 'error'),
  });

  const busy = move.isPending;
  const plan = preview && preview.ok ? preview : null;
  const refusal = preview && !preview.ok ? preview.message : null;
  const ok = plan !== null;
  // A server error (rather than a refusal) arrives here instead of in the preview body. Both are
  // the same thing to read.
  const problem = refusal ?? (error instanceof Error ? error.message : null);

  const fromCid = preview?.fromCid ?? currentCid;
  const chosenTarget: CidMoveTarget | undefined = useMemo(
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
              <h2 className="text-lg font-semibold text-gray-900">Change CID</h2>
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
              <span className="font-mono text-sm font-semibold text-gray-900">{fromCid ?? '—'}</span>
              {group && (
                <span className="text-xs text-gray-500">
                  {sharing
                    ? `client ${group.rounds.find(r => r.id === projectId)?.roundSeq ?? 1} of ${group.rounds.length} under this number`
                    : 'the only client under this number'}
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
              title={sharing ? 'A CID of its own' : 'A new CID'}
              subtitle={sharing
                ? 'This client stops sharing its number and is issued the next CID. The ones left behind are renumbered.'
                : 'This client is issued the next CID and its current one is retired.'}
            >
              <p className="text-[11px] text-gray-500 pt-1">
                {preview?.mintPreview ? `Would issue ${preview.mintPreview}` : 'The next CID in this financial year'}
                {' '}— CIDs are only issued in sequence, and a retired one is never re-used.
              </p>
            </Choice>

            <Choice
              selected={intent === 'MERGE'}
              onSelect={() => setIntent('MERGE')}
              icon={<Merge size={15} />}
              title="Under another client's CID"
              subtitle="Two numbers were issued for what is really one matter. This client becomes the next client under that number, and its current CID is marked as merged into it."
            >
              {loadingTargets ? (
                <p className="text-xs text-gray-400 py-1">Looking for CIDs…</p>
              ) : targets.length === 0 ? (
                <p className="text-xs text-gray-500 py-1">
                  No other CID in this financial year holds live work, so there is nothing to merge under.
                </p>
              ) : (
                <select
                  value={intoProjectId}
                  onChange={e => setIntoProjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
                >
                  <option value="">Choose the client to file this under…</option>
                  {targets.map(t => (
                    <optgroup key={t.cid} label={t.cid}>
                      {t.rounds.map(r => (
                        <option key={r.id} value={r.id} disabled={r.id === projectId}>
                          {t.cid} · client {r.roundSeq} — {r.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {chosenTarget && (
                <p className="text-[11px] text-gray-500 pt-1.5">
                  {chosenTarget.cid} already holds {chosenTarget.rounds.length}{' '}
                  {chosenTarget.rounds.length === 1 ? 'client' : 'clients'}.
                </p>
              )}
            </Choice>
          </section>

          {/* The consequence. The reason this modal exists. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">What will happen</h3>

            {!ready ? (
              <p className="text-sm text-gray-400 px-3.5 py-3 rounded-xl border border-dashed border-gray-200">
                Choose where the client should go.
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
                  <span className="font-mono text-sm text-gray-500 line-through">{plan.fromCid}</span>
                  <ArrowRight size={14} className="text-gray-400" />
                  <span className="font-mono text-sm font-semibold text-gray-900">{plan.toCid}</span>
                  {plan.mintsNewCid && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white text-brand-700 border border-brand-200">
                      newly issued
                    </span>
                  )}
                </div>

                <ul className="space-y-1.5 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <Check size={15} className="text-brand-600 shrink-0 mt-0.5" />
                    <span>
                      {plan.mode === 'MERGE'
                        ? <>&ldquo;{projectTitle}&rdquo; becomes <strong>client {plan.newRoundSeq} of {plan.targetTotal}</strong> under {plan.toCid}.</>
                        : <>&ldquo;{projectTitle}&rdquo; becomes the <strong>first and only client</strong> under {plan.toCid}.</>}
                    </span>
                  </li>

                  <li className="flex gap-2">
                    <Check size={15} className="text-brand-600 shrink-0 mt-0.5" />
                    {plan.retiresFromCid ? (
                      <span>
                        <strong className="font-mono">{plan.fromCid}</strong> is left holding nothing and is{' '}
                        <strong>{plan.mode === 'MERGE' ? `marked merged into ${plan.toCid}` : 'retired'}</strong>. It stays in
                        the CID ledger and is never issued to anything else.
                      </span>
                    ) : (
                      <span>
                        <strong className="font-mono">{plan.fromCid}</strong> keeps {plan.sourceRemaining}{' '}
                        {plan.sourceRemaining === 1 ? 'client' : 'clients'} and stays in use.
                      </span>
                    )}
                  </li>

                  <li className="flex gap-2">
                    <Check size={15} className="text-brand-600 shrink-0 mt-0.5" />
                    <span>Tasks, timesheets, files and staffing stay with this client — only the number changes.</span>
                  </li>
                </ul>

                {/* Other clients' rounds. Renumbering is how "client 2 of 3" stays true, but it is
                    still somebody else's record changing, so it is listed by name. */}
                {(plan.sourceRenumber.length > 0 || plan.targetRenumber.length > 0) && (
                  <div className="pt-1 border-t border-brand-100">
                    <p className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-amber-500" />
                      {plan.affectedCount} other {plan.affectedCount === 1 ? 'client is' : 'clients are'} renumbered
                    </p>
                    <ul className="space-y-1">
                      {[...plan.sourceRenumber, ...plan.targetRenumber].map(c => (
                        <li key={c.id} className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="truncate max-w-[16rem]">{c.title || c.id}</span>
                          <span className="text-gray-400 shrink-0">client {c.from} → {c.to}</span>
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
            {busy ? 'Moving…' : plan ? `Move to ${plan.toCid}` : 'Move'}
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

