'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Loader, Menu } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from './Sidebar';
import { ForcePasswordReset } from './ForcePasswordReset';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationToaster } from '@/components/layout/NotificationToaster';
import { TopBar } from './TopBar';

const PUBLIC_ROUTES = ['/login', '/signup'];

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthed, loading, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bouncedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!isAuthed && !isPublic) {
      // A revoked/expired session can leave its 14-day cookie physically present. The edge
      // middleware treats that cookie as "authed" and would bounce /login → /home forever
      // (an infinite redirect loop, e.g. right after an admin resets your password). logout()
      // clears the cookies and performs the redirect itself, in that order.
      if (!bouncedRef.current) {
        bouncedRef.current = true;
        void logout();
      }
      return;
    }
    bouncedRef.current = false;
    if (isAuthed && isPublic) router.replace('/home');
  }, [loading, isAuthed, isPublic, pathname, router, logout]);

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

  // There used to be a second gate here: a new joiner could not reach the app until they had
  // typed their address, date of birth and emergency contact into a form. It was removed on the
  // owner's instruction (review of 2026-09) — the details are HR's record, not the new joiner's
  // toll gate, and HR now fills them in when the account is created (Admin → Add User) or
  // afterwards from the person's profile. The form itself still exists, voluntarily, at
  // /profile/complete, so nobody lost the ability to fill their own details in.

  // Authenticated app shell. On lg+ the sidebar is static; below lg it becomes an
  // off-canvas drawer and a mobile top bar (with a hamburger) appears.
  return (
    <>
      <Sidebar mobileOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Phone / tablet: the drawer handle and the brand, with the same controls on the right. */}
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 bg-sidebar text-white shrink-0">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="p-1.5 -ml-1.5 rounded-md hover:bg-white/10">
            <Menu size={22} />
          </button>
          <Image src="/fav.png" alt="Squark Dashboard" width={26} height={26} className="rounded-md" />
          <span className="font-bold tracking-tight truncate">Squark Dashboard</span>
          <div className="ml-auto shrink-0"><TopBar dark /></div>
        </header>
        {/* Desktop: the sidebar already carries the brand, so this bar is the controls alone —
            your day, your notifications, your account, in the corner people look in. */}
        <header className="hidden lg:flex items-center h-14 px-6 bg-white border-b border-gray-200 shrink-0">
          <div className="ml-auto"><TopBar /></div>
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">{children}</div>
      </div>
      <GlobalSearch />
      <NotificationToaster />
    </>
  );
}
