'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

/**
 * The app's one dialog shape.
 *
 * Every modal used to hand-roll its own container, and most of them forgot to bound the
 * height. A tall form (the task form has an assignee list with every person in the company)
 * then grew past the viewport, and because the overlay centres its child, it overflowed BOTH
 * ends of the screen — pushing the Cancel/Save buttons off the bottom with no way to scroll
 * to them. `overflow-hidden` on the panel made it worse: the buttons were clipped, not merely
 * out of view.
 *
 * So the panel is a bounded flex column: the header and the footer are pinned, and ONLY the
 * body scrolls. The actions are therefore always reachable, however tall the content grows.
 * Put the primary buttons in `footer` and they can never disappear again.
 *
 * MOTION. The dialog animates both ways. The exit is handled inside: a close request plays
 * the outgoing transition and only THEN calls `onClose`, so callers keep writing the same
 * `{open && <Modal onClose={...} />}` they always did and get the animation for free.
 *
 * FOCUS. Tab is trapped inside the panel. Without it, tabbing walks the page behind a dialog
 * that is visually blocking it — the keyboard user is somewhere they cannot see.
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

const EXIT_MS = 180;

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  size = 'md',
  onClose,
  children,
  footer,
  labelledBy,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: ModalSize;
  onClose: () => void;
  /** The scrollable body. */
  children: ReactNode;
  /** Pinned to the bottom — always visible. Put the actions here. */
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);

  /* Play the exit, then hand control back to the caller, which unmounts us. */
  const requestClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { requestClose(); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    // The page behind must not scroll while a modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      // Send focus back where it came from, or the keyboard lands at the top of the page.
      previouslyFocused?.focus?.();
    };
  }, [requestClose]);

  const open = shown && !closing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      aria-labelledby={labelledBy}
    >
      {/* Scrim. Glass belongs here: the backdrop is the app itself, so the contrast behind
          the panel is ours to control — the one place translucency is safe. */}
      <div
        className="absolute inset-0 bg-gray-950/25 backdrop-blur-[3px]"
        style={{ opacity: open ? 1 : 0, transition: `opacity ${EXIT_MS}ms var(--ease-out)` }}
        onClick={requestClose}
      />

      {/* Bounded column: header + scrolling body + pinned footer. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'relative bg-white rounded-2xl w-full flex flex-col',
          'max-h-[calc(100dvh-2rem)] focus:outline-none ring-1 ring-gray-950/[0.06]',
          SIZE[size],
        )}
        style={{
          boxShadow: 'var(--shadow-2xl)',
          /* Rises the last few pixels rather than zooming from nothing — scale(0) reads as a
             cartoon; 0.97 reads as the panel settling into place. */
          transform: open ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.97)',
          opacity: open ? 1 : 0,
          transition: `transform var(--dur-slow) var(--ease-out), opacity ${EXIT_MS}ms var(--ease-out)`,
        }}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-950/[0.06] shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">{title}</h2>}
              {subtitle && <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="p-2 -m-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* The only part that scrolls. min-h-0 is what lets a flex child actually shrink. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-gray-950/[0.06] px-6 py-4 bg-white rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
