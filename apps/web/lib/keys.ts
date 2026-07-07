import type { KeyboardEvent } from 'react';

/**
 * Shared composer key handling: Enter submits, Shift+Enter inserts a newline.
 * IME-safe — never fires while a CJK/other composition is in progress.
 *
 *   <textarea onKeyDown={submitOnEnter(handleSend)} />
 */
export function submitOnEnter(onSubmit: () => void) {
  return (e: KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !(e.nativeEvent as unknown as { isComposing?: boolean }).isComposing
    ) {
      e.preventDefault();
      onSubmit();
    }
  };
}
