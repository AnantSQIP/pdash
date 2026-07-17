// Shared palette + helpers for the Performance dashboard.
// Single source of truth for SVG chart fills (Tailwind brand-*/accent-* mirror these).

export const C = {
  brand: '#3d8de2', // primary blue
  accent: '#fe841f', // orange
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#9334e6',
  teal: '#14b8a6',
  indigo: '#6366f1',
  pink: '#ec4899',
  sky: '#0ea5e9',
  slate: '#94a3b8',
};

// Rotating palette for part-to-whole charts.
export const DONUT_COLORS = [C.brand, C.accent, C.green, C.purple, C.teal, C.amber, C.pink, C.indigo, C.sky, C.slate];

// Categorical colour maps (used for status / priority / severity widgets).
export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: C.red, HIGH: C.accent, MEDIUM: C.amber, LOW: C.slate,
};
export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: C.red, MAJOR: C.accent, MINOR: C.amber, TRIVIAL: C.slate,
};
export const STATUS_COLORS: Record<string, string> = {
  Open: C.sky, 'In Progress': C.amber, 'In Review': C.purple, Closed: C.green,
};

/** Green ≥80, amber ≥50, else red — used for rate gauges/bars. */
export function rateColor(v: number): string {
  return v >= 80 ? C.green : v >= 50 ? C.amber : C.red;
}

// Plain-language definitions of every performance metric — the single source used for
// the info tooltips and the "How these are calculated" legend. Kept in sync with the
// server-side formulas in performance.service.ts.
export const METRIC_HELP: Record<string, string> = {
  score: 'Contribution score = 4×tasks completed + 3×issues resolved + 1×hour logged + 0.5×on-time% + 0.5×activity. A single weighted number to rank delivered, timely work.',
  tasksCompleted: 'Tasks moved to a Done/Closed status within the selected period.',
  hoursLogged: 'Total hours booked to timesheets in the period.',
  onTimeRate: 'Of the completed tasks that HAD a deadline, the share finished on or before it. Tasks with no due date are not counted.',
  activityVolume: 'Number of tracked actions in the period — task & issue updates, status changes and comments. A proxy for how active someone was.',
  completionRate: 'Share of assigned tasks that are completed.',
  billablePct: 'Share of logged hours marked billable.',
  cycleTime: 'Average days from a task starting to being completed.',
};

// Rows for the "How these are calculated" legend (ordered).
export const METRIC_GLOSSARY: { label: string; help: string }[] = [
  { label: 'Score', help: METRIC_HELP.score },
  { label: 'On-time rate', help: METRIC_HELP.onTimeRate },
  { label: 'Activity', help: METRIC_HELP.activityVolume },
  { label: 'Tasks completed', help: METRIC_HELP.tasksCompleted },
  { label: 'Hours logged', help: METRIC_HELP.hoursLogged },
  { label: 'Contribution heatmap', help: 'Each square is one day; darker = more actions that day (buckets: 0, 1–2, 3–5, 6–9, 10+).' },
];

export function round1(n: number): number {
  return Math.round((n ?? 0) * 10) / 10;
}
export function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n ?? 0);
}
export function fmtHours(n: number): string {
  return `${round1(n)}h`;
}

// ── CSV export ─────────────────────────────────────────────────────────────────
export type CsvColumn = { key: string; header: string };

export function toCSV(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(c => esc(c.header)).join(',');
  const body = rows.map(r => columns.map(c => esc(r[c.key])).join(',')).join('\n');
  return `${head}\n${body}`;
}

/** Trigger a client-side CSV download (no server round-trip, no temp file). */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
