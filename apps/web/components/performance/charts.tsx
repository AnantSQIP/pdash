'use client';

// Reusable chart primitives for the Performance dashboard.
// All widgets share the card style `bg-white rounded-xl border border-gray-200 p-5`,
// render a bounded-height empty state when data is missing, and read colours from tokens.ts.

import { useId, useMemo, useState, type ReactNode, type ElementType } from 'react';
import clsx from 'clsx';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Sector, LabelList,
  RadialBarChart, RadialBar, PolarAngleAxis,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { RiArrowUpSLine, RiArrowDownSLine, RiArrowRightSLine, RiInformationLine } from '@remixicon/react';
import { C, DONUT_COLORS, rateColor, round1, toCSV, downloadCSV, METRIC_GLOSSARY } from './tokens';

/** Compact colour key (legend) for a chart — a row of swatch+label pairs. */
export function ColorKey({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: it.color }} />{it.label}
        </span>
      ))}
    </div>
  );
}

/** A small info affordance with a native tooltip — used to explain a metric inline. */
export function InfoDot({ text, className }: { text: string; className?: string }) {
  return (
    <span title={text} className={clsx('inline-flex text-gray-300 hover:text-gray-500 cursor-help align-middle', className)}>
      <RiInformationLine size={13} />
    </span>
  );
}

/** Collapsible "how these numbers are calculated" glossary, shown at the foot of a view. */
export function MetricsLegend() {
  return (
    <details className="bg-white rounded-xl border border-gray-200 group">
      <summary className="flex items-center gap-2 px-5 py-3 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-800">
        <RiInformationLine size={16} className="text-gray-400" />
        How these numbers are calculated
        <RiArrowRightSLine size={16} className="ml-auto text-gray-400 transition-transform group-open:rotate-90" />
      </summary>
      <dl className="px-5 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {METRIC_GLOSSARY.map(m => (
          <div key={m.label}>
            <dt className="text-xs font-semibold text-gray-700">{m.label}</dt>
            <dd className="text-xs text-gray-500 leading-snug mt-0.5">{m.help}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────────
export type Datum = { name: string; value: number; color?: string };
export type Series = { key: string; name: string; color: string };

function Empty({ height = 200, label = 'No data yet' }: { height?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center text-sm text-gray-300" style={{ height }}>
      {label}
    </div>
  );
}

export function ChartCard({
  title, subtitle, action, children, className,
}: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 p-5', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-gray-700">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Sparkline (inline mini trend) ───────────────────────────────────────────────
// Fixed-size SVG (NOT ResponsiveContainer): inside a tiny flex box ResponsiveContainer
// mis-measures and overflows, drawing the chart on top of neighbouring text.
export function Sparkline({ data, color = C.brand, type = 'area', width = 56, height = 28 }: {
  data: number[]; color?: string; type?: 'area' | 'line'; width?: number; height?: number;
}) {
  const gid = `sl-${useId().replace(/:/g, '')}`;
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const d = data.map((v, i) => ({ i, v }));
  if (type === 'line') {
    return (
      <LineChart width={width} height={height} data={d} margin={{ top: 3, bottom: 3, left: 0, right: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    );
  }
  return (
    <AreaChart width={width} height={height} data={d} margin={{ top: 3, bottom: 3, left: 0, right: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
    </AreaChart>
  );
}

// ── KPI tile (optional sparkline + Δ + cross-filter click) ───────────────────────
export function KpiTile({
  label, value, Icon, tint, active, hero, delta, deltaSuffix, spark, sparkColor, onClick, info,
}: {
  label: string; value: string | number; Icon: ElementType; tint: string;
  active?: boolean; hero?: boolean; delta?: number; deltaSuffix?: string;
  spark?: number[]; sparkColor?: string; onClick?: () => void; info?: string;
}) {
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        'text-left bg-white rounded-xl border px-4 py-3.5 flex items-center gap-3 transition-all w-full',
        onClick && 'hover:border-brand-400 hover:shadow-sm cursor-pointer',
        active ? 'border-brand-500 ring-1 ring-brand-400 bg-brand-50/40' : 'border-gray-200',
      )}
    >
      <div className={clsx('rounded-full flex items-center justify-center shrink-0', hero ? 'w-12 h-12' : 'w-10 h-10', tint)}>
        <Icon size={hero ? 22 : 18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx('font-bold text-gray-900 leading-none truncate', hero ? 'text-2xl' : 'text-xl')}>{value}</p>
        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1 min-w-0">
          <span className="truncate">{label}</span>
          {info && <span title={info} className="text-gray-300 hover:text-gray-500 cursor-help shrink-0"><RiInformationLine size={12} /></span>}
          {delta != null && delta !== 0 && (
            <span className={clsx('inline-flex items-center shrink-0', delta > 0 ? 'text-green-600' : 'text-red-500')}>
              {delta > 0 ? <RiArrowUpSLine size={12} /> : <RiArrowDownSLine size={12} />}{Math.abs(delta)}{deltaSuffix ?? ''}
            </span>
          )}
        </p>
      </div>
      {spark && spark.length > 1 && (
        <div className="shrink-0 hidden lg:block 2xl:hidden"><Sparkline data={spark} color={sparkColor ?? C.brand} /></div>
      )}
      {onClick && <RiArrowRightSLine size={15} className={clsx('shrink-0', active ? 'text-brand-500' : 'text-gray-300')} />}
    </Comp>
  );
}

// ── Radial gauge ─────────────────────────────────────────────────────────────────
export function GaugeCard({ value, label, color, size = 112 }: { value: number; label: string; color?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v }]} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="v" cornerRadius={20} fill={color ?? rateColor(v)} background={{ fill: '#f1f5f9' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-gray-900">{Math.round(v)}%</span>
        </div>
      </div>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
    </div>
  );
}

// The active (hovered) donut slice grows outward with a thin outer ring — a subtle,
// modern "lift" that reads as interactive without being noisy.
function activeSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 5} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 7} outerRadius={outerRadius + 9} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.35} />
    </g>
  );
}

// Rich legend: colour · name · value · share%. Hovering a row lifts the matching slice
// (and vice-versa), so the reader can tie a segment to its number precisely.
function DonutLegend({ items, total, colors, active, onHover }: {
  items: Datum[]; total: number; colors: string[]; active: number | null; onHover: (i: number | null) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-3 space-y-0.5">
      {items.map((d, i) => (
        <div
          key={i}
          onMouseEnter={() => onHover(i)}
          onMouseLeave={() => onHover(null)}
          className={clsx('flex items-center gap-2 text-[11px] px-1.5 py-1 rounded-md transition-colors cursor-default', active === i ? 'bg-gray-50' : '')}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color ?? colors[i % colors.length] }} />
          <span className="truncate flex-1 text-gray-600">{d.name}</span>
          <span className="text-gray-500 font-medium tabular-nums">{round1(d.value)}</span>
          <span className="text-gray-300 tabular-nums w-9 text-right">{total ? Math.round((d.value / total) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  );
}

/** Shared interactive donut (hover-lift slice + synced legend + center readout). */
function InteractiveDonut({ data, centerValue, centerLabel, colors = DONUT_COLORS, height = 176 }: {
  data: Datum[]; centerValue: string | number; centerLabel: string; colors?: string[]; height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const items = useMemo(() => data.filter(d => d.value > 0), [data]);
  const total = useMemo(() => items.reduce((s, d) => s + d.value, 0), [items]);
  const has = total > 0;
  const shown = active != null ? items[active] : null;
  return (
    <div>
      <div className="relative w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={has ? items : [{ name: 'No data', value: 1 }]}
              dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={80}
              paddingAngle={has ? 2 : 0} stroke="none" cornerRadius={4}
              // activeIndex/activeShape are valid runtime props but missing from this
              // recharts version's Pie types — pass them through an any-cast spread.
              {...({ activeIndex: active ?? undefined, activeShape: activeSlice } as any)}
              onMouseEnter={(_: any, i: number) => setActive(i)}
              onMouseLeave={() => setActive(null)}
              isAnimationActive={false}
            >
              {(has ? items : [{ value: 1 }]).map((d: any, i) => (
                <Cell key={i} fill={has ? (d.color ?? colors[i % colors.length]) : '#e5e7eb'} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          {shown ? (
            <>
              <span className="text-xl font-bold text-gray-900 tabular-nums">{round1(shown.value)}</span>
              <span className="text-[10px] text-gray-400 mt-0.5 truncate max-w-full">{shown.name} · {total ? Math.round((shown.value / total) * 100) : 0}%</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-gray-900">{centerValue}</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{centerLabel}</span>
            </>
          )}
        </div>
      </div>
      <DonutLegend items={items} total={total} colors={colors} active={active} onHover={setActive} />
    </div>
  );
}

// ── Donut (hollow, with explicit center readout) ─────────────────────────────────
export function DonutCard(props: {
  data: Datum[]; centerValue: string | number; centerLabel: string; colors?: string[]; height?: number;
}) {
  return <InteractiveDonut {...props} />;
}

// ── Pie → rendered as a consistent donut with a "Total" center. ──────────────────
export function PieCard({ data, colors = DONUT_COLORS, height = 176 }: { data: Datum[]; colors?: string[]; height?: number }) {
  const total = data.filter(d => d.value > 0).reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty height={height} />;
  return <InteractiveDonut data={data} centerValue={round1(total)} centerLabel="Total" colors={colors} height={height} />;
}

// ── Line (time-series) ───────────────────────────────────────────────────────────
export function LineCard({ data, xKey, series, height = 220, xFmt }: {
  data: any[]; xKey: string; series: Series[]; height?: number; xFmt?: (v: string) => string;
}) {
  if (!data?.length) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tickFormatter={xFmt} tick={{ fontSize: 10, fill: C.slate }} />
        <YAxis tick={{ fontSize: 10, fill: C.slate }} allowDecimals={false} />
        <Tooltip />
        {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />}
        {series.map(s => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Area (time-series, optional stacked) ─────────────────────────────────────────
export function AreaCard({ data, xKey, series, stacked, height = 220, xFmt }: {
  data: any[]; xKey: string; series: Series[]; stacked?: boolean; height?: number; xFmt?: (v: string) => string;
}) {
  const gid = `ac-${useId().replace(/:/g, '')}`;
  if (!data?.length) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={stacked ? 0.6 : 0.4} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tickFormatter={xFmt} tick={{ fontSize: 10, fill: C.slate }} />
        <YAxis tick={{ fontSize: 10, fill: C.slate }} allowDecimals={false} />
        <Tooltip />
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
            stackId={stacked ? 's' : undefined} stroke={s.color} strokeWidth={2} fill={`url(#${gid}-${i})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Bar (horizontal comparison; clickable) ───────────────────────────────────────
export function BarCard({ data, categoryKey, valueKey, color = C.brand, height, onBarClick, highlightKey, highlightValue, labelWidth = 112, showValues, barSize = 18 }: {
  data: any[]; categoryKey: string; valueKey: string; color?: string; height?: number;
  onBarClick?: (row: any) => void; highlightKey?: string; highlightValue?: string; labelWidth?: number;
  showValues?: boolean; barSize?: number;
}) {
  if (!data?.length) return <Empty height={height ?? 200} />;
  const h = height ?? Math.max(180, data.length * 40);
  const maxChars = Math.max(8, Math.floor(labelWidth / 7));
  const truncTick = (v: any) => (typeof v === 'string' && v.length > maxChars ? `${v.slice(0, maxChars - 1)}…` : v);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: showValues ? 32 : 16, top: 4, bottom: 4 }} barCategoryGap={12}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: C.slate }} allowDecimals={false} />
        <YAxis type="category" dataKey={categoryKey} tick={{ fontSize: 11, fill: '#334155' }} width={labelWidth} tickFormatter={truncTick} interval={0} />
        <Tooltip cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} barSize={barSize} cursor={onBarClick ? 'pointer' : undefined}
          onClick={onBarClick ? (d: any) => onBarClick(d?.payload ?? d) : undefined}>
          {data.map((row, i) => (
            <Cell key={i} fill={highlightKey && row[highlightKey] === highlightValue ? C.accent : (row.color ?? color)} />
          ))}
          {showValues && <LabelList dataKey={valueKey} position="right" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Column (vertical comparison; single or stacked series) ───────────────────────
export function ColumnCard({ data, categoryKey, series, stacked, height = 220, xFmt, showValues }: {
  data: any[]; categoryKey: string; series: Series[]; stacked?: boolean; height?: number; xFmt?: (v: string) => string; showValues?: boolean;
}) {
  if (!data?.length) return <Empty height={height} />;
  const single = series.length === 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: showValues ? 18 : 4, bottom: 0 }} barCategoryGap={data.length > 6 ? '18%' : '30%'}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey={categoryKey} tickFormatter={xFmt} tick={{ fontSize: 10, fill: C.slate }} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: C.slate }} allowDecimals={false} />
        <Tooltip cursor={{ fill: '#f8fafc' }} />
        {!single && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, si) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId={stacked ? 's' : undefined} fill={s.color} radius={stacked ? undefined : [4, 4, 0, 0]} maxBarSize={48}>
            {single && data.map((row, i) => <Cell key={i} fill={row.color ?? s.color} />)}
            {showValues && single && si === 0 && <LabelList dataKey={s.key} position="top" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Bullet (actual vs target) ────────────────────────────────────────────────────
export function BulletChart({ items, unit = 'h' }: {
  items: { label: string; actual: number; target: number; color?: string }[]; unit?: string;
}) {
  if (!items?.length) return <Empty height={160} />;
  const max = Math.max(1, ...items.map(i => Math.max(i.actual, i.target))) * 1.1;
  return (
    <div className="space-y-3.5">
      {items.map((it, i) => {
        const pa = Math.min(100, (it.actual / max) * 100);
        const pt = Math.min(100, (it.target / max) * 100);
        const over = it.target > 0 && it.actual > it.target;
        const color = it.color ?? (over ? C.red : C.brand);
        return (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 truncate pr-2">{it.label}</span>
              <span className="text-gray-400 shrink-0">{round1(it.actual)}{unit} <span className="text-gray-300">/ {round1(it.target)}{unit}</span></span>
            </div>
            <div className="relative h-3">
              <div className="absolute inset-0 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pa}%`, backgroundColor: color }} />
              </div>
              {it.target > 0 && (
                <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-gray-800 rounded" style={{ left: `${pt}%` }} title={`Target ${round1(it.target)}${unit}`} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Data grid (sortable / searchable / exportable) ───────────────────────────────
export type GridColumn<T> = {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  accessor?: (row: T) => number | string;
  render?: (row: T) => ReactNode;
  exportValue?: (row: T) => string | number;
  width?: string;
};

export function DataGrid<T extends Record<string, any>>({
  title, columns, rows, initialSort, searchKeys, searchPlaceholder, exportName, onRowClick, rightSlot, emptyLabel = 'No rows',
}: {
  title?: string;
  columns: GridColumn<T>[];
  rows: T[];
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  searchKeys?: string[];
  searchPlaceholder?: string;
  exportName?: string;
  onRowClick?: (row: T) => void;
  rightSlot?: ReactNode;
  emptyLabel?: string;
}) {
  const [sortKey, setSortKey] = useState(initialSort?.key ?? '');
  const [dir, setDir] = useState<'asc' | 'desc'>(initialSort?.dir ?? 'desc');
  const [query, setQuery] = useState('');

  const view = useMemo(() => {
    let r = rows;
    if (query.trim() && searchKeys?.length) {
      const q = query.toLowerCase();
      r = r.filter(row => searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(q)));
    }
    if (sortKey) {
      const col = columns.find(c => c.key === sortKey);
      const acc = col?.accessor ?? ((row: T) => row[sortKey]);
      r = [...r].sort((a, b) => {
        const av = acc(a), bv = acc(b);
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, query, sortKey, dir, searchKeys, columns]);

  function toggleSort(k: string) {
    if (sortKey === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setDir('desc'); }
  }

  function handleExport() {
    const cols = columns.map(c => ({ key: c.key, header: c.header }));
    const data = view.map(row =>
      Object.fromEntries(columns.map(c => [
        c.key,
        c.exportValue ? c.exportValue(row) : (c.accessor ? c.accessor(row) : row[c.key]),
      ])),
    );
    downloadCSV(exportName ?? (title ?? 'export'), toCSV(cols, data));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        {title && <h3 className="text-sm font-semibold text-gray-700">{title}</h3>}
        <div className="flex items-center gap-2 ml-auto">
          {rightSlot}
          {searchKeys?.length ? (
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? 'Search…'}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white w-40 focus:outline-none focus:border-brand-400"
            />
          ) : null}
          <button onClick={handleExport} className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            Export CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              {columns.map(c => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={clsx('px-3 py-2.5 first:pl-5', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.sortable && 'cursor-pointer select-none hover:text-gray-700')}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortable && (sortKey === c.key
                      ? (dir === 'asc' ? <RiArrowUpSLine size={13} /> : <RiArrowDownSLine size={13} />)
                      : <span className="text-gray-300 text-[10px] leading-none">↕</span>)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {view.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-5 py-8 text-center text-sm text-gray-300">{emptyLabel}</td></tr>
            ) : view.map((row, ri) => (
              <tr key={ri} className={clsx('hover:bg-gray-50', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map(c => (
                  <td key={c.key} className={clsx('px-3 py-2.5 first:pl-5', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>
                    {c.render ? c.render(row) : String(row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
