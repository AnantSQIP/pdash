'use client';

import { ReactNode, useEffect, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Loader, Menu } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from './Sidebar';
import { ForcePasswordReset } from './ForcePasswordReset';
import { CompleteProfile } from './CompleteProfile';

const PUBLIC_ROUTES = ['/login', '/signup'];

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthed, loading, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isAuthed && !isPublic) router.replace('/login');
    if (isAuthed && isPublic) router.replace('/home');
  }, [loading, isAuthed, isPublic, pathname, router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

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

  // A freshly-invited user must set their own password before reaching the app.
  if (user?.mustResetPassword) {
    return <ForcePasswordReset />;
  }

  // ...and then tell us who they are. Order matters: the password first (so the account is
  // theirs alone before any personal data is typed into it), then the joining details.
  // Existing staff were grandfathered by the migration, so this only fires for someone
  // signing in for the very first time.
  if (user && !user.profileCompleted) {
    return <CompleteProfile />;
  }

  // Authenticated app shell. On lg+ the sidebar is static; below lg it becomes an
  // off-canvas drawer and a mobile top bar (with a hamburger) appears.
  return (
    <>
      <Sidebar mobileOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 bg-sidebar text-white shrink-0">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="p-1.5 -ml-1.5 rounded-md hover:bg-white/10">
            <Menu size={22} />
          </button>
          <Image src="/fav.png" alt="SquarkIP" width={26} height={26} className="rounded-md" />
          <span className="font-bold tracking-tight">SquarkIP</span>
        </header>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
      </div>
    </>
  );
}
