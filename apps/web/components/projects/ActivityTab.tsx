'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CheckSquare,
  Plus,
  MessageCircle,
  RefreshCw,
  FileText,
  Flag,
  Download,
} from 'lucide-react';
import { api, type ApiComment, type ApiTask } from '@/lib/api';
import { userInitials, avatarColor, fullName } from '@/lib/avatar';

type ActivityType = 'task_created' | 'comment';

type ActivityEvent = {
  id: string;
  type: ActivityType;
  user?: { id: string; firstName?: string | null; lastName?: string | null } | null;
  text: string;
  detail?: string;
  at: Date;
};

const FILTER_LABELS = ['All', 'Tasks', 'Comments', 'Files', 'Milestones'] as const;
type FilterLabel = (typeof FILTER_LABELS)[number];

function matchesFilter(event: ActivityEvent, filter: FilterLabel): boolean {
  if (filter === 'All') return true;
  if (filter === 'Tasks') return event.type === 'task_created';
  if (filter === 'Comments') return event.type === 'comment';
  // No real data source yet for Files / Milestones.
  return false;
}

const EVENT_ICON: Record<ActivityType, React.ReactNode> = {
  task_created: <Plus className="w-3.5 h-3.5" />,
  comment: <MessageCircle className="w-3.5 h-3.5" />,
};

const EVENT_ICON_COLOR: Record<ActivityType, string> = {
  task_created: 'bg-blue-100 text-blue-600',
  comment: 'bg-purple-100 text-purple-600',
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dateLabel(d: Date): string {
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function EventRow({ event }: { event: ActivityEvent }) {
  const name = fullName(event.user);

  return (
    <div className="flex gap-3 py-2.5">
      {/* Avatar (real user) or event-type icon circle */}
      {event.user ? (
        <div
          className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
            avatarColor(event.user.id)
          )}
        >
          {userInitials(event.user)}
        </div>
      ) : (
        <div
          className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
            EVENT_ICON_COLOR[event.type]
          )}
        >
          {EVENT_ICON[event.type]}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 leading-snug">
          {event.user && <span className="font-semibold text-gray-900">{name} </span>}
          <span>{event.text}</span>
          {event.detail && (
            <span className="font-medium text-brand-600 break-words"> {event.detail}</span>
          )}
        </p>
      </div>

      {/* Time */}
      <span className="text-xs text-gray-400 ml-auto shrink-0 pt-0.5">{formatTime(event.at)}</span>
    </div>
  );
}

function truncate(s: string, max = 80): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export default function ActivityTab({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<FilterLabel>('All');

  const commentsQuery = useQuery({
    queryKey: ['comments', 'PROJECT', projectId],
    queryFn: () => api.comments.list('PROJECT', projectId),
    staleTime: 30_000,
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks.list(projectId),
    staleTime: 30_000,
  });

  const events = useMemo<ActivityEvent[]>(() => {
    const list: ActivityEvent[] = [];

    for (const c of (commentsQuery.data ?? []) as ApiComment[]) {
      list.push({
        id: `c-${c.id}`,
        type: 'comment',
        user: c.user ?? null,
        text: 'commented',
        detail: `“${truncate(c.content)}”`,
        at: new Date(c.createdAt),
      });
    }

    for (const t of (tasksQuery.data ?? []) as ApiTask[]) {
      list.push({
        id: `t-${t.id}`,
        type: 'task_created',
        // Tasks don't expose the creator's user object; fall back to an icon row.
        user: t.assignees?.[0]?.user ?? null,
        text: 'created task',
        detail: `“${truncate(t.title)}”`,
        at: new Date(t.createdAt),
      });
    }

    list.sort((a, b) => b.at.getTime() - a.at.getTime());
    return list;
  }, [commentsQuery.data, tasksQuery.data]);

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, filter)),
    [events, filter]
  );

  // Group events by date label, preserving sorted order.
  const groups = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of filtered) {
      const label = dateLabel(e.at);
      const arr = map.get(label);
      if (arr) arr.push(e);
      else map.set(label, [e]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const isLoading = commentsQuery.isLoading || tasksQuery.isLoading;
  const isError = commentsQuery.isError || tasksQuery.isError;

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Top bar — non-scrolling header (sibling above the scroll region) */}
      <div className="flex items-center gap-3 flex-wrap -mx-6 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="text-xs font-medium text-gray-500 shrink-0">Filter by:</span>
        {FILTER_LABELS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-3 py-1 text-xs font-medium rounded-full transition-colors',
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => {}}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* Activity feed — its own scroll area below the bar */}
      <div className="flex-1 overflow-y-auto min-h-0 pt-2">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin mb-3" />
            <p className="text-sm text-gray-500">Loading activity…</p>
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-red-500">Failed to load activity.</p>
          </div>
        )}

        {!isLoading && !isError &&
          groups.map(([label, items], groupIdx) => (
            <div key={label}>
              <div
                className={clsx(
                  'text-xs font-semibold text-gray-400 uppercase tracking-wider py-2 border-b border-gray-100 mb-2',
                  groupIdx > 0 && 'mt-4'
                )}
              >
                {label}
              </div>
              {items.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          ))}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <RefreshCw className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">
              {filter === 'All' ? 'No activity yet.' : 'No activity for this filter.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
