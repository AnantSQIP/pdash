'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * The frame for every "this page cannot show you what you asked for" state — errors, 404s,
 * and anything else that replaces content rather than decorating it.
 *
 * These pages are seen at the worst moment, so they are the quietest surface in the product:
 * one mark, one sentence that says what happened in plain words, and the two things a person
 * actually wants to do next. No apology paragraph, no stack trace, no illustration of a robot.
 * The technical reference is there for a support conversation, small and out of the way.
 */
export function StatusPage({
  mark,
  code,
  title,
  message,
  actions,
  reference,
  tone = 'neutral',
}: {
  mark: ReactNode;
  /** Big, quiet number for HTTP states. Omitted for runtime errors, which have no number. */
  code?: string;
  title: string;
  message: ReactNode;
  actions?: ReactNode;
  /** Error digest or id — useful to quote, never the headline. */
  reference?: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div
          className={clsx(
            'mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl ring-1',
            tone === 'danger'
              ? 'bg-red-50 text-red-600 ring-red-600/10'
              : 'bg-gray-50 text-gray-400 ring-gray-950/[0.06]',
          )}
          aria-hidden
        >
          {mark}
        </div>

        {code && (
          <p className="mb-2 text-[13px] font-medium tabular-nums tracking-[0.14em] text-gray-400">
            {code}
          </p>
        )}

        <h1 className="text-[19px] font-semibold tracking-[-0.015em] text-gray-900">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-gray-500">{message}</p>

        {actions && <div className="mt-7 flex items-center justify-center gap-2">{actions}</div>}

        {reference && (
          <p className="mt-8 font-mono text-[11px] text-gray-300">
            Reference {reference}
          </p>
        )}
      </div>
    </div>
  );
}

export function PrimaryAction({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    'rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gray-800';
  return href
    ? <Link href={href} className={cls}>{children}</Link>
    : <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

export function SecondaryAction({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    'rounded-lg px-4 py-2 text-[13px] font-medium text-gray-600 ring-1 ring-inset ring-gray-950/[0.08] transition-colors hover:bg-gray-50';
  return href
    ? <Link href={href} className={cls}>{children}</Link>
    : <button type="button" onClick={onClick} className={cls}>{children}</button>;
}
