'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, CheckSquare, BarChart2, Calendar,
  MessageSquare, Users, Settings, Bell, ChevronDown,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import clsx from 'clsx';
import { NotificationsPanel } from './NotificationsPanel';
import { UserMenu } from './UserMenu';
import { useOrg } from '@/lib/org-context';
import { userInitials, fullName } from '@/lib/avatar';

const NAV = [
  { href: '/home',      icon: LayoutDashboard, label: 'Home' },
  { href: '/projects',  icon: FolderKanban,    label: 'Projects' },
  { href: '/tasks',     icon: CheckSquare,     label: 'My Tasks' },
  { href: '/calendar',  icon: Calendar,        label: 'Calendar' },
  { href: '/reports',   icon: BarChart2,       label: 'Reports' },
  { href: '/discuss',   icon: MessageSquare,   label: 'Discuss' },
  { href: '/users',     icon: Users,           label: 'People' },
];

const STORAGE_KEY = 'sidebar-collapsed';

export function Sidebar() {
  const path = usePathname();
  const { currentUser } = useOrg();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore persisted state on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved === '1') setCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + B (matches shadcn sidebar)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const name = currentUser ? fullName(currentUser) : 'Loading…';
  const email = currentUser?.email ?? '';
  const initials = currentUser ? userInitials(currentUser) : '··';

  return (
    <aside
      className={clsx(
        'relative flex flex-col shrink-0 bg-sidebar text-white overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={clsx('flex items-center border-b border-white/10 py-5', collapsed ? 'justify-center px-0' : 'gap-2.5 px-4')}>
        <Image src="/fav.png" alt="SquarkIP" width={32} height={32} className="rounded-lg shrink-0" />
        {!collapsed && <span className="font-bold text-lg tracking-tight flex-1">SquarkIP</span>}
        {!collapsed && (
          <button
            onClick={toggle}
            title="Collapse sidebar (Ctrl/⌘ B)"
            aria-label="Collapse sidebar"
            className="p-1.5 rounded-md bg-white/10 text-white/80 hover:text-white hover:bg-white/20 ring-1 ring-white/10 transition-colors"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed (sits under the logo) */}
      {collapsed && (
        <button
          onClick={toggle}
          title="Expand sidebar (Ctrl/⌘ B)"
          aria-label="Expand sidebar"
          className="mx-auto mt-2 p-1.5 rounded-md bg-white/10 text-white/80 hover:text-white hover:bg-white/20 ring-1 ring-white/10 transition-colors"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = href === '/home' ? path === '/home' : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={clsx(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active ? 'bg-sidebar-active text-white' : 'text-white/60 hover:bg-sidebar-hover hover:text-white',
              )}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: notifications + settings + user */}
      <div className="border-t border-white/10 p-3 space-y-0.5">
        <button
          onClick={() => setShowNotifications(v => !v)}
          title={collapsed ? 'Notifications' : undefined}
          className={clsx(
            'w-full flex items-center rounded-lg text-sm text-white/60 hover:bg-sidebar-hover hover:text-white transition-colors',
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          )}
        >
          <span className="relative shrink-0">
            <Bell size={17} />
            <span className="w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center absolute -top-0.5 -right-0.5">
              3
            </span>
          </span>
          {!collapsed && 'Notifications'}
        </button>
        <Link
          href="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={clsx(
            'flex items-center rounded-lg text-sm text-white/60 hover:bg-sidebar-hover hover:text-white transition-colors',
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          )}
        >
          <Settings size={17} className="shrink-0" />
          {!collapsed && 'Settings'}
        </Link>
        <div
          onClick={() => setShowUserMenu(v => !v)}
          title={collapsed ? name : undefined}
          className={clsx(
            'flex items-center rounded-lg hover:bg-sidebar-hover cursor-pointer mt-1',
            collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2',
          )}
        >
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{name}</p>
                <p className="text-[10px] text-white/40 truncate">{email}</p>
              </div>
              <ChevronDown size={13} className="text-white/40 shrink-0" />
            </>
          )}
        </div>
      </div>

      {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} />}
      {showUserMenu && <UserMenu onClose={() => setShowUserMenu(false)} />}
    </aside>
  );
}
