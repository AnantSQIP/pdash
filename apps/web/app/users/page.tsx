'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, Search, Loader } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type UserSummary, type ApiProject } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { Can } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';

function fullName(u: UserSummary) {
  return `${u.firstName} ${u.lastName ?? ''}`.trim();
}

// Map a designation to a department bucket for the Departments tab.
function departmentOf(designation?: string): string {
  switch (designation) {
    case 'VP': return 'Leadership';
    case 'Manager': return 'Management';
    case 'Product Development': return 'Product';
    case 'Research Associate':
    case 'Senior Research Associate': return 'Search & Analytics';
    case 'Senior Consultant':
    case 'Consultant': return 'Consulting';
    case 'Testing and QA': return 'QA';
    case 'HR': return 'Human Resources';
    default: return 'Other';
  }
}

type Tab = 'All Members' | 'Departments';

export default function UsersPage() {
  const { org, loading: orgLoading } = useOrg();
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

  // Group users by department for the Departments tab.
  const byDept: Record<string, UserSummary[]> = {};
  for (const u of users) {
    const d = departmentOf(u.designation);
    (byDept[d] ??= []).push(u);
  }

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

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
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
                          <Avatar user={u} size={36} />
                          <div>
                            <p className="font-medium text-gray-900">{fullName(u)}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{u.designation ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-500">{departmentOf(u.designation)}</td>
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
          /* Departments Tab */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(byDept).map(([dept, members]) => (
              <div key={dept} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{dept}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex -space-x-2 mb-3">
                  {members.slice(0, 6).map(u => (
                    <Avatar key={u.id} user={u} size={28} className="ring-2 ring-white" />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Head: <span className="font-medium text-gray-700">{fullName(members[0])}</span>
                </p>
                <Link href="/admin" className="block text-center w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Manage in Admin →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
