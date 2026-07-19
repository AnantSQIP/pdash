'use client';

import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import {
  Send, Hash, Plus, Lock, X, Loader, Trash2, Users, UserPlus, Crown, Check,
  Smile, Pin, PinOff, Pencil, Link2, Bell, BellOff,
} from 'lucide-react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Channel, type Message, type ChannelMembers, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePresence } from '@/lib/presence-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { AttachButton, AttachmentList, PendingAttachmentChips, useAttachmentUploads } from '@/components/files/Attachments';

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

// ── @mention-aware composer input ──────────────────────────────────────────────
function MentionInput({ value, onChange, onEnter, members, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; onEnter: () => void;
  members: MiniUser[]; placeholder: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [hi, setHi] = useState(0);
  const matches = query
    ? members.filter(m => fullName(m).toLowerCase().includes(query.text.toLowerCase())).slice(0, 6)
    : [];

  function recompute(val: string, caret: number) {
    const m = val.slice(0, caret).match(/@([^\s@]*)$/);
    if (m) { setQuery({ text: m[1], start: caret - m[0].length }); setHi(0); }
    else setQuery(null);
  }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    recompute(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }
  function pick(u: MiniUser) {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, query.start);
    const after = value.slice(caret);
    const token = `@${fullName(u)} `;
    onChange(before + token + after);
    setQuery(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); const pos = (before + token).length; el.setSelectionRange(pos, pos); }
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
        <div className="absolute bottom-full mb-2 left-0 w-64 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
          {matches.map((u, i) => (
            <button type="button" key={u.id} onMouseDown={e => { e.preventDefault(); pick(u); }}
              className={clsx('w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left', i === hi ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-700')}>
              <Avatar user={u} size={22} className="shrink-0" /> {fullName(u)}
            </button>
          ))}
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
};
function MessageItem({ msg, sameAuthor, currentUserId, canModerate, mentionRe, mentionSet, usersById, highlight, authorStatus, h }: {
  msg: Message; sameAuthor: boolean; currentUserId?: string; canModerate: boolean;
  mentionRe: RegExp | null; mentionSet: Set<string>; usersById: Map<string, UserSummary>;
  highlight: boolean; authorStatus?: string | null; h: MsgHandlers;
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
            {msg.content && (
              <p className="text-sm text-gray-700 leading-relaxed break-words whitespace-pre-wrap">
                {renderContent(msg.content, mentionRe, mentionSet)}
                {msg.editedAt && <span className="text-[10px] text-gray-400 ml-1">(edited)</span>}
              </p>
            )}
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
          {isAuthor && <button onClick={() => { setDraft(msg.content); setEditing(true); }} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit"><Pencil size={14} /></button>}
          {(isAuthor || canModerate) && <button onClick={() => h.onDelete(msg.id)} className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>}
        </div>
      )}
    </div>
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
  const channelMembers = (memberData?.members ?? []).map(m => m.user);
  const { data: notifPrefs } = useQuery({ queryKey: ['notif-prefs'], queryFn: () => api.notifications.preferences(), staleTime: 30_000 });
  const muted = !!activeChannel && (notifPrefs?.mutedChannels ?? []).includes(activeChannel.id);
  async function toggleMute() {
    if (!activeChannel) return;
    try { await api.notifications.muteChannel(activeChannel.id, !muted); qc.invalidateQueries({ queryKey: ['notif-prefs'] }); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not update mute'); }
  }

  // Mention rendering data (highlight any "@Full Name" of an org member, longest first).
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const mentionNames = useMemo(() => users.map(u => `@${fullName(u)}`).filter(n => n.length > 1), [users]);
  const mentionRe = useMemo(() => mentionNames.length
    ? new RegExp('(' + mentionNames.map(escapeRegex).sort((a, b) => b.length - a.length).join('|') + ')', 'g')
    : null, [mentionNames]);
  const mentionSet = useMemo(() => new Set(mentionNames), [mentionNames]);

  // Keep pinned to the bottom on new messages — unless we're jumping to a deep-linked one.
  useEffect(() => { if (!highlightId) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, highlightId]);
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`msg-${highlightId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const t = setTimeout(() => setHighlightId(null), 2500); return () => clearTimeout(t); }
  }, [highlightId, messages]);

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
          ) : channels.map(ch => (
            <button key={ch.id} onClick={() => setActiveChannelId(ch.id)}
              className={clsx('w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors',
                (activeChannel?.id === ch.id) ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100')}>
              <Lock size={12} className="shrink-0 text-gray-400" />
              <span className="flex-1 truncate">{ch.name}</span>
              {ch._count && ch._count.messages > 0 && <span className="text-xs text-gray-400">{ch._count.messages}</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-200">
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
                  <button onClick={() => deleteChannel(activeChannel.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Delete discussion">
                    <Trash2 size={14} />
                  </button>
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
                    highlight={highlightId === msg.id} authorStatus={presenceOf(msg.userId)?.status} h={handlers} />
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-white space-y-2">
              {attachments.error && <p className="text-xs text-red-600">{attachments.error}</p>}
              <PendingAttachmentChips items={attachments.pending} onRemove={attachments.remove} />
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-brand-400 transition-colors">
                <AttachButton onPick={attachments.add} disabled={sending} />
                <MentionInput value={draft} onChange={setDraft} onEnter={sendMessage} members={channelMembers} placeholder={`Message ${activeChannel.name}  ·  @ to mention`} disabled={sending} />
                <button type="submit" disabled={(!draft.trim() && attachments.documentIds.length === 0) || attachments.uploading || sending}
                  className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 shrink-0">
                  {sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </form>
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
    </div>
  );
}
