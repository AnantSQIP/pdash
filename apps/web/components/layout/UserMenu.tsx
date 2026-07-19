'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, CheckSquare, Settings, LogOut, Home, Plane, FileBadge } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { usePresence, presenceMeta } from '@/lib/presence-context';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { Portal } from '@/components/ui/Portal';
import clsx from 'clsx';

interface MenuItem {
  icon: React.ElementType;
  label: string;
  action?: () => void;
  href?: string;
  danger?: boolean;
  separator?: boolean;
}

const STATUS_BUTTONS = [
  { v: 'AVAILABLE', label: 'Available' },
  { v: 'BUSY', label: 'Busy' },
  { v: 'DND', label: 'Do not disturb' },
  { v: 'BRB', label: 'Be right back' },
  { v: 'OFFLINE', label: 'Appear offline' },
];
const EXPIRY = [
  { v: 0, label: "Don't clear" },
  { v: 30, label: '30 minutes' },
  { v: 60, label: '1 hour' },
  { v: 240, label: '4 hours' },
];

function StatusPicker() {
  const { mine, setStatus, clearStatus } = usePresence();
  const [msg, setMsg] = useState(mine?.statusMessage ?? '');
  const [expiry, setExpiry] = useState(0);
  const [busy, setBusy] = useState(false);
  const meta = presenceMeta(mine?.effective);

  async function apply(status: string) {
    if (busy) return; setBusy(true);
    try { await setStatus(status, msg.trim() || undefined, expiry || undefined); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (busy) return; setBusy(true);
    try { await clearStatus(); setMsg(''); setExpiry(0); }
    finally { setBusy(false); }
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <span className={clsx('w-2.5 h-2.5 rounded-full', meta.dot)} />
        <span className="text-sm font-medium text-gray-800">{meta.label}</span>
        {mine?.workMode === 'WFH' && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full"><Home size={9} /> WFH</span>}
        {mine?.effective === 'ON_LEAVE' && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full"><Plane size={9} /> Leave</span>}
      </div>
      {mine?.statusMessage && <p className="text-xs text-gray-500 mb-2 truncate">“{mine.statusMessage}”</p>}
      <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Set a status message…" maxLength={140}
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:border-brand-400" />
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {STATUS_BUTTONS.map(s => (
          <button key={s.v} onClick={() => apply(s.v)} disabled={busy}
            className={clsx('flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50',
              mine?.status === s.v ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
            <span className={clsx('w-2 h-2 rounded-full', presenceMeta(s.v === 'OFFLINE' ? 'OFFLINE' : s.v).dot)} />
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <select value={expiry} onChange={e => setExpiry(Number(e.target.value))} className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600">
          {EXPIRY.map(e => <option key={e.v} value={e.v}>Clear after: {e.label}</option>)}
        </select>
        {mine?.status && <button onClick={reset} disabled={busy} className="text-[11px] font-medium text-gray-500 hover:text-brand-600 px-2 py-1.5 disabled:opacity-50">Reset</button>}
      </div>
    </div>
  );
}

export function UserMenu({ onClose, collapsed = false }: { onClose: () => void; collapsed?: boolean }) {
  const router = useRouter();
  const { logout, email } = useAuth();
  const { currentUser } = useOrg();
  const { mine } = usePresence();

  const name = currentUser ? fullName(currentUser) : email ?? 'User';
  const role = currentUser?.designation ?? 'Member';
  const displayEmail = currentUser?.email ?? email ?? '';

  const menuItems: MenuItem[] = [
    { icon: User,        label: 'My Profile', href: '/settings' },
    { icon: CheckSquare, label: 'My Tasks',   href: '/tasks' },
    { icon: FileBadge,   label: 'My HR',      href: '/my-hr' },
    { icon: Settings,    label: 'Account Settings', href: '/settings' },
    { icon: LogOut,      label: 'Sign Out', danger: true, separator: true, action: () => { logout(); router.replace('/login'); } },
  ];

  return (
    <Portal>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />

      <div className={`fixed bottom-20 z-[61] rounded-xl shadow-2xl bg-white overflow-hidden left-4 right-4 lg:right-auto lg:w-64 ${collapsed ? 'lg:left-20' : 'lg:left-[240px]'}`}>
        {/* Profile header */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
          <Avatar user={currentUser} size={40} status={mine?.effective} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
            <p className="text-[10px] text-gray-400 truncate">{role}</p>
            <p className="text-[10px] text-gray-500 truncate">{displayEmail}</p>
          </div>
        </div>

        {/* Presence status picker */}
        <StatusPicker />

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
