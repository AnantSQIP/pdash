'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, CheckSquare, BarChart2, Calendar,
  MessageSquare, Users, Settings, Bell, ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { NotificationsPanel } from './NotificationsPanel';
import { UserMenu } from './UserMenu';

const NAV = [
  { href: '/home',      icon: LayoutDashboard, label: 'Home' },
  { href: '/projects',  icon: FolderKanban,    label: 'Projects' },
  { href: '/tasks',     icon: CheckSquare,     label: 'My Tasks' },
  { href: '/calendar',  icon: Calendar,        label: 'Calendar' },
  { href: '/reports',   icon: BarChart2,       label: 'Reports' },
  { href: '/discuss',   icon: MessageSquare,   label: 'Discuss' },
  { href: '/users',     icon: Users,           label: 'People' },
];

export function Sidebar() {
  const path = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-sidebar text-white overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
        <Image
          src="/fav.png"
          alt="SquarkIP"
          width={32}
          height={32}
          className="rounded-lg shrink-0"
        />
        <span className="font-bold text-lg tracking-tight">SquarkIP</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = href === '/home'
            ? path === '/home'
            : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-active text-white'
                  : 'text-white/60 hover:bg-sidebar-hover hover:text-white',
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: notifications + settings + user */}
      <div className="border-t border-white/10 p-3 space-y-0.5">
        <button
          onClick={() => setShowNotifications(v => !v)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-sidebar-hover hover:text-white transition-colors relative"
        >
          <span className="relative">
            <Bell size={17} />
            <span className="w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center absolute -top-0.5 -right-0.5">
              3
            </span>
          </span>
          Notifications
        </button>
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-sidebar-hover hover:text-white transition-colors"
        >
          <Settings size={17} />
          Settings
        </Link>
        <div
          onClick={() => setShowUserMenu(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sidebar-hover cursor-pointer mt-1"
        >
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold">
            AN
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">Anant Gupta</p>
            <p className="text-[10px] text-white/40 truncate">anant@company.com</p>
          </div>
          <ChevronDown size={13} className="text-white/40" />
        </div>
      </div>

      {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} />}
      {showUserMenu && <UserMenu onClose={() => setShowUserMenu(false)} />}
    </aside>
  );
}
