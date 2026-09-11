'use client';

/**
 * Performance — two KPIs, and nothing else on the front of the page.
 *
 * The module used to be a second task list with a score attached: a backlog, an activity volume,
 * an issue-severity pie, a leaderboard, and a full copy of the signed-in person's tasks. It
 * overlapped My Tasks so heavily that nobody could say what either page was for.
 *
 * It now answers two questions and only two. Does somebody's work cost what it was given
 * (KPI 1), and can they be relied on to land on the date and inside the budget, again and again
 * (KPI 2). Everything else — which projects, which tasks, which managers — is layered underneath
 * as the detail behind those two figures.
 */

import { useMemo, useState } from 'react';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { UserKpiPanel } from '@/components/performance/UserKpiPanel';
import { OrgKpiView } from '@/components/performance/OrgKpiView';
import { CalendarPeriodPicker } from '@/components/performance/controls';
import { DEFAULT_PERIOD, describeWindow, periodWindow, type CalendarPeriodKey } from '@/lib/periods';
import { PageHeader, SegmentedControl } from '@/components/ui/Page';

export default function PerformancePage() {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  // The organisation tab is gated on the code the SERVER enforces on every one of its routes.
  // It used to be gated on analytics.view.organization, which is a different permission held by
  // a different set of roles — so the tab appeared for people the API would have refused.
  const canOrg = can('performance.view.organization');
  const [tab, setTab] = useState<'me' | 'org'>('me');
  // Opens on LAST week, not this one. A window ending today is always a part-week, and reporting
  // a part-week beside a whole one is the complaint this rework started from.
  const [periodKey, setPeriodKey] = useState<CalendarPeriodKey>(DEFAULT_PERIOD);
  // Recomputed only when the choice changes, so every panel on screen measures the same window
  // even if the clock passes midnight while the page is open.
  const period = useMemo(() => periodWindow(periodKey), [periodKey]);

  const tabs: { value: 'me' | 'org'; label: string }[] = [
    { value: 'me', label: 'My performance' },
    ...(canOrg ? [{ value: 'org' as const, label: 'Organisation' }] : []),
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Performance"
        subtitle="Two KPIs: time spent against time allocated, and delivering on the date and inside the budget."
        actions={<CalendarPeriodPicker value={periodKey} onChange={setPeriodKey} />}
        tabs={tabs.length > 1 ? <SegmentedControl value={tab} onChange={setTab} options={tabs} /> : undefined}
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {/* One quiet line that labels everything below without competing with it. It names the
            exact days, because "last week" means different things on a Monday and a Sunday. */}
        <p className="mb-5 text-[12px] leading-relaxed text-gray-400">
          Showing <span className="font-medium text-gray-600">{period.label.toLowerCase()}</span> — {describeWindow(period)},
          compared with the same length of time before it.
          {period.partial && ' This period has not finished, so every count in it is still rising.'}
          {' '}Ongoing and overdue work is not repeated here; it lives in My Tasks.
        </p>

        {tab === 'me' && currentUser && <UserKpiPanel userId={currentUser.id} period={period} self />}
        {tab === 'me' && !currentUser && <p className="text-[13px] text-gray-400">Loading…</p>}
        {tab === 'org' && canOrg && <OrgKpiView period={period} />}
      </div>
    </div>
  );
}
