'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type ToastKind = 'success' | 'error' | 'info';
type ToastEntry = { id: number; kind: ToastKind; message: string };

const ToastCtx = createContext<{ toast: (message: string, kind?: ToastKind) => void }>({ toast: () => {} });

let counter = 0;

const META: Record<ToastKind, { Icon: typeof CheckCircle2; ring: string; icon: string }> = {
  success: { Icon: CheckCircle2, ring: 'border-green-200', icon: 'text-green-600' },
  error:   { Icon: AlertCircle,  ring: 'border-red-200',   icon: 'text-red-600' },
  info:    { Icon: Info,         ring: 'border-brand-200', icon: 'text-brand-600' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), []);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++counter;
    setToasts(ts => [...ts, { id, kind, message }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const { Icon, ring, icon } = META[t.kind];
          return (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex items-start gap-2.5 w-80 max-w-[90vw] rounded-xl border bg-white px-4 py-3 shadow-lg',
                'animate-[toastIn_.18s_ease-out]', ring,
              )}
              role="status"
            >
              <Icon size={18} className={clsx('mt-0.5 shrink-0', icon)} />
              <p className="flex-1 text-sm text-gray-800 leading-snug">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-gray-300 hover:text-gray-500 shrink-0"><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
