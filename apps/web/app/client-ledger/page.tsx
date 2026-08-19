'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader, ShieldAlert, BookOpen, Archive, ChevronRight, AlertTriangle } from 'lucide-react';
import { api, type LedgerRow, type LedgerUnattributed } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { ClientLedgerPanel } from '@/components/patents/ClientLedgerPanel';
import { formatHours, formatMoney } from '@/lib/ledger-format';

/**
 * The client ledger — what work we have done for each client, and what it is worth.
 *
 * Deliberately its own screen rather than a tab of the patent portal. The portal is where
 * confidential patent numbers are unlocked; this is a routine commercial summary that a Super
 * Admin should be able to open without going anywhere near a reveal button. Same people, very
 * different act.
 */
export default function ClientLedgerPage() {
  const { can, loading } = usePermissions();
  const [selected, setSelected] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: rows = [], isLoading } = useQuery<LedgerRow[]>({
    queryKey: ['client-ledger', showArchived],
    queryFn: () => api.clientLedger.list(showArchived),
    enabled: can('patent.manage'),
  });
  // Hours that reach no client. Fetched alongside so the page can never read as a complete
  // picture of the firm's work while quietly omitting some of it.
  const { data: orphan } = useQuery<LedgerUnattributed>({
    queryKey: ['client-ledger-unattributed'],
    queryFn: () => api.clientLedger.unattributed(),
    enabled: can('patent.manage'),
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!can('patent.manage')) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <ShieldAlert className="mx-auto text-gray-300" size={40} />
        <h1 className="mt-3 text-lg font-semibold text-gray-800">Restricted</h1>
        <p className="text-sm text-gray-500 mt-1">The client ledger identifies clients by name and is limited to Super Admins.</p>
      </div>
    );
  }

  // Totals across every listed client. Uses the EFFECTIVE hours, so a stated figure counts
  // rather than the figure it supersedes — otherwise the total would contradict its own rows.
  const totals = rows.reduce((acc, r) => ({
    clients: acc.clients + 1,
    projects: acc.projects + r.derived.projectCount,
    patents: acc.patents + r.derived.patentCount,
    billable: acc.billable + r.effective.billableHours,
  }), { clients: 0, projects: 0, patents: 0, billable: 0 });

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={20} className="text-brand-600" /> Client Ledger
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Projects, patents and hours per client — recomputed from live data every time this page loads
        </p>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Clients" value={String(totals.clients)} />
          <Stat label="Projects" value={String(totals.projects)} />
          <Stat label="Patents" value={String(totals.patents)} />
          <Stat label="Billable hours" value={formatHours(totals.billable)} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">All clients</h2>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Include archived
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-4 sm:px-5 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 font-medium text-right">Projects</th>
                  <th className="px-3 py-2.5 font-medium text-right">Patents</th>
                  <th className="px-3 py-2.5 font-medium text-right">Billable</th>
                  <th className="px-3 py-2.5 font-medium text-right">Non-billable</th>
                  <th className="px-3 py-2.5 font-medium text-right">Value</th>
                  <th className="px-3 py-2.5 font-medium text-right">Last logged</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  <tr><td colSpan={8} className="px-5 py-6 text-xs text-gray-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-sm text-gray-400 text-center">No clients yet.</td></tr>
                ) : rows.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={clsx('hover:bg-gray-50 cursor-pointer', r.archivedAt && 'opacity-60')}
                  >
                    <td className="px-4 sm:px-5 py-2.5">
                      <span className="font-mono font-semibold text-gray-800">{r.code}</span>
                      {r.name && <span className="ml-2 text-gray-500">{r.name}</span>}
                      {r.archivedAt && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-400">
                          <Archive size={10} /> Archived
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                      {r.derived.projectCount}
                      {r.derived.activeProjectCount > 0 && (
                        <span className="text-[11px] text-green-600 ml-1">({r.derived.activeProjectCount} live)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{r.derived.patentCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="text-gray-800 font-medium">{formatHours(r.effective.billableHours)}</span>
                      {/* A superseded figure stays on screen. Hiding it would make a stated
                          number indistinguishable from a measured one. */}
                      {r.effective.billableHoursSource === 'override' && (
                        <span className={clsx('block text-[10px]', r.effective.stale ? 'text-red-600 font-medium' : 'text-amber-600')}>
                          {r.effective.stale
                            // A stated figure that the work has moved past is worse than no
                            // figure: it looks authoritative and is quietly wrong.
                            ? `stated · ${formatHours(Math.abs(r.effective.driftHours ?? 0))} of work since`
                            : `stated · derived ${formatHours(r.derived.billableHours)}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{formatHours(r.derived.nonBillableHours)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                      {r.effective.amount == null
                        ? <span className="text-gray-300">—</span>
                        : formatMoney(r.effective.amount, r.effective.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-400">
                      {r.derived.lastLoggedAt ? String(r.derived.lastLoggedAt).slice(0, 10) : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-gray-300"><ChevronRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
              {/* Hours that reach no client, stated rather than omitted. Without this line the
                  table above reads as the whole of the firm's work, which it is not. */}
              {orphan && orphan.totalHours > 0 && (
                <tfoot className="border-t-2 border-gray-100">
                  <tr className="bg-amber-50/40">
                    <td className="px-4 sm:px-5 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                        <AlertTriangle size={13} /> Unattributed
                      </span>
                      <span className="block text-[11px] text-amber-700/80 mt-0.5">
                        {orphan.awaitingPid > 0 && `${formatHours(orphan.awaitingPid)} awaiting a PID`}
                        {orphan.awaitingPid > 0 && orphan.onClientlessProjects > 0 && ' · '}
                        {orphan.onClientlessProjects > 0
                          && `${formatHours(orphan.onClientlessProjects)} on ${orphan.projectCount} project${orphan.projectCount === 1 ? '' : 's'} with no client`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-800">{orphan.projectCount || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">—</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-amber-800">{formatHours(orphan.billableHours)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-700/80">{formatHours(orphan.totalHours - orphan.billableHours)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">—</td>
                    <td className="px-3 py-2.5" colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          Hours reach a client through their projects. Time logged before a PID is assigned, or on a project
          with no client, is counted on the Unattributed line rather than left out.
        </p>
      </div>

      {selected && <ClientLedgerPanel clientId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
