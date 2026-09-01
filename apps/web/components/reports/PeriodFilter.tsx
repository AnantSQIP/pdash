'use client';

import { useMemo, useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Choosing a period, which the Reports page could not do at all.
 *
 * It showed every project that has ever existed, with no way to ask about last month or the
 * financial year — the first question anyone actually brings to a report. The CSV inherited the
 * same problem, so "export the report" meant "export everything, then filter it in a spreadsheet".
 *
 * WHAT "IN THIS PERIOD" MEANS
 *
 * A project OVERLAPS the window, rather than starting inside it. Asking for July should return the
 * matter that ran from June to August — it was live in July, which is what the question means.
 * Filtering on start date alone would hide exactly the long-running work a report is usually about.
 *
 * The financial year runs April to March, matching the rest of the system.
 */

export type Period = { key: string; label: string; from: Date | null; to: Date | null };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** April–March, the Indian financial year the rest of the system already uses. */
function financialYear(offset = 0) {
  const now = new Date();
  const startYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offset;
  return {
    from: new Date(startYear, 3, 1),
    to: endOfDay(new Date(startYear + 1, 2, 31)),
    label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
  };
}

export function buildPeriods(): Period[] {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const q = Math.floor(m / 3);
  const fyNow = financialYear(0), fyPrev = financialYear(-1);
  return [
    { key: 'all', label: 'All time', from: null, to: null },
    { key: 'month', label: 'This month', from: new Date(y, m, 1), to: endOfDay(new Date(y, m + 1, 0)) },
    { key: 'lastmonth', label: 'Last month', from: new Date(y, m - 1, 1), to: endOfDay(new Date(y, m, 0)) },
    { key: 'quarter', label: 'This quarter', from: new Date(y, q * 3, 1), to: endOfDay(new Date(y, q * 3 + 3, 0)) },
    { key: 'fy', label: fyNow.label, from: fyNow.from, to: fyNow.to },
    { key: 'fyprev', label: fyPrev.label, from: fyPrev.from, to: fyPrev.to },
  ];
}

/**
 * Did this project exist during the window?
 *
 * Overlap, not containment. A project counts if it had started by the end of the window and had
 * not finished before the window began. One with no dates at all is included rather than dropped —
 * a report that silently omits records because somebody left a field blank is worse than one that
 * shows them.
 */
export function inPeriod(
  p: { startDate: string | null; createdAt: string | null; completedAt: string | null; closedAt: string | null },
  period: Period,
): boolean {
  if (!period.from || !period.to) return true;
  const began = p.startDate ? new Date(p.startDate) : p.createdAt ? new Date(p.createdAt) : null;
  const ended = p.completedAt ? new Date(p.completedAt) : p.closedAt ? new Date(p.closedAt) : null;
  if (!began && !ended) return true;
  if (began && began > period.to) return false;   // had not started yet
  if (ended && ended < period.from) return false; // already finished
  return true;
}

export function PeriodFilter({
  value, onChange, matched, total,
}: { value: Period; onChange: (p: Period) => void; matched: number; total: number }) {
  const periods = useMemo(buildPeriods, []);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const from = startOfDay(new Date(customFrom));
    const to = endOfDay(new Date(customTo));
    if (to < from) return;
    onChange({
      key: 'custom',
      label: `${from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      from, to,
    });
    setShowCustom(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CalendarRange size={14} className="text-gray-400 shrink-0 mr-0.5" />
      {periods.map(p => (
        <button
          key={p.key} onClick={() => onChange(p)}
          className={clsx('px-2.5 py-1.5 text-[12px] rounded-md transition-colors',
            value.key === p.key
              ? 'bg-white text-gray-900 shadow-[0_1px_2px_0_rgb(16_24_40_/_0.06),0_1px_3px_0_rgb(16_24_40_/_0.04)] font-medium'
              : 'text-gray-500 hover:text-gray-800')}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setShowCustom(v => !v)}
        className={clsx('px-2.5 py-1.5 text-[12px] rounded-md transition-colors',
          value.key === 'custom'
            ? 'bg-white text-gray-900 shadow-[0_1px_2px_0_rgb(16_24_40_/_0.06),0_1px_3px_0_rgb(16_24_40_/_0.04)] font-medium'
            : 'text-gray-500 hover:text-gray-800')}
      >
        {value.key === 'custom' ? value.label : 'Custom…'}
      </button>

      {value.key !== 'all' && (
        <span className="text-[11px] text-gray-500 ml-1">
          {matched} of {total} {total === 1 ? 'project' : 'projects'} were live in this period
        </span>
      )}

      {showCustom && (
        <div className="w-full flex flex-wrap items-end gap-2 mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500" />
          </div>
          <button onClick={applyCustom} disabled={!customFrom || !customTo}
            className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            Apply
          </button>
          <button onClick={() => setShowCustom(false)}
            className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-lg"><X size={13} /></button>
          <p className="w-full text-[11px] text-gray-400">
            A project is included if it was live at any point in the range — not only if it started
            inside it.
          </p>
        </div>
      )}
    </div>
  );
}
