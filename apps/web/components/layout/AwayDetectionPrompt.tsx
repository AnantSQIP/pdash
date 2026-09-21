'use client';

import { useEffect, useState } from 'react';
import { MonitorSmartphone, X } from 'lucide-react';
import { usePresence } from '@/lib/presence-context';

const DISMISSED_KEY = 'pdash-away-detection-dismissed';

/**
 * A one-time card asking to let the dashboard notice when the person is away from their PC.
 *
 * Presence turns yellow after five minutes without keyboard or mouse. The dashboard can only see
 * its OWN tab unless the browser allows more — Chrome and Edge can report input anywhere on the PC
 * (and a locked screen), but only after the person says yes, and only from a click. Without it,
 * someone working in another program looks away. The same switch lives in the status menu, so
 * "Not now" is not "never".
 */
export function AwayDetectionPrompt() {
  const { canWatchDevice, watchDevice } = usePresence();
  const [dismissed, setDismissed] = useState(true);   // until storage says otherwise — no flash
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISSED_KEY) === '1'); } catch { setDismissed(false); }
  }, []);

  if (!canWatchDevice || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* storage blocked */ }
  };

  return (
    <div role="dialog" aria-label="Away detection"
      className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] sm:w-80 rounded-xl border border-gray-200 bg-white shadow-xl p-4">
      <button onClick={close} aria-label="Not now" className="absolute top-2.5 right-2.5 p-1 text-gray-400 hover:text-gray-600 rounded">
        <X size={14} />
      </button>
      <div className="flex items-start gap-3 pr-4">
        <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
          <MonitorSmartphone size={18} className="text-yellow-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Show you as away only when you are</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Your dot turns yellow after 5 minutes without using your PC. Allow this so work in other
            programs counts — otherwise only the dashboard can tell you&apos;re there.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              disabled={busy}
              onClick={async () => { setBusy(true); await watchDevice(); setBusy(false); close(); }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
              Allow
            </button>
            <button onClick={close} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}
