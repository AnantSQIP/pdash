'use client';

/**
 * "How free is this person, really?" — printed on every screen that hands out work.
 *
 * The owner's complaint: looking at one client, a person showed free hours in a week; they were
 * already booked solid on another matter, and somebody gave them a task on the strength of what
 * the screen said. The staffing form, the board's task editor, the add-task dialog and "assign
 * the N tasks" all offered hours with no idea of the person's week at all.
 *
 * So every one of them now renders this, and every one of them asks the same API for the answer
 * (POST /capacity/availability/preview → AvailabilityService). Nothing here computes free hours;
 * it only draws what the server said. The meter is the person's whole day-range at a glance:
 *
 *    ▓▓▓▓ other work   ████ this client   ░░░░ what you are about to add   ▁▁▁▁ still free
 *
 * Colour never carries the message on its own — the sentence under the meter says the same thing
 * in words, the segments are labelled, and the over-capacity tail is both a different colour and
 * hatched.
 *
 * It WARNS rather than refuses. A deadline sometimes genuinely costs somebody a ten-hour day and
 * the screen is not the place to forbid that. What it will not do is let it happen quietly: when
 * the assignment pushes a day over, saving is blocked behind an acknowledgement the person has to
 * tick — `useOverrideGate` below — so an overload is always a decision somebody made on purpose.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Loader, TriangleAlert, CalendarX2 } from 'lucide-react';
import { api, type AssignmentPreview, type ClientShare, type ProposedSeat, type SeatPreview } from '@/lib/api';
import { formatDate, fmtHours } from '@/lib/date';
import { cidLabel } from '@/lib/mock-data';

// The four bands of the meter. Deliberately not the board's project hues: this is one person's
// day, not a palette of matters, and the question is only "whose hours are these?".
const BAND = {
  /** Work on every other client — hatched slate, so it reads as load even in a client's own view. */
  other: '#94a3b8',    // slate-400
  /** This client's existing hours. */
  mine: '#3d8de2',     // brand-600
  /** The hours about to be given. */
  adding: '#f59e0b',   // amber-500
  /** The part of them that does not fit. */
  over: '#e11d48',     // rose-600
  /** What is left. */
  free: '#a7f3d0',     // emerald-200
} as const;

const HATCH = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 5px)';

export type PreviewState = {
  seats: SeatPreview[];
  isLoading: boolean;
  /** True when any seat would push a day past its capacity. */
  over: boolean;
};

/**
 * Ask the server what these seats would do. Debounced, because it is wired to fields somebody is
 * typing in; disabled when nobody is named yet, so an empty form makes no calls.
 */
export function useAssignmentPreview(
  seats: ProposedSeat[],
  opts: { projectId?: string | null; excludeTaskId?: string | null; enabled?: boolean } = {},
): PreviewState {
  const named = useMemo(() => seats.filter(s => s.userId), [seats]);
  const key = useMemo(() => JSON.stringify(named.map(s => [s.userId, s.hours ?? 0, s.startDate ?? '', s.dueDate ?? '', s.hoursPerDay ?? ''])), [named]);
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), 350);
    return () => clearTimeout(t);
  }, [key]);

  const enabled = (opts.enabled ?? true) && named.length > 0;
  const { data, isFetching } = useQuery<AssignmentPreview>({
    queryKey: ['availability-preview', settled, opts.projectId ?? '', opts.excludeTaskId ?? ''],
    queryFn: () => api.capacity.previewAssignment({
      seats: JSON.parse(settled).map(([userId, hours, startDate, dueDate, hoursPerDay]: [string, number, string, string, number | '']) => ({
        userId, hours, startDate: startDate || null, dueDate: dueDate || null, hoursPerDay: hoursPerDay === '' ? null : hoursPerDay,
      })),
      projectId: opts.projectId ?? null,
      excludeTaskId: opts.excludeTaskId ?? null,
    }),
    enabled,
    staleTime: 20_000,
    // Availability is advice, not a gate on the form: a viewer without capacity.view gets a 403
    // and the dialog carries on without the panel rather than breaking.
    retry: false,
  });

  const rows = enabled ? data?.seats ?? [] : [];
  return { seats: rows, isLoading: enabled && isFetching && !data, over: rows.some(s => s.verdict === 'OVER') };
}

/**
 * The acknowledgement an over-assignment has to pass through.
 *
 * Returns whether saving is allowed and the checkbox to render. The tick resets whenever the
 * warning changes, so agreeing to one overload never silently covers a different one.
 */
export function useOverrideGate(over: boolean, signature: string): { allowed: boolean; node: React.ReactNode } {
  const [ack, setAck] = useState(false);
  useEffect(() => { setAck(false); }, [signature]);
  if (!over) return { allowed: true, node: null };
  return {
    allowed: ack,
    node: (
      <label className="mt-2 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-900 ring-1 ring-inset ring-rose-200">
        <input
          type="checkbox"
          checked={ack}
          onChange={e => setAck(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
        />
        <span>I know this puts them over their day — assign it anyway.</span>
      </label>
    ),
  };
}

function shareLabel(s: ClientShare): string {
  if (s.restricted) return 'Other work';
  if (s.isTeamWork) return s.label;
  return s.code ? `${cidLabel(s.code, s.round)} · ${s.label}` : s.label;
}

/** The whole panel: one block per person named in the assignment. */
export function AssignmentImpact({ state, className, compact }: {
  state: PreviewState;
  className?: string;
  /** Inside a narrow dialog column: the day list collapses to a sentence. */
  compact?: boolean;
}) {
  if (state.isLoading) {
    return (
      <p className={clsx('flex items-center gap-2 text-[12px] text-gray-400', className)}>
        <Loader size={13} className="animate-spin" /> Checking what else they are on…
      </p>
    );
  }
  if (!state.seats.length) return null;
  return (
    <div className={clsx('space-y-2.5', className)}>
      {state.seats.map(seat => <SeatImpact key={seat.userId} seat={seat} compact={compact} />)}
    </div>
  );
}

function SeatImpact({ seat, compact }: { seat: SeatPreview; compact?: boolean }) {
  const tone =
    seat.verdict === 'OVER' ? 'border-rose-200 bg-rose-50/60'
      : seat.verdict === 'NO_ROOM' ? 'border-amber-200 bg-amber-50/60'
        : seat.verdict === 'TIGHT' ? 'border-amber-200 bg-amber-50/40'
          : 'border-emerald-200 bg-emerald-50/50';
  const Icon = seat.verdict === 'OVER' ? AlertTriangle : seat.verdict === 'NO_ROOM' ? CalendarX2 : seat.verdict === 'TIGHT' ? TriangleAlert : CheckCircle2;
  const ink = seat.verdict === 'OVER' ? 'text-rose-800' : seat.verdict === 'NO_ROOM' || seat.verdict === 'TIGHT' ? 'text-amber-800' : 'text-emerald-800';

  // The meter's four bands, in hours, against the capacity of the days being assigned. The scale
  // stretches past capacity when the assignment overflows, so the tail is visible rather than
  // clipped — an overload you cannot see is the bug this whole panel exists for.
  const cap = Math.max(seat.capacityHours, 0.1);
  const mine = Math.max(0, seat.committedHours - seat.otherHours);
  const fits = Math.max(0, Math.min(seat.requestedHours, seat.freeHours));
  const over = seat.overHours;
  const free = Math.max(0, seat.freeHours - fits);
  const scale = Math.max(cap, seat.committedHours + seat.requestedHours);
  const bands: { key: string; hours: number; color: string; hatch?: boolean; label: string }[] = [
    { key: 'other', hours: seat.otherHours, color: BAND.other, hatch: true, label: `${fmtHours(seat.otherHours)} on other work` },
    { key: 'mine', hours: mine, color: BAND.mine, label: `${fmtHours(mine)} already on this client` },
    { key: 'adding', hours: fits, color: BAND.adding, label: `${fmtHours(fits)} you are adding` },
    { key: 'over', hours: over, color: BAND.over, hatch: true, label: `${fmtHours(over)} beyond their day` },
    { key: 'free', hours: free, color: BAND.free, label: `${fmtHours(free)} still free` },
  ];

  return (
    <div className={clsx('rounded-xl border px-3 py-2.5', tone)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[13px] font-semibold text-gray-900">{seat.name}</span>
        <span className="text-[11.5px] tabular-nums text-gray-600">
          {formatDate(seat.from, { day: 'numeric', month: 'short' })}–{formatDate(seat.to, { day: 'numeric', month: 'short' })}
          {' · '}<span className="font-medium text-gray-900">{fmtHours(seat.freeHours)}</span> free of {fmtHours(seat.capacityHours)}
        </span>
      </div>

      <div
        className="mt-1.5 flex h-2.5 w-full items-stretch overflow-hidden rounded-full bg-white ring-1 ring-inset ring-gray-900/10"
        role="img"
        aria-label={bands.filter(b => b.hours > 0.05).map(b => b.label).join(', ') || 'No hours'}
      >
        {bands.filter(b => b.hours > 0.05).map(b => (
          <div
            key={b.key}
            title={b.label}
            style={{ width: `${(b.hours / scale) * 100}%`, backgroundColor: b.color, ...(b.hatch ? { backgroundImage: HATCH } : {}) }}
          />
        ))}
      </div>

      <p className={clsx('mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug', ink)}>
        <Icon size={13} className="mt-0.5 shrink-0" />
        <span>{seat.message}</span>
      </p>

      {seat.otherClients.length > 0 && (
        // The four biggest, then a count. A partner can be on a dozen matters, and a line that
        // lists all of them stops being read — the four that account for most of the week are
        // what somebody deciding needs.
        <p className="mt-1 text-[11.5px] leading-snug text-gray-600">
          Also on:{' '}
          {seat.otherClients.slice(0, 4).map((s, i) => (
            <span key={`${s.projectId ?? 'other'}-${i}`}>
              {i > 0 && ', '}
              <span className={clsx('tabular-nums', s.restricted && 'italic text-gray-500')}>{shareLabel(s)} {fmtHours(s.hours)}</span>
            </span>
          ))}
          {seat.otherClients.length > 4 && (
            <span className="text-gray-500"> and {seat.otherClients.length - 4} more, {fmtHours(seat.otherClients.slice(4).reduce((n, s) => n + s.hours, 0))} between them</span>
          )}
        </p>
      )}

      {!compact && seat.overDays.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11.5px] tabular-nums text-rose-800">
          {seat.days.filter(d => d.over > 0.05).slice(0, 5).map(d => (
            <li key={d.date}>
              {formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })} — {fmtHours(d.committed + d.add)} planned of {fmtHours(d.capacity)}
              <span className="font-semibold"> · {fmtHours(d.over)} over</span>
            </li>
          ))}
          {seat.overDays.length > 5 && <li className="text-rose-700">…and {seat.overDays.length - 5} more days.</li>}
        </ul>
      )}
    </div>
  );
}

/** The legend, for the dialogs that show more than one person at a time. */
export function ImpactLegend({ className }: { className?: string }) {
  const keys: [string, string, boolean][] = [
    ['Other clients', BAND.other, true],
    ['This client', BAND.mine, false],
    ['Adding', BAND.adding, false],
    ['Over', BAND.over, true],
    ['Free', BAND.free, false],
  ];
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-gray-500', className)}>
      {keys.map(([label, color, hatch]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <span className="h-2 w-3.5 rounded-sm ring-1 ring-inset ring-gray-900/10" style={{ backgroundColor: color, ...(hatch ? { backgroundImage: HATCH } : {}) }} />
          {label}
        </span>
      ))}
    </div>
  );
}
