'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Plus, MessageCircle, RefreshCw, Flag, CheckCircle, Trash2, FolderKanban, Clock, Download, Activity as ActivityIcon,
} from 'lucide-react';
import { api, type ActivityItem } from '@/lib/api';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';

// action → display verb, filter category, and icon.
const ACTION_META: Record<string, { verb: string; cat: string; icon: React.ReactNode; color: string }> = {
  'task.created':         { verb: 'created task',          cat: 'Tasks',    icon: <Plus className="w-3.5 h-3.5" />,        color: 'bg-blue-100 text-blue-600' },
  'task.status_changed':  { verb: 'changed status of',     cat: 'Tasks',    icon: <RefreshCw className="w-3.5 h-3.5" />,   color: 'bg-amber-100 text-amber-600' },
  'task.updated':         { verb: 'updated task',          cat: 'Tasks',    icon: <ActivityIcon className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-600' },
  'task.deleted':         { verb: 'deleted task',          cat: 'Tasks',    icon: <Trash2 className="w-3.5 h-3.5" />,      color: 'bg-red-100 text-red-600' },
  'comment.created':      { verb: 'commented',             cat: 'Comments', icon: <MessageCircle className="w-3.5 h-3.5" />, color: 'bg-purple-100 text-purple-600' },
  'issue.created':        { verb: 'reported issue',        cat: 'Issues',   icon: <Flag className="w-3.5 h-3.5" />,        color: 'bg-orange-100 text-orange-600' },
  'issue.updated':        { verb: 'updated issue',         cat: 'Issues',   icon: <Flag className="w-3.5 h-3.5" />,        color: 'bg-orange-100 text-orange-600' },
  'issue.resolved':       { verb: 'resolved issue',        cat: 'Issues',   icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-600' },
  'project.created':      { verb: 'created the project',   cat: 'Projects', icon: <FolderKanban className="w-3.5 h-3.5" />, color: 'bg-brand-100 text-brand-600' },
  'project.approved':     { verb: 'approved the project',  cat: 'Projects', icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-600' },
  'project.rejected':     { verb: 'rejected the project',  cat: 'Projects', icon: <Trash2 className="w-3.5 h-3.5" />,      color: 'bg-red-100 text-red-600' },
  'timesheet.logged':     { verb: 'logged time',           cat: 'Tasks',    icon: <Clock className="w-3.5 h-3.5" />,       color: 'bg-teal-100 text-teal-600' },
};
function metaFor(action: string) {
  return ACTION_META[action] ?? { verb: action, cat: 'Other', icon: <ActivityIcon className="w-3.5 h-3.5" />, color: 'bg-gray-100 text-gray-500' };
}

const FILTERS = ['All', 'Tasks', 'Comments', 'Issues', 'Projects'] as const;
type FilterLabel = (typeof FILTERS)[number];

function formatTime(d: Date) {
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
function detailOf(a: ActivityItem): string | null {
  const m = a.metadata ?? {};
  if (a.action === 'comment.created' && m.snippet) return `“${m.snippet}”`;
  if (a.action === 'task.status_changed' && m.title) return `${m.title}`;
  if (m.title) return `“${m.title}”`;
  return null;
}

function EventRow({ a }: { a: ActivityItem }) {
  const meta = metaFor(a.action);
  const at = new Date(a.createdAt);
  return (
    <div className="flex gap-3 py-2.5">
      {a.actor ? (
        <Avatar user={a.actor} size={28} className="shrink-0" />
      ) : (
        <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', meta.color)}>{meta.icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 leading-snug">
          {a.actor && <span className="font-semibold text-gray-900">{fullName(a.actor)} </span>}
          <span>{meta.verb}</span>
          {detailOf(a) && <span className="font-medium text-brand-600 break-words"> {detailOf(a)}</span>}
        </p>
      </div>
      <span className="text-xs text-gray-400 ml-auto shrink-0 pt-0.5">{formatTime(at)}</span>
    </div>
  );
}

export default function ActivityTab({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<FilterLabel>('All');

  const { data: items = [], isLoading, isError } = useQuery<ActivityItem[]>({
    queryKey: ['activity', 'PROJECT', projectId],
    queryFn: () => api.activity.list({ projectId, limit: 150 }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(
    () => items.filter(a => filter === 'All' || metaFor(a.action).cat === filter),
    [items, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const a of filtered) {
      const label = dateLabel(new Date(a.createdAt));
      (map.get(label) ?? map.set(label, []).get(label)!).push(a);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function exportCsv() {
    const rows = [
      ['time', 'actor', 'action', 'detail'],
      ...filtered.map(a => [
        new Date(a.createdAt).toISOString(),
        a.actor ? fullName(a.actor) : '',
        a.action,
        (detailOf(a) ?? '').replace(/"/g, '""'),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url; link.download = `activity-${projectId}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-3 flex-wrap -mx-6 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <span className="text-xs font-medium text-gray-500 shrink-0">Filter by:</span>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx('px-3 py-1 text-xs font-medium rounded-full transition-colors',
              filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

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
        {!isLoading && !isError && groups.map(([label, rows], gi) => (
          <div key={label}>
            <div className={clsx('text-xs font-semibold text-gray-400 uppercase tracking-wider py-2 border-b border-gray-100 mb-2', gi > 0 && 'mt-4')}>
              {label}
            </div>
            {rows.map(a => <EventRow key={a.id} a={a} />)}
          </div>
        ))}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <ActivityIcon className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">{filter === 'All' ? 'No activity yet — actions will appear here.' : `No ${filter.toLowerCase()} activity.`}</p>
          </div>
        )}
      </div>
    </div>
  );
}
