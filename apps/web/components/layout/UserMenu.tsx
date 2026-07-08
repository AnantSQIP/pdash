'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, CheckSquare, Settings, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { Portal } from '@/components/ui/Portal';

interface MenuItem {
  icon: React.ElementType;
  label: string;
  action?: () => void;
  href?: string;
  danger?: boolean;
  separator?: boolean;
}

export function UserMenu({ onClose, collapsed = false }: { onClose: () => void; collapsed?: boolean }) {
  const router = useRouter();
  const { logout, email } = useAuth();
  const { currentUser } = useOrg();

  const name = currentUser ? fullName(currentUser) : email ?? 'User';
  const role = currentUser?.designation ?? 'Member';
  const displayEmail = currentUser?.email ?? email ?? '';

  const menuItems: MenuItem[] = [
    { icon: User,        label: 'My Profile', href: '/settings' },
    { icon: CheckSquare, label: 'My Tasks',   href: '/tasks' },
    { icon: Settings,    label: 'Account Settings', href: '/settings' },
    { icon: LogOut,      label: 'Sign Out', danger: true, separator: true, action: () => { logout(); router.replace('/login'); } },
  ];

  return (
    <Portal>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />

      <div className={`fixed bottom-20 z-[61] rounded-xl shadow-2xl bg-white overflow-hidden left-4 right-4 lg:right-auto lg:w-64 ${collapsed ? 'lg:left-20' : 'lg:left-[240px]'}`}>
        {/* Profile header */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
          <Avatar user={currentUser} size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
            <p className="text-[10px] text-gray-400 truncate">{role}</p>
            <p className="text-[10px] text-gray-500 truncate">{displayEmail}</p>
          </div>
        </div>

        {/* Menu items */}
        <div className="py-1">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx}>
                {item.separator && <div className="border-t border-gray-100 my-1" />}
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${
                      item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'
                    }`}
                  >
                    <Icon size={15} className={item.danger ? 'text-red-500' : 'text-gray-400'} />
                    {item.label}
                  </Link>
                ) : (
                  <button
                    onClick={() => { if (item.action) item.action(); onClose(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${
                      item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'
                    }`}
                  >
                    <Icon size={15} className={item.danger ? 'text-red-500' : 'text-gray-400'} />
                    {item.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Portal>
  );
}
