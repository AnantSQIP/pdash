'use client';

/**
 * The people on one task — a seat each, with its hours, its start, its own deadline and a ceiling
 * on how much of a day it may take.
 *
 * Lifted out of the board's task editor when "start a whole piece of client work" arrived: that
 * dialog staffs many tasks at once, and a second set of person rows that looked or behaved even
 * slightly differently would be a second vocabulary for the same act. There is one. Everything
 * here — the row, the words under it, what a seat may not be, and how a set of seats becomes the
 * question "do they have the hours?" — is shared by both doors.
 */

import { useRef, type MutableRefObject, type ReactNode } from 'react';
import clsx from 'clsx';
import { Plus, X } from 'lucide-react';
import type { CapacitySeat, CapacityTaskOptions, ProposedSeat, TaskRole } from '@/lib/api';
import { DateField } from '@/components/ui/DateField';

export type Person = CapacityTaskOptions['people'][number];

export type SeatRow = {
  key: string;
  userId: string;
  role: TaskRole;
  hours: string;
  start: string;
  due: string;
  perDay: string;
};

export const ROLES: { value: TaskRole; label: string }[] = [
  { value: 'ANALYST', label: 'Analyst' }, { value: 'REVIEWER', label: 'Reviewer' }, { value: 'PM', label: 'PM' },
];

let seatKey = 0;
export const newSeatKey = () => `s${++seatKey}`;
export const blankSeat = (start = ''): SeatRow =>
  ({ key: newSeatKey(), userId: '', role: 'ANALYST', hours: '', start, due: '', perDay: '' });

export const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

// ── the shape of a field, everywhere these dialogs draw one ─────────────────────────────────

export const INPUT = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 disabled:bg-gray-50 disabled:text-gray-500';
// No width here: each use sets its own, so a width class never has to out-rank another one.
export const SMALL_BASE = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] focus:border-brand-500 focus:outline-none';
export const SMALL = `w-full ${SMALL_BASE}`;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium text-gray-700">
        {label}
        {hint && <span className="text-[11px] font-normal text-gray-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

// ── what a set of seats may be ──────────────────────────────────────────────────────────────

/** Seats as the API takes them, or the reason they cannot be sent. Empty person rows are skipped. */
export function buildSeats(rows: SeatRow[]): CapacitySeat[] | string {
  const out: CapacitySeat[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.userId) continue;
    const k = `${r.userId}|${r.role}`;
    if (seen.has(k)) return 'The same person is in the same role twice.';
    seen.add(k);
    const h = r.hours.trim() === '' ? 0 : Number(r.hours);
    if (!Number.isFinite(h) || h < 0) return 'Hours cannot be negative.';
    if (r.start && r.due && r.start > r.due) return 'A person’s start cannot be after their deadline.';
    const cap = r.perDay.trim() === '' ? null : Number(r.perDay);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0 || cap > 24)) return 'Hours a day must be between 0 and 24.';
    out.push({ userId: r.userId, role: r.role, estimatedHours: h, startDate: r.start || null, dueDate: r.due || null, hoursPerDay: cap });
  }
  if (out.filter(s => s.role === 'PM').length > 1) return 'A task can have only one PM.';
  return out;
}

export const seatSig = (s: CapacitySeat[]) => JSON.stringify(
  [...s].map(x => [x.userId, x.role, x.estimatedHours ?? 0, x.startDate ?? null, x.dueDate ?? null, x.hoursPerDay ?? null]).sort(),
);

// ── the same seats, as the availability question ────────────────────────────────────────────

/**
 * One task's seats as proposed assignments. A seat with no dates of its own inherits the task's,
 * because that is what the server does with it — otherwise the check would be about a different
 * fortnight from the one being saved.
 */
export function seatsToProposed(rows: SeatRow[], task: { start?: string; due?: string }): ProposedSeat[] {
  const out: ProposedSeat[] = [];
  for (const r of rows) {
    if (!r.userId) continue;
    const h = Number(r.hours);
    const cap = Number(r.perDay);
    out.push({
      userId: r.userId,
      hours: r.hours.trim() !== '' && Number.isFinite(h) ? h : 0,
      startDate: r.start || task.start || null,
      dueDate: r.due || task.due || null,
      hoursPerDay: r.perDay.trim() !== '' && Number.isFinite(cap) ? cap : null,
    });
  }
  return out;
}

/**
 * Everything one person is being given, as ONE proposal: the hours summed, the earliest start,
 * the latest deadline, the per-day ceilings added up. A person can be on several tasks — of one
 * client or, in the new-client dialog, of several task groups at once — and asking about each
 * seat separately would report each one fitting into the same free hours.
 */
export function mergeProposed(seats: ProposedSeat[]): ProposedSeat[] {
  const merged = new Map<string, ProposedSeat>();
  for (const s of seats) {
    const prev = merged.get(s.userId);
    merged.set(s.userId, {
      userId: s.userId,
      hours: (prev?.hours ?? 0) + (s.hours ?? 0),
      startDate: [prev?.startDate, s.startDate].filter(Boolean).sort()[0] ?? null,
      dueDate: [prev?.dueDate, s.dueDate].filter(Boolean).sort().pop() ?? null,
      hoursPerDay: s.hoursPerDay != null ? (prev?.hoursPerDay ?? 0) + s.hoursPerDay : prev?.hoursPerDay ?? null,
    });
  }
  return [...merged.values()];
}

// ── the rows themselves ─────────────────────────────────────────────────────────────────────

/**
 * The people box: a row per seat, "Add person", and the line explaining what a start does. The
 * whole team may be on one task, so there is no cap here beyond the API's.
 */
export function SeatList({ rows, people, onChange, defaultStart = '', highlightUserId, containerRef, compact }: {
  rows: SeatRow[];
  people: Person[];
  onChange: (next: SeatRow[]) => void;
  /** A new row starts here — the task's own start, so the hours land where the task does. */
  defaultStart?: string;
  /** Reassign: the seat to pick out. */
  highlightUserId?: string;
  containerRef?: MutableRefObject<HTMLDivElement | null>;
  /** Inside a task row that is already inside a task group: quieter, no outer border. */
  compact?: boolean;
}) {
  const fallback = useRef<HTMLDivElement | null>(null);
  const setSeat = (key: string, patch: Partial<SeatRow>) =>
    onChange(rows.map(r => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div ref={containerRef ?? fallback} className={clsx(!compact && 'rounded-xl border border-gray-200')}>
      <div className={clsx('flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2', compact && 'px-0 pt-0')}>
        <p className={clsx('font-medium text-gray-800', compact ? 'text-[12px]' : 'text-sm')}>People</p>
        <button type="button"
          onClick={() => onChange([...rows, blankSeat(defaultStart)])}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
          <Plus size={13} /> Add person
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-gray-400">Nobody yet — the task will be unassigned.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(r => (
            <li key={r.key} className={clsx('py-2.5', compact ? 'px-0' : 'px-3', highlightUserId && r.userId === highlightUserId && 'bg-brand-50/60')}>
              <div className="flex items-center gap-2">
                <select value={r.userId} data-seat-user={r.userId} onChange={e => setSeat(r.key, { userId: e.target.value })}
                  className={clsx(SMALL_BASE, 'w-0 min-w-0 flex-1')} aria-label="Person">
                  <option value="">Pick a person…</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.designation ? ` — ${p.designation}` : ''}</option>
                  ))}
                </select>
                <select value={r.role} onChange={e => setSeat(r.key, { role: e.target.value as TaskRole })} className={clsx(SMALL_BASE, 'w-28 shrink-0')} aria-label="Role">
                  {ROLES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
                <button type="button" onClick={() => onChange(rows.filter(x => x.key !== r.key))}
                  className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-rose-600" aria-label="Remove this person" title="Remove">
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-[11px] text-gray-500">Hours
                  <input type="number" min={0} step={0.25} value={r.hours} placeholder="0" onChange={e => setSeat(r.key, { hours: e.target.value })} className={SMALL} />
                </label>
                <label className="text-[11px] text-gray-500">Starts
                  <DateField type="date" value={r.start} max={r.due || undefined} onChange={e => setSeat(r.key, { start: e.target.value })} className={SMALL} />
                </label>
                <label className="text-[11px] text-gray-500">Their deadline
                  <DateField type="date" value={r.due} min={r.start || undefined} onChange={e => setSeat(r.key, { due: e.target.value })} className={SMALL} />
                </label>
                <label className="text-[11px] text-gray-500">Hours a day
                  <input type="number" min={0} max={24} step={0.5} value={r.perDay} placeholder="fills the day" onChange={e => setSeat(r.key, { perDay: e.target.value })} className={SMALL} />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={clsx('border-t border-gray-100 py-2 text-[11px] leading-snug text-gray-400', compact ? 'px-0' : 'px-3')}>
        A start places their hours on those days; without one the hours are spread up to the deadline. Their own deadline
        may run past the task’s — it moves nobody else’s.
      </p>
    </div>
  );
}
