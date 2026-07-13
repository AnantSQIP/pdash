'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  RiNotification3Line, RiAlarmWarningLine, RiCalendarEventLine, RiFlag2Line,
  RiCheckboxCircleLine, RiTimeLine, RiUserAddLine, RiCloseCircleLine,
  RiShieldKeyholeLine, RiUserSettingsLine, RiChat3Line,
} from '@remixicon/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiTask, type CalendarEvent, type NotificationItem } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { Portal } from '@/components/ui/Portal';

type Reminder = { id: string; kind: 'overdue' | 'due' | 'event' | 'milestone'; text: string; time: string; ts: number };

function relativePast(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(diff / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
function relativeDue(ts: number): string {
  const diff = ts - Date.now();
  const absDays = Math.round(Math.abs(diff) / 86400000);
  if (diff < 0) return absDays === 0 ? 'today' : absDays === 1 ? 'yesterday' : `${absDays}d ago`;
  return absDays === 0 ? 'today' : absDays === 1 ? 'tomorrow' : `in ${absDays}d`;
}

const TYPE_META: Record<string, { Icon: typeof RiNotification3Line; color: string; bg: string }> = {
  'task.assigned':    { Icon: RiUserAddLine,        color: 'text-brand-600',  bg: 'bg-brand-50' },
  'task.overdue':        { Icon: RiAlarmWarningLine, color: 'text-red-600',    bg: 'bg-red-50' },
  'task.overdue_digest': { Icon: RiAlarmWarningLine, color: 'text-amber-600',  bg: 'bg-amber-50' },
  'project.approval_requested': { Icon: RiCheckboxCircleLine, color: 'text-brand-600', bg: 'bg-brand-50' },
  'leave.approved':   { Icon: RiCheckboxCircleLine, color: 'text-green-600',  bg: 'bg-green-50' },
  'leave.rejected':   { Icon: RiCloseCircleLine,    color: 'text-red-600',    bg: 'bg-red-50' },
  'project.approved': { Icon: RiCheckboxCircleLine, color: 'text-green-600',  bg: 'bg-green-50' },
  'project.rejected': { Icon: RiCloseCircleLine,    color: 'text-red-600',    bg: 'bg-red-50' },
  'meeting.invited':  { Icon: RiCalendarEventLine,  color: 'text-brand-600',  bg: 'bg-brand-50' },
  'meeting.updated':  { Icon: RiCalendarEventLine,  color: 'text-amber-600',  bg: 'bg-amber-50' },
  'access.changed':   { Icon: RiShieldKeyholeLine,  color: 'text-purple-600', bg: 'bg-purple-50' },
  'account.updated':  { Icon: RiUserSettingsLine,   color: 'text-slate-600',  bg: 'bg-slate-100' },
  'discussion.added': { Icon: RiChat3Line,          color: 'text-brand-600',  bg: 'bg-brand-50' },
};
function typeMeta(t: string) { return TYPE_META[t] ?? { Icon: RiNotification3Line, color: 'text-gray-600', bg: 'bg-gray-100' }; }

const KIND_META: Record<Reminder['kind'], { Icon: typeof RiAlarmWarningLine; color: string; bg: string }> = {
  overdue:   { Icon: RiAlarmWarningLine,  color: 'text-red-600',    bg: 'bg-red-50' },
  due:       { Icon: RiTimeLine,          color: 'text-amber-600',  bg: 'bg-amber-50' },
  event:     { Icon: RiCalendarEventLine, color: 'text-brand-600',  bg: 'bg-brand-50' },
  milestone: { Icon: RiFlag2Line,         color: 'text-purple-600', bg: 'bg-purple-50' },
};

export function NotificationsPanel({ onClose, collapsed = false }: { onClose: () => void; collapsed?: boolean }) {
  const { org, currentUser } = useOrg();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Real, DB-backed notifications — polled every 15s for near-realtime sync.
  const { data: notifs = [] } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(30),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // Derived deadline reminders (live-computed, not persisted) — kept as a helpful supplement.
  const { data: tasks = [] } = useQuery<ApiTask[]>({
    queryKey: ['tasks-me', currentUser?.id], queryFn: () => api.tasks.listForUser(currentUser!.id), enabled: !!currentUser?.id, staleTime: 30_000,
  });
  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['events', org?.id, 'notif'], queryFn: () => api.events.list(org!.id), enabled: !!org?.id, staleTime: 30_000,
  });

  const reminders = useMemo<Reminder[]>(() => {
    const now = Date.now();
    const soon = now + 3 * 86400000;
    const items: Reminder[] = [];
    for (const t of tasks) {
      if (!t.dueDate || t.currentStatus?.type === 'CLOSED' || t.completionPercentage === 100) continue;
      const due = new Date(t.dueDate).getTime();
      if (due < now) items.push({ id: `t-${t.id}`, kind: 'overdue', text: `"${t.title}" is overdue`, time: relativeDue(due), ts: due });
      else if (due <= soon) items.push({ id: `t-${t.id}`, kind: 'due', text: `"${t.title}" is due ${relativeDue(due)}`, time: relativeDue(due), ts: due });
    }
    for (const e of events) {
      const start = new Date(e.startDate).getTime();
      if (start < now || start > soon) continue;
      const milestone = e.type === 'MILESTONE';
      items.push({ id: `e-${e.id}`, kind: milestone ? 'milestone' : 'event', text: `${milestone ? 'Milestone' : 'Upcoming'}: "${e.title}" ${relativeDue(start)}`, time: relativeDue(start), ts: start });
    }
    return items.filter(i => !dismissed.has(i.id)).sort((a, b) => Math.abs(a.ts - now) - Math.abs(b.ts - now)).slice(0, 12);
  }, [tasks, events, dismissed]);

  const unread = notifs.filter(n => !n.isRead).length;
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread'] }); };

  async function markRead(id: string) { await api.notifications.markRead(id); invalidate(); }
  async function markAllRead() { await api.notifications.markAllRead(); setDismissed(new Set([...dismissed, ...reminders.map(r => r.id)])); invalidate(); }

  const empty = notifs.length === 0 && reminders.length === 0;

  return (
    <Portal>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className={`fixed bottom-4 z-[61] max-h-[80vh] lg:max-h-[520px] rounded-xl shadow-2xl bg-white overflow-hidden flex flex-col left-4 right-4 lg:right-auto lg:w-96 ${collapsed ? 'lg:left-20' : 'lg:left-[240px]'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <RiNotification3Line size={16} className="text-gray-600" />
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            {unread > 0 && (
              <span className="px-1.5 py-0.5 bg-brand-600 text-white text-[10px] font-bold rounded-full leading-none">{unread}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(unread > 0 || reminders.length > 0) && (
              <button onClick={markAllRead} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Mark all read</button>
            )}
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X size={15} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {empty ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <RiNotification3Line size={32} className="mb-2 opacity-40" />
              <p className="text-sm">You&apos;re all caught up</p>
              <p className="text-xs mt-0.5">No new notifications or upcoming deadlines</p>
            </div>
          ) : (
            <>
              {notifs.map(n => {
                const meta = typeMeta(n.type);
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 relative ${n.isRead ? 'bg-white' : 'bg-blue-50/50'}`}
                  >
                    {!n.isRead && <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600 rounded-r-sm" />}
                    <div className={`w-8 h-8 shrink-0 rounded-full ${meta.bg} flex items-center justify-center`}><meta.Icon size={16} className={meta.color} /></div>
                    <div className="flex-1 min-w-0 pl-1">
                      <p className={`text-sm leading-snug ${n.isRead ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>{n.title}</p>
                      <p className="text-xs text-gray-500 leading-snug mt-0.5">{n.message}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{relativePast(n.createdAt)}</p>
                    </div>
                  </div>
                );
              })}

              {reminders.length > 0 && (
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50/60">Reminders</div>
              )}
              {reminders.map(r => {
                const meta = KIND_META[r.kind];
                return (
                  <div key={r.id} onClick={() => setDismissed(prev => new Set(prev).add(r.id))} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50">
                    <div className={`w-8 h-8 shrink-0 rounded-full ${meta.bg} flex items-center justify-center`}><meta.Icon size={16} className={meta.color} /></div>
                    <div className="flex-1 min-w-0 pl-1">
                      <p className="text-sm leading-snug text-gray-700">{r.text}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{r.time}</p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="border-t border-gray-100 shrink-0">
          <a href="/tasks" className="block w-full py-3 text-center text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 font-medium">View my tasks</a>
        </div>
      </div>
    </Portal>
  );
}
