'use client';

// Interactive controls for the Performance dashboard header.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { RiSearchLine, RiArrowDownSLine, RiCloseLine, RiFilter3Line, RiDownloadLine } from '@remixicon/react';
import { toCSV, downloadCSV, type CsvColumn } from './tokens';
import { DateField } from '@/components/ui/DateField';

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('flex items-center gap-2 flex-wrap', className)}>{children}</div>;
}

// ── Period pills (7 / 30 / 90) ───────────────────────────────────────────────────
export function PeriodPicker({ value, onChange, options = [7, 30, 90] }: {
  value: number; onChange: (d: number) => void; options?: number[];
}) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      <span className="text-xs text-gray-400 px-2">Period</span>
      {options.map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
            value === d ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

// ── Custom date range (overrides period when set) ────────────────────────────────
export function DateRangePicker({ from, to, onChange }: {
  from?: string; to?: string; onChange: (r: { from?: string; to?: string }) => void;
}) {
  const active = !!(from || to);
  return (
    <div className={clsx('flex items-center gap-1.5 text-xs rounded-lg border px-2 py-1', active ? 'border-brand-300 bg-brand-50/50' : 'border-gray-200')}>
      <DateField type="date" value={from ?? ''} max={to || undefined} onChange={e => onChange({ from: e.target.value || undefined, to })}
        className="bg-transparent text-gray-600 focus:outline-none" />
      <span className="text-gray-300">→</span>
      <DateField type="date" value={to ?? ''} min={from || undefined} onChange={e => onChange({ from, to: e.target.value || undefined })}
        className="bg-transparent text-gray-600 focus:outline-none" />
      {active && (
        <button onClick={() => onChange({ from: undefined, to: undefined })} className="text-gray-400 hover:text-gray-600" title="Clear range">
          <RiCloseLine size={14} />
        </button>
      )}
    </div>
  );
}

// ── Search box ───────────────────────────────────────────────────────────────────
export function SearchBox({ value, onChange, placeholder = 'Search…', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={clsx('relative', className)}>
      <RiSearchLine size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-xs border border-gray-200 rounded-lg pl-8 pr-2.5 py-1.5 bg-white w-44 focus:outline-none focus:border-brand-400"
      />
    </div>
  );
}

// ── Multi-select dropdown (department / designation / project) ───────────────────
export function MultiSelectFilter({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border',
          selected.length ? 'border-brand-300 bg-brand-50/50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
      >
        <RiFilter3Line size={14} />
        {label}
        {selected.length > 0 && <span className="bg-brand-500 text-white rounded-full px-1.5 text-[10px]">{selected.length}</span>}
        <RiArrowDownSLine size={14} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 right-0 w-56 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-1.5">
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[11px] text-brand-600 hover:underline">Clear</button>
            )}
          </div>
          {options.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">No options</p>}
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="accent-brand-500" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Export button (CSV from explicit columns + rows) ─────────────────────────────
export function ExportButton<T extends Record<string, any>>({ filename, columns, rows, label = 'Export' }: {
  filename: string; columns: (CsvColumn & { value?: (row: T) => string | number })[]; rows: T[]; label?: string;
}) {
  function handle() {
    const cols: CsvColumn[] = columns.map(c => ({ key: c.key, header: c.header }));
    const data = rows.map(r => Object.fromEntries(columns.map(c => [c.key, c.value ? c.value(r) : r[c.key]])));
    downloadCSV(filename, toCSV(cols, data));
  }
  return (
    <button onClick={handle} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
      <RiDownloadLine size={14} />{label}
    </button>
  );
}
