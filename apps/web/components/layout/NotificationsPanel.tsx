'use client';

import { useState } from 'react';
import { X, Bell } from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  read: boolean;
  time: string;
  text: string;
  avatar: string;
  color: string;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'task',      read: false, time: '5m ago',  text: 'Bob Taylor assigned you "Implement responsive navbar"', avatar: 'BT', color: 'bg-blue-500' },
  { id: 'n2', type: 'comment',   read: false, time: '1h ago',  text: 'Alice Kim commented on "Design component library"',     avatar: 'AK', color: 'bg-purple-500' },
  { id: 'n3', type: 'milestone', read: false, time: '2h ago',  text: 'Milestone "Phase 1" is due in 3 days',                  avatar: '🎯', color: '' },
  { id: 'n4', type: 'approval',  read: true,  time: '1d ago',  text: 'Your project "Mobile App v2" was approved',             avatar: '✅', color: '' },
  { id: 'n5', type: 'mention',   read: true,  time: '1d ago',  text: 'Carol Patel mentioned you in Apollo discussion',        avatar: 'CP', color: 'bg-pink-500' },
  { id: 'n6', type: 'task',      read: true,  time: '2d ago',  text: '"SEO audit" status changed to In Review',               avatar: 'SA', color: 'bg-orange-500' },
];

function isEmoji(str: string) {
  return /\p{Emoji}/u.test(str) && str.length <= 2;
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);

  const unreadCount = notifications.filter(n => !n.read).length;

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed left-64 bottom-4 z-50 w-96 max-h-[500px] rounded-xl shadow-2xl bg-white overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-gray-600" />
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-brand-600 text-white text-[10px] font-bold rounded-full leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Bell size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <ul>
              {notifications.map(n => (
                <li
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 relative ${
                    n.read ? 'bg-white' : 'bg-blue-50'
                  }`}
                >
                  {/* Unread left border */}
                  {!n.read && (
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600 rounded-r-sm" />
                  )}

                  {/* Avatar */}
                  {isEmoji(n.avatar) ? (
                    <div className="w-8 h-8 shrink-0 flex items-center justify-center text-lg">
                      {n.avatar}
                    </div>
                  ) : (
                    <div
                      className={`w-8 h-8 shrink-0 rounded-full ${n.color} flex items-center justify-center text-white text-[10px] font-bold`}
                    >
                      {n.avatar}
                    </div>
                  )}

                  {/* Text */}
                  <div className="flex-1 min-w-0 pl-1">
                    <p className={`text-sm leading-snug ${n.read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                      {n.text}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{n.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 shrink-0">
          <button className="w-full py-3 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors font-medium">
            View all notifications
          </button>
        </div>
      </div>
    </>
  );
}
