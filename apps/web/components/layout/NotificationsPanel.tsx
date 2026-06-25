'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { RiNotification3Line, RiAlarmWarningLine, RiCalendarEventLine, RiFlag2Line, RiCheckboxCircleLine, RiTimeLine } from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiTask, type CalendarEvent } from '@/lib/api';
import { useOrg } from '@/lib/org-context';

type Notif = {
  id: string;
  kind: 'overdue' | 'due' | 'event' | 'milestone' | 'done';
  text: string;
  time: string;
  ts: number;
};

function relative(ts: number, now: number): string {
  const diff = ts - now;
  const absDays = Math.round(Math.abs(diff) / 86400000);
  if (diff < 0) {
    if (absDays === 0) return 'today';
    if (absDays === 1) return 'yesterday';
    return `${absDays}d ago`;
  }
  if (absDays === 0) return 'today';
  if (absDays === 1) return 'tomorrow';
  return `in ${absDays}d`;
}

const KIND_META: Record<Notif['kind'], { Icon: typeof RiAlarmWarningLine; color: string; bg: string }> = {
  overdue:   { Icon: RiAlarmWarningLine,   color: 'text-red-600',    bg: 'bg-red-50' },
  due:       { Icon: RiTimeLine,           color: 'text-amber-600',  bg: 'bg-amber-50' },
  event:     { Icon: RiCalendarEventLine,  color: 'text-brand-600',  bg: 'bg-brand-50' },
  milestone: { Icon: RiFlag2Line,          color: 'text-purple-600', bg: 'bg-purple-50' },
  done:      { Icon: RiCheckboxCircleLine, color: 'text-green-600',  bg: 'bg-green-50' },
};

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { org, currentUser } = useOrg();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const { data: tasks = [] } = useQuery<ApiTask[]>({
    queryKey: ['tasks-me', currentUser?.id],
    queryFn: () => api.tasks.listForUser(currentUser!.id),
    enabled: !!currentUser?.id,
    staleTime: 30_000,
  });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['events', org?.id, 'notif'],
    queryFn: () => api.events.list(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
  });

  const notifications = useMemo<Notif[]>(() => {
    const now = Date.now();
    const soon = now + 3 * 86400000; // next 3 days
    const items: Notif[] = [];

    for (const t of tasks) {
      const closed = t.currentStatus?.type === 'CLOSED' || t.completionPercentage === 100;
      if (!t.dueDate) continue;
      const due = new Date(t.dueDate).getTime();
      if (closed) continue;
      if (due < now) {
        items.push({ id: `t-${t.id}`, kind: 'overdue', text: `"${t.title}" is overdue`, time: relative(due, now), ts: due });
      } else if (due <= soon) {
        items.push({ id: `t-${t.id}`, kind: 'due', text: `"${t.title}" is due ${relative(due, now)}`, time: relative(due, now), ts: due });
      }
    }

    for (const e of events) {
      const start = new Date(e.startDate).getTime();
      if (start < now || start > soon) continue;
      const kind: Notif['kind'] = e.type === 'MILESTONE' ? 'milestone' : 'event';
      const verb = e.type === 'MILESTONE' ? 'Milestone' : 'Upcoming';
      items.push({ id: `e-${e.id}`, kind, text: `${verb}: "${e.title}" ${relative(start, now)}`, time: relative(start, now), ts: start });
    }

    // Soonest / most-overdue first
    return items.sort((a, b) => Math.abs(a.ts - now) - Math.abs(b.ts - now)).slice(0, 12);
  }, [tasks, events]);

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;
  const markAllRead = () => setReadIds(new Set(notifications.map(n => n.id)));
  const markRead = (id: string) => setReadIds(prev => new Set(prev).add(id));

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed left-20 bottom-4 z-50 w-96 max-h-[500px] rounded-xl shadow-2xl bg-white overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <RiNotification3Line size={16} className="text-gray-600" />
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-brand-600 text-white text-[10px] font-bold rounded-full leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <RiNotification3Line size={32} className="mb-2 opacity-40" />
              <p className="text-sm">You're all caught up</p>
              <p className="text-xs mt-0.5">No overdue tasks or upcoming deadlines</p>
            </div>
          ) : (
            <ul>
              {notifications.map(n => {
                const meta = KIND_META[n.kind];
                const read = readIds.has(n.id);
                return (
                  <li
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 relative ${read ? 'bg-white' : 'bg-blue-50/50'}`}
                  >
                    {!read && <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600 rounded-r-sm" />}
                    <div className={`w-8 h-8 shrink-0 rounded-full ${meta.bg} flex items-center justify-center`}>
                      <meta.Icon size={16} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0 pl-1">
                      <p className={`text-sm leading-snug ${read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>{n.text}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{n.time}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 shrink-0">
          <a href="/tasks" className="block w-full py-3 text-center text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors font-medium">
            View my tasks
          </a>
        </div>
      </div>
    </>
  );
}
