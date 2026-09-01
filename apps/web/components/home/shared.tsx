'use client';

import { useEffect, useState, type ReactNode, type ElementType } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight, AlertCircle, RotateCw } from 'lucide-react';
import { Avatar } from '@/components/Avatar';

// Shared visual primitives + helpers for the role-adaptive home dashboard sections.
// These exist so every card renders the same header, loading, error, empty, person and
// badge treatments — the cards used to hand-roll each of these, which drifted.

export const PHASE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: 'bg-emerald-50 ring-1 ring-inset ring-emerald-600/15', text: 'text-emerald-700', label: 'Active'    },
  PLANNING:  { bg: 'bg-brand-50 ring-1 ring-inset ring-brand-600/15',     text: 'text-brand-700',   label: 'Planning'  },
  ON_HOLD:   { bg: 'bg-amber-50 ring-1 ring-inset ring-amber-600/15',     text: 'text-amber-700',   label: 'On Hold'   },
  COMPLETED: { bg: 'bg-gray-50 ring-1 ring-inset ring-gray-950/10',       text: 'text-gray-600',    label: 'Completed' },
  CLOSED:    { bg: 'bg-slate-50 ring-1 ring-inset ring-slate-600/15',     text: 'text-slate-600',   label: 'Closed'    },
  CANCELLED: { bg: 'bg-rose-50 ring-1 ring-inset ring-rose-600/15',       text: 'text-rose-700',    label: 'Cancelled' },
  ARCHIVED:  { bg: 'bg-gray-50 ring-1 ring-inset ring-gray-950/10',       text: 'text-gray-500',    label: 'Archived'  },
};

/** A human phase label + colours for any phase, falling back gracefully for unknowns. */
export function phaseChip(phase: string): { bg: string; text: string; label: string } {
  return PHASE_COLORS[phase] ?? { bg: 'bg-gray-50 ring-1 ring-inset ring-gray-950/10', text: 'text-gray-600', label: phase.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) };
}

/** Consistent badge palettes so the same meaning reads the same colour across cards. */
/**
 * Badge palettes. The 100/700 pairs these replace were solid blocks of colour — five of them
 * on one card fought each other and the data. A 50-level tint with an inset ring reads as the
 * same status at a glance while letting the numbers stay the loudest thing on screen.
 */
export const BADGE = {
  good:    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  info:    'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15',
  warn:    'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
  danger:  'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15',
  neutral: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-950/10',
} as const;

export function priorityDotClass(priority: string): string {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'bg-red-500';
  if (priority === 'MEDIUM') return 'bg-amber-500';
  return 'bg-gray-300';
}

/**
 * A hairline ring, not a 1px grey border.
 *
 * `border-gray-200` draws a hard line that reads as a boundary you are meant to notice; on a
 * page of fourteen cards that is fourteen competing rectangles. A near-transparent ring plus
 * the contact shadow from globals.css separates the surface without announcing itself, which
 * is the whole difference between a dashboard that looks assembled and one that looks drawn.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('bg-white rounded-xl ring-1 ring-gray-950/[0.06] shadow-xs', className)}>{children}</div>;
}

/**
 * One card header. Optional trailing `badge` (e.g. a pending count) and `actions` (e.g.
 * a tab row) slots mean list/approval/tabbed cards no longer hand-roll their own header.
 */
export function CardHeader({ title, icon: Icon, iconColor, href, linkLabel, badge, actions }: {
  title: string; icon?: ElementType; iconColor?: string; href?: string; linkLabel?: string;
  badge?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-950/[0.05]">
      {/* Card titles are labels, not headlines. Dropping from 16px to 13.5px lets the DATA be
          the largest thing in the card, which is the point of the card. */}
      <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-gray-900 flex items-center gap-2 min-w-0">
        {/* One neutral for every card icon. Fourteen cards each with their own hue meant the
            page had no accent left to spend on anything that MATTERS — an overdue count, a
            falling metric. Colour is reserved for data now; the icon is just a signpost. */}
        {Icon && <Icon size={15} className={clsx('shrink-0', iconColor ?? 'text-gray-400')} />}
        <span className="truncate">{title}</span>
        {badge}
      </h2>
      {actions}
      {href && (
        <Link href={href} className="text-sm text-brand-600 hover:underline inline-flex items-center gap-1 shrink-0">
          {linkLabel ?? 'View'} <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

/** A small count badge for card headers. */
export function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0">{n}</span>;
}

export function StatTile({ label, value, Icon, iconBg, iconColor, loading, error }: {
  label: string; value: string | number; Icon: ElementType;
  /* Both optional and neutral by default. A stat tile's icon is a signpost, not a signal —
     four different hues across four tiles told the reader nothing about the four numbers. */
  iconBg?: string; iconColor?: string; loading?: boolean; error?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-gray-950/[0.06] shadow-xs px-5 py-4 flex items-center gap-4 min-w-0">
      {/* Squircle rather than a circle: it sits better beside rounded cards, and the icon only
          supports the number, so it stays small and quiet. */}
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset ring-gray-950/[0.04]', iconBg ?? 'bg-gray-50')}>
        <Icon size={18} className={iconColor ?? 'text-gray-400'} />
      </div>
      <div className="min-w-0">
        {loading
          ? <div className="h-7 w-12 bg-gray-100 animate-pulse rounded-md" />
          : <p className="text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-gray-900 leading-none truncate">{error ? '—' : value}</p>}
        <p className="text-[12px] text-gray-500 mt-1.5 truncate">{label}</p>
      </div>
    </div>
  );
}

/** Pulls just the text colour out of a BADGE palette, so a metric can be tinted without a box. */
function badgeText(badge: string): string {
  const m = /text-[a-z]+-\d+/.exec(badge);
  return m ? m[0] : 'text-gray-900';
}

/** Compact 2x2 (or 2xN) metric grid used inside cards. Surfaces a fetch error instead of showing zeros. */
export function MetricRow({ items, loading, error, onRetry }: {
  items: { label: string; value: string | number; badge?: string }[];
  loading?: boolean; error?: boolean; onRetry?: () => void;
}) {
  if (error) return <ErrorState onRetry={onRetry} />;
  return (
    <div className="grid grid-cols-2 gap-px bg-gray-100">
      {items.map(({ label, value, badge }) => (
        <div key={label} className="bg-white px-4 py-4 flex flex-col gap-1 min-w-0">
          {loading
            ? <div className="h-7 w-10 bg-gray-100 animate-pulse rounded" />
            /* The number used to sit in a filled, bordered chip. Six of those on one card
               is six competing blocks of colour. The status still reads — it is carried by
               the numeral's own colour — but the box is gone and the figure can be large,
               tabular and comparable down the column. */
            : <span className={clsx('text-[21px] font-semibold leading-none tracking-[-0.02em] tabular-nums self-start',
                                    badge ? badgeText(badge) : 'text-gray-900')}>{value}</span>}
          <span className="text-[12px] text-gray-500 truncate">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-sm text-gray-500 text-center">{children}</p>;
}

/** A failed-fetch state with an optional retry — so an error never masquerades as "empty" or "0". */
export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
      <AlertCircle size={18} className="text-red-500" />
      <p className="text-sm text-gray-600">{message ?? "Couldn't load this."}</p>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
          <RotateCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

/** N shimmer rows for a list card's loading state (one shared look everywhere). */
export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-gray-100 animate-pulse shrink-0" />
          <div className="h-4 bg-gray-100 animate-pulse rounded flex-1" />
          <div className="h-4 w-16 bg-gray-100 animate-pulse rounded shrink-0" />
        </div>
      ))}
    </>
  );
}

/**
 * One person, rendered the same way everywhere: avatar (photo or initials) + name, with
 * an optional rank, sub-line and trailing content. Home used to print bare names.
 */
export function PersonRow({ user, name, sub, rank, trailing }: {
  user?: { firstName?: string | null; lastName?: string | null; profilePhoto?: string | null; id?: string } | null;
  name?: string; sub?: string; rank?: number; trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {rank != null && <span className="text-xs font-bold text-gray-400 w-4 shrink-0 text-center">{rank}</span>}
      <Avatar user={user ?? { firstName: name ?? '?' }} size={26} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{name ?? ((`${user?.firstName ?? ''} ${user?.lastName ?? ''}`).trim() || 'A team member')}</p>
        {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/**
 * A destructive-action button that requires a second click to confirm (auto-disarms
 * after a few seconds). Used for Reject and Punch-out so a single misclick can't fire
 * an irreversible action — without pulling in a modal.
 */
export function ConfirmButton({ onConfirm, disabled, title, className, armedClassName, children, armedChildren }: {
  onConfirm: () => void; disabled?: boolean; title?: string;
  className?: string; armedClassName?: string; children: ReactNode; armedChildren?: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      title={armed ? 'Click again to confirm' : title}
      className={clsx(armed ? armedClassName : className)}
      onClick={() => { if (armed) { onConfirm(); setArmed(false); } else setArmed(true); }}
    >
      {armed ? (armedChildren ?? children) : children}
    </button>
  );
}
