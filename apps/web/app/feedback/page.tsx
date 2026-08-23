'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, Check, Eye, Loader, MessageSquarePlus, Pencil, Search, ThumbsUp, Trash2, X,
} from 'lucide-react';
import { api, type FeedbackItem, type FeedbackKind, type FeedbackSummary, type UserSummary } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { formatDate } from '@/lib/date';

/**
 * Feedback — an observation about a colleague, written down while it is still accurate.
 *
 * Appraisals happen twice a year between one person and their manager. This is the other thing:
 * what somebody noticed in March about a colleague on another team, which by October has become
 * "I think they were late on something". Writing it down when it happens is the whole feature.
 *
 * WHO SEES IT is decided on the server and cannot be widened from here — the author, HR, and the
 * subject's reporting manager. Not the subject. The composer says so plainly, because a person
 * about to write something ought to know who will read it before they choose their words.
 */

const KINDS: { key: FeedbackKind; label: string; hint: string; tone: string }[] = [
  { key: 'PRAISE', label: 'Praise', hint: 'Something that went well and deserves to be on record.', tone: 'emerald' },
  { key: 'CONCERN', label: 'Concern', hint: 'Something that went wrong, or a pattern worth watching.', tone: 'amber' },
  { key: 'OBSERVATION', label: 'Observation', hint: 'Neither — a fact worth remembering at review time.', tone: 'slate' },
];

const KIND_STYLE: Record<FeedbackKind, string> = {
  PRAISE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CONCERN: 'bg-amber-50 text-amber-700 border-amber-200',
  OBSERVATION: 'bg-gray-50 text-gray-600 border-gray-200',
};

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function FeedbackPage() {
  const { can, loading: permsLoading } = usePermissions();
  const { users, currentUser } = useOrg();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [kindFilter, setKindFilter] = useState<FeedbackKind | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [openOnly, setOpenOnly] = useState(false);

  const isHr = can('appraisal.manage');

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ['feedback', tab],
    queryFn: () => api.feedback.list(tab === 'mine' ? { mine: true } : undefined),
  });
  const { data: summary } = useQuery<FeedbackSummary>({
    queryKey: ['feedback-summary'],
    queryFn: () => api.feedback.summary(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['feedback'] });
    qc.invalidateQueries({ queryKey: ['feedback-summary'] });
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(f => {
      if (kindFilter !== 'ALL' && f.kind !== kindFilter) return false;
      if (openOnly && f.acknowledgedAt) return false;
      if (!q) return true;
      return (
        fullName(f.about).toLowerCase().includes(q) ||
        fullName(f.author).toLowerCase().includes(q) ||
        f.body.toLowerCase().includes(q)
      );
    });
  }, [items, kindFilter, search, openOnly]);

  if (permsLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Record something about a colleague while it is still fresh — it feeds the review, not a mailbox.
          </p>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          <MessageSquarePlus size={15} /> Give feedback
        </button>
      </header>

      {/* Who reads this. Stated once, at the top, rather than left for people to assume. */}
      <div className="flex items-start gap-2.5 bg-blue-50/60 border border-blue-200 rounded-xl px-4 py-3">
        <Eye size={15} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-900 leading-relaxed">
          <b>Who can read what you write:</b> you, HR, and the reporting manager of the person it is about.
          The person themselves cannot — so this is a record for the review, not a way to tell somebody
          something. If they should hear it, tell them as well.
        </p>
      </div>

      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Visible to you" value={summary.total} />
          <Stat label="Not yet handled" value={summary.open} alert={isHr && summary.open > 0} />
          {summary.byKind.filter(k => k.kind !== 'OBSERVATION').map(k => (
            <Stat key={k.kind} label={k.kind === 'PRAISE' ? 'Praise' : 'Concerns'} value={k.count} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['all', 'mine'] as const).map(t => (
            <button
              key={t} onClick={() => setTab(t)}
              className={clsx('px-3 py-1.5 text-xs font-medium rounded-md',
                tab === t ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
            >
              {t === 'all' ? 'Everything I can see' : 'Written by me'}
            </button>
          ))}
        </div>
        <select
          value={kindFilter} onChange={e => setKindFilter(e.target.value as FeedbackKind | 'ALL')}
          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-500"
        >
          <option value="ALL">All kinds</option>
          {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        {isHr && (
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} className="rounded" />
            Not yet handled
          </label>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people or text…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400"><Loader className="animate-spin inline mr-2" size={16} />Loading…</div>
      ) : visible.length === 0 ? (
        <Empty hasAny={items.length > 0} onCompose={() => setComposing(true)} />
      ) : (
        <ul className="space-y-3">
          {visible.map(f => (
            <FeedbackCard
              key={f.id} item={f} isHr={isHr} isAuthor={f.authorId === currentUser?.id}
              onChanged={invalidate}
            />
          ))}
        </ul>
      )}

      {composing && (
        <Composer
          users={users.filter(u => u.id !== currentUser?.id && u.status === 'ACTIVE')}
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); invalidate(); toast('Feedback recorded.', 'success'); }}
        />
      )}
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

function Empty({ hasAny, onCompose }: { hasAny: boolean; onCompose: () => void }) {
  return (
    <div className="py-14 text-center">
      <p className="text-sm text-gray-500">
        {hasAny ? 'Nothing matches those filters.' : 'No feedback recorded yet.'}
      </p>
      {!hasAny && (
        <button onClick={onCompose} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">
          Write the first one
        </button>
      )}
    </div>
  );
}

function FeedbackCard({ item, isHr, isAuthor, onChanged }: {
  item: FeedbackItem; isHr: boolean; isAuthor: boolean; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(item.body);
  const [kind, setKind] = useState<FeedbackKind>(item.kind);

  const save = useMutation({
    mutationFn: () => api.feedback.update(item.id, { body: body.trim(), kind }),
    onSuccess: () => { setEditing(false); onChanged(); toast('Updated.', 'success'); },
    onError: e => toast(msg(e), 'error'),
  });
  const ack = useMutation({
    mutationFn: () => api.feedback.acknowledge(item.id),
    onSuccess: () => { onChanged(); toast('Marked as handled.', 'success'); },
    onError: e => toast(msg(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.feedback.remove(item.id),
    onSuccess: () => { onChanged(); toast('Withdrawn.', 'success'); },
    onError: e => toast(msg(e), 'error'),
  });

  return (
    <li className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <Avatar user={item.about} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-gray-900">{fullName(item.about)}</span>
            {item.about.designation && <span className="text-xs text-gray-400">{item.about.designation}</span>}
            <span className={clsx('text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border', KIND_STYLE[item.kind])}>
              {KINDS.find(k => k.key === item.kind)?.label ?? item.kind}
            </span>
            {item.rating != null && (
              <span className="text-[11px] text-gray-500 tabular-nums">{item.rating}/5</span>
            )}
            {item.acknowledgedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-600">
                <Check size={10} /> Handled
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1.5">
                {KINDS.map(k => (
                  <button
                    key={k.key} onClick={() => setKind(k.key)}
                    className={clsx('px-2 py-1 text-[11px] font-medium rounded border',
                      kind === k.key ? KIND_STYLE[k.key] : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={3} value={body} onChange={e => setBody(e.target.value)} maxLength={4000}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-brand-500"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditing(false); setBody(item.body); setKind(item.kind); }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button
                  onClick={() => save.mutate()} disabled={save.isPending || body.trim().length < 3}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {save.isPending ? <Loader size={12} className="animate-spin" /> : <Check size={12} />} Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap break-words">{item.body}</p>
          )}

          <p className="text-[11px] text-gray-400 mt-2">
            {fullName(item.author)} · {formatDate(item.createdAt)}
            {item.updatedAt !== item.createdAt && ' · edited'}
          </p>
        </div>

        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            {isAuthor && (
              <button onClick={() => setEditing(true)} title="Edit"
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><Pencil size={13} /></button>
            )}
            {isHr && !item.acknowledgedAt && (
              <button onClick={() => ack.mutate()} disabled={ack.isPending} title="Mark as handled"
                className="p-1.5 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded"><Check size={14} /></button>
            )}
            {(isAuthor || isHr) && (
              <button onClick={() => remove.mutate()} disabled={remove.isPending} title={isAuthor ? 'Withdraw' : 'Remove'}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Composer({ users, onClose, onSaved }: {
  users: UserSummary[]; onClose: () => void; onSaved: () => void;
}) {
  const [aboutUserId, setAboutUserId] = useState('');
  const [kind, setKind] = useState<FeedbackKind>('OBSERVATION');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () => api.feedback.create({
      aboutUserId, kind, body: body.trim(),
      ...(rating === '' ? {} : { rating: Number(rating) }),
    }),
    onSuccess: onSaved,
    onError: e => setErr(msg(e)),
  });

  const chosen = users.find(u => u.id === aboutUserId);
  const blocked = !aboutUserId || body.trim().length < 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Give feedback</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">About</label>
            <select
              value={aboutUserId} onChange={e => setAboutUserId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
            >
              <option value="">Choose a colleague…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {fullName(u)}{u.designation ? ` — ${u.designation}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Kind</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {KINDS.map(k => (
                <button
                  key={k.key} onClick={() => setKind(k.key)}
                  className={clsx('text-left px-3 py-2 rounded-lg border transition',
                    kind === k.key ? KIND_STYLE[k.key] : 'border-gray-200 hover:bg-gray-50')}
                >
                  <span className="block text-xs font-semibold">{k.label}</span>
                  <span className="block text-[10px] text-gray-500 mt-0.5 leading-snug">{k.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">What happened</label>
            <textarea
              rows={5} value={body} onChange={e => setBody(e.target.value)} maxLength={4000}
              placeholder="Be specific — what, when, and what the effect was. “Turned the Malikie search around in two days and wrote it up unprompted” is usable at review time; “good attitude” is not."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">{body.length}/4000</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Rating <span className="font-normal text-gray-400">— optional</span>
            </label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setRating('')}
                className={clsx('px-2.5 py-1 text-xs rounded border',
                  rating === '' ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
              >
                None
              </button>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n} onClick={() => setRating(n)}
                  className={clsx('w-8 py-1 text-xs tabular-nums rounded border',
                    rating === n ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Repeated here, where the words are actually being chosen. */}
          <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <AlertTriangle size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-gray-600 leading-relaxed">
              {chosen ? <><b>{fullName(chosen)}</b> will not see this.</> : 'The person will not see this.'}{' '}
              HR and their reporting manager will. Write it as a record for the review — and if they
              ought to hear it, say it to them too.
            </p>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => { setErr(''); save.mutate(); }} disabled={blocked || save.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? <Loader size={14} className="animate-spin" /> : <ThumbsUp size={14} />} Record it
          </button>
        </div>
      </div>
    </div>
  );
}
