'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Hash } from 'lucide-react';

type Message = {
  id: string;
  author: string;
  initials: string;
  color: string;
  time: string;
  content: string;
};

const CHANNELS = [
  { id: 'general',     name: 'general',          unread: 3 },
  { id: 'apollo',      name: 'apollo-redesign',   unread: 1 },
  { id: 'mobile',      name: 'mobile-app-v2',     unread: 0 },
  { id: 'engineering', name: 'engineering',       unread: 0 },
  { id: 'design',      name: 'design',            unread: 2 },
];

const INITIAL_MESSAGES: Record<string, Message[]> = {
  general: [
    { id: 'm1', author: 'Alice Kim',   initials: 'AK', color: 'bg-purple-500', time: '10:30 AM', content: 'Good morning everyone! Sprint planning at 2pm today.' },
    { id: 'm2', author: 'Bob Taylor',  initials: 'BT', color: 'bg-blue-500',   time: '10:45 AM', content: "On it! I'll have the performance report ready before then." },
    { id: 'm3', author: 'Carol Patel', initials: 'CP', color: 'bg-pink-500',   time: '11:00 AM', content: 'New wireframes uploaded to Files tab in Apollo project. Please review 🎨' },
    { id: 'm4', author: 'Anant Gupta', initials: 'AN', color: 'bg-brand-600', time: '11:30 AM', content: 'Great work team! Milestone 1 is now 85% complete.' },
    { id: 'm5', author: 'Dan Voss',    initials: 'DV', color: 'bg-red-500',    time: '2:15 PM',  content: 'Sprint planning done. 12 tickets assigned for Sprint 2.' },
  ],
  apollo: [
    { id: 'a1', author: 'Alice Kim',   initials: 'AK', color: 'bg-purple-500', time: '9:00 AM', content: 'Wireframes updated — v3 is now in the Files tab.' },
    { id: 'a2', author: 'Carol Patel', initials: 'CP', color: 'bg-pink-500',   time: '9:20 AM', content: 'Looks great! The nav restructuring is much cleaner.' },
  ],
  mobile: [],
  engineering: [
    { id: 'e1', author: 'Bob Taylor', initials: 'BT', color: 'bg-blue-500', time: 'Yesterday', content: 'Bumped Next.js to 14.2.29. Build times improved by 20%.' },
  ],
  design: [
    { id: 'd1', author: 'Carol Patel', initials: 'CP', color: 'bg-pink-500', time: '2 days ago', content: 'Updated the component library with the new color system.' },
    { id: 'd2', author: 'Grace Lee',   initials: 'GL', color: 'bg-cyan-500', time: '2 days ago', content: 'Added dark mode variants to all button components 🌙' },
  ],
};

const CHANNEL_MEMBER_COUNT: Record<string, number> = {
  general: 8,
  apollo: 6,
  'mobile-app-v2': 4,
  engineering: 3,
  design: 2,
};

function Avatar({ initials, color, size = 'md' }: { initials: string; color: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0
      ${size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs'}
      ${color}`}>
      {initials}
    </span>
  );
}

export default function DiscussPage() {
  const [selectedChannel, setSelectedChannel] = useState('general');
  const [messages, setMessages] = useState<Record<string, Message[]>>(INITIAL_MESSAGES);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState<Record<string, number>>(
    Object.fromEntries(CHANNELS.map(c => [c.id, c.unread]))
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedChannel]);

  function handleChannelSelect(id: string) {
    setSelectedChannel(id);
    setUnread(prev => ({ ...prev, [id]: 0 }));
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      author: 'You',
      initials: 'ME',
      color: 'bg-brand-600',
      time: 'Just now',
      content: trimmed,
    };
    setMessages(prev => ({
      ...prev,
      [selectedChannel]: [...(prev[selectedChannel] || []), newMsg],
    }));
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const currentChannel = CHANNELS.find(c => c.id === selectedChannel);
  const currentMessages = messages[selectedChannel] || [];
  const memberCount = CHANNEL_MEMBER_COUNT[currentChannel?.name ?? ''] ?? CHANNEL_MEMBER_COUNT['general'];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 shrink-0 flex flex-col" style={{ backgroundColor: '#1a1f36' }}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/10">
          <h2 className="text-white font-bold text-base">Discuss</h2>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto py-3">
          <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Channels
          </p>
          <ul className="space-y-0.5 px-2">
            {CHANNELS.map(ch => (
              <li key={ch.id}>
                <button
                  onClick={() => handleChannelSelect(ch.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedChannel === ch.id
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Hash size={13} className="shrink-0 opacity-70" />
                    <span className="truncate">{ch.name}</span>
                  </span>
                  {unread[ch.id] > 0 && (
                    <span className="ml-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shrink-0">
                      {unread[ch.id]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Channel header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 shrink-0">
          <Hash size={16} className="text-gray-400" />
          <span className="font-semibold text-gray-900">{currentChannel?.name}</span>
          <span className="text-xs text-gray-400 ml-1">{memberCount} members</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {currentMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Hash size={32} className="text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No messages yet. Be the first to say something!</p>
            </div>
          ) : (
            currentMessages.map((msg, idx) => {
              const prev = currentMessages[idx - 1];
              const sameAuthor = prev && prev.author === msg.author;
              return (
                <div key={msg.id} className="flex items-start gap-3">
                  {sameAuthor ? (
                    <div className="w-8 shrink-0" />
                  ) : (
                    <Avatar initials={msg.initials} color={msg.color} />
                  )}
                  <div className="flex-1 min-w-0">
                    {!sameAuthor && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-gray-900">{msg.author}</span>
                        <span className="text-xs text-gray-400">{msg.time}</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-700 leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Compose bar */}
        <div className="border-t border-gray-200 p-3 shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${currentChannel?.name}`}
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none leading-5 max-h-28"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 ml-1">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
