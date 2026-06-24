'use client';

import { useState } from 'react';
import { UserPlus, Search } from 'lucide-react';

const USERS = [
  { id: 'u1', name: 'Anant Gupta',  initials: 'AN', color: 'bg-brand-600', role: 'Admin',           dept: 'Leadership',  email: 'anant@acme.com',  status: 'ACTIVE',   projects: 4 },
  { id: 'u2', name: 'Alice Kim',    initials: 'AK', color: 'bg-purple-500', role: 'Manager',          dept: 'Product',     email: 'alice@acme.com',  status: 'ACTIVE',   projects: 3 },
  { id: 'u3', name: 'Bob Taylor',   initials: 'BT', color: 'bg-blue-500',   role: 'Engineer',         dept: 'Engineering', email: 'bob@acme.com',    status: 'ACTIVE',   projects: 5 },
  { id: 'u4', name: 'Carol Patel',  initials: 'CP', color: 'bg-pink-500',   role: 'Designer',         dept: 'Design',      email: 'carol@acme.com',  status: 'ACTIVE',   projects: 3 },
  { id: 'u5', name: 'Dan Voss',     initials: 'DV', color: 'bg-red-500',    role: 'Engineer',         dept: 'Engineering', email: 'dan@acme.com',    status: 'ACTIVE',   projects: 2 },
  { id: 'u6', name: 'Emma Stone',   initials: 'ES', color: 'bg-teal-500',   role: 'QA Engineer',      dept: 'Engineering', email: 'emma@acme.com',   status: 'ACTIVE',   projects: 2 },
  { id: 'u7', name: 'Frank Ito',    initials: 'FI', color: 'bg-brand-500', role: 'Product Manager',  dept: 'Product',     email: 'frank@acme.com',  status: 'ON_LEAVE', projects: 1 },
  { id: 'u8', name: 'Grace Lee',    initials: 'GL', color: 'bg-cyan-500',   role: 'Designer',         dept: 'Design',      email: 'grace@acme.com',  status: 'ACTIVE',   projects: 2 },
];

const DEPARTMENTS = [
  { name: 'Leadership',  members: ['u1'],             head: 'Anant Gupta' },
  { name: 'Product',     members: ['u2', 'u7'],       head: 'Alice Kim' },
  { name: 'Engineering', members: ['u3', 'u5', 'u6'], head: 'Bob Taylor' },
  { name: 'Design',      members: ['u4', 'u8'],       head: 'Carol Patel' },
];

const TEAMS = [
  { name: 'Frontend Team',  members: ['u4', 'u8', 'u3'], projects: 3 },
  { name: 'Backend Team',   members: ['u3', 'u5', 'u6'], projects: 2 },
];

type Tab = 'All Members' | 'Departments' | 'Teams';

function Avatar({ user, size = 'md' }: { user: { initials: string; color: string }; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0
      ${size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'}
      ${user.color}`}>
      {user.initials}
    </span>
  );
}

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('All Members');
  const [search, setSearch] = useState('');

  const filtered = USERS.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const userById = Object.fromEntries(USERS.map(u => [u.id, u]));

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">People</h1>
          <p className="text-sm text-gray-500 mt-0.5">8 members</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
          <UserPlus size={15} />
          Invite Member
        </button>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-6 flex items-center gap-1">
        {(['All Members', 'Departments', 'Teams'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* --- All Members Tab --- */}
        {tab === 'All Members' && (
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

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Projects</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, idx) => (
                    <tr key={u.id} className={`${idx < filtered.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} />
                          <div>
                            <p className="font-medium text-gray-900">{u.name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{u.role}</td>
                      <td className="px-3 py-3 text-gray-500">{u.dept}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {u.status === 'ACTIVE' ? 'Active' : 'On Leave'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500">{u.projects}</td>
                      <td className="px-3 py-3">
                        <button className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                          View
                        </button>
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
        )}

        {/* --- Departments Tab --- */}
        {tab === 'Departments' && (
          <div className="grid grid-cols-2 gap-4">
            {DEPARTMENTS.map(dept => {
              const members = dept.members.map(id => userById[id]).filter(Boolean);
              return (
                <div key={dept.name} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{dept.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  {/* Stacked avatars */}
                  <div className="flex -space-x-2 mb-3">
                    {members.slice(0, 5).map(u => (
                      <Avatar key={u.id} user={u} size="sm" />
                    ))}
                  </div>

                  <p className="text-xs text-gray-500 mb-4">Head: <span className="font-medium text-gray-700">{dept.head}</span></p>

                  <button className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    + Add Member
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* --- Teams Tab --- */}
        {tab === 'Teams' && (
          <div className="grid grid-cols-2 gap-4">
            {TEAMS.map(team => {
              const members = team.members.map(id => userById[id]).filter(Boolean);
              return (
                <div key={team.name} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{team.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{members.length} members &middot; {team.projects} projects</p>
                    </div>
                  </div>

                  {/* Stacked avatars */}
                  <div className="flex -space-x-2 mb-4">
                    {members.slice(0, 5).map(u => (
                      <Avatar key={u.id} user={u} size="sm" />
                    ))}
                  </div>

                  <button className="w-full px-3 py-2 rounded-lg bg-brand-50 border border-brand-100 text-xs font-medium text-brand-600 hover:bg-brand-100 transition-colors">
                    Manage
                  </button>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
