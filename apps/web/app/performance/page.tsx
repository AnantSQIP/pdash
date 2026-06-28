'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { TrendingUp } from 'lucide-react';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { UserPerfPanel } from '@/components/performance/UserPerfPanel';
import { OrgView } from '@/components/performance/OrgView';
import { PeriodPicker } from '@/components/performance/controls';

export default function PerformancePage() {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const canOrg = can('analytics.view.organization');
  const [tab, setTab] = useState<'me' | 'org'>('me');
  const [days, setDays] = useState(30);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky header + tabs + period (stays pinned; the body below scrolls) */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp size={20} className="text-brand-600" /> Performance
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Productivity analytics, trends and contribution insights</p>
        <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab('me')}
              className={clsx('px-4 py-1.5 rounded-full text-sm font-medium', tab === 'me' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100')}
            >
              My Performance
            </button>
            {canOrg && (
              <button
                onClick={() => setTab('org')}
                className={clsx('px-4 py-1.5 rounded-full text-sm font-medium', tab === 'org' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100')}
              >
                Organization
              </button>
            )}
          </div>
          <PeriodPicker value={days} onChange={setDays} />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {tab === 'me' && currentUser && <UserPerfPanel userId={currentUser.id} days={days} />}
        {tab === 'me' && !currentUser && <div className="text-sm text-gray-400">Loading user…</div>}
        {tab === 'org' && canOrg && <OrgView days={days} />}
      </div>
    </div>
  );
}
