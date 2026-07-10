'use client';

// Renders the step-up passcode modal and registers the api-client handler that
// drives it. When a "big change" request 403s with a PASSCODE_* code, the api
// client calls the registered handler; this provider opens the modal, collects the
// passcode, and resolves it back so the request retries with the x-org-passcode
// header. Concurrent guarded requests share one prompt (same org passcode).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ShieldAlert, Lock, X, Loader } from 'lucide-react';
import { setPasscodeHandler, type PasscodePrompt } from './api';

export function PasscodeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<PasscodePrompt | null>(null);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<Array<(v: string | null) => void>>([]);

  const handler = useCallback((incoming: PasscodePrompt) => {
    return new Promise<string | null>((resolve) => {
      pendingRef.current.push(resolve);
      setInfo(incoming);
      setSubmitting(false);
      setValue('');
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    setPasscodeHandler(handler);
    return () => setPasscodeHandler(null);
  }, [handler]);

  const settle = useCallback((v: string | null) => {
    const resolvers = pendingRef.current;
    pendingRef.current = [];
    setOpen(false);
    setValue('');
    resolvers.forEach(r => r(v));
  }, []);

  const locked = info?.code === 'PASSCODE_LOCKED';
  const invalid = info?.code === 'PASSCODE_INVALID';

  function confirm() {
    if (!value.trim() || locked) return;
    // Keep the modal up while the request retries; the api client re-invokes the
    // handler (reopening with an error) if the passcode was wrong.
    setSubmitting(true);
    settle(value);
  }

  const lockedMsg = locked && info?.lockedUntil
    ? `Too many attempts. Try again after ${new Date(info.lockedUntil).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`
    : info?.message;

  return (
    <>
      {children}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Organization passcode">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => settle(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center', locked ? 'bg-red-50' : 'bg-amber-50')}>
                  {locked ? <Lock size={18} className="text-red-500" /> : <ShieldAlert size={18} className="text-amber-600" />}
                </div>
                <h2 className="text-base font-semibold text-gray-900">Confirm big change</h2>
              </div>
              <button onClick={() => settle(null)} aria-label="Cancel" className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-600">
                This is a protected organization action. Enter the organization passcode to continue.
              </p>
              <input
                type="password"
                autoFocus
                value={value}
                disabled={locked || submitting}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') settle(null); }}
                placeholder="Organization passcode"
                autoComplete="off"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-gray-50"
              />
              {(invalid || locked) && (
                <p className="text-xs text-red-600">
                  {lockedMsg}
                  {invalid && typeof info?.remaining === 'number' && info.remaining > 0 && ` · ${info.remaining} attempt${info.remaining === 1 ? '' : 's'} left`}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button onClick={() => settle(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button
                  onClick={confirm}
                  disabled={!value.trim() || locked || submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting && <Loader size={14} className="animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
