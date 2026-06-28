'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from './Sidebar';

const PUBLIC_ROUTES = ['/login', '/signup'];

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthed, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!isAuthed && !isPublic) router.replace('/login');
    if (isAuthed && isPublic) router.replace('/home');
  }, [loading, isAuthed, isPublic, pathname, router]);

  // Resolving the persisted session
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader size={20} className="animate-spin" />
      </div>
    );
  }

  // Login / signup — full screen, no sidebar
  if (isPublic) {
    return <div className="flex-1 overflow-y-auto">{children}</div>;
  }

  // Not authed on a protected route — redirecting
  if (!isAuthed) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader size={20} className="animate-spin" />
      </div>
    );
  }

  // Authenticated app shell. The content area scrolls; pages that manage their
  // own internal scroll use `h-full` and stay within this column.
  return (
    <>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">{children}</div>
    </>
  );
}
