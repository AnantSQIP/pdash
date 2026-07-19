'use client';

import { createContext, useContext, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PresenceEntry, type MyPresence } from './api';
import { useAuth } from './auth-context';

type PresenceContextValue = {
  presenceOf: (userId?: string | null) => PresenceEntry | null;
  mine: MyPresence | null;
  setStatus: (status: string, message?: string, expiryMinutes?: number) => Promise<void>;
  clearStatus: () => Promise<void>;
};

const PresenceContext = createContext<PresenceContextValue>({
  presenceOf: () => null, mine: null, setStatus: async () => {}, clearStatus: async () => {},
});

// Shared presentation for a presence status (dot color + label). Kept here so every
// surface — avatars, the status picker, people list — reads the same vocabulary.
export const PRESENCE_META: Record<string, { dot: string; label: string }> = {
  AVAILABLE: { dot: 'bg-green-500', label: 'Available' },
  BUSY:      { dot: 'bg-red-500', label: 'Busy' },
  DND:       { dot: 'bg-red-600', label: 'Do not disturb' },
  BRB:       { dot: 'bg-amber-400', label: 'Be right back' },
  AWAY:      { dot: 'bg-amber-400', label: 'Away' },
  ON_LEAVE:  { dot: 'bg-purple-500', label: 'On leave' },
  OFFLINE:   { dot: 'bg-gray-300', label: 'Offline' },
};
export function presenceMeta(status?: string | null) {
  return (status && PRESENCE_META[status]) || PRESENCE_META.OFFLINE;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const qc = useQueryClient();

  const { data: org = [] } = useQuery<PresenceEntry[]>({
    queryKey: ['presence-org'], queryFn: () => api.presence.org(),
    enabled: isAuthed, refetchInterval: 45_000, staleTime: 20_000,
  });
  const { data: mine = null } = useQuery<MyPresence | null>({
    queryKey: ['presence-me'], queryFn: () => api.presence.me(),
    enabled: isAuthed, refetchInterval: 60_000,
  });

  const map = useMemo(() => new Map(org.map(p => [p.userId, p])), [org]);

  // Heartbeat while the tab is open and visible; also on focus/visibility regained.
  useEffect(() => {
    if (!isAuthed) return;
    let stopped = false;
    const beat = () => { if (!stopped && document.visibilityState === 'visible') api.presence.heartbeat().catch(() => {}); };
    beat();
    const id = setInterval(beat, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', beat);
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', beat); };
  }, [isAuthed]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['presence-me'] });
    qc.invalidateQueries({ queryKey: ['presence-org'] });
  }, [qc]);

  const setStatus = useCallback(async (status: string, message?: string, expiryMinutes?: number) => {
    await api.presence.setStatus({ status, message, expiryMinutes });
    refresh();
  }, [refresh]);
  const clearStatus = useCallback(async () => {
    await api.presence.clearStatus();
    refresh();
  }, [refresh]);

  const value = useMemo<PresenceContextValue>(() => ({
    presenceOf: (userId) => (userId ? map.get(userId) ?? null : null),
    mine, setStatus, clearStatus,
  }), [map, mine, setStatus, clearStatus]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() { return useContext(PresenceContext); }
