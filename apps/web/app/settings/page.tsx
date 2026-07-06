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

// ── General Tab ────────────────────────────────────────────────────────────────
function GeneralTab() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [orgName, setOrgName] = useState('');
  useEffect(() => { if (org) setOrgName(org.name); }, [org]);
  const [orgTimezone, setOrgTimezone] = useState('UTC');
  const [showSaved, setShowSaved] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedColor, setSelectedColor] = useState('brand');

  const COLOR_SWATCHES = [
    { id: 'brand',   bg: 'bg-brand-600'   },
    { id: 'blue',    bg: 'bg-blue-600'    },
    { id: 'green',   bg: 'bg-green-600'   },
    { id: 'orange',  bg: 'bg-orange-500'  },
    { id: 'red',     bg: 'bg-red-500'     },
    { id: 'purple',  bg: 'bg-purple-600'  },
  ];

  async function handleSave() {
    if (!org || !orgName.trim() || saving) return;
    setSaving(true); setSaveErr('');
    try {
      await api.orgs.update(org.id, { name: orgName.trim() });
      await qc.invalidateQueries({ queryKey: ['orgs'] }); // reflect the new name app-wide
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not save changes');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <ProfilePhotoCard />
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
function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    project_updates: true,
    task_assign:     true,
    comments:        true,
    milestones:      true,
    approvals:       false,
    digest:          true,
  });

  const [inApp, setInApp] = useState({
    due_reminders:   true,
    mentions:        true,
    status_changes:  false,
    new_comments:    true,
  });

  const EMAIL_TOGGLES = [
    { key: 'project_updates', label: 'Project updates',     desc: 'When tasks or milestones change'     },
    { key: 'task_assign',     label: 'Task assignments',    desc: 'When tasks are assigned to you'      },
    { key: 'comments',        label: 'Comments & mentions', desc: 'When someone @mentions you'          },
    { key: 'milestones',      label: 'Milestone reminders', desc: '3 days before milestone due'         },
    { key: 'approvals',       label: 'Approval requests',   desc: 'When your approval is required'      },
    { key: 'digest',          label: 'Weekly digest',       desc: 'Summary email every Monday'          },
  ] as const;

  const INAPP_TOGGLES = [
    { key: 'due_reminders',  label: 'Due reminders'   },
    { key: 'mentions',       label: 'Mentions'        },
    { key: 'status_changes', label: 'Status changes'  },
    { key: 'new_comments',   label: 'New comments'    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Email Notifications</h2>
        <div>
          {EMAIL_TOGGLES.map(item => (
            <div key={item.key} className="flex justify-between items-center py-3 border-b last:border-0">
              <div>
                <div className="text-sm font-medium text-gray-900">{item.label}</div>
                <div className="text-xs text-gray-500">{item.desc}</div>
              </div>
              <Toggle
                on={prefs[item.key]}
                onToggle={() => setPrefs(p => ({ ...p, [item.key]: !p[item.key] }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">In-App Notifications</h2>
        <div>
          {INAPP_TOGGLES.map(item => (
            <div key={item.key} className="flex justify-between items-center py-3 border-b last:border-0">
              <div className="text-sm font-medium text-gray-900">{item.label}</div>
              <Toggle
                on={inApp[item.key]}
                onToggle={() => setInApp(p => ({ ...p, [item.key]: !p[item.key] }))}
              />
            </div>
          ))}
        </div>
      </div>

      <button className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
        Save preferences
      </button>
    </div>
  );
}

// ── Workflows Tab ──────────────────────────────────────────────────────────────
const WORKFLOWS = [
  { name: 'Default Workflow', type: 'GLOBAL',           statuses: ['Open', 'In Progress', 'In Review', 'Closed'], tasks: 24 },
  { name: 'Bug Tracker',      type: 'PROJECT_SPECIFIC', statuses: ['New', 'Assigned', 'Fixed', 'Verified', 'Closed'], tasks: 0 },
];

function WorkflowsTab() {
  const [automations, setAutomations] = useState([
    { label: 'Auto-close subtasks when parent task closes', on: true  },
    { label: 'Send reminder 2 days before due date',        on: true  },
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Workflow Templates</h2>
          <button
            onClick={() => alert('Create workflow coming soon')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Workflow
          </button>
        </div>

        <div className="space-y-3">
          {WORKFLOWS.map(wf => (
            <div key={wf.name} className="border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-900">{wf.name}</span>
                <span className={clsx(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  wf.type === 'GLOBAL' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600',
                )}>
                  {wf.type}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {wf.statuses.map(s => (
                  <span key={s} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                    {s}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{wf.tasks} tasks</span>
                <div className="flex gap-2">
                  <button className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 transition-colors">Edit</button>
                  <button className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 transition-colors">Duplicate</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Automation Rules</h2>
        <div className="space-y-3">
          {automations.map((auto, i) => (
            <div key={i} className="flex justify-between items-center">
              <span className="text-sm text-gray-700">{auto.label}</span>
              <Toggle
                on={auto.on}
                onToggle={() => setAutomations(prev => prev.map((a, j) => j === i ? { ...a, on: !a.on } : a))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Integrations Tab ───────────────────────────────────────────────────────────
type Integration = { name: string; logo: string; desc: string; connected: boolean };

const INITIAL_INTEGRATIONS: Integration[] = [
  { name: 'GitHub',       logo: '🐙', desc: 'Link commits and PRs to tasks',      connected: true  },
  { name: 'Slack',        logo: '💬', desc: 'Get notifications in Slack channels', connected: false },
  { name: 'Google Drive', logo: '📁', desc: 'Attach files from Google Drive',      connected: false },
  { name: 'Jira',         logo: '🔵', desc: 'Sync issues from Jira projects',      connected: false },
  { name: 'Figma',        logo: '🎨', desc: 'Preview Figma designs in tasks',      connected: false },
  { name: 'Zapier',       logo: '⚡', desc: 'Connect 5000+ apps via Zapier',       connected: false },
];

function IntegrationsTab() {
  const [intState, setIntState] = useState<Integration[]>(INITIAL_INTEGRATIONS);

  function toggle(name: string) {
    setIntState(prev => prev.map(i => i.name === name ? { ...i, connected: !i.connected } : i));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {intState.map(int => (
        <div key={int.name} className="bg-white rounded-xl border p-4">
          <div className="text-3xl mb-2">{int.logo}</div>
          <div className="text-lg font-semibold text-gray-900">{int.name}</div>
          <div className="text-sm text-gray-500 mt-1 mb-4">{int.desc}</div>
          <div className="flex items-center gap-2">
            {int.connected ? (
              <>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  Connected
                </span>
                <button
                  onClick={() => { toggle(int.name); alert(`${int.name} disconnected`); }}
                  className="text-sm border border-gray-300 text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => alert(`Connect ${int.name} coming soon`)}
                className="text-sm border border-brand-600 text-brand-600 px-3 py-1 rounded-lg hover:bg-brand-50 transition-colors"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Billing Tab ────────────────────────────────────────────────────────────────
const PLAN_FEATURES = [
  'Unlimited projects',
  'Advanced reporting',
  'Custom workflows',
  'Priority support',
  '50 GB storage',
  'API access',
  'Single sign-on',
];

const BILLING_HISTORY = [
  { date: 'Jun 2026', amount: '$232', status: 'Paid' },
  { date: 'May 2026', amount: '$232', status: 'Paid' },
  { date: 'Apr 2026', amount: '$203', status: 'Paid' },
];

function BillingTab() {
  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <span className="bg-purple-100 text-purple-700 text-sm font-semibold px-3 py-1 rounded-full inline-block mb-3">
          Professional Plan
        </span>
        <div className="mb-3">
          <span className="text-4xl font-bold text-gray-900">$29</span>
          <span className="text-lg text-gray-500"> / user / month</span>
        </div>
        <div className="mb-1 text-sm text-gray-600">8 active users</div>
        <div className="w-full bg-gray-100 rounded-full h-2 max-w-xs">
          <div className="bg-brand-600 h-2 rounded-full" style={{ width: '80%' }} />
        </div>
        <div className="text-xs text-gray-500 mt-1 mb-3">8 / 10 seats used</div>
        <div className="text-lg font-medium text-gray-900 mb-4">Total: $232 / month</div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => alert('Upgrade coming soon')}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            Upgrade to Enterprise
          </button>
          <button
            onClick={() => alert('Manage billing coming soon')}
            className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Manage Billing
          </button>
        </div>
      </div>

      {/* Plan Features */}
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Plan Features</h2>
        <ul className="space-y-2">
          {PLAN_FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Billing History</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left text-xs uppercase text-gray-500 font-medium px-3 py-2">Date</th>
              <th className="text-left text-xs uppercase text-gray-500 font-medium px-3 py-2">Amount</th>
              <th className="text-left text-xs uppercase text-gray-500 font-medium px-3 py-2">Status</th>
              <th className="text-left text-xs uppercase text-gray-500 font-medium px-3 py-2">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {BILLING_HISTORY.map(row => (
              <tr key={row.date}>
                <td className="px-3 py-3 text-gray-900">{row.date}</td>
                <td className="px-3 py-3 text-gray-900">{row.amount}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <button
                    onClick={() => alert('Download coming soon')}
                    className="text-gray-500 hover:text-gray-700 text-sm underline"
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
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
