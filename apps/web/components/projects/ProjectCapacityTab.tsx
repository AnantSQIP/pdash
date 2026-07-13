'use client';

// Per-project availability — the Team Capacity board, scoped to this project's members.
// Answers "who on THIS project is free to take more of it?" without leaving the project.

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Users, Loader, ArrowRight, CalendarRange } from 'lucide-react';
import { api, type CapacityRow } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { STATE_STYLE, DOW, DayCell, CapacityLegend, dayOfWeek, dayNum, isToday } from '@/components/capacity/grid';

const RANGES = [7, 14, 30] as const;

export function ProjectCapacityTab({ projectId }: { projectId: string }) {
  const [days, setDays] = useState<number>(14);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['capacity', 'project', projectId, days],
    queryFn: () => api.capacity.forProject(projectId, days),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader className="animate-spin mr-2" size={18} /> Loading availability…</div>;
  }
  // capacity.view is required; without it the API returns 403 and this tab simply explains why.
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users size={34} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Availability isn&apos;t visible to you</p>
        <p className="text-sm text-gray-400 mt-1">You need the <code>capacity.view</code> permission to see who is free.</p>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const dates = rows[0]?.days.map(d => d.date) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          When each member of this project is free — across <span className="font-medium text-gray-700">all</span> their projects,
          so you can see who has real room for more of this one.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={clsx('px-3 py-1.5 text-xs font-medium', days === r ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
              >
                {r}d
              </button>
            ))}
          </div>
          <Link href="/capacity" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            Full board <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center text-gray-400">
          <CalendarRange size={30} className="mb-2" />
          This project has no active members yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 min-w-[180px]">Member</th>
                  {dates.map(d => (
                    <th key={d} className={clsx('px-1 py-2 text-center', isToday(d) && 'bg-brand-50')}>
                      <div className="text-[10px] text-gray-400">{DOW[dayOfWeek(d)]}</div>
                      <div className={clsx('text-xs', isToday(d) ? 'font-bold text-brand-600' : 'text-gray-500')}>{dayNum(d)}</div>
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[130px]">Availability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: CapacityRow) => (
                  <tr key={row.userId} className="border-t border-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar user={{ firstName: row.name.split(' ')[0], lastName: row.name.split(' ').slice(1).join(' '), profilePhoto: row.profilePhoto }} size={28} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{row.name}</div>
                          {row.designation && <div className="text-[11px] text-gray-400 truncate">{row.designation}{row.overdueCount > 0 && <span className="text-red-500"> · {row.overdueCount} overdue</span>}</div>}
                        </div>
                      </div>
                    </td>
                    {row.days.map(d => (
                      <td key={d.date} className="px-0.5 py-2 w-9"><DayCell day={d} /></td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      <div className={clsx('text-sm font-semibold', row.availableNow ? 'text-emerald-600' : 'text-gray-500')}>
                        {row.availableNow ? 'Available now' : row.nextFreeDate ? `Free ${new Date(`${row.nextFreeDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : 'Fully booked'}
                      </div>
                      <div className="text-[11px] text-gray-400">{Math.round(row.freeHours)}h free · {row.utilization}% used</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CapacityLegend />
    </div>
  );
}
