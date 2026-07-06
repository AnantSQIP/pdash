'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Loader, Plus, Shield, X, Check, Trash2, Search, MoreHorizontal, Copy, Pencil,
  Users as UsersIcon, KeyRound, Layers, Grid3x3, ListChecks, Lock, AlertTriangle, Code2,
} from 'lucide-react';
import { api, type PermissionDef, type RoleSummary, type GroupSummary, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { AddPermissionsWizard } from '@/components/admin/AddPermissionsWizard';

type Tab = 'Users' | 'Roles' | 'Groups' | 'Permissions';
const MGMT_TABS: { key: Tab; icon: React.ElementType }[] = [
  { key: 'Users', icon: UsersIcon }, { key: 'Roles', icon: KeyRound }, { key: 'Groups', icon: Layers },
  { key: 'Permissions', icon: Grid3x3 },
];
const SYSTEM_ROLES = new Set(['Super Admin', 'Admin', 'Manager', 'Senior Consultant', 'Consultant', 'HR', 'Employee']);
function moduleOf(code: string) { return code.split('.')[0]; }
function actionOf(code: string) { return code.split('.').slice(1).join('.'); }
function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace(/[._]/g, ' '); }
const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className={clsx('bg-white rounded-xl shadow-2xl w-full max-h-[85vh] overflow-y-auto', wide ? 'max-w-2xl' : 'max-w-md')} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmWord, affected, onCancel, onConfirm }: { title: string; message: string; confirmWord?: string; affected?: number; onCancel: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('');
  const ok = !confirmWord || typed === confirmWord;
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-3">
        <div className="flex gap-3"><AlertTriangle className="text-red-500 shrink-0" size={20} /><p className="text-sm text-gray-600">{message}</p></div>
        {affected != null && affected > 0 && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">This affects <b>{affected}</b> {affected === 1 ? 'member' : 'members'}.</p>}
        {confirmWord && <input className={inputCls} placeholder={`Type "${confirmWord}" to confirm`} value={typed} onChange={e => setTyped(e.target.value)} />}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
          <button disabled={!ok} onClick={onConfirm} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50">Delete</button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminPage() {
  const { org } = useOrg();
  const { can, isSuperAdmin, loading } = usePermissions();
  const [tab, setTab] = useState<Tab>('Users');

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  if (!isSuperAdmin && !can(['permission.view', 'role.view', 'user.create', 'group.view'])) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Shield size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">You don&apos;t have permission to view the admin console.</p>
      </div>
    );
  }

  function TabBtn({ k, icon: Icon }: { k: Tab; icon: React.ElementType }) {
    return (
      <button onClick={() => setTab(k)} className={clsx('px-3.5 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5', tab === k ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
        <Icon size={14} /> {k}
      </button>
    );
  }

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Shield size={20} className="text-brand-600" /> Administration</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, roles, permission groups and the permission matrix</p>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Access management</span>
            {MGMT_TABS.map(t => <TabBtn key={t.key} k={t.key} icon={t.icon} />)}
          </div>
          <div className="flex items-center gap-1 flex-wrap pl-3 border-l border-gray-200">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Access reports</span>
            <a href="/admin/audit" className="px-3.5 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:bg-gray-100 flex items-center gap-1.5"><ListChecks size={14} /> Audit Log</a>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {org && tab === 'Users' && <UsersTab orgId={org.id} />}
        {org && tab === 'Roles' && <RolesTab orgId={org.id} />}
        {org && tab === 'Groups' && <GroupsTab orgId={org.id} />}
        {org && tab === 'Permissions' && <MatrixTab orgId={org.id} />}
      </div>
    </div>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────
function UsersTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: users = [] } = useQuery({ queryKey: ['users', orgId], queryFn: () => api.users.list(orgId), staleTime: 30_000 });
  const { data: roles = [] } = useQuery({ queryKey: ['roles', orgId], queryFn: () => api.roles.list(orgId), staleTime: 30_000 });
  const [showCreate, setShowCreate] = useState(false);
  const [wizardUser, setWizardUser] = useState<UserSummary | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [desig, setDesig] = useState('');

  const designations = [...new Set(users.map(u => u.designation).filter(Boolean))] as string[];
  const filtered = users.filter(u =>
    (fullName(u).toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) &&
    (!desig || u.designation === desig));

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-56" placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={desig} onChange={e => setDesig(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">All designations</option>{designations.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"><Plus size={14} /> Add User</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        <div className="overflow-x-auto lg:overflow-visible">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
            <th className="px-5 py-2.5">Member</th><th className="px-3 py-2.5">Designation</th><th className="px-3 py-2.5">Email</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/users/${u.id}`)}>
                <td className="px-5 py-2.5"><div className="flex items-center gap-2">
                  <Avatar user={u} size={28} />
                  <span className="font-medium text-gray-800">{fullName(u)}</span>
                </div></td>
                <td className="px-3 py-2.5 text-gray-500">{u.designation ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-500">{u.email}</td>
                <td className="px-3 py-2.5"><span className={clsx('text-xs px-2 py-0.5 rounded-full', u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{u.status === 'ACTIVE' ? 'Active' : u.status}</span></td>
                <td className="px-3 py-2.5 text-right relative" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setMenuFor(menuFor === u.id ? null : u.id)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><MoreHorizontal size={16} /></button>
                  {menuFor === u.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-3 top-9 z-20 w-44 bg-white rounded-lg shadow-xl border border-gray-100 py-1 text-left">
                        <button onClick={() => { router.push(`/admin/users/${u.id}`); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">Manage user</button>
                        <button onClick={() => { setWizardUser(u); setMenuFor(null); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">Add permissions…</button>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">No members match.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
      {showCreate && <CreateUserModal orgId={orgId} roles={roles} onClose={() => setShowCreate(false)} onDone={() => { qc.invalidateQueries({ queryKey: ['users', orgId] }); setShowCreate(false); }} />}
      {wizardUser && <AddPermissionsWizard orgId={orgId} user={wizardUser} onClose={() => setWizardUser(null)} onDone={() => qc.invalidateQueries({ queryKey: ['users', orgId] })} />}
    </div>
  );
}

function CreateUserModal({ orgId, roles, onClose, onDone }: { orgId: string; roles: RoleSummary[]; onClose: () => void; onDone: () => void }) {
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(''); const [designation, setDesignation] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  async function submit() {
    setBusy(true); setErr('');
    try {
      const u = await api.users.create({ organizationId: orgId, firstName, lastName, email, designation, password: password.trim() || undefined, roleIds });
      setCreated({ email: u.email, tempPassword: u.tempPassword });
      setBusy(false);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); setBusy(false); }
  }

  if (created) {
    return (
      <Modal title="User created" onClose={onDone}>
        <div className="space-y-3">
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            ✓ <b>{created.email}</b> can now sign in. Share these credentials — they&apos;ll be required to set a new password on first login.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-gray-500">Email</span><span className="font-mono text-gray-800">{created.email}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500">Temp password</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-gray-800">{created.tempPassword}</span>
                <button onClick={() => navigator.clipboard?.writeText(`${created.email} / ${created.tempPassword}`)} className="text-xs text-brand-600 hover:underline">Copy</button>
              </span>
            </div>
          </div>
          <button onClick={onDone} className="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-medium">Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add User" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className={inputCls} placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />
          <input className={inputCls} placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
        </div>
        <input className={inputCls} placeholder="email@squarkip.com" value={email} onChange={e => setEmail(e.target.value)} />
        <input className={inputCls} placeholder="Designation" value={designation} onChange={e => setDesignation(e.target.value)} />
        <div>
          <input className={inputCls} placeholder="Initial password (optional — auto-generated if blank)" value={password} onChange={e => setPassword(e.target.value)} />
          <p className="text-[11px] text-gray-400 mt-1">Min 8 characters. The user must change it on first sign-in.</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Roles</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {roles.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={roleIds.includes(r.id)} onChange={e => setRoleIds(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} />
                {r.name}
              </label>
            ))}
          </div>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button disabled={busy || !firstName || !email} onClick={submit} className="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{busy ? 'Creating…' : 'Create User'}</button>
      </div>
    </Modal>
  );
}

// ── Roles ────────────────────────────────────────────────────────────────────
const ROLE_TEMPLATES: Record<string, (perms: PermissionDef[]) => string[]> = {
  'Read-only (all .view)': perms => perms.filter(p => actionOf(p.code) === 'view' || actionOf(p.code).startsWith('view.')).map(p => p.id),
  'Project Manager': perms => perms.filter(p => ['project', 'task', 'milestone', 'tasklist', 'timesheet', 'issue', 'comment'].includes(moduleOf(p.code))).map(p => p.id),
  'Empty role': () => [],
};

function RolesTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery({ queryKey: ['roles', orgId], queryFn: () => api.roles.list(orgId), staleTime: 30_000 });
  const { data: users = [] } = useQuery({ queryKey: ['users', orgId], queryFn: () => api.users.list(orgId), staleTime: 30_000 });
  const { data: perms = [] } = useQuery({ queryKey: ['permissions'], queryFn: () => api.permissions.list(), staleTime: 60_000 });
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<RoleSummary | null>(null);
  const [delRole, setDelRole] = useState<RoleSummary | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['roles', orgId] });

  async function clone(r: RoleSummary) {
    const res = await api.roles.create({ organizationId: orgId, name: `${r.name} (copy)`, description: r.description });
    if (r.permissionIds.length) await api.roles.setPermissions(res.id, r.permissionIds);
    inv();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{roles.length} roles · permissions edited in the <b>Permissions</b> tab</p>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"><Plus size={14} /> New Role</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {roles.map(r => {
          const isSystem = SYSTEM_ROLES.has(r.name);
          return (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-1.5">{r.name}{isSystem && <span className="inline-flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"><Lock size={9} /> system</span>}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="hover:text-brand-600">{r.memberCount} members</button>
                    <span>{r.permissionIds.length} permissions</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button title="Clone" onClick={() => clone(r)} className="p-1 text-gray-300 hover:text-brand-600"><Copy size={15} /></button>
                  {!isSystem && <button title="Edit" onClick={() => setEditRole(r)} className="p-1 text-gray-300 hover:text-gray-700"><Pencil size={15} /></button>}
                  {r.name !== 'Super Admin' && !isSystem && <button title="Delete" onClick={() => setDelRole(r)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>}
                </div>
              </div>
              {expanded === r.id && r.memberCount > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] uppercase tracking-wide text-amber-600 mb-1.5">Editing this role affects these {r.memberCount} members</p>
                  <div className="flex flex-wrap gap-1.5">
                    {/* member resolution is approximate — we don't have per-role member lists, show counts */}
                    <span className="text-xs text-gray-400">See the Users tab to inspect individual assignments.</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showCreate && <CreateRoleModal orgId={orgId} perms={perms} onClose={() => setShowCreate(false)} onDone={() => { inv(); setShowCreate(false); }} />}
      {editRole && <EditNamedModal title="Edit Role" initial={editRole} onClose={() => setEditRole(null)} onSave={async (name, description) => { await api.roles.update(editRole.id, { name, description }); inv(); setEditRole(null); }} />}
      {delRole && <ConfirmModal title={`Delete role "${delRole.name}"`} message="Members currently using this role will lose its permissions." affected={delRole.memberCount} confirmWord={delRole.memberCount > 0 ? delRole.name : undefined} onCancel={() => setDelRole(null)} onConfirm={async () => { await api.roles.delete(delRole.id); inv(); setDelRole(null); }} />}
    </div>
  );
}

function CreateRoleModal({ orgId, perms, onClose, onDone }: { orgId: string; perms: PermissionDef[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [template, setTemplate] = useState('Empty role'); const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const permissionIds = ROLE_TEMPLATES[template]?.(perms) ?? [];
      await api.roles.create({ organizationId: orgId, name, description: desc, permissionIds });
      onDone();
    } catch (e) {
      setBusy(false);
      alert(e instanceof Error ? e.message : 'Failed to create role');
    }
  }
  return (
    <Modal title="New Role" onClose={onClose}>
      <div className="space-y-3">
        <input className={inputCls} placeholder="Role name" value={name} onChange={e => setName(e.target.value)} />
        <input className={inputCls} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Start from a template</p>
          <select className={inputCls} value={template} onChange={e => setTemplate(e.target.value)}>
            {Object.keys(ROLE_TEMPLATES).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">You can fine-tune permissions afterwards in the Permissions tab.</p>
        </div>
        <button disabled={busy || !name} onClick={submit} className="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Create Role</button>
      </div>
    </Modal>
  );
}

// ── Groups ───────────────────────────────────────────────────────────────────
function GroupsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data: groups = [] } = useQuery({ queryKey: ['groups', orgId], queryFn: () => api.groups.list(orgId), staleTime: 30_000 });
  const { data: users = [] } = useQuery({ queryKey: ['users', orgId], queryFn: () => api.users.list(orgId), staleTime: 30_000 });
  const [showCreate, setShowCreate] = useState(false);
  const [membersOf, setMembersOf] = useState<GroupSummary | null>(null);
  const [editGroup, setEditGroup] = useState<GroupSummary | null>(null);
  const [delGroup, setDelGroup] = useState<GroupSummary | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['groups', orgId] });
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{groups.length} groups · reusable permission bundles assigned to many users</p>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"><Plus size={14} /> New Group</button>
      </div>
      {groups.length === 0 && <p className="text-sm text-gray-400">No permission groups yet. Create one to bundle permissions and assign them to many users at once (like an AWS managed policy).</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.map(g => (
          <div key={g.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-900 flex items-center gap-1.5">{g.name}{g.isSystemGroup && <span className="inline-flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"><Lock size={9} /> system</span>}</p>
              <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>
              <div className="flex gap-3 mt-2 text-xs text-gray-500"><span>{g.memberCount} members</span><span>{g.permissionIds.length} permissions</span></div>
            </div>
            <div className="flex gap-1">
              <button title="Members" onClick={() => setMembersOf(g)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">Members</button>
              {!g.isSystemGroup && <button title="Edit" onClick={() => setEditGroup(g)} className="p-1 text-gray-300 hover:text-gray-700"><Pencil size={15} /></button>}
              {!g.isSystemGroup && <button title="Delete" onClick={() => setDelGroup(g)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>}
            </div>
          </div>
        ))}
      </div>
      {showCreate && <CreateNamedModal title="New Group" onClose={() => setShowCreate(false)} onSubmit={async (name, description) => { await api.groups.create({ organizationId: orgId, name, description }); inv(); setShowCreate(false); }} />}
      {editGroup && <EditNamedModal title="Edit Group" initial={editGroup} onClose={() => setEditGroup(null)} onSave={async (name, description) => { await api.groups.update(editGroup.id, { name, description }); inv(); setEditGroup(null); }} />}
      {delGroup && <ConfirmModal title={`Delete group "${delGroup.name}"`} message="Members will lose the permissions this group grants." affected={delGroup.memberCount} onCancel={() => setDelGroup(null)} onConfirm={async () => { await api.groups.delete(delGroup.id); inv(); setDelGroup(null); }} />}
      {membersOf && <MembersModal group={membersOf} users={users} onClose={() => setMembersOf(null)} onDone={inv} />}
    </div>
  );
}

function MembersModal({ group, users, onClose, onDone }: { group: GroupSummary; users: UserSummary[]; onClose: () => void; onDone: () => void }) {
  // Preload current members so editing is additive, not a blind full-replace wipe.
  const [ids, setIds] = useState<string[]>(group.memberIds ?? []); const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await api.groups.setMembers(group.id, ids); onDone(); onClose(); } catch (e) { setBusy(false); alert(e instanceof Error ? e.message : 'Failed to save members'); } }
  return (
    <Modal title={`Members — ${group.name}`} onClose={onClose}>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">This replaces the full member list for the group.</p>
      <div className="space-y-1 max-h-72 overflow-y-auto mb-4">
        {users.map(u => (
          <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700 py-0.5">
            <input type="checkbox" checked={ids.includes(u.id)} onChange={e => setIds(p => e.target.checked ? [...p, u.id] : p.filter(x => x !== u.id))} />
            {fullName(u)} <span className="text-xs text-gray-400">{u.designation}</span>
          </label>
        ))}
      </div>
      <button disabled={busy} onClick={save} className="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Save Members</button>
    </Modal>
  );
}

function CreateNamedModal({ title, onClose, onSubmit }: { title: string; onClose: () => void; onSubmit: (name: string, desc?: string) => Promise<void> }) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <input className={inputCls} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input className={inputCls} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
        <button disabled={busy || !name} onClick={async () => { setBusy(true); try { await onSubmit(name, desc); } catch (e) { setBusy(false); alert(e instanceof Error ? e.message : 'Failed'); } }} className="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Create</button>
      </div>
    </Modal>
  );
}

function EditNamedModal({ title, initial, onClose, onSave }: { title: string; initial: { name: string; description?: string }; onClose: () => void; onSave: (name: string, desc?: string) => Promise<void> }) {
  const [name, setName] = useState(initial.name); const [desc, setDesc] = useState(initial.description ?? ''); const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
        <input className={inputCls} placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
        <button disabled={busy || !name} onClick={async () => { setBusy(true); try { await onSave(name, desc); } catch (e) { setBusy(false); alert(e instanceof Error ? e.message : 'Failed'); } }} className="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Save</button>
      </div>
    </Modal>
  );
}

// ── Permission Matrix ──────────────────────────────────────────────────────────
function MatrixTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data: perms = [] } = useQuery({ queryKey: ['permissions'], queryFn: () => api.permissions.list(), staleTime: 60_000 });
  const { data: roles = [] } = useQuery({ queryKey: ['roles', orgId], queryFn: () => api.roles.list(orgId), staleTime: 30_000 });
  const { data: groups = [] } = useQuery({ queryKey: ['groups', orgId], queryFn: () => api.groups.list(orgId), staleTime: 30_000 });

  const [target, setTarget] = useState('');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [showJson, setShowJson] = useState(false);

  const targetObj = useMemo(() => {
    if (!target) return null;
    const [type, id] = target.split(':');
    if (type === 'role') { const r = roles.find(x => x.id === id); return r ? { type, ...r } : null; }
    const g = groups.find(x => x.id === id); return g ? { type, ...g } : null;
  }, [target, roles, groups]);

  const baseIds = useMemo(() => new Set(targetObj?.permissionIds ?? []), [targetObj]);
  const sel = selected ?? baseIds;
  const dirty = selected != null && (sel.size !== baseIds.size || [...sel].some(x => !baseIds.has(x)));

  const byModule = useMemo(() => {
    const m = new Map<string, PermissionDef[]>();
    for (const p of perms) { const k = moduleOf(p.code); (m.get(k) ?? m.set(k, []).get(k)!).push(p); }
    return [...m.entries()].sort();
  }, [perms]);

  const codeById = useMemo(() => new Map(perms.map(p => [p.id, p.code])), [perms]);
  const selectedCodes = useMemo(() => [...sel].map(id => codeById.get(id)!).filter(Boolean), [sel, codeById]);

  // Access-Analyzer-style lint
  const lint = useMemo(() => {
    const warnings: string[] = [];
    if (target && sel.size === 0) warnings.push('This role/group has no permissions — members get no access.');
    const codes = new Set(selectedCodes);
    for (const c of selectedCodes) {
      const a = actionOf(c);
      if ((a === 'delete' || a === 'update' || a === 'create') && !codes.has(`${moduleOf(c)}.view`)) {
        warnings.push(`${c} granted without ${moduleOf(c)}.view — members can ${a} but not see it.`);
      }
    }
    return [...new Set(warnings)];
  }, [target, sel, selectedCodes]);

  function toggle(id: string) { const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); }
  function toggleModule(ids: string[], on: boolean) { const next = new Set(sel); ids.forEach(i => on ? next.add(i) : next.delete(i)); setSelected(next); }
  async function save() {
    if (!targetObj) return; setBusy(true);
    try {
      const ids = [...sel];
      if (targetObj.type === 'role') await api.roles.setPermissions(targetObj.id, ids);
      else await api.groups.setPermissions(targetObj.id, ids);
      qc.invalidateQueries({ queryKey: ['roles', orgId] }); qc.invalidateQueries({ queryKey: ['groups', orgId] });
      setSelected(null);
    } finally { setBusy(false); }
  }
  const isSuper = targetObj?.type === 'role' && (targetObj as any).name === 'Super Admin';
  const q = search.toLowerCase();

  return (
    <div>
      <div className="sticky top-0 z-10 bg-gray-50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-4 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Edit permissions for:</span>
        <select value={target} onChange={e => { setTarget(e.target.value); setSelected(null); }} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">Select a role or group…</option>
          <optgroup label="Roles">{roles.map(r => <option key={r.id} value={`role:${r.id}`}>{r.name}</option>)}</optgroup>
          {groups.length > 0 && <optgroup label="Groups">{groups.map(g => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>}
        </select>
        {target && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48" placeholder="Filter permissions…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
        {target && <button onClick={() => setShowJson(v => !v)} className="text-xs flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-white"><Code2 size={13} /> {showJson ? 'Visual' : 'JSON'}</button>}
        {dirty && <button disabled={busy} onClick={save} className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"><Check size={14} /> Save changes</button>}
      </div>

      {!target && <p className="text-sm text-gray-400">Pick a role or group to view and edit its permission matrix.</p>}
      {isSuper && <p className="text-sm text-amber-600 mb-3">Super Admin always has all permissions (changes here are cosmetic).</p>}

      {lint.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-1"><AlertTriangle size={13} /> {lint.length} finding{lint.length > 1 ? 's' : ''}</p>
          <ul className="text-xs text-amber-700 space-y-0.5 list-disc pl-4">{lint.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {target && showJson && (
        <pre className="bg-gray-900 text-gray-100 text-xs rounded-xl p-4 overflow-x-auto">{JSON.stringify({ target: (targetObj as any)?.name, allow: selectedCodes.sort() }, null, 2)}</pre>
      )}

      {target && !showJson && (
        <div className="space-y-4">
          {byModule.map(([mod, list]) => {
            const visible = list.filter(p => !q || p.code.toLowerCase().includes(q));
            if (!visible.length) return null;
            const ids = list.map(p => p.id);
            const allOn = ids.every(i => sel.has(i));
            return (
              <div key={mod} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">{titleCase(mod)}</span>
                  <button onClick={() => toggleModule(ids, !allOn)} className="text-xs text-brand-600 hover:underline">{allOn ? 'Clear all' : 'Select all'}</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 p-4">
                  {visible.map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="rounded" />
                      <span className="capitalize">{titleCase(actionOf(p.code))}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

