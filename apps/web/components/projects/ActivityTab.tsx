'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  CheckSquare,
  Plus,
  MessageCircle,
  RefreshCw,
  UserPlus,
  FileText,
  Flag,
  ThumbsUp,
  Download,
} from 'lucide-react';

type ActivityEvent = {
  id: string;
  type: 'task_created' | 'task_completed' | 'comment' | 'status_changed' | 'member_added' | 'file_uploaded' | 'milestone' | 'approval';
  actor: string;
  actorInitials: string;
  actorColor: string;
  text: string;
  detail?: string;
  time: string;
  date: string;
};

const ACTIVITY_EVENTS: ActivityEvent[] = [
  { id: 'a1',  type: 'task_completed',  actor: 'Anant Gupta',  actorInitials: 'AN', actorColor: 'bg-brand-600', text: 'completed task',                         detail: '"Define information architecture"', time: '10:30 AM', date: 'Today' },
  { id: 'a2',  type: 'comment',         actor: 'Alice Kim',    actorInitials: 'AK', actorColor: 'bg-purple-500', text: 'commented on',                            detail: '"Design component library"',        time: '11:15 AM', date: 'Today' },
  { id: 'a3',  type: 'status_changed',  actor: 'Bob Taylor',   actorInitials: 'BT', actorColor: 'bg-blue-500',   text: 'moved "Navbar" from Open to In Progress', detail: undefined,                           time: '2:00 PM',  date: 'Today' },
  { id: 'a4',  type: 'file_uploaded',   actor: 'Carol Patel',  actorInitials: 'CP', actorColor: 'bg-pink-500',   text: 'uploaded',                                detail: '"Wireframes_v3.fig"',               time: '3:30 PM',  date: 'Today' },
  { id: 'a5',  type: 'task_created',    actor: 'Bob Taylor',   actorInitials: 'BT', actorColor: 'bg-blue-500',   text: 'created task',                            detail: '"Performance benchmark baseline"',  time: '9:00 AM',  date: 'Yesterday' },
  { id: 'a6',  type: 'member_added',    actor: 'Anant Gupta',  actorInitials: 'AN', actorColor: 'bg-brand-600', text: 'added',                                   detail: 'Dan Voss to the project',           time: '10:00 AM', date: 'Yesterday' },
  { id: 'a7',  type: 'milestone',       actor: 'System',       actorInitials: 'SY', actorColor: 'bg-gray-400',   text: 'Milestone "Phase 1 Complete" is due in 7 days', detail: undefined,                     time: '9:00 AM',  date: 'Yesterday' },
  { id: 'a8',  type: 'approval',        actor: 'Anant Gupta',  actorInitials: 'AN', actorColor: 'bg-brand-600', text: 'approved project phase change',           detail: 'PLANNING → ACTIVE',                time: '4:00 PM',  date: 'Jun 20' },
  { id: 'a9',  type: 'task_completed',  actor: 'Anant Gupta',  actorInitials: 'AN', actorColor: 'bg-brand-600', text: 'completed task',                          detail: '"SEO keyword research"',            time: '5:30 PM',  date: 'Jun 20' },
  { id: 'a10', type: 'comment',         actor: 'Bob Taylor',   actorInitials: 'BT', actorColor: 'bg-blue-500',   text: 'commented on',                            detail: '"Performance benchmark baseline"',  time: '11:00 AM', date: 'Jun 19' },
];

const FILTER_LABELS = ['All', 'Tasks', 'Comments', 'Files', 'Milestones'] as const;
type FilterLabel = typeof FILTER_LABELS[number];

function matchesFilter(event: ActivityEvent, filter: FilterLabel): boolean {
  if (filter === 'All') return true;
  if (filter === 'Tasks') return ['task_created', 'task_completed', 'status_changed'].includes(event.type);
  if (filter === 'Comments') return event.type === 'comment';
  if (filter === 'Files') return event.type === 'file_uploaded';
  if (filter === 'Milestones') return event.type === 'milestone';
  return true;
}

const EVENT_ICON: Record<ActivityEvent['type'], React.ReactNode> = {
  task_completed: <CheckSquare className="w-3.5 h-3.5" />,
  task_created:   <Plus className="w-3.5 h-3.5" />,
  comment:        <MessageCircle className="w-3.5 h-3.5" />,
  status_changed: <RefreshCw className="w-3.5 h-3.5" />,
  member_added:   <UserPlus className="w-3.5 h-3.5" />,
  file_uploaded:  <FileText className="w-3.5 h-3.5" />,
  milestone:      <Flag className="w-3.5 h-3.5" />,
  approval:       <ThumbsUp className="w-3.5 h-3.5" />,
};

const EVENT_ICON_COLOR: Record<ActivityEvent['type'], string> = {
  task_completed: 'bg-green-100 text-green-600',
  task_created:   'bg-blue-100 text-blue-600',
  comment:        'bg-purple-100 text-purple-600',
  status_changed: 'bg-orange-100 text-orange-600',
  member_added:   'bg-teal-100 text-teal-600',
  file_uploaded:  'bg-brand-100 text-brand-600',
  milestone:      'bg-yellow-100 text-yellow-600',
  approval:       'bg-brand-100 text-brand-600',
};

function EventRow({ event }: { event: ActivityEvent }) {
  const isSystem = event.type === 'milestone';

  return (
    <div className="flex gap-3 py-2.5">
      {/* Avatar or icon circle */}
      {isSystem ? (
        <div
          className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
            EVENT_ICON_COLOR[event.type]
          )}
        >
          {EVENT_ICON[event.type]}
        </div>
      ) : (
        <div
          className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
            event.actorColor
          )}
        >
          {event.actorInitials}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 leading-snug">
          {!isSystem && (
            <span className="font-semibold text-gray-900">{event.actor} </span>
          )}
          <span>{event.text}</span>
          {event.detail && (
            <span className="font-medium text-brand-600"> {event.detail}</span>
          )}
        </p>
      </div>

      {/* Time */}
      <span className="text-xs text-gray-400 ml-auto shrink-0 pt-0.5">{event.time}</span>
    </div>
  );
}

export default function ActivityTab({ projectId: _projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<FilterLabel>('All');

  // Group events by date, preserving order
  const dates = Array.from(new Set(ACTIVITY_EVENTS.map((e) => e.date)));

  return (
    <div className="flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap -mx-6 px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
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

      {/* Activity feed */}
      <div className="mt-2">
        {dates.map((date, dateIdx) => {
          const events = ACTIVITY_EVENTS.filter(
            (e) => e.date === date && matchesFilter(e, filter)
          );
          if (events.length === 0) return null;

          return (
            <div key={date}>
              <div
                className={clsx(
                  'text-xs font-semibold text-gray-400 uppercase tracking-wider py-2 border-b border-gray-100 mb-2',
                  dateIdx > 0 && 'mt-4'
                )}
              >
                {date}
              </div>
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          );
        })}

        {/* Empty state */}
        {dates.every((date) =>
          ACTIVITY_EVENTS.filter(
            (e) => e.date === date && matchesFilter(e, filter)
          ).length === 0
        ) && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <RefreshCw className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">No activity for this filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
