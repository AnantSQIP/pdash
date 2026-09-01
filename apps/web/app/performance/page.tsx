'use client';

import { useState } from 'react';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { UserPerfPanel } from '@/components/performance/UserPerfPanel';
import { OrgView } from '@/components/performance/OrgView';
import { PeriodPicker } from '@/components/performance/controls';
import { PageHeader, SegmentedControl } from '@/components/ui/Page';

export default function PerformancePage() {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const canOrg = can('analytics.view.organization');
  const [tab, setTab] = useState<'me' | 'org'>('me');
  const [days, setDays] = useState(30);

  const tabs: { value: 'me' | 'org'; label: string }[] = [
    { value: 'me', label: 'My performance' },
    ...(canOrg ? [{ value: 'org' as const, label: 'Organisation' }] : []),
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Performance"
        subtitle="Productivity, trends and contribution across the period you choose."
        actions={<PeriodPicker value={days} onChange={setDays} />}
        tabs={tabs.length > 1 ? <SegmentedControl value={tab} onChange={setTab} options={tabs} /> : undefined}
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {/* The scope note used to be a full-width tinted callout with a border — a banner
            shouting a footnote. It is a footnote, so it is set as one: one quiet line that
            labels everything below without competing with any of it. */}
        <p className="mb-5 text-[12px] leading-relaxed text-gray-400">
          Figures cover the <span className="font-medium text-gray-600 tabular-nums">last {days} days</span> through today.
          Trend lines are per day; donut and bullet charts are totals across the window.
          Capacity assumes a 40-hour week, Mon–Fri, 9am–6pm IST.
        </p>

        {tab === 'me' && currentUser && <UserPerfPanel userId={currentUser.id} days={days} />}
        {tab === 'me' && !currentUser && <p className="text-[13px] text-gray-400">Loading…</p>}
        {tab === 'org' && canOrg && <OrgView days={days} />}
      </div>
    </div>
  );
}
