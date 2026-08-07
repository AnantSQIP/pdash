'use client';

import type { ComponentType } from 'react';
import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArrowLeft, Mail, Briefcase, MapPin, CalendarCheck, Clock, AlertTriangle, ExternalLink, Loader, ShieldCheck,
} from 'lucide-react';
import { api, type UserSummary, type TeamCapacity, type CapacityRow } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import { formatDate } from '@/lib/date';

/**
 * One person's page.
 *
 * Every member name across the digest, reports and project pages links to /users/<id>. That
 * route did not exist, so all of those links landed on a 404 — this is the page they meant.
 * It answers the question somebody actually has when they click a name: who is this, what are
 * they working on, and are they free.
 */

const PRIORITY_TINT: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-gray-50 text-gray-600 border-gray-200',
};

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: user, isLoading, isError } = useQuery<UserSummary>({
    queryKey: ['user', id], queryFn: () => api.users.get(id), enabled: !!id, retry: false,
  });
  // The capacity board already computes everybody's load and open work — reuse it rather than
  // asking for a second, slightly different version of the same answer. It is permission-gated,
  // so somebody without capacity.view gets told that, not a blank "no work" that reads as fact.
  const { can, isSuperAdmin } = usePermissions();
  const canSeeLoad = can('capacity.view');
  // Access administration lives on its own screen. This page is about the work; linking across
  // stops the two feeling like unrelated halves to whoever can see both.
  const canManageAccess = isSuperAdmin || can('user.manage_access');
  const { data: capacity } = useQuery<TeamCapacity>({
    queryKey: ['capacity-team', 14], queryFn: () => api.capacity.team(14),
    enabled: canSeeLoad, staleTime: 60_000,
  });
  const row: CapacityRow | undefined = useMemo(
    () => capacity?.rows.find(r => r.userId === id), [capacity, id],
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader size={20} className="animate-spin" /></div>;
  }
  if (isError || !user) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-sm text-gray-500">That person could not be found.</p>
        <button onClick={() => router.back()} className="text-sm font-medium text-brand-700 hover:underline">Go back</button>
      </div>
    );
  }

  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-start gap-4 flex-wrap">
          <Avatar user={user} size={56} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {name}
              {user.status !== 'ACTIVE' && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">{user.status}</span>
              )}
            </h1>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-xs text-gray-500">
              {user.designation && <span className="inline-flex items-center gap-1.5"><Briefcase size={13} className="text-gray-400" /> {user.designation}</span>}
              <a href={`mailto:${user.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-600"><Mail size={13} className="text-gray-400" /> {user.email}</a>
              {row?.office && <span className="inline-flex items-center gap-1.5"><MapPin size={13} className="text-gray-400" /> {row.office}</span>}
              {canManageAccess && (
                <Link href={`/admin/users/${id}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
                  <ShieldCheck size={13} /> Roles &amp; permissions
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Load over the next fortnight — the reason most people click a name. */}
        {row ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label="Committed" value={`${row.committedHours}h`} sub="next 14 days" tint="bg-brand-50 text-brand-700" Icon={Clock} />
              <Tile label="Free" value={`${row.freeHours}h`} sub={row.availableNow ? 'available now' : row.nextFreeDate ? `free from ${formatDate(row.nextFreeDate)}` : 'no clear run'} tint="bg-green-50 text-green-700" Icon={CalendarCheck} />
              <Tile label="Utilisation" value={`${row.utilization}%`} sub="of capacity" tint="bg-amber-50 text-amber-700" Icon={Clock} />
              <Tile label="Overdue" value={row.overdueCount} sub={row.overdueCount === 1 ? 'task past due' : 'tasks past due'} tint={row.overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'} Icon={AlertTriangle} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-700">Open work</h3>
                <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{row.openTasks.length}</span>
              </div>
              {row.openTasks.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-300">Nothing open right now</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
                        <th className="px-5 py-2.5 font-semibold">Task</th>
                        <th className="px-3 py-2.5 font-semibold">Project</th>
                        <th className="px-3 py-2.5 font-semibold">Priority</th>
                        <th className="px-3 py-2.5 font-semibold">Deadline</th>
                        <th className="px-5 py-2.5 font-semibold text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {row.openTasks.map(t => (
                        <tr key={t.id} className={clsx('hover:bg-gray-50/60', t.overdue && 'bg-red-50/40')}>
                          <td className="px-5 py-2.5">
                            {t.projectId ? (
                              <Link href={`/projects/${t.projectId}`} className="text-gray-800 hover:text-brand-600 hover:underline inline-flex items-center gap-1.5">
                                {t.title} <ExternalLink size={11} className="text-gray-300" />
                              </Link>
                            ) : <span className="text-gray-800">{t.title}</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {t.projectId ? (
                              <Link href={`/projects/${t.projectId}`} className="text-gray-600 hover:text-brand-600 hover:underline">{t.project ?? '—'}</Link>
                            ) : <span className="text-gray-400">{t.project ?? '—'}</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border', PRIORITY_TINT[t.priority] ?? PRIORITY_TINT.LOW)}>{t.priority}</span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={clsx(t.overdue ? 'text-red-600 font-medium' : 'text-gray-600')}>
                              {t.dueDate ? formatDate(t.dueDate) : '—'}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-gray-700">{t.remainingHours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
            <p className="text-sm text-gray-400">
              {canSeeLoad ? 'No capacity information for this person.' : 'You do not have access to workload information.'}
            </p>
            {canSeeLoad && <p className="text-xs text-gray-400 mt-1">They may be inactive, or have no assigned work in the next fortnight.</p>}
          </div>
        )}

        {canSeeLoad && (
          <p className="text-[11px] text-gray-400">
            Load is measured over the next 14 days. The full board is on{' '}
            <Link href="/capacity" className="text-brand-700 hover:underline">Team Capacity</Link>.
          </p>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tint, Icon }: {
  label: string; value: string | number; sub?: string; tint: string;
  Icon: ComponentType<{ size?: number | string; className?: string }>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2">
        <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', tint)}><Icon size={14} /></span>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
