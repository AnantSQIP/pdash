'use client';

// The top-right controls: where you are in your day, what has happened, and who you are.
//
// All three used to live at the bottom of the sidebar (notifications, the account chip) or only
// on Home (the punch button). Neither is where anybody looks for them: a person's own account
// belongs in the top-right corner of a web application, and the punch control is the thing most
// people touch first and last every day — it should not be reachable from one page only.
//
// Order, left to right: the day, then the news, then you.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePresence } from '@/lib/presence-context';
import { Avatar } from '@/components/Avatar';
import { NotificationsPanel } from './NotificationsPanel';
import { UserMenu } from './UserMenu';
import { PunchControl } from '@/components/home/usePunch';

export function TopBar({ dark }: { dark?: boolean }) {
  const { currentUser } = useOrg();
  const { mine } = usePresence();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Polled at 30s and paused off-tab — the same query the sidebar used to own.
  const { data: unread } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const unreadCount = unread?.count ?? 0;

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* The day. Its status line is hidden on small screens by the control itself. */}
      <PunchControl variant="banner" />

      <span className={clsx('hidden h-6 w-px sm:block', dark ? 'bg-white/15' : 'bg-gray-200')} />

      <button
        onClick={() => { setShowUserMenu(false); setShowNotifications(v => !v); }}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        title="Notifications"
        className={clsx('relative rounded-lg p-2 transition-colors',
          dark ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900')}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <button
        onClick={() => { setShowNotifications(false); setShowUserMenu(v => !v); }}
        aria-label="Your account"
        aria-haspopup="menu"
        aria-expanded={showUserMenu}
        title={currentUser ? `${currentUser.firstName} ${currentUser.lastName ?? ''}`.trim() : 'Your account'}
        className={clsx('flex items-center gap-1.5 rounded-lg p-1 pr-1.5 transition-colors',
          dark ? 'hover:bg-white/10' : 'hover:bg-gray-100')}
      >
        <Avatar user={currentUser} size={30} status={mine?.effective} />
        <ChevronDown size={13} className={dark ? 'text-white/50' : 'text-gray-400'} />
      </button>

      {showNotifications && <NotificationsPanel anchor="topbar" onClose={() => setShowNotifications(false)} />}
      {showUserMenu && <UserMenu anchor="topbar" onClose={() => setShowUserMenu(false)} />}
    </div>
  );
}
