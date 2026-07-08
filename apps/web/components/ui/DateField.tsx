'use client';

import { forwardRef, useRef, type InputHTMLAttributes } from 'react';

/**
 * Drop-in replacement for a native <input type="date|time|datetime-local|month" />
 * whose picker opens on a click ANYWHERE in the field — not only on the small
 * calendar/clock glyph. Uses the standard HTMLInputElement.showPicker() inside the
 * click gesture; guarded so browsers without it simply keep the default behaviour.
 */
export const DateField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function DateField({ onClick, ...props }, forwardedRef) {
    const innerRef = useRef<HTMLInputElement | null>(null);
    return (
      <input
        {...props}
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) (forwardedRef as { current: HTMLInputElement | null }).current = node;
        }}
        onClick={(e) => {
          // showPicker() must run inside a user gesture; guard for unsupported/older browsers.
          try {
            (innerRef.current as unknown as { showPicker?: () => void })?.showPicker?.();
          } catch {
            /* not supported — fall back to the native glyph */
          }
          onClick?.(e);
        }}
      />
    );
  },
);
