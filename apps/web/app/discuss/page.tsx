'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Hash, Plus, Lock, Globe, X, Loader, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Channel, type Message } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { userInitials } from '@/lib/avatar';

const AVATAR_COLORS = [
  'bg-brand-600', 'bg-purple-500', 'bg-pink-500',
  'bg-slate-600', 'bg-green-500', 'bg-amber-500', 'bg-blue-500',
];
function avatarColor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CreateChannelModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { org, currentUser } = useOrg();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !currentUser) return;
    setLoading(true);
    setError('');
    try {
      await api.channels.create({
        organizationId: org.id,
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        description: description.trim() || undefined,
        type,
        createdBy: currentUser.id,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <Hash size={18} className="text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Create Channel</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Channel name <span className="text-red-500">*</span></label>
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input required autoFocus value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. general, design-team"
                className="w-full pl-8 pr-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
            <div className="grid grid-cols-2 gap-2">
              {([['PUBLIC', 'Public', Globe], ['PRIVATE', 'Private', Lock]] as const).map(([val, label, Icon]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setType(val)}
                  className={clsx(
                    'flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors',
                    type === val ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300',
                  )}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading || !name.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</> : 'Create Channel'}
            </button>
          </div>
        </form>
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
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ['channels', org?.id],
    queryFn: () => api.channels.list(org!.id),
    enabled: !!org?.id,
  });

  const activeChannel = channels.find(c => c.id === activeChannelId) ?? channels[0] ?? null;

  useEffect(() => {
    if (channels.length > 0 && !activeChannelId) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['messages', activeChannel?.id],
    queryFn: () => api.channels.messages(activeChannel!.id),
    enabled: !!activeChannel?.id,
    refetchInterval: 5000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function invalidateChannels() { qc.invalidateQueries({ queryKey: ['channels', org?.id] }); }
  function invalidateMessages() { qc.invalidateQueries({ queryKey: ['messages', activeChannel?.id] }); }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !currentUser || !activeChannel) return;
    setSending(true);
    try {
      await api.channels.sendMessage(activeChannel.id, { userId: currentUser.id, content: draft.trim() });
      setDraft('');
      invalidateMessages();
    } catch {} finally { setSending(false); }
  }

  async function deleteChannel(id: string) {
    if (!confirm('Delete this channel? All messages will be lost.')) return;
    await api.channels.delete(id);
    invalidateChannels();
    if (activeChannelId === id) setActiveChannelId(null);
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Channels</h2>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {channelsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader size={16} className="animate-spin text-gray-400" /></div>
          ) : (
            channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className={clsx(
                  'w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors group',
                  activeChannelId === ch.id || (!activeChannelId && ch === channels[0])
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100',
                )}
              >
                {ch.type === 'PRIVATE' ? <Lock size={12} className="shrink-0 text-gray-400" /> : <Hash size={12} className="shrink-0" />}
                <span className="flex-1 truncate">{ch.name}</span>
                {ch._count && ch._count.messages > 0 && (
                  <span className="text-xs text-gray-400">{ch._count.messages}</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 w-full transition-colors"
          >
            <Plus size={14} />
            Add Channel
          </button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {activeChannel ? (
          <>
            {/* Channel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                {activeChannel.type === 'PRIVATE' ? <Lock size={16} className="text-gray-400" /> : <Hash size={16} className="text-gray-500" />}
                <span className="font-semibold text-gray-900">{activeChannel.name}</span>
                {activeChannel._count && (
                  <span className="text-xs text-gray-400 ml-1">{activeChannel._count.members} members</span>
                )}
              </div>
              <button
                onClick={() => deleteChannel(activeChannel.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete channel"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader size={16} className="animate-spin mr-2" />
                  <span className="text-sm">Loading messages…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Hash size={32} className="mb-3 opacity-30" />
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs mt-1">Be the first to say something in #{activeChannel.name}</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const prev = idx > 0 ? messages[idx - 1] : null;
                  const sameAuthor = prev?.userId === msg.userId && (new Date(msg.createdAt).getTime() - new Date(prev!.createdAt).getTime() < 5 * 60000);
                  const fullName = `${msg.user.firstName} ${msg.user.lastName}`;
                  const color = avatarColor(fullName);
                  return (
                    <div key={msg.id} className={clsx('flex items-start gap-3', sameAuthor && 'mt-0.5')}>
                      {!sameAuthor ? (
                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-0.5', color)}>
                          {userInitials(msg.user)}
                        </div>
                      ) : (
                        <div className="w-8 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        {!sameAuthor && (
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-gray-900">{fullName}</span>
                            <span className="text-xs text-gray-400">{fmtTime(msg.createdAt)}</span>
                          </div>
                        )}
                        <p className="text-sm text-gray-700 leading-relaxed break-words">{msg.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="px-6 py-4 border-t border-gray-200 bg-white">
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl border border-gray-200 px-4 py-2.5 focus-within:border-brand-400 transition-colors">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder={`Message #${activeChannel.name}`}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors shrink-0"
                >
                  {sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Hash size={40} className="mb-3 opacity-20" />
            <p className="text-base font-medium">Select a channel to start messaging</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 text-sm text-brand-600 hover:underline flex items-center gap-1">
              <Plus size={14} /> Create your first channel
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateChannelModal
          onClose={() => setShowCreate(false)}
          onSuccess={invalidateChannels}
        />
      )}
    </div>
  );
}
