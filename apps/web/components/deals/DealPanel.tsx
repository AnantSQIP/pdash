'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { X, Loader, Trash2, Trophy, XCircle, Phone, Mail, Users, StickyNote, ArrowRight } from 'lucide-react';
import { api, type Deal, type DealStageDef, type ClientSummary } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { formatMoney } from '@/lib/ledger-format';
import { formatDate } from '@/lib/date';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  CALL: Phone, EMAIL: Mail, MEETING: Users, NOTE: StickyNote, STAGE_CHANGE: ArrowRight,
};

/**
 * One deal: where it is, what happened to it, and how it moves.
 *
 * The two moves that matter get their own handling. **Losing** demands a reason, because the
 * server insists and because the aggregate of those reasons is the most useful thing the pipeline
 * produces. **Winning** offers to tie the deal to a client — the moment a prospect stops being a
 * name and its work starts flowing through projects and the client ledger.
 */
export function DealPanel({ dealId, stages, onClose, onChanged, onDeleted }: {
  dealId: string;
  stages: DealStageDef[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const [closing, setClosing] = useState<'WON' | 'LOST' | null>(null);
  const [activityType, setActivityType] = useState('CALL');
  const [activityNote, setActivityNote] = useState('');

  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ['deal', dealId], queryFn: () => api.deals.get(dealId),
  });

  const after = () => { qc.invalidateQueries({ queryKey: ['deal', dealId] }); onChanged(); };

  const move = useMutation({
    mutationFn: (data: { stage: string; lostReason?: string; clientId?: string; newClientCode?: string }) =>
      api.deals.move(dealId, data),
    onSuccess: () => { setClosing(null); setErr(''); after(); },
    onError: (e: unknown) => setErr(msg(e)),
  });
  const logActivity = useMutation({
    mutationFn: () => api.deals.logActivity(dealId, { type: activityType, note: activityNote.trim() || undefined }),
    onSuccess: () => { setActivityNote(''); after(); },
    onError: (e: unknown) => setErr(msg(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.deals.remove(dealId),
    onSuccess: onDeleted,
    onError: (e: unknown) => setErr(msg(e)),
  });

  const mayEdit = can('deal.manage');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="bg-gray-50 w-full max-w-lg h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        {isLoading || !deal ? (
          <div className="p-10 text-center text-sm text-gray-400"><Loader className="animate-spin inline mr-2" size={16} />Loading…</div>
        ) : (
          <>
            <div className="bg-white px-5 py-4 border-b border-gray-200 sticky top-0 z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">{deal.company}</h2>
                  {deal.title && <p className="text-sm text-gray-500 mt-0.5">{deal.title}</p>}
                </div>
                <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded shrink-0"><X size={18} /></button>
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-lg font-bold text-gray-900 tabular-nums">
                  {deal.value == null ? <span className="text-gray-300 text-sm font-normal">no value set</span> : formatMoney(deal.value, deal.currency)}
                </span>
                <StageBadge stage={deal.stage} stages={stages} />
                {deal.client && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-purple-50 text-purple-700 ring-1 ring-purple-100">
                    {deal.client.code}
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Owner" value={`${deal.owner.firstName} ${deal.owner.lastName}`} />
                <Field label="Source" value={deal.source ?? '—'} />
                <Field label="Expected close" value={deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : '—'} />
                <Field label="Opened" value={formatDate(deal.createdAt)} />
              </dl>

              {deal.lostReason && (
                <p className="text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-xs uppercase tracking-wide text-gray-400 block mb-0.5">Lost because</span>
                  {deal.lostReason}
                </p>
              )}

              {/* Moving it along */}
              {mayEdit && (
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                  <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">Move to</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.filter(s => s.value !== deal.stage).map(s => (
                      <button
                        key={s.value}
                        onClick={() => (s.value === 'WON' || s.value === 'LOST') ? setClosing(s.value as 'WON' | 'LOST') : move.mutate({ stage: s.value })}
                        disabled={move.isPending}
                        className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50',
                          s.value === 'WON' ? 'border-green-200 text-green-700 hover:bg-green-50'
                            : s.value === 'LOST' ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
                      >
                        {s.value === 'WON' && <Trophy size={11} className="inline mr-1" />}
                        {s.value === 'LOST' && <XCircle size={11} className="inline mr-1" />}
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {closing && (
                <CloseDealForm
                  kind={closing} company={deal.company}
                  pending={move.isPending}
                  onCancel={() => { setClosing(null); setErr(''); }}
                  onSubmit={data => move.mutate({ stage: closing, ...data })}
                />
              )}

              {/* Log something that happened */}
              {mayEdit && (
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                  <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">Log an activity</h3>
                  <div className="flex gap-2">
                    <select
                      value={activityType} onChange={e => setActivityType(e.target.value)}
                      className="px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
                    >
                      {['CALL', 'EMAIL', 'MEETING', 'NOTE'].map(t => (
                        <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                    <input
                      value={activityNote} onChange={e => setActivityNote(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && activityNote.trim()) logActivity.mutate(); }}
                      placeholder="What happened?"
                      className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                    />
                    <button
                      onClick={() => logActivity.mutate()} disabled={logActivity.isPending || !activityNote.trim()}
                      className="px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >Log</button>
                  </div>
                </div>
              )}

              {/* What happened, newest first */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">History</h3>
                </div>
                <ul className="divide-y divide-gray-50">
                  {(deal.activities ?? []).map(a => {
                    const Icon = ACTIVITY_ICON[a.type] ?? StickyNote;
                    return (
                      <li key={a.id} className="px-4 py-2.5 flex items-start gap-2.5">
                        <Icon size={13} className="text-gray-300 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-700">
                            {a.type === 'STAGE_CHANGE'
                              ? <>Moved <span className="text-gray-400">{a.fromStage ?? 'in'}</span> → <b className="font-medium">{a.toStage}</b></>
                              : a.note}
                          </p>
                          {a.type === 'STAGE_CHANGE' && a.note && <p className="text-xs text-gray-500 mt-0.5">{a.note}</p>}
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {formatDate(a.occurredAt)}{a.byName ? ` · ${a.byName}` : ''}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                  {!(deal.activities ?? []).length && <li className="px-4 py-4 text-sm text-gray-400">Nothing logged yet.</li>}
                </ul>
              </div>

              {err && <p className="text-sm text-red-600">{err}</p>}

              {mayEdit && (
                <button
                  onClick={() => { if (confirm(`Remove the ${deal.company} deal?`)) remove.mutate(); }}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600"
                >
                  <Trash2 size={12} /> Remove this deal
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Closing a deal. The two directions ask for genuinely different things: losing needs the reason,
 * winning needs to know which client this became — and offers to mint the code, since that is
 * exactly the moment a prospect turns into a real engagement.
 */
function CloseDealForm({ kind, company, pending, onCancel, onSubmit }: {
  kind: 'WON' | 'LOST';
  company: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (data: { lostReason?: string; clientId?: string; newClientCode?: string }) => void;
}) {
  const { can } = usePermissions();
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'none' | 'existing' | 'new'>('none');
  const [clientId, setClientId] = useState('');
  const [newCode, setNewCode] = useState('');

  const mayCreateClient = can('patent.manage');
  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients'], queryFn: () => api.clients.list(),
    enabled: kind === 'WON' && mayCreateClient,
  });
  const { data: suggestion } = useQuery({
    queryKey: ['deal-code-suggestion', company],
    queryFn: () => api.deals.codeSuggestion(company),
    enabled: kind === 'WON' && mayCreateClient,
  });
  useEffect(() => { if (suggestion?.code && !newCode) setNewCode(suggestion.code); }, [suggestion?.code]);

  if (kind === 'LOST') {
    return (
      <div className="bg-white rounded-xl border border-gray-300 p-3 space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">Why was it lost?</h3>
        <p className="text-[11px] text-gray-400">
          Required — the pattern across lost deals is the most useful thing this pipeline produces.
        </p>
        <input
          value={reason} onChange={e => setReason(e.target.value)} autoFocus
          placeholder="Went with an incumbent firm on price"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => onSubmit({ lostReason: reason.trim() })} disabled={pending || !reason.trim()}
            className="px-3 py-1.5 text-sm font-medium bg-gray-700 text-white rounded-lg disabled:opacity-50"
          >Mark lost</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-green-200 p-3 space-y-2.5">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
        <Trophy size={14} className="text-green-600" /> Won — which client is this?
      </h3>
      {!mayCreateClient ? (
        <p className="text-[11px] text-gray-500">
          The deal will be marked won. Linking it to a client code needs the confidential client
          permission — ask a Super Admin to connect it so its work reaches the client ledger.
        </p>
      ) : (
        <>
          <div className="flex gap-1.5 text-xs">
            {(['new', 'existing', 'none'] as const).map(m => (
              <button
                key={m} onClick={() => setMode(m)}
                className={clsx('px-2.5 py-1 rounded-lg border',
                  mode === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500')}
              >
                {m === 'new' ? 'New client' : m === 'existing' ? 'Existing client' : 'Decide later'}
              </button>
            ))}
          </div>
          {mode === 'new' && (
            <div>
              <input
                value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
                placeholder="Client code"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Suggested from the company name. Patent IDs will read <span className="font-mono">Pat_{newCode || 'XXX'}_001</span>.
              </p>
            </div>
          )}
          {mode === 'existing' && (
            <select
              value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
            >
              <option value="">— pick a client —</option>
              {clients.filter(c => !c.archivedAt).map(c => (
                <option key={c.id} value={c.id}>{c.name ? `${c.name} (${c.code})` : c.code}</option>
              ))}
            </select>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button
          onClick={() => onSubmit(
            mode === 'new' && newCode ? { newClientCode: newCode }
              : mode === 'existing' && clientId ? { clientId }
              : {},
          )}
          disabled={pending || (mode === 'new' && !newCode) || (mode === 'existing' && !clientId)}
          className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Mark won'}
        </button>
      </div>
    </div>
  );
}

function StageBadge({ stage, stages }: { stage: string; stages: DealStageDef[] }) {
  const def = stages.find(s => s.value === stage);
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
      stage === 'WON' ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
        : stage === 'LOST' ? 'bg-gray-100 text-gray-500'
        : 'bg-brand-50 text-brand-700 ring-1 ring-brand-100')}>
      {def?.label ?? stage}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5">{value}</dd>
    </div>
  );
}
