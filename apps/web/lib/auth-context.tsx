'use client';

import { createContext, useContext, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthUser } from './api';

type Result = { ok: boolean; error?: string };

// Auto sign-out after this long with no activity. Persisted in localStorage so that a PC
// left closed for hours is signed out the moment the app is reopened (not just live tabs).
const IDLE_KEY = 'pdash:lastActivity';
const IDLE_LIMIT_MS = 6 * 60 * 60 * 1000; // ~6 hours

function markActivity() { try { localStorage.setItem(IDLE_KEY, String(Date.now())); } catch { /* storage blocked */ } }
function lastActivityAt(): number { try { return parseInt(localStorage.getItem(IDLE_KEY) ?? '', 10) || 0; } catch { return 0; } }

type AuthValue = {
  user: AuthUser | null;
  email: string | null;
  isAuthed: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  /** Re-fetch the current user — e.g. after completing the profile, so the gate lifts. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  user: null, email: null, isAuthed: false, loading: true,
  login: async () => ({ ok: false }), logout: async () => {}, refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  // The verified current user (from the httpOnly session cookie). null = signed out.
  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ['auth-me'],
    queryFn: async () => { try { return await api.auth.me(); } catch { return null; } },
    retry: false,
    staleTime: 60_000,
  });

  const login = useCallback(async (email: string, password: string): Promise<Result> => {
    try {
      await api.auth.login(email, password);
      markActivity(); // a fresh sign-in resets the idle clock
      await qc.invalidateQueries({ queryKey: ['auth-me'] });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Sign in failed' };
    }
  }, [qc]);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    try { localStorage.removeItem(IDLE_KEY); } catch { /* storage blocked */ }
    qc.clear();
    qc.setQueryData(['auth-me'], null);
  }, [qc]);

  // Record activity (throttled) so we know when a signed-in session has gone idle.
  useEffect(() => {
    let last = 0;
    const onActivity = () => { const now = Date.now(); if (now - last > 30_000) { last = now; markActivity(); } };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, onActivity));
  }, []);

  // Sign out after IDLE_LIMIT_MS of inactivity. Checked on load (catching a PC that was
  // closed for hours) and on a rolling interval while a tab is open.
  useEffect(() => {
    if (!user) return;
    if (!lastActivityAt()) markActivity(); // no record yet → treat this session as active now
    const check = () => {
      const at = lastActivityAt();
      if (at && Date.now() - at > IDLE_LIMIT_MS) {
        logout().finally(() => { window.location.href = '/login'; });
      }
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [user, logout]);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['auth-me'] });
  }, [qc]);

  const value = useMemo<AuthValue>(() => ({
    user, email: user?.email ?? null, isAuthed: !!user, loading: isLoading, login, logout, refresh,
  }), [user, isLoading, login, logout, refresh]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
