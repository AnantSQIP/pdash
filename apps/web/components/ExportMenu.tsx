'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { exportCsv, exportPdf, type Cell } from '@/lib/export';

export type ExportData = {
  filename: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Cell[][];
  meta?: { label: string; value: string }[];
};

/** Dropdown "Export ▾" → CSV / PDF. `getData` is called lazily on click so the
 *  latest data (filters/period) is captured at export time. */
export function ExportMenu({ getData, label = 'Export', disabled }: { getData: () => ExportData; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Download size={15} /> {label} <ChevronDown size={13} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1">
          <button
            onClick={() => { const d = getData(); exportCsv(d.filename, d.columns, d.rows); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <FileSpreadsheet size={15} className="text-green-600" /> Export as CSV
          </button>
          <button
            onClick={() => { exportPdf(getData()); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <FileText size={15} className="text-red-500" /> Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}

export type { Cell };
