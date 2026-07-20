'use client';

import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import {
  Send, Hash, Plus, Lock, X, Loader, Trash2, Users, UserPlus, Crown, Check,
  Smile, Pin, PinOff, Pencil, Link2, Bell, BellOff, BarChart3, Bookmark, BookmarkCheck,
  AtSign, Archive, ArchiveRestore, Settings2, Clock,
} from 'lucide-react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Channel, type Message, type ChannelMembers, type UserSummary, type MessagePoll, type SavedMessage, type Tag, type ChannelRead } from '@/lib/api';
import { useOrg, byName } from '@/lib/org-context';
import { usePresence } from '@/lib/presence-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { AttachButton, AttachmentList, PendingAttachmentChips, useAttachmentUploads, VoiceRecorderButton } from '@/components/files/Attachments';

// Reserved group mentions offered in the composer alongside people and tags.
const GROUP_MENTIONS = [
  { key: 'channel', label: '@channel', hint: 'Notify everyone in this discussion' },
  { key: 'everyone', label: '@everyone', hint: 'Notify everyone in this discussion' },
];

const EMOJI = ['👍', '❤️', '😄', '🎉', '👀', '🙏', '✅', '🔥'];

// The lightweight user shape carried on messages/members (enough for Avatar + fullName).
type MiniUser = Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'profilePhoto'>;

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function fmtTime(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── message text rendering (safe: React nodes only, never dangerouslySetInnerHTML) ──
// A tiny markdown subset: **bold**, `code`, and auto-linked URLs. Newlines are handled
// by `whitespace-pre-wrap` on the container (so we don't emit <br/> here). Italic via
// underscores is deliberately NOT supported — it would mangle snake_case/file names.
function renderInline(text: string, kp: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => {
    if (!p) return null;
    const key = `${kp}-${i}`;
    if (/^`[^`]+`$/.test(p)) return <code key={key} className="px-1 py-0.5 bg-gray-100 rounded text-[0.85em] font-mono text-gray-800">{p.slice(1, -1)}</code>;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(p)) return <a key={key} href={p} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline break-all">{p}</a>;
    return p;
  });
}

function renderContent(content: string, mentionRe: RegExp | null, mentionSet: Set<string>): ReactNode {
  if (!mentionRe) return renderInline(content, 'c');
  // split() keeps the captured @mention tokens as their own array entries.
  return content.split(mentionRe).map((p, i) => {
    if (p == null || p === '') return null;
    if (mentionSet.has(p)) return <span key={i} className="text-brand-700 bg-brand-50 rounded px-1 font-medium">{p}</span>;
    return <span key={i}>{renderInline(p, `c${i}`)}</span>;
  });
}

// A composer autocomplete suggestion: a group mention, a named tag, or a person.
type Suggestion =
  | { kind: 'group'; key: string; token: string; label: string; hint: string }
  | { kind: 'tag'; id: string; token: string; label: string; hint: string }
  | { kind: 'user'; user: MiniUser; token: string; label: string };

// ── @mention-aware composer input ──────────────────────────────────────────────
function MentionInput({ value, onChange, onEnter, members, tags, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; onEnter: () => void;
  members: MiniUser[]; tags: Tag[]; placeholder: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [hi, setHi] = useState(0);

  const matches: Suggestion[] = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    const groups: Suggestion[] = GROUP_MENTIONS
      .filter(g => g.key.startsWith(q))
      .map(g => ({ kind: 'group', key: g.key, token: `@${g.key} `, label: g.label, hint: g.hint }));
    const tagHits: Suggestion[] = tags
      .filter(t => t.name.toLowerCase().includes(q))
      .map(t => ({ kind: 'tag', id: t.id, token: `@${t.name} `, label: `@${t.name}`, hint: `${t.memberCount} ${t.memberCount === 1 ? 'person' : 'people'}` }));
    const users: Suggestion[] = members
      .filter(m => fullName(m).toLowerCase().includes(q))
      .map(m => ({ kind: 'user', user: m, token: `@${fullName(m)} `, label: fullName(m) }));
    return [...groups, ...tagHits, ...users].slice(0, 8);
  }, [query, members, tags]);

  function recompute(val: string, caret: number) {
    const m = val.slice(0, caret).match(/@([^\s@]*)$/);
    if (m) { setQuery({ text: m[1], start: caret - m[0].length }); setHi(0); }
    else setQuery(null);
  }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    recompute(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }
  function pick(s: Suggestion) {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, query.start);
    const after = value.slice(caret);
    onChange(before + s.token + after);
    setQuery(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); const pos = (before + s.token).length; el.setSelectionRange(pos, pos); }
    });
  }
  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (query && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[hi]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); }
  }

  return (
    <div className="relative flex-1 min-w-0">
      {query && matches.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 w-72 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
          {matches.map((s, i) => {
            const active = i === hi;
            const key = s.kind === 'user' ? s.user.id : s.kind === 'tag' ? s.id : s.key;
            return (
              <button type="button" key={`${s.kind}-${key}`} onMouseDown={e => { e.preventDefault(); pick(s); }}
                className={clsx('w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left', active ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-700')}>
                {s.kind === 'user'
                  ? <Avatar user={s.user} size={22} className="shrink-0" />
                  : <span className={clsx('w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0', s.kind === 'group' ? 'bg-brand-100 text-brand-600' : 'bg-teal-100 text-teal-600')}>{s.kind === 'group' ? <Users size={12} /> : <AtSign size={12} />}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.label}</span>
                  {s.kind !== 'user' && <span className="block text-[10px] text-gray-400 truncate">{s.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <input ref={ref} value={value} onChange={handleChange} onKeyDown={handleKey} placeholder={placeholder} disabled={disabled}
        className="w-full bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:opacity-60" />
    </div>
  );
}

/** Toggleable list of org members (excludes the people in `exclude`). */
function MemberPicker({ users, selected, onToggle, exclude }: { users: UserSummary[]; selected: Set<string>; onToggle: (id: string) => void; exclude?: Set<string> }) {
  const pickable = users.filter(u => !exclude?.has(u.id));
  return (
    <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-1.5 space-y-0.5">
      {pickable.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">No people to add.</p>}
      {pickable.map(u => {
        const on = selected.has(u.id);
        return (
          <button key={u.id} type="button" onClick={() => onToggle(u.id)}
            className={clsx('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors', on ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-700')}>
            <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0', on ? 'bg-brand-600 border-brand-600' : 'border-gray-300')}>
              {on && <Check size={11} className="text-white" />}
            </span>
            <Avatar user={u} size={24} className="shrink-0" />
            {fullName(u)}
          </button>
        );
      })}
    </div>
  );
}

function CreateDiscussionModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (id: string) => void }) {
  const { org, currentUser, users } = useOrg();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const exclude = new Set(currentUser ? [currentUser.id] : []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setLoading(true); setError('');
    try {
      const ch = await api.channels.create({ organizationId: org.id, name: name.trim(), description: description.trim() || undefined, memberIds: [...memberIds] });
      onSuccess(ch.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create discussion');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center"><Lock size={17} className="text-brand-600" /></div>
            <h2 className="text-lg font-semibold text-gray-900">New Discussion</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SEP litigation strategy"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this about?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Add people {memberIds.size > 0 && <span className="text-gray-400 font-normal">({memberIds.size})</span>}</label>
            <MemberPicker users={users} selected={memberIds} exclude={exclude} onToggle={id => setMemberIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
            <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1"><Lock size={11} /> Private — only you and the people you add can see this. You are the owner.</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading || !name.trim()} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</> : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MembersModal({ channelId, isOwner, onClose }: { channelId: string; isOwner: boolean; onClose: () => void }) {
  const { users } = useOrg();
  const { presenceOf } = usePresence();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery<ChannelMembers>({ queryKey: ['channel-members', channelId], queryFn: () => api.channels.members(channelId), enabled: !!channelId });
  const memberIdSet = new Set((data?.members ?? []).map(m => m.userId));

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['channel-members', channelId] }); qc.invalidateQueries({ queryKey: ['channels'] }); };
  async function add() {
    if (!adding.size) return;
    setBusy(true);
    try { await api.channels.addMembers(channelId, [...adding]); setAdding(new Set()); invalidate(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed to add'); } finally { setBusy(false); }
  }
  async function remove(userId: string) {
    try { await api.channels.removeMember(channelId, userId); invalidate(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed to remove'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Users size={17} className="text-brand-600" /> Members</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {isLoading ? <Loader size={16} className="animate-spin text-gray-400" /> : (
            <div className="space-y-1">
              {(data?.members ?? []).map(m => (
                <div key={m.userId} className="flex items-center gap-2 py-1">
                  <Avatar user={m.user} size={28} status={presenceOf(m.userId)?.status} />
                  <span className="text-sm text-gray-800 flex-1">{fullName(m.user)}</span>
                  {m.userId === data?.ownerId
                    ? <span className="text-[11px] text-amber-600 inline-flex items-center gap-1"><Crown size={12} /> Owner</span>
                    : isOwner && <button onClick={() => remove(m.userId)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>}
                </div>
              ))}
            </div>
          )}
          {isOwner && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><UserPlus size={13} /> Add people</p>
              <MemberPicker users={users} selected={adding} exclude={memberIdSet} onToggle={id => setAdding(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
              <button onClick={add} disabled={busy || adding.size === 0} className="mt-2 w-full py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Adding…' : adding.size ? `Add ${adding.size}` : 'Select people to add'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── one message row with hover actions, reactions and inline edit ──────────────
type MsgHandlers = {
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => Promise<void> | void;
  onDelete: (messageId: string) => void;
  onPin: (messageId: string, pinned: boolean) => void;
  onCopyLink: (messageId: string) => void;
  onVote: (pollId: string, optionIds: string[]) => void;
  onClosePoll: (pollId: string) => void;
  onSave: (messageId: string, save: boolean) => void;
};

// A poll rendered inside a discussion message (the message content is the question).
function PollCard({ poll, currentUserId, canClose, onVote, onClose }: {
  poll: MessagePoll; currentUserId?: string; canClose: boolean;
  onVote: (optionIds: string[]) => void; onClose: () => void;
}) {
  const closed = !!poll.closedAt;
  const myVotes = new Set(poll.votes.filter(v => v.userId === currentUserId).map(v => v.optionId));
  const total = poll.votes.length;
  const voters = new Set(poll.votes.map(v => v.userId)).size;
  const countOf = (id: string) => poll.votes.filter(v => v.optionId === id).length;

  function click(optionId: string) {
    if (closed) return;
    if (poll.multiple) {
      const next = new Set(myVotes);
      next.has(optionId) ? next.delete(optionId) : next.add(optionId);
      if (next.size === 0) return; // must keep at least one choice
      onVote([...next]);
    } else {
      onVote([optionId]);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 max-w-md bg-white">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 size={14} className="text-brand-600 shrink-0" />
        <p className="text-sm font-semibold text-gray-800">{poll.question}</p>
      </div>
      <div className="space-y-1.5">
        {poll.options.map(o => {
          const c = countOf(o.id);
          const pct = total ? Math.round((c / total) * 100) : 0;
          const mine = myVotes.has(o.id);
          return (
            <button key={o.id} disabled={closed} onClick={() => click(o.id)}
              className={clsx('relative w-full text-left rounded-lg border overflow-hidden transition-colors', mine ? 'border-brand-300' : 'border-gray-200', !closed && 'hover:border-brand-300', closed && 'cursor-default')}>
              <span className="absolute inset-y-0 left-0 bg-brand-50" style={{ width: `${pct}%` }} />
              <span className="relative flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={clsx('w-3.5 h-3.5 border flex items-center justify-center shrink-0', poll.multiple ? 'rounded' : 'rounded-full', mine ? 'bg-brand-600 border-brand-600' : 'border-gray-300')}>
                    {mine && <Check size={9} className="text-white" />}
                  </span>
                  <span className="truncate text-gray-700">{o.text}</span>
                </span>
                <span className="text-xs text-gray-500 tabular-nums shrink-0 ml-2">{pct}% · {c}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
        <span>{voters} vote{voters !== 1 ? 's' : ''}{poll.multiple ? ' · multiple choice' : ''}{closed ? ' · closed' : ''}</span>
        {canClose && <button onClick={onClose} className="font-medium hover:text-brand-600">{closed ? 'Reopen' : 'Close poll'}</button>}
      </div>
    </div>
  );
}

function CreatePollModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (question: string, options: string[], multiple: boolean) => Promise<void> }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = question.trim().length > 0 && options.filter(o => o.trim()).length >= 2;

  function setOpt(i: number, v: string) { setOptions(o => o.map((x, j) => (j === i ? v : x))); }
  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try { await onSubmit(question.trim(), options.map(o => o.trim()).filter(Boolean), multiple); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create the poll'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center"><BarChart3 size={17} className="text-brand-600" /></div>
            <h2 className="text-lg font-semibold text-gray-900">New poll</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Question <span className="text-red-500">*</span></label>
            <input autoFocus value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Which filing strategy for the SEP matter?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Options</label>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={o} onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
                  {options.length > 2 && <button onClick={() => setOptions(opts => opts.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><X size={15} /></button>}
                </div>
              ))}
            </div>
            {options.length < 10 && <button onClick={() => setOptions(o => [...o, ''])} className="mt-2 text-xs font-medium text-brand-600 hover:underline inline-flex items-center gap-1"><Plus size={13} /> Add option</button>}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={multiple} onChange={e => setMultiple(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Allow multiple choices</span>
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={submit} disabled={!valid || busy} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {busy ? <><Loader size={14} className="animate-spin" /> Posting…</> : 'Post poll'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function MessageItem({ msg, sameAuthor, currentUserId, canModerate, mentionRe, mentionSet, usersById, highlight, authorStatus, saved, seenBy, h }: {
  msg: Message; sameAuthor: boolean; currentUserId?: string; canModerate: boolean;
  mentionRe: RegExp | null; mentionSet: Set<string>; usersById: Map<string, UserSummary>;
  highlight: boolean; authorStatus?: string | null; saved: boolean; seenBy?: number | null; h: MsgHandlers;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [showEmoji, setShowEmoji] = useState(false);
  const deleted = !!msg.deletedAt;
  const isAuthor = msg.userId === currentUserId;
  const mentionsMe = !!currentUserId && (msg.mentions ?? []).includes(currentUserId);

  // Group reactions by emoji, tracking who reacted (for the tooltip and my-own highlight).
  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    (msg.reactions ?? []).forEach(r => { const a = g.get(r.emoji) ?? []; a.push(r.userId); g.set(r.emoji, a); });
    return [...g.entries()];
  }, [msg.reactions]);

  async function saveEdit() {
    const next = draft.trim();
    if (!next || next === msg.content) { setEditing(false); return; }
    await h.onEdit(msg.id, next);
    setEditing(false);
  }

  return (
    <div id={`msg-${msg.id}`} className={clsx('group relative flex items-start gap-3 -mx-2 px-2 rounded-lg transition-colors',
      sameAuthor ? 'mt-0.5' : 'mt-1',
      highlight ? 'bg-amber-50 ring-1 ring-amber-200' : mentionsMe && !deleted ? 'bg-brand-50/40' : 'hover:bg-gray-50')}>
      {!sameAuthor ? <Avatar user={msg.user} size={32} status={authorStatus} className="shrink-0 mt-0.5" /> : <div className="w-8 shrink-0" />}
      <div className="flex-1 min-w-0 py-0.5">
        {!sameAuthor && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900">{fullName(msg.user)}</span>
            <span className="text-xs text-gray-400">{fmtTime(msg.createdAt)}</span>
          </div>
        )}
        {deleted ? (
          <p className="text-sm italic text-gray-400">This message was deleted.</p>
        ) : editing ? (
          <div className="flex items-center gap-2">
            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { setEditing(false); setDraft(msg.content); } }}
              className="flex-1 text-sm border border-brand-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-200" />
            <button onClick={saveEdit} className="text-xs font-medium text-brand-600 hover:underline">Save</button>
            <button onClick={() => { setEditing(false); setDraft(msg.content); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <>
            {msg.poll ? (
              <PollCard poll={msg.poll} currentUserId={currentUserId} canClose={msg.poll.createdBy === currentUserId || canModerate}
                onVote={ids => h.onVote(msg.poll!.id, ids)} onClose={() => h.onClosePoll(msg.poll!.id)} />
            ) : msg.content ? (
              <p className="text-sm text-gray-700 leading-relaxed break-words whitespace-pre-wrap">
                {renderContent(msg.content, mentionRe, mentionSet)}
                {msg.editedAt && <span className="text-[10px] text-gray-400 ml-1">(edited)</span>}
              </p>
            ) : null}
            <AttachmentList attachments={msg.attachments} />
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {groups.map(([emoji, uids]) => {
                  const mine = !!currentUserId && uids.includes(currentUserId);
                  const names = uids.map(id => { const u = usersById.get(id); return u ? fullName(u) : 'Someone'; }).join(', ');
                  return (
                    <button key={emoji} onClick={() => h.onReact(msg.id, emoji)} title={names}
                      className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
                        mine ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100')}>
                      <span>{emoji}</span><span className="tabular-nums">{uids.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {seenBy != null && seenBy > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
            <Check size={11} className="text-brand-500" /> Seen by {seenBy}
          </p>
        )}
      </div>

      {/* hover toolbar */}
      {!deleted && !editing && (
        <div className="absolute right-2 -top-3 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-sm px-0.5 py-0.5">
          <div className="relative">
            <button onClick={() => setShowEmoji(v => !v)} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="React"><Smile size={14} /></button>
            {showEmoji && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
                <div className="absolute right-0 bottom-full mb-1 z-20 flex gap-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
                  {EMOJI.map(e => (
                    <button key={e} onClick={() => { h.onReact(msg.id, e); setShowEmoji(false); }} className="w-7 h-7 rounded-md hover:bg-gray-100 text-base leading-none">{e}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => h.onPin(msg.id, !msg.pinnedAt)} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600" title={msg.pinnedAt ? 'Unpin' : 'Pin'}>
            {msg.pinnedAt ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button onClick={() => h.onCopyLink(msg.id)} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Copy link"><Link2 size={14} /></button>
          <button onClick={() => h.onSave(msg.id, !saved)} className={clsx('p-1.5 rounded-md hover:bg-gray-100', saved ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600')} title={saved ? 'Remove from saved' : 'Save message'}>
            {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </button>
          {isAuthor && <button onClick={() => { setDraft(msg.content); setEditing(true); }} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit"><Pencil size={14} /></button>}
          {(isAuthor || canModerate) && <button onClick={() => h.onDelete(msg.id)} className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>}
        </div>
      )}
    </div>
  );
}

function SavedModal({ saved, onClose, onJump }: { saved: SavedMessage[]; onClose: () => void; onJump: (channelId: string, messageId: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Bookmark size={17} className="text-brand-600" /> Saved messages</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-gray-50">
          {saved.length === 0 && <p className="px-6 py-10 text-center text-sm text-gray-400">No saved messages yet. Hover a message and tap the bookmark to save it.</p>}
          {saved.map(m => (
            <button key={m.id} onClick={() => onJump(m.channelId, m.id)} className="w-full text-left px-6 py-3 hover:bg-gray-50">
              <p className="text-[11px] text-gray-400 mb-0.5"><Lock size={9} className="inline mr-1" />{m.channel.name} · {fullName(m.user)} · {fmtTime(m.createdAt)}</p>
              <p className="text-sm text-gray-700 line-clamp-2">{m.poll ? `📊 ${m.poll.question}` : (m.content || '(attachment)')}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Owner-only settings popover: message retention + archive + delete.
const RETENTION_OPTIONS = [
  { value: null, label: 'Keep forever' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
];
function ChannelSettingsMenu({ channel, onClose, onArchive, onUnarchive, onRetention, onDelete }: {
  channel: Channel; onClose: () => void;
  onArchive: () => void; onUnarchive: () => void; onRetention: (days: number | null) => void; onDelete: () => void;
}) {
  const archived = !!channel.archivedAt;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-30 p-3 space-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            <Clock size={12} /> Message retention
          </label>
          <select
            value={channel.retentionDays == null ? '' : String(channel.retentionDays)}
            onChange={e => onRetention(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200">
            {RETENTION_OPTIONS.map(o => <option key={o.label} value={o.value == null ? '' : o.value}>{o.label}</option>)}
          </select>
          <p className="text-[10px] text-gray-400 mt-1">Older messages are automatically deleted.</p>
        </div>
        <div className="border-t border-gray-100 pt-2 space-y-1">
          {archived ? (
            <button onClick={onUnarchive} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50">
              <ArchiveRestore size={14} className="text-brand-600" /> Reopen discussion
            </button>
          ) : (
            <button onClick={onArchive} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50">
              <Archive size={14} className="text-gray-500" /> Archive (read-only)
            </button>
          )}
          <button onClick={onDelete} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50">
            <Trash2 size={14} /> Delete discussion
          </button>
        </div>
      </div>
    </>
  );
}

export default function DiscussPage() {
  const { org, currentUser, users } = useOrg();
  const { presenceOf } = usePresence();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const attachments = useAttachmentUploads();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ['channels', org?.id], queryFn: () => api.channels.list(org!.id), enabled: !!org?.id,
  });
  const activeChannel = channels.find(c => c.id === activeChannelId) ?? channels[0] ?? null;
  const isOwner = !!(activeChannel && currentUser && activeChannel.createdBy === currentUser.id);

  // Deep link (?channel&message) — open the channel and flag the message to scroll to.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ch = sp.get('channel'); const msg = sp.get('message');
    if (ch) setActiveChannelId(ch);
    if (msg) setHighlightId(msg);
  }, []);
  useEffect(() => { if (channels.length > 0 && !activeChannelId) setActiveChannelId(channels[0].id); }, [channels, activeChannelId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['messages', activeChannel?.id], queryFn: () => api.channels.messages(activeChannel!.id), enabled: !!activeChannel?.id, refetchInterval: 5000,
  });
  const { data: pinned = [] } = useQuery<Message[]>({
    queryKey: ['pinned', activeChannel?.id], queryFn: () => api.channels.pinned(activeChannel!.id), enabled: !!activeChannel?.id, refetchInterval: 15000,
  });
  const { data: memberData } = useQuery<ChannelMembers>({
    queryKey: ['channel-members', activeChannel?.id], queryFn: () => api.channels.members(activeChannel!.id), enabled: !!activeChannel?.id,
  });
  const channelMembers = (memberData?.members ?? []).map(m => m.user).sort(byName);
  const { data: notifPrefs } = useQuery({ queryKey: ['notif-prefs'], queryFn: () => api.notifications.preferences(), staleTime: 30_000 });
  const muted = !!activeChannel && (notifPrefs?.mutedChannels ?? []).includes(activeChannel.id);
  async function toggleMute() {
    if (!activeChannel) return;
    try { await api.notifications.muteChannel(activeChannel.id, !muted); qc.invalidateQueries({ queryKey: ['notif-prefs'] }); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not update mute'); }
  }
  const { data: savedList = [] } = useQuery<SavedMessage[]>({ queryKey: ['saved-messages'], queryFn: () => api.channels.saved(), enabled: !!currentUser?.id, staleTime: 30_000 });
  const savedIds = useMemo(() => new Set(savedList.map(m => m.id)), [savedList]);
  // Named tags for @mention autocomplete + message highlighting.
  const { data: tags = [] } = useQuery<Tag[]>({ queryKey: ['tags'], queryFn: () => api.tags.list(), staleTime: 60_000 });
  // Per-member read positions for the active channel — powers "seen by" on own messages.
  const { data: reads = [] } = useQuery<ChannelRead[]>({
    queryKey: ['channel-reads', activeChannel?.id], queryFn: () => api.channels.reads(activeChannel!.id),
    enabled: !!activeChannel?.id, refetchInterval: 15000,
  });
  const archived = !!activeChannel?.archivedAt;

  // Mention rendering data: highlight member names, group mentions, and tag names (longest first).
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const mentionNames = useMemo(() => [
    ...users.map(u => `@${fullName(u)}`),
    '@channel', '@everyone',
    ...tags.map(t => `@${t.name}`),
  ].filter(n => n.length > 1), [users, tags]);
  const mentionRe = useMemo(() => mentionNames.length
    ? new RegExp('(' + mentionNames.map(escapeRegex).sort((a, b) => b.length - a.length).join('|') + ')', 'g')
    : null, [mentionNames]);
  const mentionSet = useMemo(() => new Set(mentionNames), [mentionNames]);

  // Mark the channel read when it's opened or receives new messages (drives unread + seen-by).
  useEffect(() => {
    if (!activeChannel?.id || messagesLoading) return;
    const chId = activeChannel.id;
    api.channels.markRead(chId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['channels', org?.id] });
        qc.invalidateQueries({ queryKey: ['channel-reads', chId] });
      })
      .catch(() => { /* non-critical */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id, messages.length, messagesLoading]);

  // Keep pinned to the bottom on new messages — unless we're jumping to a deep-linked one.
  useEffect(() => { if (!highlightId) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, highlightId]);
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`msg-${highlightId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const t = setTimeout(() => setHighlightId(null), 2500); return () => clearTimeout(t); }
  }, [highlightId, messages]);

  // "Seen by" is shown only on the actor's own latest message (as in most chat apps).
  const lastOwnMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].userId === currentUser?.id && !messages[i].deletedAt) return messages[i].id;
    }
    return null;
  }, [messages, currentUser?.id]);
  const seenByCount = useMemo(() => {
    const own = messages.find(m => m.id === lastOwnMessageId);
    if (!own) return 0;
    const ts = new Date(own.createdAt).getTime();
    return reads.filter(r => r.userId !== currentUser?.id && new Date(r.lastReadAt).getTime() >= ts).length;
  }, [messages, lastOwnMessageId, reads, currentUser?.id]);

  const invalidateChannels = () => qc.invalidateQueries({ queryKey: ['channels', org?.id] });
  const invalidateMessages = () => { qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] }); qc.invalidateQueries({ queryKey: ['pinned', activeChannel?.id] }); };

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const hasFiles = attachments.documentIds.length > 0;
    if ((!draft.trim() && !hasFiles) || attachments.uploading || !activeChannel) return;
    setSending(true);
    try {
      await api.channels.sendMessage(activeChannel.id, { content: draft.trim(), documentIds: hasFiles ? attachments.documentIds : undefined });
      setDraft(''); attachments.clear(); invalidateMessages(); invalidateChannels();
    }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed to send'); } finally { setSending(false); }
  }

  const handlers: MsgHandlers = {
    onReact: async (messageId, emoji) => {
      if (!activeChannel) return;
      try { await api.channels.toggleReaction(activeChannel.id, messageId, emoji); invalidateMessages(); }
      catch (e) { alert(e instanceof Error ? e.message : 'Could not react'); }
    },
    onEdit: async (messageId, content) => {
      if (!activeChannel) return;
      try { await api.channels.editMessage(activeChannel.id, messageId, content); invalidateMessages(); }
      catch (e) { alert(e instanceof Error ? e.message : 'Could not edit'); }
    },
    onDelete: async (messageId) => {
      if (!activeChannel || !confirm('Delete this message?')) return;
      try { await api.channels.deleteMessage(activeChannel.id, messageId); invalidateMessages(); }
      catch (e) { alert(e instanceof Error ? e.message : 'Could not delete'); }
    },
    onPin: async (messageId, pinned) => {
      if (!activeChannel) return;
      try { await (pinned ? api.channels.pinMessage : api.channels.unpinMessage)(activeChannel.id, messageId); invalidateMessages(); }
      catch (e) { alert(e instanceof Error ? e.message : 'Could not pin'); }
    },
    onCopyLink: (messageId) => {
      if (!activeChannel) return;
      const url = `${window.location.origin}/discuss?channel=${activeChannel.id}&message=${messageId}`;
      navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => toast('Could not copy link', 'error'));
    },
    onVote: async (pollId, optionIds) => {
      if (!activeChannel) return;
      try { await api.channels.votePoll(activeChannel.id, pollId, optionIds); invalidateMessages(); }
      catch (e) { alert(e instanceof Error ? e.message : 'Could not vote'); }
    },
    onClosePoll: async (pollId) => {
      if (!activeChannel) return;
      try { await api.channels.closePoll(activeChannel.id, pollId); invalidateMessages(); }
      catch (e) { alert(e instanceof Error ? e.message : 'Could not update the poll'); }
    },
    onSave: async (messageId, save) => {
      if (!activeChannel) return;
      try {
        await (save ? api.channels.saveMessage(activeChannel.id, messageId) : api.channels.unsaveMessage(activeChannel.id, messageId));
        qc.invalidateQueries({ queryKey: ['saved-messages'] });
      } catch (e) { alert(e instanceof Error ? e.message : 'Could not update saved'); }
    },
  };

  async function deleteChannel(id: string) {
    if (!confirm('Delete this discussion? All messages will be lost.')) return;
    try { await api.channels.delete(id); invalidateChannels(); if (activeChannelId === id) setActiveChannelId(null); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed to delete'); }
  }

  async function renameChannel(id: string, nextName: string) {
    const name = nextName.trim();
    setEditingName(false);
    if (!name || name === activeChannel?.name) return;
    try { await api.channels.update(id, { name }); invalidateChannels(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not rename the discussion'); }
  }

  async function archiveChannel(id: string) {
    if (!confirm('Archive this discussion? It becomes read-only until reopened.')) return;
    try { await api.channels.archive(id); invalidateChannels(); toast('Discussion archived'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not archive'); }
  }
  async function unarchiveChannel(id: string) {
    try { await api.channels.unarchive(id); invalidateChannels(); toast('Discussion reopened'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not reopen'); }
  }
  async function setRetention(id: string, retentionDays: number | null) {
    try { await api.channels.update(id, { retentionDays }); invalidateChannels(); toast(retentionDays ? `Messages auto-delete after ${retentionDays} days` : 'Retention turned off'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not update retention'); }
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Sidebar */}
      <div className="w-full lg:w-60 max-h-[40vh] lg:max-h-none border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200"><h2 className="text-sm font-semibold text-gray-700">Discussions</h2></div>
        <div className="flex-1 overflow-y-auto py-2">
          {channelsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader size={16} className="animate-spin text-gray-400" /></div>
          ) : channels.length === 0 ? (
            <p className="px-4 py-6 text-xs text-gray-400 text-center">No discussions yet. Create one — only the people you add will see it.</p>
          ) : channels.map(ch => {
            const active = activeChannel?.id === ch.id;
            const unread = ch.unreadCount ?? 0;
            const isArchived = !!ch.archivedAt;
            return (
              <button key={ch.id} onClick={() => setActiveChannelId(ch.id)}
                className={clsx('w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors',
                  active ? 'bg-brand-50 text-brand-700 font-medium' : clsx('hover:bg-gray-100', unread > 0 ? 'text-gray-900 font-semibold' : 'text-gray-600'))}>
                {isArchived ? <Archive size={12} className="shrink-0 text-gray-400" /> : <Lock size={12} className="shrink-0 text-gray-400" />}
                <span className="flex-1 truncate">{ch.name}</span>
                {unread > 0 && !active
                  ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">{unread > 99 ? '99+' : unread}</span>
                  : ch._count && ch._count.messages > 0 ? <span className="text-xs text-gray-400">{ch._count.messages}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 space-y-2">
          <button onClick={() => setShowSaved(true)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 w-full transition-colors">
            <Bookmark size={14} /> Saved {savedList.length > 0 && <span className="text-xs text-gray-400">({savedList.length})</span>}
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 w-full transition-colors">
            <Plus size={14} /> New Discussion
          </button>
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <Lock size={15} className="text-gray-400 shrink-0" />
                {editingName ? (
                  <input autoFocus defaultValue={activeChannel.name}
                    onChange={e => setNameDraft(e.target.value)}
                    onBlur={() => renameChannel(activeChannel.id, nameDraft || activeChannel.name)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameChannel(activeChannel.id, (e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    className="font-semibold text-gray-900 border border-brand-300 rounded-md px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-200 min-w-0" />
                ) : (
                  <button onClick={() => { if (isOwner) { setNameDraft(activeChannel.name); setEditingName(true); } }}
                    title={isOwner ? 'Click to rename' : undefined}
                    className={clsx('font-semibold text-gray-900 truncate rounded-md px-1 -mx-1', isOwner && 'hover:bg-gray-100 cursor-pointer')}>
                    {activeChannel.name}
                  </button>
                )}
                <span className="text-xs text-gray-400 ml-1 shrink-0">· {activeChannel._count?.members ?? 0} members</span>
              </div>
              <div className="flex items-center gap-1">
                {pinned.length > 0 && (
                  <button onClick={() => setShowPinned(v => !v)} className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg', showPinned ? 'bg-amber-50 border-amber-200 text-amber-700' : 'text-gray-600 border-gray-200 hover:bg-gray-50')}>
                    <Pin size={13} /> {pinned.length}
                  </button>
                )}
                <button onClick={toggleMute} title={muted ? 'Unmute this discussion' : 'Mute this discussion'}
                  className={clsx('p-1.5 border rounded-lg', muted ? 'text-amber-600 border-amber-200 bg-amber-50' : 'text-gray-400 border-gray-200 hover:bg-gray-50')}>
                  {muted ? <BellOff size={14} /> : <Bell size={14} />}
                </button>
                <button onClick={() => setShowMembers(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Users size={13} /> {isOwner ? 'Manage' : 'Members'}
                </button>
                {isOwner && (
                  <div className="relative">
                    <button onClick={() => setShowSettings(v => !v)} className={clsx('p-1.5 border rounded-lg', showSettings ? 'bg-gray-100 border-gray-300 text-gray-700' : 'text-gray-400 border-gray-200 hover:bg-gray-50')} title="Discussion settings">
                      <Settings2 size={14} />
                    </button>
                    {showSettings && (
                      <ChannelSettingsMenu
                        channel={activeChannel}
                        onClose={() => setShowSettings(false)}
                        onArchive={() => { setShowSettings(false); archiveChannel(activeChannel.id); }}
                        onUnarchive={() => { setShowSettings(false); unarchiveChannel(activeChannel.id); }}
                        onRetention={(d) => setRetention(activeChannel.id, d)}
                        onDelete={() => { setShowSettings(false); deleteChannel(activeChannel.id); }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Pinned pane */}
            {showPinned && pinned.length > 0 && (
              <div className="border-b border-amber-100 bg-amber-50/50 px-4 sm:px-6 py-2.5 space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1"><Pin size={11} /> Pinned</p>
                {pinned.map(p => (
                  <button key={p.id} onClick={() => { setShowPinned(false); setHighlightId(p.id); }}
                    className="block w-full text-left text-xs text-gray-600 hover:text-gray-900 truncate">
                    <span className="font-medium text-gray-700">{fullName(p.user)}:</span> {p.content || '(attachment)'}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400"><Loader size={16} className="animate-spin mr-2" /><span className="text-sm">Loading…</span></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Hash size={32} className="mb-3 opacity-30" />
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs mt-1">Be the first to post in {activeChannel.name}</p>
                </div>
              ) : messages.map((msg, idx) => {
                const prev = idx > 0 ? messages[idx - 1] : null;
                const sameAuthor = !!prev && prev.userId === msg.userId && !prev.deletedAt && !msg.deletedAt
                  && (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60000);
                return (
                  <MessageItem key={msg.id} msg={msg} sameAuthor={sameAuthor} currentUserId={currentUser?.id}
                    canModerate={isOwner} mentionRe={mentionRe} mentionSet={mentionSet} usersById={usersById}
                    highlight={highlightId === msg.id} authorStatus={presenceOf(msg.userId)?.status} saved={savedIds.has(msg.id)}
                    seenBy={msg.id === lastOwnMessageId ? seenByCount : null} h={handlers} />
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {archived ? (
              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-center gap-2 text-sm text-gray-500">
                <Archive size={15} /> This discussion is archived and read-only.
                {isOwner && <button onClick={() => unarchiveChannel(activeChannel.id)} className="text-brand-600 hover:underline font-medium">Reopen</button>}
              </div>
            ) : (
              <form onSubmit={sendMessage} className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-white space-y-2">
                {attachments.error && <p className="text-xs text-red-600">{attachments.error}</p>}
                <PendingAttachmentChips items={attachments.pending} onRemove={attachments.remove} />
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-brand-400 transition-colors">
                  <AttachButton onPick={attachments.add} disabled={sending} />
                  <VoiceRecorderButton onRecorded={attachments.add} disabled={sending} />
                  <button type="button" onClick={() => setShowPoll(true)} disabled={sending} title="Create a poll"
                    className="p-1 text-gray-400 hover:text-brand-600 disabled:opacity-50 shrink-0"><BarChart3 size={18} /></button>
                  <MentionInput value={draft} onChange={setDraft} onEnter={sendMessage} members={channelMembers} tags={tags} placeholder={`Message ${activeChannel.name}  ·  @ to mention`} disabled={sending} />
                  <button type="submit" disabled={(!draft.trim() && attachments.documentIds.length === 0) || attachments.uploading || sending}
                    className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 shrink-0">
                    {sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Lock size={40} className="mb-3 opacity-20" />
            <p className="text-base font-medium">Your private discussions appear here</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 text-sm text-brand-600 hover:underline flex items-center gap-1"><Plus size={14} /> Start a discussion</button>
          </div>
        )}
      </div>

      {showCreate && <CreateDiscussionModal onClose={() => setShowCreate(false)} onSuccess={(id) => { invalidateChannels(); setActiveChannelId(id); }} />}
      {showMembers && activeChannel && <MembersModal channelId={activeChannel.id} isOwner={isOwner} onClose={() => { setShowMembers(false); invalidateChannels(); }} />}
      {showPoll && activeChannel && (
        <CreatePollModal onClose={() => setShowPoll(false)}
          onSubmit={async (question, options, multiple) => { await api.channels.createPoll(activeChannel.id, { question, options, multiple }); invalidateMessages(); invalidateChannels(); }} />
      )}
      {showSaved && (
        <SavedModal saved={savedList} onClose={() => setShowSaved(false)}
          onJump={(cid, mid) => { setShowSaved(false); setActiveChannelId(cid); setHighlightId(mid); }} />
      )}
    </div>
  );
}
