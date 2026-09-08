'use client';

// "How fresh is this board?" — the board polls, so the reader should never have to wonder
// whether what they see is current. One line: a live dot while polling is on, how long since the
// payload was fetched, and a button to fetch it now.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export function LiveStatus({
  updatedAt, isFetching, onRefresh, intervalMs, className,
}: {
  /** `dataUpdatedAt` from the query — 0 until the first payload arrives. */
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
  /** The poll interval, so the label can say how often the board checks. */
  intervalMs: number;
  className?: string;
}) {
  // A one-second tick keeps "12s ago" honest without re-rendering anything else.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const stale = updatedAt > 0 && now - updatedAt > intervalMs * 3;

  return (
    <div className={clsx('inline-flex items-center gap-1.5 text-[11px] text-gray-500', className)}
      title={`Refreshes every ${Math.round(intervalMs / 1000)}s while this tab is open, and whenever you come back to it.`}>
      <span className="relative inline-flex h-2 w-2">
        {!stale && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={clsx('relative inline-flex h-2 w-2 rounded-full', stale ? 'bg-amber-500' : 'bg-emerald-500')} />
      </span>
      <span className="tabular-nums">
        {updatedAt === 0 ? 'Loading…' : stale ? `Last updated ${ago(now - updatedAt)}` : `Live · updated ${ago(now - updatedAt)}`}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        aria-label="Refresh now"
        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60"
      >
        <RefreshCw size={12} className={clsx(isFetching && 'animate-spin')} />
      </button>
    </div>
  );
}
