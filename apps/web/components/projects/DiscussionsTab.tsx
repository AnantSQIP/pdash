'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { api, ApiComment } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function CommentRow({
  comment,
  canDelete,
  deleting,
  onDelete,
}: {
  comment: ApiComment;
  canDelete: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-4">
      <Avatar user={comment.user} size={36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{fullName(comment.user)}</span>
          <span className="text-xs text-gray-400 ml-auto">{formatTimestamp(comment.createdAt)}</span>
        </div>
        <p className="text-sm text-gray-700 mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
          {comment.content}
        </p>
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(comment.id)}
          disabled={deleting}
          title="Delete message"
          className="shrink-0 p-1.5 -m-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-40 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function DiscussionsTab({ projectId }: { projectId: string }) {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const queryKey = ['comments', 'PROJECT', projectId] as const;

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.comments.list('PROJECT', projectId),
    staleTime: 15_000,
  });

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Oldest -> newest, like a chat thread.
  const ordered = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  async function handlePost() {
    const content = draft.trim();
    if (!content || sending || !currentUser) return;
    setSending(true);
    try {
      await api.comments.create({
        entityType: 'PROJECT',
        entityId: projectId,
        userId: currentUser.id,
        content,
      });
      setDraft('');
      await queryClient.invalidateQueries({ queryKey });
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await api.comments.delete(id);
      await queryClient.invalidateQueries({ queryKey });
    } finally {
      setDeletingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePost();
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">Discussion</h2>
          {comments.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
              {comments.length}
            </span>
          )}
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            Loading discussion…
          </div>
        ) : ordered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <MessageSquare className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">No discussion yet</h3>
            <p className="text-sm text-gray-500">Start the conversation below.</p>
          </div>
        ) : (
          ordered.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              canDelete={!!currentUser && comment.userId === currentUser.id && can('comment.delete')}
              deleting={deletingId === comment.id}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Composer — fixed bottom bar */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <Avatar user={currentUser ?? undefined} size={36} />
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message… (Ctrl+Enter to post)"
              rows={2}
              disabled={!currentUser}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">Ctrl+Enter to post</span>
              <button
                onClick={handlePost}
                disabled={!draft.trim() || sending || !currentUser}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {sending ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
