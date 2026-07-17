'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, ListTodo, FileBarChart, CalendarDays, Fingerprint,
  MessagesSquare, Users, Gauge, Settings, Bell, ChevronDown, LineChart,
  ShieldCheck, History, PanelLeftClose, PanelLeftOpen, X, type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { NotificationsPanel } from './NotificationsPanel';
import { UserMenu } from './UserMenu';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';

type NavItem = { href: string; icon: LucideIcon; label: string; perm?: string | string[] };

// Home is always shown (landing page). The rest are permission-gated so each role
// sees only what it can use — e.g. HR (no project/task perms) won't see Projects/My Tasks.
const NAV: NavItem[] = [
  { href: '/home',        icon: LayoutDashboard, label: 'Home' },
  { href: '/projects',    icon: FolderKanban,    label: 'Projects',    perm: 'project.view' },
  { href: '/tasks',       icon: ListTodo,        label: 'My Tasks',    perm: 'task.view' },
  // Delivery-lead view: who is free, who is overloaded, who can take more work — a load gauge.
  { href: '/capacity',    icon: Gauge,           label: 'Team Capacity', perm: 'capacity.view' },
  { href: '/performance', icon: LineChart,       label: 'Performance', perm: 'performance.view.own' },
  { href: '/calendar',    icon: CalendarDays,    label: 'Calendar',    perm: 'calendar.view' },
  { href: '/attendance',  icon: Fingerprint,     label: 'Attendance',  perm: 'attendance.view.own' },
  { href: '/reports',     icon: FileBarChart,    label: 'Reports',     perm: ['report.view', 'report.export'] },
  { href: '/discuss',     icon: MessagesSquare,  label: 'Discuss',     perm: 'channel.view' },
  { href: '/users',       icon: Users,           label: 'People',      perm: 'user.view' },
];

// Permission-gated admin entries (shown only when the actor can access them).
const ADMIN_NAV = [
  // "Admin" = RBAC/system administration (roles, groups, permission matrix) — gated on
  // RBAC perms, NOT user.create (HR has user.create for people-ops but isn't an RBAC admin).
  { href: '/admin',       icon: ShieldCheck, label: 'Admin',     perm: ['permission.view', 'role.view', 'group.view'] },
  { href: '/admin/audit', icon: History,     label: 'Audit Log', perm: ['audit.view'] },
];

const STORAGE_KEY = 'sidebar-collapsed';

export function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void } = {}) {
  const path = usePathname();
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  // Real unread-notification count. Polled at 30s, and paused while the tab is
  // hidden (refetchIntervalInBackground defaults false) to avoid idle background load.
  const { data: unread } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api.notifications.unreadCount(),
    enabled: !!currentUser?.id,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const unreadCount = unread?.count ?? 0;
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

  return (
    <>
      {/* Mobile drawer backdrop */}
      {mobileOpen && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-hidden />}
      <aside
        className={clsx(
          'flex flex-col bg-sidebar text-white overflow-y-auto overflow-x-hidden ease-in-out',
          // Mobile/tablet: off-canvas drawer
          'fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop (lg+): static, in-flow, collapsible
          'lg:static lg:z-auto lg:translate-x-0 lg:shrink-0 lg:transition-[width]',
          collapsed ? 'lg:w-16' : 'lg:w-56',
        )}
      >
      {/* Logo + collapse toggle */}
      <div className={clsx('flex items-center border-b border-white/10 py-5', collapsed ? 'justify-center px-0' : 'gap-2.5 px-4')}>
        <Image src="/fav.png" alt="Squark Dashboard" width={32} height={32} className="rounded-lg shrink-0" />
        {!collapsed && <span className="font-bold text-lg tracking-tight flex-1">Squark Dashboard</span>}
        {!collapsed && (
          <>
            <button
              onClick={toggle}
              title="Collapse sidebar (Ctrl/⌘ B)"
              aria-label="Collapse sidebar"
              className="hidden lg:inline-flex p-1.5 rounded-md bg-white/10 text-white/80 hover:text-white hover:bg-white/20 ring-1 ring-white/10 transition-colors"
            >
              <PanelLeftClose size={18} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="lg:hidden p-1.5 rounded-md bg-white/10 text-white/80 hover:text-white hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </>
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
        {NAV.filter(n => !n.perm || can(n.perm)).map(({ href, icon: Icon, label }) => {
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

        {/* Permission-gated admin section */}
        {ADMIN_NAV.some(n => can(n.perm)) && (
          <div className={clsx('pt-3 mt-2 border-t border-white/10', collapsed && 'mx-1')}>
            {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Administration</p>}
            {ADMIN_NAV.filter(n => can(n.perm)).map(({ href, icon: Icon, label }) => {
              const active = path.startsWith(href);
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
          </div>
        )}
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
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
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
          <Avatar user={currentUser} size={28} />
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

      {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} collapsed={collapsed} />}
      {showUserMenu && <UserMenu onClose={() => setShowUserMenu(false)} collapsed={collapsed} />}
      </aside>
    </>
  );
}
