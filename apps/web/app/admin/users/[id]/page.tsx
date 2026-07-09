'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Loader, Shield, ArrowLeft, Search, Check, Plus, X, KeyRound, Layers,
  ShieldCheck, ShieldAlert, Info, Activity as ActivityIcon, UserCog,
} from 'lucide-react';
import { RiShieldUserLine } from '@remixicon/react';
import {
  api,
  type PermissionDef,
  type RoleSummary,
  type GroupSummary,
  type UserSummary,
} from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { avatarColor, fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';

// ── helpers ──────────────────────────────────────────────────────────────────
function moduleOf(code: string) { return code.split('.')[0]; }
function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace(/[._]/g, ' '); }

type Tab = 'Permissions' | 'Roles' | 'Groups' | 'Overrides' | 'Activity';
const TABS: { key: Tab; icon: React.ElementType }[] = [
  { key: 'Permissions', icon: ShieldCheck },
  { key: 'Roles', icon: KeyRound },
  { key: 'Groups', icon: Layers },
  { key: 'Overrides', icon: UserCog },
  { key: 'Activity', icon: ActivityIcon },
];

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

// Describes a "sources[code]" value as a coloured "Attached via" badge.
function SourceBadge({ source }: { source?: string }) {
  let label = 'Direct';
  let cls = 'bg-gray-100 text-gray-600';
  if (source === 'super-admin') { label = 'Super Admin'; cls = 'bg-amber-100 text-amber-700'; }
  else if (source === 'direct') { label = 'Direct'; cls = 'bg-gray-100 text-gray-600'; }
  else if (source?.startsWith('role:')) { label = `Role: ${source.slice(5)}`; cls = 'bg-blue-100 text-blue-700'; }
  else if (source?.startsWith('group:')) { label = `Group: ${source.slice(6)}`; cls = 'bg-purple-100 text-purple-700'; }
  else if (source === 'override:ALLOW') { label = 'Allow override'; cls = 'bg-green-100 text-green-700'; }
  else if (source === 'override:DENY') { label = 'Deny override'; cls = 'bg-red-100 text-red-700'; }
  else if (source) { label = source; }
  return <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap', cls)}>{label}</span>;
}

// Reusable modal (mirrors the admin console pattern).
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { org } = useOrg();
  const { can, isSuperAdmin, loading: permLoading } = usePermissions();
  const [tab, setTab] = useState<Tab>('Permissions');

  const orgId = org?.id;
  const { data: users = [] } = useQuery({
    queryKey: ['users', orgId],
    queryFn: () => api.users.list(orgId!),
    enabled: !!orgId,
    staleTime: 20_000,
  });
  const user = useMemo<UserSummary | undefined>(() => users.find(u => u.id === id), [users, id]);

  const { data: eff, isLoading: effLoading } = useQuery({
    queryKey: ['eff', id],
    queryFn: () => api.users.effectivePermissions(id),
    enabled: !!id,
    staleTime: 20_000,
  });

  if (permLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }

  if (!isSuperAdmin && !can(['user.view', 'permission.view'])) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Shield size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">You don&apos;t have permission to view this user&apos;s access.</p>
        <Link href="/admin" className="mt-4 text-sm text-brand-600 hover:underline">Back to Administration</Link>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 mb-3">
          <ArrowLeft size={15} /> Back to Administration
        </Link>
        <div className="flex items-start gap-4">
          {user ? (
            <Avatar user={user} size={56} className="shrink-0" />
          ) : (
            <div className={clsx('w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0', avatarColor(id))}>
              <RiShieldUserLine size={22} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{user ? fullName(user) : 'User'}</h1>
              {user && <StatusBadge status={user.status} />}
              {eff?.isSuperAdmin && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  <ShieldAlert size={12} /> Super Admin
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{user?.email ?? id}</p>
            {user?.designation && <p className="text-xs text-gray-400 mt-0.5">{user.designation}</p>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 flex-wrap">
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5',
                tab === key ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              <Icon size={14} /> {key}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === 'Permissions' && <PermissionsTab eff={eff} loading={effLoading} />}
        {tab === 'Roles' && orgId && <RolesTab userId={id} orgId={orgId} eff={eff} canManage={isSuperAdmin || can('user.manage_access')} />}
        {tab === 'Groups' && orgId && <GroupsTab orgId={orgId} eff={eff} />}
        {tab === 'Overrides' && <OverridesTab userId={id} canManage={isSuperAdmin || can('user.manage_access')} />}
        {tab === 'Activity' && orgId && <ActivityTab userId={id} orgId={orgId} />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toUpperCase();
  const active = s === 'ACTIVE';
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full',
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600',
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', active ? 'bg-green-500' : 'bg-gray-400')} />
      {titleCase((status ?? 'unknown').toLowerCase())}
    </span>
  );
}

// ── Permissions (the IAM centerpiece) ────────────────────────────────────────
function PermissionsTab({ eff, loading }: { eff?: { isSuperAdmin: boolean; codes: string[]; sources: Record<string, string> }; loading: boolean }) {
  const [q, setQ] = useState('');

  const byModule = useMemo(() => {
    const codes = (eff?.codes ?? []).filter(c => c.toLowerCase().includes(q.toLowerCase()));
    const m = new Map<string, string[]>();
    for (const code of codes) {
      const k = moduleOf(code);
      (m.get(k) ?? m.set(k, []).get(k)!).push(code);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mod, list]) => [mod, list.sort()] as const);
  }, [eff, q]);

  if (loading) return <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="animate-spin" size={16} /> Resolving effective permissions…</div>;

  const total = eff?.codes.length ?? 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-50 text-brand-600"><ShieldCheck size={15} /></span>
          <span className="font-semibold text-gray-900">{total}</span>
          <span className="text-gray-500">effective permission{total === 1 ? '' : 's'}</span>
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter codes…" className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-56" />
        </div>
      </div>

      {eff?.isSuperAdmin && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>This user is a <b>Super Admin</b> — every permission is granted implicitly regardless of roles, groups or overrides.</span>
        </div>
      )}

      <p className="text-xs text-gray-400 mb-3">Each permission shows where it comes from — the answer to &ldquo;why does this user have it?&rdquo;</p>

      {total === 0 && <p className="text-sm text-gray-400">This user has no effective permissions.</p>}
      {total > 0 && byModule.length === 0 && <p className="text-sm text-gray-400">No permissions match &ldquo;{q}&rdquo;.</p>}

      <div className="space-y-4">
        {byModule.map(([mod, codes]) => (
          <div key={mod} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">{titleCase(mod)}</span>
              <span className="text-xs text-gray-400">{codes.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {codes.map(code => (
                <div key={code} className="flex items-center justify-between gap-3 px-4 py-2">
                  <code className="text-xs text-gray-700">{code}</code>
                  <SourceBadge source={eff?.sources[code]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Roles ────────────────────────────────────────────────────────────────────
function RolesTab({ userId, orgId, eff, canManage }: { userId: string; orgId: string; eff?: { roles?: string[]; sources: Record<string, string> }; canManage: boolean }) {
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useQuery({ queryKey: ['roles', orgId], queryFn: () => api.roles.list(orgId), staleTime: 20_000 });

  // Derive current roles from the authoritative eff.roles list — NOT from `sources`,
  // which last-write-wins per code and silently omits a role whose permissions are all
  // shadowed by a higher-precedence grant (which made setRoles' replace drop it on save).
  const currentRoleIds = useMemo(
    () => roles.filter(r => eff?.roles?.includes(r.name)).map(r => r.id),
    [roles, eff],
  );

  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? currentRoleIds;
  const dirty = draft != null && (
    selected.length !== currentRoleIds.length ||
    selected.some(rid => !currentRoleIds.includes(rid)) ||
    currentRoleIds.some(rid => !selected.includes(rid))
  );
  const [busy, setBusy] = useState(false);

  function toggle(rid: string, on: boolean) {
    setDraft(prev => {
      const base = prev ?? currentRoleIds;
      return on ? [...new Set([...base, rid])] : base.filter(x => x !== rid);
    });
  }

  async function save() {
    setBusy(true);
    try {
      await api.users.setRoles(userId, selected);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['eff', userId] });
      qc.invalidateQueries({ queryKey: ['roles', orgId] });
      qc.invalidateQueries({ queryKey: ['effective-permissions'] }); // M34: refresh the live gate/sidebar
    } finally { setBusy(false); }
  }

  if (isLoading) return <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="animate-spin" size={16} /> Loading roles…</div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{currentRoleIds.length} of {roles.length} role{roles.length === 1 ? '' : 's'} assigned</p>
        {dirty && canManage && (
          <button disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            <Check size={14} /> {busy ? 'Saving…' : 'Save roles'}
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {roles.length === 0 && <p className="text-sm text-gray-400 p-4">No roles defined for this organization.</p>}
        {roles.map(r => (
          <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" className="rounded" checked={selected.includes(r.id)} onChange={e => toggle(r.id, e.target.checked)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{r.name}</p>
              {r.description && <p className="text-xs text-gray-400 truncate">{r.description}</p>}
            </div>
            <span className="text-xs text-gray-400 shrink-0">{r.permissionIds.length} perms</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">Roles bundle permissions and apply them to every assigned member. Saving updates this user&apos;s effective access immediately.</p>
    </div>
  );
}

// ── Groups (read-only — membership is managed in Admin → Groups) ──────────────
function GroupsTab({ orgId, eff }: { orgId: string; eff?: { sources: Record<string, string> } }) {
  const { data: groups = [], isLoading } = useQuery({ queryKey: ['groups', orgId], queryFn: () => api.groups.list(orgId), staleTime: 20_000 });

  // Best-effort: highlight groups that contribute at least one effective permission.
  const contributing = useMemo(() => {
    const names = new Set<string>();
    if (eff?.sources) for (const s of Object.values(eff.sources)) if (s.startsWith('group:')) names.add(s.slice(6));
    return names;
  }, [eff]);

  if (isLoading) return <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="animate-spin" size={16} /> Loading groups…</div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
        <Info size={16} className="mt-0.5 shrink-0 text-gray-400" />
        <span>Group membership is managed in <Link href="/admin" className="text-brand-600 hover:underline font-medium">Admin → Groups</Link>. Groups highlighted below currently grant this user one or more permissions.</span>
      </div>
      {groups.length === 0 && <p className="text-sm text-gray-400">No permission groups defined.</p>}
      <div className="space-y-2">
        {groups.map(g => {
          const active = contributing.has(g.name);
          return (
            <div key={g.id} className={clsx('flex items-center justify-between rounded-xl border p-4', active ? 'border-purple-200 bg-purple-50/40' : 'border-gray-200 bg-white')}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{g.name}</p>
                  {active && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Member</span>}
                </div>
                {g.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{g.description}</p>}
              </div>
              <div className="flex gap-3 text-xs text-gray-500 shrink-0">
                <span>{g.memberCount} members</span>
                <span>{g.permissionIds.length} perms</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Overrides (explicit Allow / Deny) ────────────────────────────────────────
type Override = { permissionId: string; effect: 'ALLOW' | 'DENY' };

function OverridesTab({ userId, canManage }: { userId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { data: perms = [], isLoading } = useQuery({ queryKey: ['permissions'], queryFn: () => api.permissions.list(), staleTime: 60_000 });
  // Preload the user's EXISTING overrides so Save (replace-semantics) doesn't wipe them.
  const { data: existing } = useQuery({ queryKey: ['overrides', userId], queryFn: () => api.users.overrides(userId), staleTime: 10_000 });

  const [overrides, setOverrides] = useState<Override[]>([]);
  const seeded = useRef(false);
  useEffect(() => {
    if (existing && !seeded.current) {
      setOverrides(existing.map(o => ({ permissionId: o.permissionId, effect: o.effect as 'ALLOW' | 'DENY' })));
      seeded.current = true;
    }
  }, [existing]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const permById = useMemo(() => new Map(perms.map(p => [p.id, p])), [perms]);

  function setEffect(permissionId: string, effect: 'ALLOW' | 'DENY') {
    setOverrides(prev => prev.map(o => o.permissionId === permissionId ? { ...o, effect } : o));
    setSaved(false);
  }
  function remove(permissionId: string) {
    setOverrides(prev => prev.filter(o => o.permissionId !== permissionId));
    setSaved(false);
  }
  function add(p: PermissionDef) {
    setOverrides(prev => prev.some(o => o.permissionId === p.id) ? prev : [...prev, { permissionId: p.id, effect: 'ALLOW' }]);
    setPicking(false);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    try {
      await api.users.setOverrides(userId, overrides.map(o => ({ permissionId: o.permissionId, effect: o.effect })));
      qc.invalidateQueries({ queryKey: ['eff', userId] });
      qc.invalidateQueries({ queryKey: ['overrides', userId] });
      qc.invalidateQueries({ queryKey: ['effective-permissions'] }); // M34: refresh the live gate/sidebar
      setSaved(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save overrides');
    } finally { setBusy(false); }
  }

  if (isLoading) return <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="animate-spin" size={16} /> Loading permission catalog…</div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
        <span>A <b className="text-red-600">DENY</b> override beats every grant — it blocks the permission even if a role or group allows it. An <b className="text-green-700">ALLOW</b> override grants the permission directly, even when no role does. Saving replaces this user&apos;s full override set.</span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{overrides.length} override{overrides.length === 1 ? '' : 's'} staged</p>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPicking(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              <Plus size={14} /> Add override
            </button>
            <button disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              <Check size={14} /> {busy ? 'Saving…' : 'Save overrides'}
            </button>
          </div>
        )}
      </div>

      {saved && <p className="text-xs text-green-600 mb-3">Overrides saved. Effective permissions updated.</p>}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {overrides.length === 0 && <p className="text-sm text-gray-400 p-4">No overrides. Add one to explicitly allow or deny a specific permission for this user.</p>}
        {overrides.map(o => {
          const p = permById.get(o.permissionId);
          return (
            <div key={o.permissionId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <code className="text-xs text-gray-700">{p?.code ?? o.permissionId}</code>
                {p?.name && <span className="ml-2 text-xs text-gray-400">{p.name}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                  <button onClick={() => setEffect(o.permissionId, 'ALLOW')} className={clsx('px-2.5 py-1', o.effect === 'ALLOW' ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-50')}>Allow</button>
                  <button onClick={() => setEffect(o.permissionId, 'DENY')} className={clsx('px-2.5 py-1 border-l border-gray-200', o.effect === 'DENY' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50')}>Deny</button>
                </div>
                <button onClick={() => remove(o.permissionId)} className="text-gray-300 hover:text-red-500"><X size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {picking && <PermissionPicker perms={perms} excludeIds={new Set(overrides.map(o => o.permissionId))} onPick={add} onClose={() => setPicking(false)} />}
    </div>
  );
}

function PermissionPicker({ perms, excludeIds, onPick, onClose }: { perms: PermissionDef[]; excludeIds: Set<string>; onPick: (p: PermissionDef) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    return perms.filter(p => !excludeIds.has(p.id) && (p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)));
  }, [perms, excludeIds, q]);
  return (
    <Modal title="Add override" onClose={onClose}>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search permissions…" className={clsx(inputCls, 'pl-8')} />
      </div>
      <div className="space-y-0.5 max-h-72 overflow-y-auto">
        {filtered.length === 0 && <p className="text-sm text-gray-400 py-2">No matching permissions.</p>}
        {filtered.map(p => (
          <button key={p.id} onClick={() => onPick(p)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 flex items-center justify-between gap-2">
            <code className="text-xs text-gray-700">{p.code}</code>
            <span className="text-xs text-gray-400 truncate">{p.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ── Activity (Access Advisor-lite) ───────────────────────────────────────────
function ActivityTab({ userId, orgId }: { userId: string; orgId: string }) {
  const { data: activity = [], isLoading: aLoading } = useQuery({
    queryKey: ['activity', 'User', userId],
    queryFn: () => api.activity.list({ entityType: 'User', entityId: userId, limit: 50 }),
    staleTime: 20_000,
  });
  const { data: audit, isLoading: auLoading } = useQuery({
    queryKey: ['audit', orgId, userId],
    queryFn: () => api.auditLogs.list({ organizationId: orgId, userId, limit: 50 }),
    staleTime: 20_000,
  });

  type Row = { id: string; action: string; entity: string; who?: string; ts: string };
  const rows = useMemo<Row[]>(() => {
    const a: Row[] = activity.map(it => ({
      id: it.id,
      action: it.action,
      entity: `${it.entityType}${it.entityId ? ` · ${it.entityId.slice(0, 8)}` : ''}`,
      who: it.actor ? fullName(it.actor) : undefined,
      ts: it.createdAt,
    }));
    const auItems = audit?.items ?? [];
    const seen = new Set(a.map(r => r.id));
    const b: Row[] = auItems
      .filter(it => !seen.has(it.id))
      .map(it => ({
        id: it.id,
        action: it.action,
        entity: `${it.entityType}${it.entityId ? ` · ${it.entityId.slice(0, 8)}` : ''}`,
        who: it.user ? fullName(it.user) : undefined,
        ts: it.timestamp,
      }));
    return [...a, ...b].sort((x, y) => +new Date(y.ts) - +new Date(x.ts));
  }, [activity, audit]);

  if (aLoading || auLoading) return <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="animate-spin" size={16} /> Loading activity…</div>;

  if (rows.length === 0) return <p className="text-sm text-gray-400">No recent activity recorded for this user.</p>;

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-500 mb-3">Recent actions by or affecting this user.</p>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-2.5">When</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Entity</th>
              <th className="px-3 py-2.5">Actor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                <td className="px-3 py-2.5"><span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{r.action}</span></td>
                <td className="px-3 py-2.5 text-gray-600">{r.entity}</td>
                <td className="px-3 py-2.5 text-gray-500">{r.who ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
