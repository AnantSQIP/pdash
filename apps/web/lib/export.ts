// Reusable CSV + PDF export helpers used by Reports, Performance, Projects, Attendance.
// CSV is RFC-4180 (every field quoted, embedded quotes doubled). PDF is a branded
// SquarkIP table via jsPDF + autotable (one-click download, no print dialog).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND: [number, number, number] = [61, 141, 226]; // #3d8de2

export type Cell = string | number | null | undefined;

function stamp(): string {
  // YYYY-MM-DD without relying on locale.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download a CSV. Every field is quoted and embedded quotes doubled (RFC-4180). */
export function exportCsv(filename: string, headers: string[], rows: Cell[][]) {
  const esc = (v: Cell) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}-${stamp()}.csv`);
}

/** Download a branded PDF table (optionally with a summary meta line). */
export function exportPdf(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Cell[][];
  meta?: { label: string; value: string }[];
}) {
  const doc = new jsPDF({ orientation: opts.columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Branded header band.
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.rect(0, 0, pageW, 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SquarkIP', 40, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(opts.title, 40, 45);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageW - 40, 24, { align: 'right' });
  if (opts.subtitle) doc.text(opts.subtitle, pageW - 40, 40, { align: 'right' });

  let startY = 74;
  if (opts.meta?.length) {
    doc.setTextColor(70);
    doc.setFontSize(9);
    doc.text(opts.meta.map(m => `${m.label}: ${m.value}`).join('     '), 40, startY);
    startY += 16;
  }

  autoTable(doc, {
    head: [opts.columns],
    body: opts.rows.map(r => r.map(c => (c == null ? '' : String(c)))),
    startY,
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [241, 245, 249], textColor: 40, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 251] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${opts.filename}-${stamp()}.pdf`);
}
