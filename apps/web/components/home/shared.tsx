'use client';

import type { ReactNode, ElementType } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';

// Shared visual primitives + helpers for the role-adaptive home dashboard sections.

export const PHASE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Active'    },
  PLANNING:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Planning'  },
  ON_HOLD:   { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'On Hold'   },
  COMPLETED: { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Completed' },
  ARCHIVED:  { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Archived'  },
  IDEA:      { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Idea'      },
};

export function priorityDotClass(priority: string): string {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'bg-red-500';
  if (priority === 'MEDIUM') return 'bg-brand-500';
  return 'bg-gray-400';
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('bg-white rounded-xl border border-gray-200', className)}>{children}</div>;
}

export function CardHeader({ title, icon: Icon, iconColor, href, linkLabel }: {
  title: string; icon?: ElementType; iconColor?: string; href?: string; linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
        {Icon && <Icon size={16} className={iconColor ?? 'text-brand-600'} />} {title}
      </h2>
      {href && (
        <Link href={href} className="text-sm text-brand-600 hover:underline inline-flex items-center gap-1 shrink-0">
          {linkLabel ?? 'View'} <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

export function StatTile({ label, value, Icon, iconBg, iconColor, loading }: {
  label: string; value: string | number; Icon: ElementType;
  iconBg: string; iconColor: string; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
      <div className={clsx('w-11 h-11 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon size={20} className={iconColor} />
      </div>
      <div>
        {loading
          ? <div className="h-7 w-12 bg-gray-100 animate-pulse rounded" />
          : <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>}
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

/** Compact 2x2 (or 2xN) metric grid used inside cards. */
export function MetricRow({ items, loading }: {
  items: { label: string; value: string | number; badge?: string }[]; loading?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-px bg-gray-100">
      {items.map(({ label, value, badge }) => (
        <div key={label} className="bg-white px-4 py-4 flex flex-col gap-1">
          {loading
            ? <div className="h-7 w-10 bg-gray-100 animate-pulse rounded" />
            : <span className={clsx('text-lg font-bold self-start', badge ? clsx('px-2 py-0.5 rounded-md', badge) : 'text-gray-900')}>{value}</span>}
          <span className="text-xs text-gray-500 mt-1">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-sm text-gray-400 text-center">{children}</p>;
}
