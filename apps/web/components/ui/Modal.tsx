'use client';

import { useEffect, useRef, type ReactNode } from 'react';
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
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

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

  // Escape closes; focus moves into the dialog so a keyboard user isn't stranded behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    // The page behind must not scroll while a modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      aria-labelledby={labelledBy}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Bounded column: header + scrolling body + pinned footer. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'relative bg-white rounded-2xl shadow-2xl w-full flex flex-col',
          'max-h-[calc(100dvh-2rem)] focus:outline-none',
          SIZE[size],
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100 shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
              {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 -m-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* The only part that scrolls. min-h-0 is what lets a flex child actually shrink. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-gray-100 px-6 py-4 bg-white rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
