'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Trash2, AtSign } from 'lucide-react';
import { api, ApiComment } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { AttachButton, AttachmentList, PendingAttachmentChips, useAttachmentUploads } from '@/components/files/Attachments';

type Member = { id: string; name: string; first: string; user: { id: string; firstName: string; lastName?: string; email?: string; profilePhoto?: string | null } };

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Render message text with any "@Member Name" that matches a project member highlighted. */
function MentionText({ content, names }: { content: string; names: string[] }) {
  if (!names.length) return <>{content}</>;
  // Longest names first so "@Anant Gupta" wins over a shorter "@Anant".
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(n => escapeRegex('@' + n)).join('|')})`, 'g');
  const parts = content.split(re);
  const set = new Set(sorted.map(n => '@' + n));
  return (
    <>
      {parts.map((p, i) =>
        set.has(p)
          ? <span key={i} className="font-medium text-brand-600 bg-brand-50 rounded px-0.5">{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function CommentRow({ comment, memberNames, canDelete, deleting, onDelete }: {
  comment: ApiComment; memberNames: string[]; canDelete: boolean; deleting: boolean; onDelete: (id: string) => void;
}) {
  return (
    <div className="group flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-4">
      <Avatar user={comment.user} size={36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{fullName(comment.user)}</span>
          <span className="text-xs text-gray-400 ml-auto">{formatTimestamp(comment.createdAt)}</span>
        </div>
        {comment.content && (
          <p className="text-sm text-gray-700 mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
            <MentionText content={comment.content} names={memberNames} />
          </p>
        )}
        <AttachmentList attachments={comment.attachments} />
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const queryKey = ['comments', 'PROJECT', projectId] as const;
  const { data: comments = [], isLoading } = useQuery({
    queryKey, queryFn: () => api.comments.list('PROJECT', projectId), staleTime: 15_000,
  });

  // Project members — the only people who can be @mentioned in this discussion.
  const { data: project } = useQuery({
    queryKey: ['project', projectId], queryFn: () => api.projects.get(projectId), staleTime: 60_000,
  });
  const members: Member[] = useMemo(
    () => (project?.members ?? [])
      .filter(m => m.isActive)
      .map(m => ({ id: m.userId, name: fullName(m.user), first: m.user.firstName, user: m.user }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [project],
  );
  const memberNames = useMemo(() => members.map(m => m.name), [members]);
  const candidates = useMemo(() => members.filter(m => m.id !== currentUser?.id), [members, currentUser]);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const attachments = useAttachmentUploads();

  // @mention autocomplete state.
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return candidates.filter(m => m.name.toLowerCase().includes(q) || m.first.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mention, candidates]);

  const ordered = [...comments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  /** Detect an in-progress "@query" immediately before the caret (@ at start or after whitespace). */
  function detectMention(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)@(\S{0,40})$/);
    if (!m) return null;
    return { query: m[1], at: caret - m[1].length - 1 }; // index of the '@'
  }

  function onDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setDraft(value);
    const found = detectMention(value, e.target.selectionStart ?? value.length);
    setMention(found);
    setHighlight(0);
  }

  function pickMention(m: Member) {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, mention.at)}@${m.name} ${draft.slice(caret)}`;
    setDraft(next);
    setMention(null);
    // Restore focus + place the caret right after the inserted mention.
    const pos = mention.at + m.name.length + 2;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  }

  async function handlePost() {
    const content = draft.trim();
    const hasFiles = attachments.documentIds.length > 0;
    if ((!content && !hasFiles) || attachments.uploading || sending || !currentUser) return;
    // Which project members are actually named in the final text.
    const mentionedUserIds = members.filter(m => content.includes(`@${m.name}`)).map(m => m.id);
    setSending(true);
    try {
      await api.comments.create({
        entityType: 'PROJECT', entityId: projectId, userId: currentUser.id, content,
        documentIds: hasFiles ? attachments.documentIds : undefined,
        mentionedUserIds: mentionedUserIds.length ? mentionedUserIds : undefined,
      });
      setDraft('');
      setMention(null);
      attachments.clear();
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not post your message.', 'error');
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
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the message.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // When the mention menu is open, arrows/enter/esc drive it instead of the textarea.
    if (mention && filtered.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(filtered[highlight]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePost(); }
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
        <span className="hidden sm:inline text-xs text-gray-400">Type <span className="font-medium text-gray-500">@</span> to mention a member</span>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading discussion…</div>
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
              memberNames={memberNames}
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
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={onDraftChange}
                onKeyDown={handleKeyDown}
                onClick={e => setMention(detectMention(draft, e.currentTarget.selectionStart ?? draft.length))}
                placeholder="Write a message… (@ to mention · Ctrl+Enter to post)"
                rows={2}
                disabled={!currentUser}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50"
              />

              {/* @mention dropdown */}
              {mention && filtered.length > 0 && (
                <div className="absolute left-0 bottom-full mb-1 z-30 w-64 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><AtSign size={11} /> Project members</p>
                  {filtered.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); pickMention(m); }}
                      onMouseEnter={() => setHighlight(i)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${i === highlight ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                    >
                      <Avatar user={m.user} size={22} />
                      <span className="text-gray-800 truncate">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {attachments.error && <p className="text-xs text-red-600 mt-1">{attachments.error}</p>}
            {attachments.pending.length > 0 && (
              <div className="mt-2"><PendingAttachmentChips items={attachments.pending} onRemove={attachments.remove} /></div>
            )}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <AttachButton onPick={attachments.add} disabled={!currentUser || sending} />
                <span className="text-xs text-gray-400">Ctrl+Enter to post</span>
              </div>
              <button
                onClick={handlePost}
                disabled={(!draft.trim() && attachments.documentIds.length === 0) || attachments.uploading || sending || !currentUser}
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
