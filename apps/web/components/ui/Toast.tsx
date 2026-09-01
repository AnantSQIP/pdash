'use client';

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Toasts.
 *
 * The previous version rendered a plain list that appeared with a keyframe and then simply
 * vanished — no exit, no stacking, and a fixed 3.5s that ran on regardless of whether the tab
 * was even visible. Four things were wrong with that, and each is fixed here:
 *
 *  • NO EXIT. Something that disappears between frames reads as a glitch. Everything that
 *    animates in animates out.
 *  • NO STACK. Five toasts became a five-high wall. They now stack, showing the newest in front
 *    with the rest tucked behind, and fan out when the pointer is over them.
 *  • THE TIMER IGNORED REALITY. It now pauses while the pointer is over the stack (you are
 *    reading it) and while the tab is hidden (you are not).
 *  • KEYFRAMES. A keyframe cannot be retargeted mid-flight, so a toast arriving while another
 *    is leaving snapped. Transitions are interruptible, so positions are always retargetable.
 *
 * The public API is unchanged — `toast('Saved')`, `toast(msg, 'error')` — because 35 call sites
 * use it. Anything richer is opt-in through the third argument.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info' | 'loading';

export type ToastOptions = {
  /** A second line for detail. The first line should still make sense alone. */
  description?: string;
  /** Milliseconds on screen. `null` keeps it until dismissed — use for 'loading'. */
  duration?: number | null;
  /** One action, right-aligned. Dismisses the toast after running. */
  action?: { label: string; onClick: () => void };
};

type Entry = {
  id: number;
  kind: ToastKind;
  message: string;
  description?: string;
  duration: number | null;
  action?: ToastOptions['action'];
  leaving: boolean;
};

type ToastApi = {
  toast: (message: string, kind?: ToastKind, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<ToastApi>({ toast: () => 0, dismiss: () => {} });

/* How far behind the front toast each older one sits, and how much it shrinks. */
const STACK_OFFSET = 14;
const STACK_SCALE = 0.05;
const GAP = 12;
/* Beyond three, extra toasts are held but not drawn — a taller stack is just noise. */
const VISIBLE = 3;
const EXIT_MS = 200;
/* Dismiss on distance OR speed, so a quick flick works without crossing the threshold. */
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 0.11; /* px per ms */

const DEFAULT_DURATION: Record<ToastKind, number | null> = {
  success: 4000,
  error: 6500,   /* longer: something went wrong and the text usually matters */
  warning: 6000,
  info: 5000,
  loading: null, /* stays until replaced or dismissed */
};

const META: Record<ToastKind, { Icon: typeof CheckCircle2; tint: string; ring: string }> = {
  success: { Icon: CheckCircle2,  tint: 'text-emerald-600', ring: 'ring-emerald-600/15' },
  error:   { Icon: AlertCircle,   tint: 'text-red-600',     ring: 'ring-red-600/15' },
  warning: { Icon: AlertTriangle, tint: 'text-amber-600',   ring: 'ring-amber-600/15' },
  info:    { Icon: Info,          tint: 'text-brand-600',   ring: 'ring-brand-600/15' },
  loading: { Icon: Loader2,       tint: 'text-gray-400',    ring: 'ring-gray-900/10' },
};

let counter = 0;

/* ─────────────────────────────────────────────────────────────────────────────
   The store lives OUTSIDE React.

   A toast is fired from catch blocks, mutation callbacks and plain helpers —
   places where a hook cannot go. Requiring `useToast()` is why 35 of those call
   sites reached for `alert()` instead, and an OS alert box is the single most
   dated thing this product could put on screen.

   So `toast(...)` is an ordinary function anyone can import. The provider below
   is only a subscriber that draws them.
   ───────────────────────────────────────────────────────────────────────────── */
type Signal = { type: 'add'; entry: Entry } | { type: 'dismiss'; id: number };
const listeners = new Set<(s: Signal) => void>();
function emit(signal: Signal) { listeners.forEach(l => l(signal)); }

/** Show a toast from anywhere — component, event handler, catch block, plain module. */
export function toast(message: string, kind: ToastKind = 'success', options?: ToastOptions): number {
  const id = ++counter;
  const duration = options?.duration !== undefined ? options.duration : DEFAULT_DURATION[kind];
  emit({
    type: 'add',
    entry: { id, kind, message, description: options?.description, duration, action: options?.action, leaving: false },
  });
  return id;
}

/**
 * For a caught error. Takes the error itself so every call site stops repeating
 * `e instanceof Error ? e.message : 'Something failed'` — and stops picking a
 * different fallback sentence each time.
 */
export function toastError(error: unknown, fallback = 'Something went wrong.'): number {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
  return toast(message, 'error');
}

export const toastSuccess = (m: string, o?: ToastOptions) => toast(m, 'success', o);
export const toastWarning = (m: string, o?: ToastOptions) => toast(m, 'warning', o);
export const toastInfo = (m: string, o?: ToastOptions) => toast(m, 'info', o);
export function dismissToast(id: number) { emit({ type: 'dismiss', id }); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [heights, setHeights] = useState<Record<number, number>>({});

  const nodes = useRef(new Map<number, HTMLDivElement>());
  const timers = useRef(new Map<number, { remaining: number; startedAt: number; handle: number | null }>());

  /* ── Removal ───────────────────────────────────────────────────────────── */
  const remove = useCallback((id: number) => {
    setEntries(list => list.filter(e => e.id !== id));
    setHeights(h => { const { [id]: _drop, ...rest } = h; return rest; });
    nodes.current.delete(id);
    const t = timers.current.get(id);
    if (t?.handle) window.clearTimeout(t.handle);
    timers.current.delete(id);
  }, []);

  /* Marks it leaving so the exit transition can play, then drops it. */
  const dismiss = useCallback((id: number) => {
    setEntries(list => list.map(e => (e.id === id ? { ...e, leaving: true } : e)));
    const t = timers.current.get(id);
    if (t?.handle) window.clearTimeout(t.handle);
    window.setTimeout(() => remove(id), EXIT_MS);
  }, [remove]);

  /* ── Timers that respect whether anyone is actually looking ────────────── */
  const resume = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t || t.handle !== null || t.remaining <= 0) return;
    t.startedAt = Date.now();
    t.handle = window.setTimeout(() => dismiss(id), t.remaining);
  }, [dismiss]);

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t || t.handle === null) return;
    window.clearTimeout(t.handle);
    t.handle = null;
    t.remaining -= Date.now() - t.startedAt;
  }, []);

  const pauseAll = useCallback(() => { timers.current.forEach((_v, id) => pause(id)); }, [pause]);
  const resumeAll = useCallback(() => { timers.current.forEach((_v, id) => resume(id)); }, [resume]);

  /* A toast that expired while the tab was in the background was never seen. */
  useEffect(() => {
    const onVisibility = () => (document.hidden ? pauseAll() : resumeAll());
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pauseAll, resumeAll]);

  /* Draw whatever the store emits. This is the only place entries enter React state. */
  useEffect(() => {
    const onSignal = (signal: Signal) => {
      if (signal.type === 'dismiss') { dismiss(signal.id); return; }
      const { entry } = signal;
      setEntries(list => [...list, entry]);
      if (entry.duration !== null) {
        timers.current.set(entry.id, { remaining: entry.duration, startedAt: Date.now(), handle: null });
      }
    };
    listeners.add(onSignal);
    return () => { listeners.delete(onSignal); };
  }, [dismiss]);

  /* Start each new toast's clock once it exists. Skipped while the tab is hidden. */
  useEffect(() => {
    if (document.hidden) return;
    entries.forEach(e => { if (!e.leaving) resume(e.id); });
  }, [entries, resume]);

  /* Measure real heights so the expanded stack can space itself honestly. */
  useLayoutEffect(() => {
    let changed = false;
    const next = { ...heights };
    nodes.current.forEach((node, id) => {
      const h = node.getBoundingClientRect().height;
      if (h && Math.abs((next[id] ?? 0) - h) > 0.5) { next[id] = h; changed = true; }
    });
    if (changed) setHeights(next);
  }, [entries, heights]);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [dismiss]);
  const live = entries.filter(e => !e.leaving);

  return (
    <ToastCtx.Provider value={api}>
      {children}

      {/* aria-live so a screen reader hears what a sighted user sees. Polite: a toast
          confirms something that already happened and must not interrupt. */}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-0 right-0 z-[100] w-[min(24rem,calc(100vw-1.5rem))] p-4 sm:p-6"
        onMouseEnter={() => { setExpanded(true); pauseAll(); }}
        onMouseLeave={() => { setExpanded(false); resumeAll(); }}
      >
        <ol className="relative list-none" style={{ height: entries.length ? heights[entries[entries.length - 1].id] ?? 64 : 0 }}>
          {entries.map((entry, i) => {
            const depth = entries.length - 1 - i;
            const liveDepth = live.length - 1 - live.findIndex(e => e.id === entry.id);
            return (
              <ToastRow
                key={entry.id}
                entry={entry}
                depth={depth}
                expanded={expanded}
                hidden={!expanded && liveDepth >= VISIBLE}
                offset={
                  expanded
                    ? entries.slice(i + 1).reduce((sum, e) => sum + (heights[e.id] ?? 64) + GAP, 0)
                    : depth * STACK_OFFSET
                }
                register={node => { if (node) nodes.current.set(entry.id, node); else nodes.current.delete(entry.id); }}
                onDismiss={() => dismiss(entry.id)}
                onPause={() => pause(entry.id)}
                onResume={() => resume(entry.id)}
              />
            );
          })}
        </ol>
      </section>
    </ToastCtx.Provider>
  );
}

function ToastRow({
  entry, depth, expanded, hidden, offset, register, onDismiss, onPause, onResume,
}: {
  entry: Entry;
  depth: number;
  expanded: boolean;
  hidden: boolean;
  offset: number;
  register: (node: HTMLDivElement | null) => void;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { Icon, tint, ring } = META[entry.kind];
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<{ x: number; t: number } | null>(null);

  /* One frame at the starting transform, so the transition has something to run from. */
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const entering = !mounted;
  const gone = entry.leaving;
  const scale = expanded ? 1 : 1 - depth * STACK_SCALE;

  /* Off-screen below on the way in and on the way out; in place otherwise. */
  const y = entering || gone ? 24 : -offset;
  const opacity = entering || gone ? 0 : hidden ? 0 : 1;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStart.current = { x: e.clientX, t: Date.now() };
    /* Capture so the gesture survives the pointer leaving the element. */
    e.currentTarget.setPointerCapture(e.pointerId);
    onPause();
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    /* Rightward (toward the edge) moves freely; the other way meets resistance. */
    const dx = e.clientX - dragStart.current.x;
    setDrag(dx > 0 ? dx : dx / 4);
  }
  function onPointerUp() {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const elapsed = Math.max(1, Date.now() - start.t);
    const velocity = Math.abs(drag) / elapsed;
    if (drag > SWIPE_DISTANCE || (drag > 12 && velocity > SWIPE_VELOCITY)) onDismiss();
    else { setDrag(0); onResume(); }
  }

  return (
    <li>
      <div
        ref={register}
        role={entry.kind === 'error' || entry.kind === 'warning' ? 'alert' : 'status'}
        aria-live={entry.kind === 'error' || entry.kind === 'warning' ? 'assertive' : 'polite'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={clsx(
          'group absolute bottom-0 right-0 w-full touch-pan-y select-none',
          'rounded-xl bg-white ring-1 ring-inset',
          'px-4 py-3.5',
          !hidden && 'pointer-events-auto',
          ring,
        )}
        style={{
          /* transform + opacity only — never height or top — so this stays on the compositor. */
          transform: `translate3d(${drag}px, ${y}px, 0) scale(${scale})`,
          opacity,
          zIndex: 100 - depth,
          boxShadow: 'var(--shadow-lg)',
          transition: dragStart.current
            ? 'none' /* follow the finger exactly while dragging */
            : `transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)`,
        }}
      >
        <div className="flex items-start gap-3">
          <Icon
            size={17}
            className={clsx('mt-0.5 shrink-0', tint, entry.kind === 'loading' && 'animate-spin')}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium leading-5 text-gray-900">{entry.message}</p>
            {entry.description && (
              <p className="mt-0.5 text-[12.5px] leading-5 text-gray-500">{entry.description}</p>
            )}
            {entry.action && (
              <button
                type="button"
                onClick={() => { entry.action?.onClick(); onDismiss(); }}
                className="mt-2 rounded-md bg-gray-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-gray-800"
              >
                {entry.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            /* Revealed on hover — a close button on every toast is visual noise. */
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Kept because 35 files already call it. It returns the same standalone functions, so
 * `const { toast } = useToast()` and a bare `import { toast }` are the same thing.
 */
export function useToast() {
  return useContext(ToastCtx);
}
