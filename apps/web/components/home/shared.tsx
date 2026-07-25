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
  ACTIVE:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Active'    },
  PLANNING:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Planning'  },
  ON_HOLD:   { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'On Hold'   },
  COMPLETED: { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Completed' },
  CLOSED:    { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Closed'    },
  CANCELLED: { bg: 'bg-rose-100',   text: 'text-rose-600',   label: 'Cancelled' },
  ARCHIVED:  { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Archived'  },
  IDEA:      { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Idea'      },
};

/** A human phase label + colours for any phase, falling back gracefully for unknowns. */
export function phaseChip(phase: string): { bg: string; text: string; label: string } {
  return PHASE_COLORS[phase] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: phase.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) };
}

/** Consistent badge palettes so the same meaning reads the same colour across cards. */
export const BADGE = {
  good:    'bg-green-100 text-green-700',
  info:    'bg-blue-100 text-blue-700',
  warn:    'bg-amber-100 text-amber-700',
  danger:  'bg-red-100 text-red-600',
  neutral: 'bg-gray-100 text-gray-600',
} as const;

export function priorityDotClass(priority: string): string {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'bg-red-500';
  if (priority === 'MEDIUM') return 'bg-amber-500';
  return 'bg-gray-300';
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('bg-white rounded-xl border border-gray-200', className)}>{children}</div>;
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
    <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100">
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 min-w-0">
        {Icon && <Icon size={16} className={clsx('shrink-0', iconColor ?? 'text-brand-600')} />}
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
  iconBg: string; iconColor: string; loading?: boolean; error?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4 min-w-0">
      <div className={clsx('w-11 h-11 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon size={20} className={iconColor} />
      </div>
      <div className="min-w-0">
        {loading
          ? <div className="h-7 w-12 bg-gray-100 animate-pulse rounded" />
          : <p className="text-2xl font-bold text-gray-900 leading-none truncate">{error ? '—' : value}</p>}
        <p className="text-xs text-gray-500 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
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
            : <span className={clsx('text-lg font-bold self-start leading-none', badge ? clsx('px-2 py-0.5 rounded-md', badge) : 'text-gray-900')}>{value}</span>}
          <span className="text-xs text-gray-500 truncate">{label}</span>
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
