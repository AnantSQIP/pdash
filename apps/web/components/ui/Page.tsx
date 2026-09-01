'use client';

import type { ElementType, ReactNode } from 'react';
import clsx from 'clsx';

/**
 * The page furniture every module shares.
 *
 * Before this, each page hand-rolled its own header: an icon beside a bold 20px title, a
 * grey subtitle, and a row of solid pill buttons. Three problems with that shape, all of
 * which read as "template":
 *
 *   • THE ICON. A picture of a graph next to the word "Performance" tells the reader
 *     nothing they did not get from the word. It is decoration in the most load-bearing
 *     spot on the page.
 *   • THE WEIGHT. `font-bold` at 20px is a shout. Scale carries hierarchy better than
 *     weight does, so titles are larger, semibold, and tightly tracked — the thing that
 *     separates a considered interface from a bootstrapped one.
 *   • THE PILLS. A solid brand-filled pill for the selected tab puts the loudest colour on
 *     the page on a navigation control, competing with the data it is meant to introduce.
 */
export function PageHeader({
  title, subtitle, actions, tabs, sticky = true,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Right-hand controls — filters, export, period pickers. */
  actions?: ReactNode;
  /** A second row, typically a SegmentedControl. */
  tabs?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      className={clsx(
        'bg-white border-b border-gray-950/[0.06] px-4 sm:px-6 pt-5 pb-4 shrink-0',
        sticky && 'sticky top-0 z-20',
      )}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.03em] text-gray-900 truncate">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
    </header>
  );
}

/**
 * A segmented control — the selected option is a raised white surface on a recessed track,
 * so selection is shown by ELEVATION rather than by flooding it with brand colour. Reads as
 * a physical switch, and leaves the accent free to mean something in the data.
 */
export function SegmentedControl<T extends string>({
  value, onChange, options, size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        'inline-flex items-center rounded-lg bg-gray-100/80 ring-1 ring-inset ring-gray-950/[0.04]',
        size === 'sm' ? 'p-0.5 gap-0.5' : 'p-1 gap-1',
      )}
    >
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
              active
                ? 'bg-white text-gray-900 shadow-[0_1px_2px_0_rgb(16_24_40_/_0.06),0_1px_3px_0_rgb(16_24_40_/_0.04)]'
                : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A headline number.
 *
 * The number is the largest thing, tightly tracked and in tabular figures so a column of
 * them lines up and can be compared by eye. The label is small and above it: you read what
 * it is, then how much, which is the order the eye wants when scanning a row of these.
 */
export function Metric({
  label, value, hint, delta, icon: Icon, tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Signed change vs the previous period. Positive is not always good — see `tone`. */
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; good?: boolean };
  icon?: ElementType;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const toneText = {
    neutral: 'text-gray-900',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  }[tone];

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-gray-400">
        {Icon && <Icon size={13} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={clsx('text-[27px] font-semibold leading-none tracking-[-0.03em] tabular-nums', toneText)}>
          {value}
        </span>
        {delta && (
          <span
            className={clsx(
              'rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset',
              delta.direction === 'flat'
                ? 'bg-gray-50 text-gray-500 ring-gray-950/10'
                : delta.good
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'
                  : 'bg-red-50 text-red-700 ring-red-600/15',
            )}
          >
            {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '–'} {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 truncate text-[11.5px] text-gray-400">{hint}</p>}
    </div>
  );
}

/** A quiet rule with a label — separates bands of content without drawing a box round them. */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-gray-400">{children}</h2>
      {actions}
    </div>
  );
}

/**
 * Bento tiles. Size states priority, so this is only for surfaces where priority is REAL —
 * a hero chart beside its supporting cuts. Never for a row of equal peers, where making one
 * bigger asserts an importance that does not exist.
 */
export function Bento({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-6', className)}>{children}</div>
  );
}
export function Tile({ span = 2, rows = 1, className, children }: {
  /** Columns out of 6 on large screens. 6 = full width, 4 = hero, 2 = a third. */
  span?: 2 | 3 | 4 | 6;
  rows?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  const col = { 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 6: 'lg:col-span-6' }[span];
  const row = rows === 2 ? 'lg:row-span-2' : '';
  return <div className={clsx(col, row, 'min-w-0', className)}>{children}</div>;
}

/** The standard surface: hairline ring, contact shadow, generous padding. */
export function Panel({ children, className, padded = true }: {
  children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <div className={clsx('rounded-xl bg-white ring-1 ring-gray-950/[0.06] shadow-xs', padded && 'p-5', className)}>
      {children}
    </div>
  );
}
