'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogIn, Loader, Clock, Home } from 'lucide-react';
import clsx from 'clsx';
import { api, type WfhRequestItem } from '@/lib/api';
import { usePunch } from './usePunch';

/**
 * First-login-of-the-day punch-in prompt. When someone opens the app and hasn't clocked in yet
 * today, a small dialog invites them to Punch In (captures location), Punch in from home, or
 * "Punch in later" (dismissed for the rest of the day, per-device). It disappears automatically
 * once they've punched in.
 *
 * The from-home option punches in AND raises today's WFH request in the same server call, so
 * nobody ends up clocked in from home with no authorisation behind it. Where that request has
 * got to (pending / approved / declined) is shown right here, so the answer arrives where the
 * question was asked instead of only in the Leaves tab.
 */
const WFH_BANNER: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-cyan-50 text-cyan-800',
  REJECTED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-gray-50 text-gray-500',
};
const WFH_WORD: Record<string, string> = {
  PENDING: 'awaiting approval', APPROVED: 'approved', REJECTED: 'declined', CANCELLED: 'cancelled',
};

export function PunchInPrompt() {
  const { allowed, ready, att, dayComplete, busy, punch } = usePunch();
  const [dismissed, setDismissed] = useState(true); // start hidden until we've checked storage
  const todayKey = new Date().toISOString().slice(0, 10);
  const storageKey = `punch-later-${todayKey}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  // Today's WFH request, if any — drives the status line below the buttons.
  const todayIso = todayKey;
  const { data: wfhMine = [] } = useQuery<WfhRequestItem[]>({
    queryKey: ['wfh-mine'], queryFn: () => api.attendance.myWfhRequests(),
    enabled: allowed, staleTime: 60_000,
  });
  const todayWfh = wfhMine.find(r => String(r.startDate).slice(0, 10) <= todayIso && todayIso <= String(r.endDate).slice(0, 10));

  const alreadyPunched = !!att?.checkIn; // clocked in or completed
  const show = allowed && ready && !alreadyPunched && !dayComplete && !dismissed;
  if (!show) return null;

  const later = () => { try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ } setDismissed(true); };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={later} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <Clock size={26} className="text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{greeting}! Ready to start your day?</h2>
          <p className="text-sm text-gray-500 mt-1.5">Punch in to record your attendance for today. Your location is captured on punch.</p>
          <div className="flex flex-col gap-2 mt-5">
            <button onClick={() => punch.mutate({})} disabled={busy}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
              {busy ? <Loader size={16} className="animate-spin" /> : <LogIn size={16} />} {busy ? 'Punching in…' : 'Punch in (Office)'}
            </button>
            <button onClick={() => punch.mutate({ wfh: true })} disabled={busy}
              title="Records today as work-from-home and sends the request to HR/Admin for approval"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-cyan-700 hover:bg-cyan-800 disabled:opacity-60">
              {busy ? <Loader size={16} className="animate-spin" /> : <Home size={16} />} Punch in (Work from home)
            </button>
            <button onClick={later} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50">
              Punch in later
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Working from home also raises a WFH request for HR to approve.
          </p>
          {todayWfh && (
            <div className={clsx('mt-3 rounded-lg px-3 py-2 text-xs text-left', WFH_BANNER[todayWfh.status] ?? 'bg-gray-50 text-gray-600')}>
              <span className="font-semibold">Today&apos;s WFH request: {WFH_WORD[todayWfh.status] ?? todayWfh.status}</span>
              {todayWfh.reviewNote ? <span className="block mt-0.5 opacity-80">{todayWfh.reviewNote}</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
