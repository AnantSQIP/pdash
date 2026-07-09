'use client';

import { useEffect, useState } from 'react';
import {
  Settings2,
  Users,
  Bell,
  GitBranch,
  Plug,
  CreditCard,
  UserPlus,
  ImageIcon,
  Plus,
  CheckCircle,
} from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';
import { Can } from '@/lib/permissions-context';
import { api, type UserSummary } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';
import { ProfilePhotoCard } from '@/components/ProfilePhotoCard';

// Only tabs backed by real functionality are shown. Notifications / Workflows /
// Integrations / Billing were unbacked mock UIs and are hidden until a real backend exists.
const TABS = [
  { id: 'general',       label: 'General',           icon: Settings2  },
  { id: 'members',       label: 'Members & Roles',   icon: Users      },
];

// ── Toggle Switch ──────────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      className={clsx(
        'w-11 h-6 rounded-full transition-colors cursor-pointer relative',
        on ? 'bg-brand-600' : 'bg-gray-200',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform transform',
          on ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </div>
  );
}

// ── Change Password (self-service) ───────────────────────────────────────────────
function ChangePasswordCard() {
  const { user, login } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputCls = 'w-full max-w-md px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setOk(false);
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    setBusy(true);
    try {
      await api.auth.changePassword(current, next);
      // Changing the password revokes the current session (securityVersion bump),
      // so silently re-establish it with the new password to stay signed in.
      await login(user?.email ?? '', next);
      setOk(true); setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setOk(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update password');
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-xl border p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
        <p className="text-xs text-gray-500 mt-0.5">Update the password for your own account.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} />
        <input type="password" autoComplete="new-password" placeholder="New password (min 8 characters)" value={next} onChange={e => setNext(e.target.value)} className={inputCls} />
        <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
        {err && <p className="text-xs text-red-600">{err}</p>}
        {ok && <p className="text-xs text-green-600 font-medium">✓ Password updated.</p>}
        <button type="submit" disabled={busy || !current || !next || !confirm} className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
          {busy ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

// ── General Tab ────────────────────────────────────────────────────────────────
function GeneralTab() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const COLOR_SWATCHES = [
    { id: 'brand',   bg: 'bg-brand-600',   hex: '#3d8de2' },
    { id: 'blue',    bg: 'bg-blue-600',    hex: '#2563eb' },
    { id: 'green',   bg: 'bg-green-600',   hex: '#16a34a' },
    { id: 'orange',  bg: 'bg-orange-500',  hex: '#f97316' },
    { id: 'red',     bg: 'bg-red-500',     hex: '#ef4444' },
    { id: 'purple',  bg: 'bg-purple-600',  hex: '#9333ea' },
  ];

  const [orgName, setOrgName] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('UTC');
  const [selectedColor, setSelectedColor] = useState('brand');
  // M25: load persisted Settings → General so they round-trip (no longer discarded).
  useEffect(() => {
    if (!org) return;
    setOrgName(org.name);
    if (org.timezone) setOrgTimezone(org.timezone);
    if (org.brandColor) setSelectedColor(COLOR_SWATCHES.find(s => s.hex === org.brandColor)?.id ?? 'brand');
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showSaved, setShowSaved] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!org || !orgName.trim() || saving) return;
    setSaving(true); setSaveErr('');
    try {
      const brandColor = COLOR_SWATCHES.find(s => s.id === selectedColor)?.hex ?? '#3d8de2';
      await api.orgs.update(org.id, { name: orgName.trim(), timezone: orgTimezone, brandColor });
      await qc.invalidateQueries({ queryKey: ['orgs'] }); // reflect changes app-wide
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not save changes');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <ProfilePhotoCard />
      <ChangePasswordCard />
      {/* Organization card */}
      <div className="bg-white rounded-xl border p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Organization</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
          <input
            type="text"
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            className="w-full max-w-md px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
          <input
            type="text"
            value={org?.code ?? ''}
            disabled
            className="w-full max-w-md px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={orgTimezone}
            onChange={e => setOrgTimezone(e.target.value)}
            className="w-full max-w-md px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Asia/Kolkata">Asia/Kolkata</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Active
          </span>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !orgName.trim()}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {showSaved && <span className="text-sm text-green-600 font-medium">✓ Saved!</span>}
          {saveErr && <span className="text-sm text-red-600">{saveErr}</span>}
        </div>
      </div>

      {/* Branding card */}
      <div className="bg-white rounded-xl border p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Branding</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
          <div
            onClick={() => alert('Upload coming soon')}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
          >
            <ImageIcon className="w-6 h-6 text-gray-400" />
            <span className="text-xs text-gray-400 mt-1">Upload</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Brand Color</label>
          <div className="flex gap-2">
            {COLOR_SWATCHES.map(swatch => (
              <button
                key={swatch.id}
                onClick={() => setSelectedColor(swatch.id)}
                className={clsx(
                  'w-7 h-7 rounded-full cursor-pointer',
                  swatch.bg,
                  selectedColor === swatch.id && 'ring-2 ring-offset-2 ring-gray-400',
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-red-700 mb-4">Danger Zone</h2>
        <button
          onClick={() => {
            if (window.confirm('Archive this org?')) alert('Archive coming soon');
          }}
          className="border border-red-300 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 text-sm"
        >
          Archive Organization
        </button>
      </div>
    </div>
  );
}

// ── Members Tab ────────────────────────────────────────────────────────────────
function MembersTab() {
  const { org } = useOrg();
  const { data: users = [], isLoading } = useQuery<UserSummary[]>({
    queryKey: ['users', org?.id],
    queryFn: () => api.users.list(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
  });

  // Real headcount per designation (replaces the old hardcoded role buckets).
  const byDesignation = users.reduce<Record<string, number>>((acc, u) => {
    const k = u.designation || 'Unassigned';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Team Members</h2>
            <p className="text-xs text-gray-500 mt-0.5">{isLoading ? 'Loading…' : `${users.length} members`} · roles &amp; access are managed in Admin</p>
          </div>
          <Can perm="user.create">
            <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <UserPlus className="w-4 h-4" />
              Add Member
            </Link>
          </Can>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400 py-6">Loading members…</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left text-xs uppercase text-gray-500 font-medium px-3 py-2">Member</th>
                <th className="text-left text-xs uppercase text-gray-500 font-medium px-3 py-2">Designation</th>
                <th className="text-left text-xs uppercase text-gray-500 font-medium px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={u} size={32} />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{fullName(u)}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600">{u.designation || '—'}</td>
                  <td className="px-3 py-3">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700',
                    )}>
                      {u.status === 'ACTIVE' ? 'Active' : u.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/admin/users/${u.id}`} className="text-xs border border-gray-300 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition-colors">Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Headcount by designation → full role/permission management lives in Admin */}
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Roles &amp; Permission Groups</h2>
          <Link href="/admin" className="text-xs text-brand-600 hover:underline">Manage in Admin →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(byDesignation).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
            <div key={name} className="border rounded-xl p-4">
              <div className="text-sm font-medium text-gray-900">{name}</div>
              <div className="text-xs text-gray-400 mt-2">{count} member{count !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Notifications Tab ──────────────────────────────────────────────────────────
// (Removed dead Settings tab stubs — Notifications/Workflows/Integrations/Billing (L25);
//  they were unbacked mock UIs, already hidden from the tab bar.)

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your organization preferences</p>
      </div>

      {/* Body */}
      <div className="flex flex-col lg:flex-row">
        {/* Left nav */}
        <aside className="w-full lg:w-56 shrink-0 bg-white border-b lg:border-b-0 lg:border-r lg:min-h-[calc(100vh-73px)] p-4">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0 lg:space-y-0.5">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer whitespace-nowrap shrink-0 lg:w-full rounded-lg transition-colors',
                    activeTab === tab.id
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 space-y-6">
          {activeTab === 'general'       && <GeneralTab />}
          {activeTab === 'members'       && <MembersTab />}
        </main>
      </div>
    </div>
  );
}
