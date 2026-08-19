'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  TrendingUp, Plus, Loader, ShieldAlert, X, Trophy, XCircle, AlertTriangle, Repeat, Clock, Gauge,
} from 'lucide-react';
import { api, type Deal, type DealStageDef, type PipelineSummary } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useOrg, byName } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/ledger-format';
import { DeliveryOutlookPanel, StageDurations, TypeBreakdown } from '@/components/pipeline/PipelineInsights';
import type { ProjectTypeDef } from '@/lib/api';
import { DealPanel } from '@/components/deals/DealPanel';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const STAGE_TINT: Record<string, string> = {
  NEW: 'border-gray-200', CONTACTED: 'border-sky-200', PROPOSAL: 'border-amber-200',
  NEGOTIATION: 'border-orange-200', WON: 'border-green-200', LOST: 'border-gray-200',
};

/**
 * The BD pipeline.
 *
 * A deal is prospective business — not a project. Projects are work we are accountable for
 * delivering; most deals never happen. Keeping them apart is what stops speculative revenue
 * appearing in delivery reporting, and what lets this board be honest about the fact that its
 * numbers are forecasts rather than facts.
 */
export default function PipelinePage() {
  const { can, loading } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [openDeal, setOpenDeal] = useState<string | null>(null);

  const enabled = can('deal.view');
  const { data: stages = [] } = useQuery<DealStageDef[]>({
    queryKey: ['deal-stages'], queryFn: () => api.deals.stages(), enabled, staleTime: Infinity,
  });
  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ['deals'], queryFn: () => api.deals.list(), enabled,
  });
  const { data: summary } = useQuery<PipelineSummary>({
    queryKey: ['deal-summary'], queryFn: () => api.deals.summary(), enabled,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['deal-summary'] });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!enabled) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <ShieldAlert className="mx-auto text-gray-300" size={40} />
        <h1 className="mt-3 text-lg font-semibold text-gray-800">Restricted</h1>
        <p className="text-sm text-gray-500 mt-1">The pipeline holds commercial information and needs the BD Pipeline permission.</p>
      </div>
    );
  }

  const currency = summary?.currencies?.[0] ?? 'INR';
  const mixedCurrency = (summary?.currencies?.length ?? 0) > 1;

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={20} className="text-brand-600" /> BD Pipeline
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Prospective business, from first contact to won or lost</p>
        </div>
        {can('deal.manage') && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 shrink-0"
          >
            <Plus size={14} /> New deal
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {/* The numbers a pipeline exists to produce */}
        {summary && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Stat label="Open" value={String(summary.openCount)} sub={formatMoney(summary.openValue, currency)} />
              <Stat
                label="Weighted forecast" value={formatMoney(summary.weightedForecast, currency)}
                sub="open value × stage odds" highlight
              />
              <Stat label="Won" value={String(summary.wonCount)} sub={formatMoney(summary.wonValue, currency)} />
              <Stat label="Win rate" value={summary.winRate === null ? '—' : `${summary.winRate}%`}
                sub={summary.winRate === null ? 'nothing closed yet' : `${summary.wonCount} of ${summary.wonCount + summary.lostCount} closed`} />
              <Stat label="Avg cycle" value={summary.avgCycleDays === null ? '—' : `${summary.avgCycleDays}d`} sub="first contact to won" />
            </div>
            {mixedCurrency && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                This pipeline mixes {summary.currencies.join(', ')}. The totals above add them together, which is not a
                meaningful figure — read the per-deal values instead.
              </p>
            )}
          </>
        )}

        {/* The two questions a board of cards cannot answer: where deals slow down, what we win,
            and whether the team could absorb what is about to land. Collapsed by default —
            reference for planning, not something to read on every visit. */}
        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <DeliveryOutlookPanel enabled={enabled} />
            <StageDurations summary={summary} currency={currency} />
            <TypeBreakdown summary={summary} currency={currency} />
          </div>
        )}

        {/* The board */}
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-min items-start">
            {stages.map(s => {
              const inStage = deals.filter(d => d.stage === s.value);
              const stageValue = inStage.reduce((n, d) => n + (d.value ?? 0), 0);
              return (
                <div key={s.value} className={clsx('w-72 shrink-0 bg-gray-50 rounded-xl border', STAGE_TINT[s.value] ?? 'border-gray-200')}>
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        {s.value === 'WON' && <Trophy size={12} className="text-green-600" />}
                        {s.value === 'LOST' && <XCircle size={12} className="text-gray-400" />}
                        {s.label}
                      </h2>
                      <span className="text-xs text-gray-400">{inStage.length}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {formatMoney(stageValue, currency)}
                      {!s.terminal && <span className="ml-1">· {Math.round(s.probability * 100)}% odds</span>}
                    </p>
                    {s.value === 'WON' && inStage.some(d => !d.client) && (
                      <p className="text-[11px] font-medium text-amber-700 mt-1">
                        {inStage.filter(d => !d.client).length} awaiting a client record
                      </p>
                    )}
                    {!s.terminal && inStage.some(d => d.flags?.some(f => f.severity === 'urgent')) && (
                      <p className="text-[11px] font-medium text-red-700 mt-1">
                        {inStage.filter(d => d.flags?.some(f => f.severity === 'urgent')).length} need attention
                      </p>
                    )}
                  </div>
                  <div className="p-2 space-y-2 min-h-[60px]">
                    {inStage.map(d => (
                      <button
                        key={d.id} onClick={() => setOpenDeal(d.id)}
                        className="w-full text-left bg-white rounded-lg border border-gray-200 p-2.5 hover:border-brand-300 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-800 leading-snug">{d.company}</p>
                        {d.title && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{d.title}</p>}
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <span className="text-sm font-semibold text-gray-800 tabular-nums">
                            {d.value == null ? <span className="text-gray-300 font-normal">no value</span> : formatMoney(d.value, d.currency)}
                          </span>
                          <span className="text-[11px] text-gray-400 truncate">{d.owner.firstName}</span>
                        </div>
                        {d.client && (
                          <span className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-50 text-purple-700">
                            {d.client.code}
                          </span>
                        )}
                        {/* Already a client of ours — a warmer proposition than a cold name, and
                            something only this system can know, because it holds the delivery history. */}
                        {!d.client && d.existingClient && (
                          <span className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                            <Repeat size={9} /> Existing client · {d.existingClient.code}
                          </span>
                        )}
                        {/* What is wrong with this deal, computed rather than typed. The whole point
                            of the board saying something back instead of only showing what was entered. */}
                        {!!d.flags?.length && (
                          <div className="mt-1.5 space-y-1">
                            {d.flags.slice(0, 2).map(f => (
                              <div key={f.kind}
                                className={clsx('flex items-start gap-1 text-[10px] leading-snug rounded px-1.5 py-1',
                                  f.severity === 'urgent'
                                    ? 'bg-red-50 text-red-800 ring-1 ring-red-200'
                                    : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200')}>
                                <AlertTriangle size={9} className="shrink-0 mt-[2px]" />
                                <span>{f.message}</span>
                              </div>
                            ))}
                            {d.flags.length > 2 && (
                              <p className="text-[10px] text-gray-400 pl-1">+{d.flags.length - 2} more</p>
                            )}
                          </div>
                        )}
                        {/* How long it has sat here. A card cannot show you where deals die; this
                            is the per-deal half of that question. */}
                        {!s.terminal && (d.daysInStage ?? 0) > 0 && (
                          <p className="mt-1 text-[10px] text-gray-400">
                            {d.daysInStage}d in {s.label.toLowerCase()}
                            {d.nextActionAt && <> · next {new Date(d.nextActionAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>}
                          </p>
                        )}
                        {d.lostReason && <p className="mt-1.5 text-[10px] text-gray-400 line-clamp-2">{d.lostReason}</p>}
                      </button>
                    ))}
                    {inStage.length === 0 && <p className="text-[11px] text-gray-300 px-1 py-2">Nothing here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

        {/* Why deals are lost — the most actionable thing on the page. */}
        {summary && summary.lostReasons.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-xl">
            <h3 className="text-sm font-semibold text-gray-700">Why we lose</h3>
            <ul className="mt-2 space-y-1.5">
              {summary.lostReasons.map(r => (
                <li key={r.reason} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-gray-600">{r.reason}</span>
                  <span className="text-gray-400 tabular-nums shrink-0">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-gray-400 max-w-2xl">
          The forecast weights each open deal by its stage&apos;s odds. Those odds are conventional starting
          points, not measurements — once there is a year of real win/loss history here, replace them with
          this firm&apos;s actual conversion rate per stage.
        </p>
      </div>

      {creating && <NewDealModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
      {openDeal && (
        <DealPanel
          dealId={openDeal} stages={stages}
          onClose={() => setOpenDeal(null)}
          onChanged={refresh}
          onDeleted={() => { setOpenDeal(null); refresh(); toast('Deal removed', 'success'); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={clsx('rounded-xl border px-4 py-3', highlight ? 'border-brand-200 bg-brand-50/40' : 'border-gray-200 bg-white')}>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { users, currentUser } = useOrg();
  // The same list projects are created from, so the two can never drift apart. A deal that
  // becomes a project should already name the kind of project it becomes.
  const { data: workTypes = [] } = useQuery<ProjectTypeDef[]>({
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: Infinity,
  });
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [stage, setStage] = useState('NEW');
  const [ownerId, setOwnerId] = useState(currentUser?.id ?? '');
  const [source, setSource] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [nextActionNote, setNextActionNote] = useState('');
  const [expectedProjectType, setExpectedProjectType] = useState('');
  const [err, setErr] = useState('');

  const create = useMutation({
    mutationFn: () => api.deals.create({
      company: company.trim(), title: title.trim() || undefined,
      value: value.trim() === '' ? undefined : Number(value),
      currency, stage, ownerId: ownerId || undefined,
      source: source.trim() || undefined,
      expectedCloseDate: expectedCloseDate || undefined,
      nextActionAt: nextActionAt || undefined,
      nextActionNote: nextActionNote.trim() || undefined,
      expectedProjectType: expectedProjectType || undefined,
    }),
    onSuccess: onCreated,
    onError: (e: unknown) => setErr(msg(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">New deal</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Company <span className="text-red-500">*</span></label>
            <input
              value={company} onChange={e => setCompany(e.target.value)} autoFocus placeholder="Acme Semiconductors"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">Just a name for now — a client record is only created if you win.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What the work would be</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)} placeholder="Portfolio landscape, 40 patents"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
              <div className="flex gap-1.5">
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none">
                  {['INR', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" placeholder="800000"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg tabular-nums focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
              <select value={stage} onChange={e => setStage(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none">
                {['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'].map(s => (
                  <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none">
                {[...users].sort(byName).map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expected close</label>
              <input type="date" value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
          </div>

          {/* The kind of matter this would become. Captured now because once a deal closes,
              nobody can say what it would have been — and it is what lets win/loss be read
              by type of work rather than as one undifferentiated number. */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kind of work</label>
            <select value={expectedProjectType} onChange={e => setExpectedProjectType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500">
              <option value="">Not sure yet</option>
              {workTypes.filter(t => !t.comingSoon).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Lets the pipeline tell you which kinds of work you actually win.
            </p>
          </div>

          {/* The single field that stops deals being forgotten rather than lost. */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Next step due</label>
                <input type="date" value={nextActionAt} onChange={e => setNextActionAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">What is it</label>
                <input value={nextActionNote} onChange={e => setNextActionNote(e.target.value)} maxLength={300}
                  placeholder="Send the quote"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              A deal without a next step is the one that gets forgotten. The board flags any deal
              that has none, and any whose step is overdue.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Where it came from</label>
            <input
              value={source} onChange={e => setSource(e.target.value)} placeholder="IPBC referral"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3.5 flex justify-end gap-2 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => { setErr(''); create.mutate(); }}
            disabled={create.isPending || company.trim().length < 2}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {create.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Add deal
          </button>
        </div>
      </div>
    </div>
  );
}
