'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { UserPlus, Search, Loader } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type UserSummary, type ApiProject, type DepartmentSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePresence, presenceMeta } from '@/lib/presence-context';
import { Can } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';
import { DepartmentsPanel } from '@/components/people/DepartmentsPanel';

function fullName(u: UserSummary) {
  return `${u.firstName} ${u.lastName ?? ''}`.trim();
}

// The Department column used to come from a `departmentOf(designation)` switch that mapped job
// titles onto invented bucket names — "Leadership", "Search & Analytics", "Other". It looked like
// the department feature working, so nobody noticed the real one was unreachable, and it disagreed
// with the actual Department records the moment anybody created one. It now reads real membership,
// and a person in no department says so.

type Tab = 'All Members' | 'Departments';

// Small chip shown next to a person when they're working from home / on leave today.
function WorkChip({ userId }: { userId: string }) {
  const { presenceOf } = usePresence();
  const p = presenceOf(userId);
  if (p?.workMode === 'WFH') return <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">WFH</span>;
  if (p?.status === 'ON_LEAVE') return <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">On leave</span>;
  return null;
}

export default function UsersPage() {
  const { org, loading: orgLoading } = useOrg();
  const { presenceOf } = usePresence();
  const [tab, setTab] = useState<Tab>('All Members');
  const [search, setSearch] = useState('');

  const { data: users = [], isLoading: usersLoading } = useQuery<UserSummary[]>({
    queryKey: ['users', org?.id],
    queryFn: () => api.users.list(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: projects = [] } = useQuery<ApiProject[]>({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  // Real Department records — not designation-string buckets.
  const { data: departments = [] } = useQuery<DepartmentSummary[]>({
    queryKey: ['departments', org?.id],
    queryFn: () => api.departments.list(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  });

  // userId → the departments they actually belong to. Someone can be in more than one, so the
  // column joins them rather than picking whichever came back first.
  const deptsByUser = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of departments) {
      for (const mem of d.members ?? []) m.set(mem.id, [...(m.get(mem.id) ?? []), d.name]);
    }
    return m;
  }, [departments]);

  // Count how many projects each user is a member of.
  const projectCount: Record<string, number> = {};
  for (const p of projects) {
    for (const m of p.members ?? []) {
      projectCount[m.user?.id ?? m.userId] = (projectCount[m.user?.id ?? m.userId] ?? 0) + 1;
    }
  }

  const isLoading = orgLoading || usersLoading;

  const filtered = users.filter(u =>
    fullName(u).toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()),
  );


  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">People</h1>
          <p className="text-sm text-gray-500 mt-0.5">{isLoading ? 'Loading…' : `${users.length} members`}</p>
        </div>
        <Can perm="user.create">
          <Link href="/admin" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
            <UserPlus size={15} />
            Invite Member
          </Link>
        </Can>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center gap-1 overflow-x-auto">
        {(['All Members', 'Departments'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors ${
              tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" />
            <span className="text-sm">Loading members…</span>
          </div>
        ) : tab === 'All Members' ? (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search members..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              />
            </div>

            {/* Mobile: member cards. The 6-column table is unreadable on a phone. */}
            <div className="sm:hidden space-y-2.5">
              {filtered.map(u => (
                <Link key={u.id} href={`/admin/users/${u.id}`}
                  className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3.5 active:bg-gray-50">
                  <Avatar user={u} size={40} status={presenceOf(u.id)?.status} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">{fullName(u)} <WorkChip userId={u.id} /></p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-500 truncate">{u.designation ?? '—'}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {u.status === 'ACTIVE' ? 'Active' : u.status}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No members found.</p>
              )}
            </div>

            {/* Desktop / tablet: the table. */}
            <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Member</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Role</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Department</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Projects</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, idx) => (
                    <tr key={u.id} className={`${idx < filtered.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} size={36} status={presenceOf(u.id)?.status} />
                          <div>
                            <p className="font-medium text-gray-900 flex items-center gap-1.5">{fullName(u)} <WorkChip userId={u.id} /></p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{u.designation ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-500">
                        {deptsByUser.get(u.id)?.join(', ') ?? <span className="text-gray-300">None</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {u.status === 'ACTIVE' ? 'Active' : u.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500">{projectCount[u.id] ?? 0}</td>
                      <td className="px-3 py-3">
                        <Link href={`/admin/users/${u.id}`} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">No members found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Departments — create, rename, staff and delete, in place. The card used to carry a
             "Manage in Admin →" link to a page that has no department management on it. */
          <DepartmentsPanel everyone={users} />
        )}
      </div>
    </div>
  );
}
