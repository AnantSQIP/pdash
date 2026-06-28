'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import type { HeatmapDay } from '@/lib/api';

const LEVEL_BG = ['bg-gray-100', 'bg-emerald-200', 'bg-emerald-400', 'bg-emerald-600', 'bg-emerald-800'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parse(d: string) { return new Date(`${d}T00:00:00Z`); }

export function ContributionHeatmap({ days }: { days: HeatmapDay[] }) {
  const { weeks, monthLabels, total } = useMemo(() => {
    if (!days.length) return { weeks: [] as (HeatmapDay | null)[][], monthLabels: [] as { col: number; label: string }[], total: 0 };
    const map = new Map(days.map(d => [d.date, d]));
    const first = parse(days[0].date);
    const last = parse(days[days.length - 1].date);
    const startSunday = new Date(first);
    startSunday.setUTCDate(first.getUTCDate() - first.getUTCDay());
    const numWeeks = Math.ceil((last.getTime() - startSunday.getTime()) / 86_400_000 / 7) + 1;

    const weeks: (HeatmapDay | null)[][] = [];
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < numWeeks; w++) {
      const col: (HeatmapDay | null)[] = [];
      for (let r = 0; r < 7; r++) {
        const d = new Date(startSunday);
        d.setUTCDate(startSunday.getUTCDate() + w * 7 + r);
        const key = d.toISOString().slice(0, 10);
        const inRange = d >= first && d <= last;
        col.push(inRange ? (map.get(key) ?? { date: key, value: 0, level: 0 }) : null);
        if (inRange && r === 0 && d.getUTCMonth() !== lastMonth) {
          lastMonth = d.getUTCMonth();
          monthLabels.push({ col: w, label: MONTHS[d.getUTCMonth()] });
        }
      }
      weeks.push(col);
    }
    const total = days.reduce((s, d) => s + d.value, 0);
    return { weeks, monthLabels, total };
  }, [days]);

  if (!days.length) return <p className="text-sm text-gray-400">No activity data.</p>;

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1 min-w-max">
        {/* month labels */}
        <div className="flex gap-[3px] pl-8 h-4 text-[10px] text-gray-400">
          {weeks.map((_, w) => {
            const m = monthLabels.find(x => x.col === w);
            return <div key={w} className="w-[11px]">{m ? m.label : ''}</div>;
          })}
        </div>
        <div className="flex gap-[3px]">
          {/* weekday labels */}
          <div className="flex flex-col gap-[3px] pr-1 text-[9px] text-gray-400 justify-around">
            <span>Mon</span><span>Wed</span><span>Fri</span>
          </div>
          {/* week columns */}
          {weeks.map((col, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              {col.map((cell, r) => (
                <div
                  key={r}
                  title={cell ? `${cell.date}: ${cell.value} ${cell.value === 1 ? 'action' : 'actions'}` : ''}
                  className={clsx('w-[11px] h-[11px] rounded-sm', cell ? LEVEL_BG[cell.level] : 'bg-transparent')}
                />
              ))}
            </div>
          ))}
        </div>
        {/* legend */}
        <div className="flex items-center gap-2 pl-8 mt-1 text-[10px] text-gray-400">
          <span>{total} actions in this period</span>
          <span className="ml-auto">Less</span>
          {LEVEL_BG.map((bg, i) => <div key={i} className={clsx('w-[11px] h-[11px] rounded-sm', bg)} />)}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
