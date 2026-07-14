'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Hash, Plus, Lock, X, Loader, Trash2, Users, UserPlus, Crown, Check } from 'lucide-react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Channel, type Message, type ChannelMembers, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { AttachButton, AttachmentList, PendingAttachmentChips, useAttachmentUploads } from '@/components/files/Attachments';

function fmtTime(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
                  <Avatar user={m.user} size={28} />
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

export default function DiscussPage() {
  const { org, currentUser } = useOrg();
  const qc = useQueryClient();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [sending, setSending] = useState(false);
  const attachments = useAttachmentUploads();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ['channels', org?.id], queryFn: () => api.channels.list(org!.id), enabled: !!org?.id,
  });
  const activeChannel = channels.find(c => c.id === activeChannelId) ?? channels[0] ?? null;
  const isOwner = !!(activeChannel && currentUser && activeChannel.createdBy === currentUser.id);

  useEffect(() => { if (channels.length > 0 && !activeChannelId) setActiveChannelId(channels[0].id); }, [channels, activeChannelId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['messages', activeChannel?.id], queryFn: () => api.channels.messages(activeChannel!.id), enabled: !!activeChannel?.id, refetchInterval: 5000,
  });
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const invalidateChannels = () => qc.invalidateQueries({ queryKey: ['channels', org?.id] });
  const invalidateMessages = () => qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] });

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const hasFiles = attachments.documentIds.length > 0;
    if ((!draft.trim() && !hasFiles) || attachments.uploading || !activeChannel) return;
    setSending(true);
    try {
      await api.channels.sendMessage(activeChannel.id, {
        content: draft.trim(),
        documentIds: hasFiles ? attachments.documentIds : undefined,
      });
      setDraft(''); attachments.clear(); invalidateMessages(); invalidateChannels();
    }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed to send'); } finally { setSending(false); }
  }

  async function deleteChannel(id: string) {
    if (!confirm('Delete this discussion? All messages will be lost.')) return;
    try { await api.channels.delete(id); invalidateChannels(); if (activeChannelId === id) setActiveChannelId(null); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed to delete'); }
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
      <div className="flex-1 flex flex-col">
        {activeChannel ? (
          <>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <Lock size={15} className="text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-900 truncate">{activeChannel.name}</span>
                <span className="text-xs text-gray-400 ml-1 shrink-0">· {activeChannel._count?.members ?? 0} members</span>
              </div>
              <div className="flex items-center gap-1">
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

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
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
                const sameAuthor = prev?.userId === msg.userId && (new Date(msg.createdAt).getTime() - new Date(prev!.createdAt).getTime() < 5 * 60000);
                const name = `${msg.user.firstName} ${msg.user.lastName}`;
                return (
                  <div key={msg.id} className={clsx('flex items-start gap-3', sameAuthor && 'mt-0.5')}>
                    {!sameAuthor ? <Avatar user={msg.user} size={32} className="shrink-0 mt-0.5" /> : <div className="w-8 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      {!sameAuthor && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-gray-900">{name}</span>
                          <span className="text-xs text-gray-400">{fmtTime(msg.createdAt)}</span>
                        </div>
                      )}
                      {msg.content && <p className="text-sm text-gray-700 leading-relaxed break-words">{msg.content}</p>}
                      <AttachmentList attachments={msg.attachments} />
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-white space-y-2">
              {attachments.error && <p className="text-xs text-red-600">{attachments.error}</p>}
              <PendingAttachmentChips items={attachments.pending} onRemove={attachments.remove} />
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-brand-400 transition-colors">
                <AttachButton onPick={attachments.add} disabled={sending} />
                <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${activeChannel.name}`}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }} />
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
