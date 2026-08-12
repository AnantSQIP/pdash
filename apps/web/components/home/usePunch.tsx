'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, LogIn, LogOut, Loader, Home } from 'lucide-react';
import { api, type Attendance, type LeaveBalance } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { formatTimeIST, fmtHours, plural, todayUtc, toUtcDay } from '@/lib/date';
import { getCurrentLocation, reverseGeocode } from '@/lib/geolocation';
import { homeKeys } from './keys';

/**
 * The single Punch In/Out implementation for the whole app's Home surface. There used to
 * be two divergent copies (the banner button and a dead card); this hook is the one source
 * of truth. It fixes the class of bugs the QA sweep found on the banner button:
 *  - a loading guard, so a click before today's row loads can't accidentally punch you out;
 *  - an optimistic cache write from the punch response, closing the double-click race;
 *  - real success/error feedback via the app toast (the banner used to fail silently);
 *  - times rendered in IST regardless of the viewer's device clock.
 */
export function usePunch() {
  const { can } = usePermissions();
  const { currentUser } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const allowed = can('attendance.view.own');
  const uid = currentUser?.id;
  const enabled = allowed && !!uid;

  const todayQ = useQuery<Attendance | null>({
    queryKey: homeKeys.attnToday(uid),
    queryFn: () => api.attendance.today(),
    enabled,
    staleTime: 30_000,
  });
  const balancesQ = useQuery<LeaveBalance[]>({
    queryKey: homeKeys.leaveBalances(uid),
    queryFn: () => api.leave.balances(),
    enabled,
    staleTime: 60_000,
  });

  const punch = useMutation({
    // Location is mandatory — capture it first and block the punch if the browser denies it.
    // Reverse-geocode to a human area/landmark (best-effort; never blocks the punch).
    mutationFn: async (workMode?: 'WFH' | 'OFFICE') => {
      const loc = await getCurrentLocation();
      const area = await reverseGeocode(loc.lat, loc.lng);
      return api.attendance.punch({ ...loc, area, ...(workMode ? { workMode } : {}) });
    },
    onSuccess: (row) => {
      // The overnight-close path returns YESTERDAY's row (it closed the forgotten shift
      // without opening today's). Only write it into today's cache when it really is today;
      // otherwise refetch, and tell the user their next click starts today.
      const isToday = row?.date ? toUtcDay(row.date) === todayUtc() : true;
      if (isToday) qc.setQueryData(homeKeys.attnToday(uid), row);
      else qc.invalidateQueries({ queryKey: homeKeys.attnToday(uid) });
      qc.invalidateQueries({ queryKey: ['attn-month'] });
      qc.invalidateQueries({ queryKey: ['attn-org'] });
      qc.invalidateQueries({ queryKey: ['attn-punch-locations'] }); // the team location table
      qc.invalidateQueries({ queryKey: homeKeys.leaveBalances(uid) });
      toast(
        !isToday ? 'Closed your open shift from earlier — punch again to clock in for today.'
          : row.checkOut ? 'Punched out. See you tomorrow!'
          : 'Punched in. Have a great day!',
        isToday ? 'success' : 'info',
      );
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not record your punch.', 'error'),
  });

  const att = todayQ.data;
  const clockedIn = !!att?.checkIn && !att?.checkOut;
  const dayComplete = !!att?.checkIn && !!att?.checkOut;
  const busy = punch.isPending;
  const ready = enabled && !todayQ.isLoading; // guard: don't act until today's row has resolved
  const totalLeave = (balancesQ.data ?? []).reduce((s, b) => s + (b.remaining ?? 0), 0);
  const leaveKnown = !balancesQ.isLoading && (balancesQ.data?.length ?? 0) > 0;

  return { allowed, ready, att, clockedIn, dayComplete, busy, punch, totalLeave, leaveKnown };
}

/**
 * The Punch In/Out button. `variant="banner"` is the compact top-right control (status
 * line + button); `variant="card"` is the full-width in-card version.
 */
export function PunchControl({ variant = 'banner' }: { variant?: 'banner' | 'card' }) {
  const { allowed, ready, att, clockedIn, dayComplete, busy, punch, totalLeave, leaveKnown } = usePunch();
  const [confirmingOut, setConfirmingOut] = useState(false);
  if (!allowed) return null;

  const statusLabel = dayComplete ? 'Day complete' : clockedIn ? 'Clocked in' : !ready ? 'Loading…' : 'Not clocked in';
  const doPunch = (workMode?: 'WFH' | 'OFFICE') => {
    if (!ready || busy || dayComplete) return;
    // Punching out ends and locks the day — require a confirm so a misclick can't do it.
    if (clockedIn && !confirmingOut) { setConfirmingOut(true); setTimeout(() => setConfirmingOut(false), 3000); return; }
    setConfirmingOut(false);
    punch.mutate(workMode);
  };
  const label = busy ? 'Saving…'
    : dayComplete ? 'Completed for today'
    : clockedIn ? (confirmingOut ? 'Confirm punch out?' : 'Punch Out')
    : 'Punch In';
  const icon = busy ? <Loader size={15} className="animate-spin" />
    : dayComplete ? <Check size={15} />
    : clockedIn ? <LogOut size={15} /> : <LogIn size={15} />;
  const disabled = !ready || busy || dayComplete;
  const btnColor = dayComplete ? 'bg-gray-300'
    : confirmingOut ? 'bg-red-600 hover:bg-red-700'
    : clockedIn ? 'bg-red-500 hover:bg-red-600'
    : 'bg-brand-600 hover:bg-brand-700';

  const button = (
    <button
      onClick={() => doPunch()}
      disabled={disabled}
      aria-busy={busy}
      aria-label={clockedIn ? 'Punch out for the day' : dayComplete ? 'Attendance complete for today' : 'Punch in for the day'}
      title={dayComplete ? 'You have clocked in and out — the day is complete.' : clockedIn ? 'Clock out for the day' : 'Clock in for the day'}
      className={clsx('inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-400',
        variant === 'card' && 'mt-3 w-full', btnColor)}
    >
      {icon}{label}
    </button>
  );

  // "Punch in — Work from home": the same clock-in, recording the day as WFH. Only offered
  // before clocking in; afterwards the day's work mode is already set, and punching out must
  // stay a single unambiguous action.
  const wfhButton = !clockedIn && !dayComplete ? (
    <button
      onClick={() => doPunch('WFH')}
      disabled={disabled}
      aria-busy={busy}
      aria-label="Punch in and record today as work from home"
      title="Clock in and mark today as work from home"
      className={clsx('inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-cyan-400',
        'bg-cyan-50 text-cyan-800 hover:bg-cyan-100 ring-1 ring-cyan-200',
        variant === 'card' && 'mt-2 w-full')}
    >
      <Home size={15} />{busy ? 'Saving…' : 'Punch In (WFH)'}
    </button>
  ) : null;

  const statusLine = (
    <>
      <div className="flex items-center gap-1.5">
        <span className={clsx('w-2 h-2 rounded-full shrink-0', clockedIn ? 'bg-green-500 animate-pulse' : dayComplete ? 'bg-green-400' : 'bg-gray-300')} />
        <span className="text-xs font-semibold text-gray-700">{statusLabel}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {att?.checkIn
          ? `In ${formatTimeIST(att.checkIn)}${att.checkOut ? ` · Out ${formatTimeIST(att.checkOut)}` : ''}${att.totalHours != null ? ` · ${fmtHours(att.totalHours)}` : ''}`
          : leaveKnown ? `${plural(totalLeave, 'leave day')} left` : ''}
      </p>
    </>
  );

  if (variant === 'card') {
    return (
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', clockedIn ? 'bg-green-500 animate-pulse' : dayComplete ? 'bg-green-400' : 'bg-gray-300')} />
          <div className="min-w-0">{statusLine}</div>
        </div>
        {button}
        {wfhButton}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right hidden sm:block">{statusLine}</div>
      {wfhButton}
      {button}
    </div>
  );
}
