'use client';

// Role-adaptive home dashboard. Every section self-gates on the actor's effective
// permissions (returning null when not allowed), so the same page renders a tailored
// view per role — and surfaces admin panels for anyone granted admin access — without
// any per-role branching here. See components/home/sections.tsx.
//
// Layout: a balanced CSS-columns "masonry". Because the set of visible cards varies by
// role, a fixed 2-column (wide/narrow) grid left one side empty for some roles. The
// masonry auto-distributes whatever cards render so both/all columns stay balanced.
import {
  PersonaBanner, OrgStatsRow, MyPerformanceCard,
  MyTasksCard, MyProjectsCard, ProjectStatusCard, QuickStatsCard,
  OrgPerformanceCard, TeamAttendanceCard, LeaveApprovalsCard, PeopleOpsCard,
  AdminShortcutsCard, QuickAccessCard, ProjectApprovalsCard, TeamAvailabilityCard,
} from '@/components/home/sections';

export default function HomeDashboardPage() {
  return (
    <div className="min-h-full">
      {/* Full-width top zone — the banner now carries the Punch In/Out button, top-right. */}
      <PersonaBanner />
      <OrgStatsRow />
      <MyPerformanceCard />

      {/* Balanced masonry — cards flow to keep columns even regardless of which render. */}
      <div className="px-4 py-4 sm:px-6 sm:py-6">
        <div className="columns-1 lg:columns-2 2xl:columns-3 gap-4 sm:gap-6 [&>*]:mb-4 sm:[&>*]:mb-6 [&>*]:break-inside-avoid">
          <ProjectApprovalsCard />
          <TeamAvailabilityCard />
          <LeaveApprovalsCard />
          <MyTasksCard />
          <TeamAttendanceCard />
          <OrgPerformanceCard />
          <MyProjectsCard />
          <PeopleOpsCard />
          <ProjectStatusCard />
          <QuickStatsCard />
          <AdminShortcutsCard />
          <QuickAccessCard />
        </div>
      </div>
    </div>
  );
}
