'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Gauge, Loader } from 'lucide-react';
import clsx from 'clsx';
import { api, type DeliveryOutlook, type PipelineSummary } from '@/lib/api';
import { formatMoney } from '@/lib/ledger-format';

/**
 * The two questions a board of cards cannot answer.
 *
 * A kanban shows you every deal and tells you nothing about the pipeline as a whole: it cannot say
 * where deals die, and it certainly cannot say whether you could deliver the ones about to land.
 * Both are collapsed by default — this is reference, consulted when planning, not something to read
 * every time you open the page.
 */

const VERDICT = {
  comfortable: { label: 'Room to take it on', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  tight:       { label: 'Tight',              cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  committed:   { label: 'Already committed',  cls: 'bg-red-50 text-red-800 ring-red-200' },
} as const;

function Section({
  title, subtitle, badge, children, defaultOpen = false,
}: {
  title: string; subtitle: string; badge?: React.ReactNode;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50">
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {badge}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );
}

/** Where deals die — median time in each stage, and what is sitting there now. */
export function StageDurations({ summary, currency }: { summary: PipelineSummary; currency: string }) {
  const rows = summary.stageDurations ?? [];
  if (!rows.length) return null;
  const longest = Math.max(1, ...rows.map(r => r.medianDays ?? 0));
  const anyMeasured = rows.some(r => r.medianDays !== null);

  return (
    <Section
      title="Where deals slow down"
      subtitle="How long deals typically sit in each stage, and what is sitting there now"
    >
      {!anyMeasured ? (
        <p className="text-xs text-gray-500 py-3">
          Nothing has moved between stages yet, so there is nothing to measure. This fills in on its
          own as deals progress — no data entry needed.
        </p>
      ) : (
        <div className="space-y-2 mt-2">
          {rows.map(r => (
            <div key={r.stage} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-gray-600 capitalize">
                {r.stage.toLowerCase()}
              </span>
              <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                {r.medianDays !== null && (
                  <div className="h-full bg-brand-500/70 rounded"
                    style={{ width: `${Math.max(4, ((r.medianDays ?? 0) / longest) * 100)}%` }} />
                )}
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-700">
                {r.medianDays === null ? '—' : `${r.medianDays}d`}
              </span>
              <span className="w-28 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">
                {r.openNow} open
                {r.longestOpenDays ? ` · oldest ${r.longestOpenDays}d` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        Median, not average — one deal that dragged for two years would otherwise make every stage
        look worse than it is. A firm losing deals at Proposal has a pricing problem; one losing them
        at Contacted has a qualification problem. Same board, different fix.
      </p>
    </Section>
  );
}

/** Win and loss by the kind of work, which is only answerable if the type was captured while open. */
export function TypeBreakdown({ summary, currency }: { summary: PipelineSummary; currency: string }) {
  const rows = (summary.byProjectType ?? []).filter(r => r.projectType !== 'Not stated' || r.open + r.won + r.lost > 0);
  if (!rows.length) return null;
  const stated = rows.filter(r => r.projectType !== 'Not stated');

  return (
    <Section
      title="Which work we win"
      subtitle="Win rate by the kind of matter a deal would become"
    >
      {!stated.length ? (
        <p className="text-xs text-gray-500 py-3">
          No deal has an expected type recorded yet. Set one when creating a deal and this becomes
          the answer to “what should we chase more of?”.
        </p>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs min-w-[420px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="text-left py-1.5">Type</th>
                <th className="text-right py-1.5">Open</th>
                <th className="text-right py-1.5">Won</th>
                <th className="text-right py-1.5">Lost</th>
                <th className="text-right py-1.5">Win rate</th>
                <th className="text-right py-1.5">Won value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.projectType}>
                  <td className="py-1.5 font-medium text-gray-700">{r.projectType}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">{r.open}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-700">{r.won}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">{r.lost}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {r.winRate === null ? <span className="text-gray-300">—</span> : `${r.winRate}%`}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">
                    {r.wonValue ? formatMoney(r.wonValue, currency) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3">
        A win rate shows as “—” until something of that type has actually closed. Zero would read as
        “we never win these”, which is a different and much worse claim than “we do not know yet”.
      </p>
    </Section>
  );
}

/**
 * Could we deliver what is about to land?
 *
 * The join no external CRM can make: it crosses each deal's expected close date against the
 * capacity board, which already accounts for leave, holidays and committed task hours.
 */
export function DeliveryOutlookPanel({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useQuery<DeliveryOutlook>({
    queryKey: ['deal-delivery-outlook'],
    queryFn: () => api.deals.deliveryOutlook(),
    enabled,
    staleTime: 60_000,
  });

  const inHorizon = (data?.items ?? []).filter(i => !i.beyondHorizon);
  const atRisk = data?.atRisk ?? 0;

  return (
    <Section
      title="Can we deliver what is landing?"
      subtitle="Each deal's close date, against the team's actual free hours"
      badge={atRisk > 0 ? (
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200">
          <AlertTriangle size={10} /> {atRisk}
        </span>
      ) : undefined}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
          <Loader size={14} className="animate-spin" /> Reading the capacity board…
        </div>
      ) : !inHorizon.length ? (
        <p className="text-xs text-gray-500 py-3">
          No open deal has an expected close date inside the next {data?.horizonDays ?? 60} days.
          Set a close date on a deal and it appears here.
        </p>
      ) : (
        <div className="space-y-1.5 mt-2">
          {inHorizon.map(i => {
            const v = i.verdict ? VERDICT[i.verdict] : null;
            return (
              <div key={i.dealId} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800 truncate">{i.company}</p>
                  <p className="text-[11px] text-gray-400">
                    {i.closeDatePassed ? 'was due ' : 'closes '}
                    {new Date(i.expectedCloseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {i.expectedProjectType ? ` · ${i.expectedProjectType}` : ''}
                    {i.closeDatePassed && ' — measured from today instead'}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                  {i.freeHoursInWindow}h free
                </span>
                {v && (
                  <span className={clsx('shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold ring-1', v.cls)}>
                    {v.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        Free hours across the whole team for the fortnight after each deal closes — leave, holidays
        and work already committed are taken out by the capacity board, not re-guessed here. This is
        advisory: you do not decline work because a number looks tight, but it is better to know
        before committing than after.
      </p>
    </Section>
  );
}
