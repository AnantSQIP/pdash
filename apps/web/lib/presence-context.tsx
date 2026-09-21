'use client';

import { createContext, useContext, useEffect, useMemo, useCallback, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PresenceEntry, type MyPresence } from './api';
import { useAuth } from './auth-context';

/** Five minutes without keyboard or mouse → Away (yellow). The firm's rule. */
export const IDLE_AFTER_MS = 5 * 60_000;

/**
 * How away-detection can see the person:
 *   device — Chrome / Edge, once allowed: keyboard or mouse ANYWHERE on the PC, and a locked
 *            screen. Someone working in Word with the dashboard in the background stays green.
 *   page   — only input inside this dashboard: the browser has not been allowed yet, or cannot
 *            (Firefox, Safari). Working in another program then looks like being away.
 */
export type IdleMode = 'device' | 'page';

type PresenceContextValue = {
  presenceOf: (userId?: string | null) => PresenceEntry | null;
  mine: MyPresence | null;
  setStatus: (status: string, message?: string, expiryMinutes?: number) => Promise<void>;
  clearStatus: () => Promise<void>;
  idleMode: IdleMode;
  /** This browser could watch the whole PC but has not been allowed to yet. */
  canWatchDevice: boolean;
  /** Ask the browser for permission to watch the whole PC. Must run inside a click. */
  watchDevice: () => Promise<boolean>;
};

const PresenceContext = createContext<PresenceContextValue>({
  presenceOf: () => null, mine: null, setStatus: async () => {}, clearStatus: async () => {},
  idleMode: 'page', canWatchDevice: false, watchDevice: async () => false,
});

// Shared presentation for a presence status (dot color + label). Kept here so every
// surface — avatars, the status picker, people list — reads the same vocabulary.
export const PRESENCE_META: Record<string, { dot: string; label: string }> = {
  AVAILABLE:  { dot: 'bg-green-500', label: 'Available' },
  BUSY:       { dot: 'bg-red-500', label: 'Busy' },
  DND:        { dot: 'bg-red-600', label: 'Do not disturb' },
  IN_MEETING: { dot: 'bg-red-500', label: 'In a meeting' },
  BRB:        { dot: 'bg-amber-400', label: 'Be right back' },
  AWAY:       { dot: 'bg-yellow-400', label: 'Away' },
  ON_LEAVE:   { dot: 'bg-purple-500', label: 'On leave' },
  OFFLINE:    { dot: 'bg-gray-300', label: 'Offline' },
};
export function presenceMeta(status?: string | null) {
  return (status && PRESENCE_META[status]) || PRESENCE_META.OFFLINE;
}

// ── The browser's Idle Detection API (Chrome / Edge), typed here — it is not in lib.dom yet ──
type IdleDetectorLike = EventTarget & {
  userState: 'active' | 'idle' | null;
  screenState: 'locked' | 'unlocked' | null;
  start(o: { threshold: number; signal?: AbortSignal }): Promise<void>;
};
type IdleDetectorCtor = { new (): IdleDetectorLike; requestPermission(): Promise<'granted' | 'denied'> };
function detector(): IdleDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { IdleDetector?: IdleDetectorCtor }).IdleDetector) ?? null;
}
async function devicePermission(): Promise<PermissionState | 'unsupported'> {
  if (!detector()) return 'unsupported';
  try { return (await navigator.permissions.query({ name: 'idle-detection' as PermissionName })).state; }
  catch { return 'prompt'; }
}

/** Last input in ANY open dashboard tab — shared, so two tabs never disagree about idleness. */
const LAST_INPUT_KEY = 'pdash-presence-last-input';
const INPUT_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'pointerdown', 'scroll'] as const;

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const qc = useQueryClient();

  const { data: org = [] } = useQuery<PresenceEntry[]>({
    queryKey: ['presence-org'], queryFn: () => api.presence.org(),
    enabled: isAuthed, refetchInterval: 30_000, staleTime: 15_000,
  });
  const { data: mine = null } = useQuery<MyPresence | null>({
    queryKey: ['presence-me'], queryFn: () => api.presence.me(),
    enabled: isAuthed, refetchInterval: 60_000,
  });

  const map = useMemo(() => new Map(org.map(p => [p.userId, p])), [org]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['presence-me'] });
    qc.invalidateQueries({ queryKey: ['presence-org'] });
  }, [qc]);

  // ── Away detection ──────────────────────────────────────────────────────────────────
  const idleRef = useRef(false);
  const modeRef = useRef<IdleMode>('page');
  const abortRef = useRef<AbortController | null>(null);
  const [idleMode, setIdleMode] = useState<IdleMode>('page');
  const [canWatchDevice, setCanWatchDevice] = useState(false);

  /** Tell the server the moment idleness changes, so the dot turns within seconds, not a minute. */
  const setIdle = useCallback((idle: boolean) => {
    if (idleRef.current === idle) return;
    idleRef.current = idle;
    api.presence.heartbeat(idle).then(refresh).catch(() => {});
  }, [refresh]);

  // Page mode: input inside the dashboard, shared across its open tabs.
  useEffect(() => {
    if (!isAuthed) return;
    let last = Date.now();
    let lastShared = 0;
    const touch = () => {
      last = Date.now();
      if (last - lastShared > 10_000) {
        lastShared = last;
        try { localStorage.setItem(LAST_INPUT_KEY, String(last)); } catch { /* storage blocked */ }
      }
      // Back at the keyboard → green at once, not at the next check.
      if (modeRef.current === 'page' && idleRef.current) setIdle(false);
    };
    for (const e of INPUT_EVENTS) window.addEventListener(e, touch, { passive: true, capture: true });
    const check = setInterval(() => {
      if (modeRef.current !== 'page') return;
      let shared = 0;
      try { shared = Number(localStorage.getItem(LAST_INPUT_KEY)) || 0; } catch { /* storage blocked */ }
      setIdle(Date.now() - Math.max(last, shared) >= IDLE_AFTER_MS);
    }, 15_000);
    return () => {
      for (const e of INPUT_EVENTS) window.removeEventListener(e, touch, { capture: true });
      clearInterval(check);
    };
  }, [isAuthed, setIdle]);

  // Device mode: the browser watches the whole PC and says when it goes idle or is locked.
  const startDevice = useCallback(async () => {
    const Detector = detector();
    if (!Detector) return false;
    try {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const d = new Detector();
      const read = () => setIdle(d.userState === 'idle' || d.screenState === 'locked');
      d.addEventListener('change', read);
      await d.start({ threshold: IDLE_AFTER_MS, signal: ctrl.signal });
      modeRef.current = 'device';
      setIdleMode('device');
      setCanWatchDevice(false);
      read();
      return true;
    } catch {
      return false;
    }
  }, [setIdle]);

  useEffect(() => {
    if (!isAuthed) return;
    let cancelled = false;
    devicePermission().then(state => {
      if (cancelled) return;
      if (state === 'granted') void startDevice();
      else setCanWatchDevice(state === 'prompt');
    });
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [isAuthed, startDevice]);

  const watchDevice = useCallback(async () => {
    const Detector = detector();
    if (!Detector) return false;
    try {
      if ((await Detector.requestPermission()) !== 'granted') { setCanWatchDevice(false); return false; }
    } catch { return false; }
    return startDevice();
  }, [startDevice]);

  // Heartbeat: once a minute for as long as the dashboard is open — IN THE BACKGROUND TOO. It used
  // to stop whenever the tab was hidden, which turned anyone working in another program yellow.
  // Whether they are at the PC is now the idle flag's job, not the tab's.
  useEffect(() => {
    if (!isAuthed) return;
    const send = () => { api.presence.heartbeat(idleRef.current).catch(() => {}); };
    send();
    const id = setInterval(send, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') send(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [isAuthed]);

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
    mine, setStatus, clearStatus, idleMode, canWatchDevice, watchDevice,
  }), [map, mine, setStatus, clearStatus, idleMode, canWatchDevice, watchDevice]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() { return useContext(PresenceContext); }
