'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, CheckSquare, Settings, Keyboard, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { userInitials, fullName } from '@/lib/avatar';

interface MenuItem {
  icon: React.ElementType;
  label: string;
  action?: () => void;
  href?: string;
  danger?: boolean;
  separator?: boolean;
}

export function UserMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { logout, email } = useAuth();
  const { currentUser } = useOrg();

  const name = currentUser ? fullName(currentUser) : email ?? 'User';
  const role = currentUser?.designation ?? 'Member';
  const displayEmail = currentUser?.email ?? email ?? '';
  const initials = currentUser ? userInitials(currentUser) : (email?.[0]?.toUpperCase() ?? 'U');

  const menuItems: MenuItem[] = [
    { icon: User,        label: 'My Profile', href: '/settings' },
    { icon: CheckSquare, label: 'My Tasks',   href: '/tasks' },
    { icon: Settings,    label: 'Account Settings', href: '/settings' },
    { icon: Keyboard,    label: 'Keyboard Shortcuts', separator: true },
    { icon: HelpCircle,  label: 'Help & Support' },
    { icon: LogOut,      label: 'Sign Out', danger: true, separator: true, action: () => { logout(); router.replace('/login'); } },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="fixed left-64 bottom-20 z-50 w-64 rounded-xl shadow-2xl bg-white overflow-hidden">
        {/* Profile header */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-bold">
            {initials}
          </div>
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
    </>
  );
}
