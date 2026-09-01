'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from './Modal';

/**
 * The replacement for `window.confirm`.
 *
 * There were 32 native confirms in this app. Whatever else was done to the styling, those
 * rendered as a grey operating-system box with the site's URL printed at the top — the single
 * most dated thing on screen, unstyleable by definition, and they freeze the page's JavaScript
 * while they are open.
 *
 * This keeps what made `confirm()` pleasant to write — one awaited call that returns true or
 * false, no state to wire up — and drops what made it look like 2010:
 *
 *     if (!(await confirm({ title: 'Delete this cycle?', danger: true }))) return;
 *
 * A destructive action gets `danger`, which is not just a red button: the wording of the
 * confirm label becomes the verb ("Delete", not "OK"), because a button that says what it
 * will do is what stops the mis-click, not the colour.
 */
export type ConfirmOptions = {
  title: string;
  /** The consequence, in a sentence. Say what cannot be undone. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Irreversible or destructive: red action, warning mark. */
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmCtx = createContext<(o: ConfirmOptions | string) => Promise<boolean>>(
  async () => false,
);

/* ─────────────────────────────────────────────────────────────────────────────
   Like the toast store, this lives outside React so it can be called from the
   same places `window.confirm` could: any handler, any helper, no hook needed.
   ───────────────────────────────────────────────────────────────────────────── */
type Asker = (o: ConfirmOptions | string) => Promise<boolean>;
let ask: Asker | null = null;

/**
 * `if (!(await confirmDialog({ title: 'Delete this?', danger: true }))) return;`
 *
 * Deliberately NOT named `confirm`: a bare `confirm(...)` that someone forgets to await
 * returns a Promise, which is always truthy — so the guard would silently pass and the
 * destructive action would run unconfirmed. A distinct name means a missed call site keeps
 * the old browser dialog: ugly, but it still asks.
 *
 * Resolves false if the provider is not mounted, which fails closed.
 */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  return ask ? ask(options) : Promise.resolve(false);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  /* Guards against the promise being settled twice — close and confirm can race. */
  const settled = useRef(false);

  const confirm = useCallback((o: ConfirmOptions | string) => {
    const options: ConfirmOptions = typeof o === 'string' ? { title: o } : o;
    settled.current = false;
    return new Promise<boolean>(resolve => setPending({ ...options, resolve }));
  }, []);

  const settle = useCallback((ok: boolean) => {
    if (settled.current) return;
    settled.current = true;
    pending?.resolve(ok);
    setPending(null);
  }, [pending]);

  /* Publish the asker so the standalone confirmDialog() can reach this provider. */
  useEffect(() => { ask = confirm; return () => { ask = null; }; }, [confirm]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && (
        <Modal
          size="sm"
          onClose={() => settle(false)}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settle(true)}
                className={clsx(
                  'rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors',
                  pending.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700',
                )}
              >
                {pending.confirmLabel ?? (pending.danger ? 'Delete' : 'Confirm')}
              </button>
            </div>
          }
        >
          <div className="flex gap-4">
            <div
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                pending.danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600',
              )}
              aria-hidden
            >
              {pending.danger ? <AlertTriangle size={19} /> : <HelpCircle size={19} />}
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">{pending.title}</h2>
              {pending.body && (
                <div className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{pending.body}</div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

/**
 * `const confirm = useConfirm()` — then `await confirm(...)` inside any async handler.
 * Deliberately the same shape as the global it replaces, so converting a call site is a
 * one-line change rather than a refactor.
 */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

/** Convenience for the commonest case: "delete X?", red, irreversible. */
export function deleteConfirm(what: string, detail?: string): ConfirmOptions {
  return {
    title: `Delete ${what}?`,
    body: detail ?? 'This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
  };
}

export { Trash2 };
