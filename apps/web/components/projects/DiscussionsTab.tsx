'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { MessageSquare, Reply, Send, Plus } from 'lucide-react';

type ReplyItem = {
  id: string;
  author: { name: string; initials: string; color: string };
  content: string;
  timestamp: string;
};

type Thread = {
  id: string;
  author: { name: string; initials: string; color: string; role: string };
  content: string;
  timestamp: string;
  replies: ReplyItem[];
};

const INITIAL_THREADS: Thread[] = [
  {
    id: 'd1',
    author: { name: 'Alice Kim', initials: 'AK', color: 'bg-purple-500', role: 'Product Manager' },
    content: "Hey team, I've updated the wireframes based on yesterday's feedback. Can everyone review by EOD Friday?",
    timestamp: '2026-06-20 at 10:30 AM',
    replies: [
      { id: 'r1', author: { name: 'Bob Taylor',   initials: 'BT', color: 'bg-blue-500'  }, content: 'On it! The new nav structure looks much cleaner.', timestamp: '2026-06-20 at 11:15 AM' },
      { id: 'r2', author: { name: 'Carol Patel',  initials: 'CP', color: 'bg-pink-500'  }, content: "Agreed. I'll have my feedback in the comments by Thursday.", timestamp: '2026-06-20 at 2:00 PM' },
    ],
  },
  {
    id: 'd2',
    author: { name: 'Bob Taylor', initials: 'BT', color: 'bg-blue-500', role: 'Senior Engineer' },
    content: "Performance benchmarks done. We're at 94 Lighthouse score on mobile. @Carol can you check the animation timings on the hero section?",
    timestamp: '2026-06-22 at 9:00 AM',
    replies: [],
  },
];

const CURRENT_USER = { name: 'You', initials: 'ME', color: 'bg-brand-500' };

function Avatar({ initials, color, size = 'md' }: { initials: string; color: string; size?: 'sm' | 'md' }) {
  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center text-white font-semibold shrink-0',
        color,
        size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
      )}
    >
      {initials}
    </div>
  );
}

function EmptyThreads() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <MessageSquare className="w-7 h-7 text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-800 mb-1">No discussions yet</h3>
      <p className="text-sm text-gray-500">Start a conversation with your team.</p>
    </div>
  );
}

function ReplyRow({ reply }: { reply: ReplyItem }) {
  return (
    <div className="flex gap-3 pt-3">
      <Avatar initials={reply.author.initials} color={reply.author.color} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{reply.author.name}</span>
          <span className="text-xs text-gray-400">{reply.timestamp}</span>
        </div>
        <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{reply.content}</p>
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  isExpanded,
  onToggle,
  onSendReply,
}: {
  thread: Thread;
  isExpanded: boolean;
  onToggle: () => void;
  onSendReply: (threadId: string, content: string) => void;
}) {
  const [replyText, setReplyText] = useState('');

  function handleSend() {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onSendReply(thread.id, trimmed);
    setReplyText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Thread header + content */}
      <div className="p-5">
        <div className="flex items-start gap-3">
          <Avatar initials={thread.author.initials} color={thread.author.color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{thread.author.name}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{thread.author.role}</span>
              <span className="text-xs text-gray-400 ml-auto">{thread.timestamp}</span>
            </div>
            <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{thread.content}</p>
          </div>
        </div>
      </div>

      {/* Reply section */}
      {(thread.replies.length > 0 || isExpanded) && (
        <div className="border-t border-gray-100 px-5 pb-4">
          {/* Replies with vertical connector */}
          {thread.replies.length > 0 && (
            <div className="relative pl-9">
              {/* Vertical line */}
              <div className="absolute left-[17px] top-0 bottom-0 w-px bg-gray-200" />
              <div className="space-y-0">
                {thread.replies.map((reply) => (
                  <ReplyRow key={reply.id} reply={reply} />
                ))}
              </div>
            </div>
          )}

          {thread.replies.length === 0 && isExpanded && (
            <p className="text-sm text-gray-400 italic py-3 pl-12">Be the first to reply</p>
          )}
        </div>
      )}

      {/* Footer: reply count + reply button */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
        {thread.replies.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <MessageSquare className="w-3.5 h-3.5" />
            {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
          </span>
        )}
        <button
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 ml-auto"
        >
          <Reply className="w-3.5 h-3.5" />
          Reply
        </button>
      </div>

      {/* Inline reply composer */}
      {isExpanded && (
        <div className="border-t border-gray-200 px-5 py-4 flex items-start gap-3 bg-white">
          <Avatar initials={CURRENT_USER.initials} color={CURRENT_USER.color} size="sm" />
          <div className="flex-1">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a reply… (Ctrl+Enter to send)"
              rows={2}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSend}
                disabled={!replyText.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-3 h-3" />
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscussionsTab() {
  const [threads, setThreads] = useState<Thread[]>(INITIAL_THREADS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newDiscussionText, setNewDiscussionText] = useState('');

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleSendReply(threadId: string, content: string) {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== threadId) return t;
        const newReply: ReplyItem = {
          id: `r-${Date.now()}`,
          author: { name: CURRENT_USER.name, initials: CURRENT_USER.initials, color: CURRENT_USER.color },
          content,
          timestamp: new Date().toLocaleString('en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: 'numeric', minute: '2-digit', hour12: true,
          }),
        };
        return { ...t, replies: [...t.replies, newReply] };
      })
    );
  }

  function handlePostDiscussion() {
    const trimmed = newDiscussionText.trim();
    if (!trimmed) return;

    const newThread: Thread = {
      id: `d-${Date.now()}`,
      author: { name: CURRENT_USER.name, initials: CURRENT_USER.initials, color: CURRENT_USER.color, role: 'Team Member' },
      content: trimmed,
      timestamp: new Date().toLocaleString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }),
      replies: [],
    };

    setThreads((prev) => [newThread, ...prev]);
    setNewDiscussionText('');
  }

  function handleNewDiscussionKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePostDiscussion();
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">Discussions</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
            {threads.length}
          </span>
        </div>
        <button
          onClick={() => {
            // Scroll to or focus the composer
            document.getElementById('new-discussion-textarea')?.focus();
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Discussion
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {threads.length === 0 ? (
          <EmptyThreads />
        ) : (
          threads.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              isExpanded={expandedId === thread.id}
              onToggle={() => toggleExpanded(thread.id)}
              onSendReply={handleSendReply}
            />
          ))
        )}
      </div>

      {/* New discussion composer — fixed bottom bar */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <Avatar initials={CURRENT_USER.initials} color={CURRENT_USER.color} />
          <div className="flex-1">
            <textarea
              id="new-discussion-textarea"
              value={newDiscussionText}
              onChange={(e) => setNewDiscussionText(e.target.value)}
              onKeyDown={handleNewDiscussionKey}
              placeholder="Start a new discussion… (Ctrl+Enter to post)"
              rows={2}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">Ctrl+Enter to post</span>
              <button
                onClick={handlePostDiscussion}
                disabled={!newDiscussionText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
