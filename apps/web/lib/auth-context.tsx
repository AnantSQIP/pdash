'use client';

import { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthUser } from './api';

type Result = { ok: boolean; error?: string };

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
      await qc.invalidateQueries({ queryKey: ['auth-me'] });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Sign in failed' };
    }
  }, [qc]);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    qc.clear();
    qc.setQueryData(['auth-me'], null);
  }, [qc]);

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
