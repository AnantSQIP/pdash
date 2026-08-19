'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Link2Off, Loader } from 'lucide-react';
import clsx from 'clsx';
import { api, type ChainGaps as Gaps } from '@/lib/api';

/**
 * Where the chain from client → patent → PID → logged hour is broken.
 *
 * Those four things exist to make work traceable back to whoever it was done for. The links are
 * enforced when they are MADE — a project cannot hold patents belonging to two clients — but
 * nothing ever reported a link that was never made at all, and no single screen could show it:
 * the client ledger lists clients, the portal lists patents, the PID ledger lists numbers, and
 * a missing join between them is visible from none of them.
 *
 * Ordered by consequence, not by count. A project with no client is the only one of the three
 * that changes a figure — its hours fall out of the ledger entirely — so it goes first even when
 * there are two of them and thirty unused patents.
 */
export function ChainGaps() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<Gaps>({
    queryKey: ['client-ledger-gaps'],
    queryFn: () => api.clientLedger.gaps(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 px-4 py-3">
        <Loader size={14} className="animate-spin" /> Checking the chain…
      </div>
    );
  }
  if (!data) return null;

  const stranded = data.projectsWithoutClient.strandedHours;
  const totalGaps =
    data.projectsWithoutClient.count + data.clientsWithoutWork.count + data.unusedPatents.count;

  if (totalGaps === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <p className="text-sm font-medium text-emerald-900">Every link in the chain is joined up.</p>
        <p className="text-xs text-emerald-800 mt-0.5">
          Every project has a client, every client has work, and every patent is tagged to something.
        </p>
      </div>
    );
  }

  return (
    <div className={clsx('border rounded-xl overflow-hidden',
      stranded > 0 ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-gray-200')}>
      <button onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-black/[0.02]">
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
        <Link2Off size={15} className={stranded > 0 ? 'text-amber-600 shrink-0' : 'text-gray-400 shrink-0'} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-800">Loose ends in the chain</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {stranded > 0
              ? `${stranded.toLocaleString()} hours are not reaching any client's ledger`
              : `${totalGaps} link${totalGaps === 1 ? '' : 's'} never made`}
          </p>
        </div>
        {stranded > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 ring-1 ring-amber-300">
            <AlertTriangle size={10} /> {data.projectsWithoutClient.count}
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-4 bg-white">
          {/* First, because it is the only one that changes a number. */}
          {data.projectsWithoutClient.count > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-amber-800 mb-1">
                {data.projectsWithoutClient.count} project{data.projectsWithoutClient.count === 1 ? '' : 's'} with a PID but no client
              </h4>
              <p className="text-[11px] text-gray-500 mb-2">
                <b>{stranded.toLocaleString()} hours</b> are logged against these. Until a client is
                named they appear on the Unattributed line and in no client&apos;s total — the ledger is
                understating by that much. Tag a patent on the project, or set its client directly.
              </p>
              <ul className="space-y-1">
                {data.projectsWithoutClient.items.map(p => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 group">
                      <span className="font-mono text-[11px] text-brand-700 shrink-0">{p.code ?? '—'}</span>
                      <span className="text-xs text-gray-700 truncate flex-1">{p.title}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">{p.projectPhase}</span>
                      <ChevronRight size={12} className="text-gray-300 group-hover:text-brand-500 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.clientsWithoutWork.count > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">
                {data.clientsWithoutWork.count} client{data.clientsWithoutWork.count === 1 ? '' : 's'} with no projects
              </h4>
              <p className="text-[11px] text-gray-500 mb-2">
                Created but never worked for — a deal that did not land, or a duplicate. Archive the
                ones that are finished with, so the list stays meaningful.
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {data.clientsWithoutWork.items.map(c => (
                  <li key={c.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200">
                    <span className="font-mono text-[11px] text-gray-700">{c.code}</span>
                    <span className="text-xs text-gray-600">{c.name}</span>
                    {c.patentCount > 0 && (
                      <span className="text-[10px] text-gray-400">{c.patentCount} patents</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.unusedPatents.count > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">
                {data.unusedPatents.count} of {data.unusedPatents.total} patents tagged to no work
              </h4>
              <p className="text-[11px] text-gray-500 mb-2">
                Minted but never attached to a project. Not necessarily wrong — a portfolio can be
                registered ahead of the work — but until one is tagged, nothing connects it to a
                PID or an hour.
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {data.unusedPatents.items.slice(0, 24).map(p => (
                  <li key={p.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200">
                    <span className="font-mono text-[11px] text-gray-700">{p.handle}</span>
                    <span className="text-[10px] text-gray-400">{p.client?.code}</span>
                  </li>
                ))}
                {data.unusedPatents.count > 24 && (
                  <li className="px-2 py-1 text-[11px] text-gray-400">
                    +{data.unusedPatents.count - 24} more
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
