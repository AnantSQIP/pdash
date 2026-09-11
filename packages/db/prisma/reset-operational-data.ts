// Reset the workspace to a clean slate WITHOUT losing people.
//
// KEEPS: the organization, every user + their login credentials AND THEIR LIVE SESSIONS, all
// RBAC (roles, permissions, grants, groups, overrides), org structure (departments, teams,
// reporting lines) and configuration (workflows, leave types, holidays, optional-holiday
// definitions, tags, custom-field defs, project templates + task standards, technology domains,
// appraisal parameters, integrations, dashboards, automation rules, notification prefs).
//
// DELETES: every piece of operational / activity content — projects, tasks, subtasks, task work
// sessions + coverage, patents, clients + ledger overrides, PID requests + reservations,
// timesheets (and backdate requests), attendance, leave/comp-off/expense/WFH requests, deadline
// changes, notifications, discussions, calendar events + personal blocks, approvals, comments,
// issues, announcements, policies, appraisals + scores, rewards, feedback, BD deals,
// analytics/audit/activity, documents — and CLEARS every user's profile (the collected PII) and
// the PID / patent serial counters.
//
// EVERY model in schema.prisma is classified as one or the other, and tools/reset-coverage.spec.ts
// fails the build if a new model is neither. That test is the reason this script does not go
// stale: it had drifted to 66 of the schema's 117 models because nothing ever forced the
// question when a table was added.
//
// SAFETY: refuses to run without `--yes`, and additionally requires ALLOW_PROD_RESET=true
// when the database is not local. Idempotent — safe to run more than once.
//
//   Local :  DATABASE_URL=... npx ts-node packages/db/prisma/reset-operational-data.ts --yes
//   Prod  :  NODE_ENV=production ALLOW_PROD_RESET=true \
//            docker compose ... exec -T api node packages/db/prisma/dist/reset-operational-data.js --yes
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const confirmed = process.argv.includes('--yes');
  if (!confirmed) {
    console.error('Refusing to run without --yes (this deletes all activity data). Re-run with --yes.');
    process.exit(1);
  }
  // Prod guard keyed on the DB HOST (a positive signal), NOT on NODE_ENV — which is unreliable
  // on the server. Any non-local database (e.g. Contabo's "@postgres" host) requires an explicit
  // ALLOW_PROD_RESET=true, so a stray --yes pointed at production still can't wipe it.
  const dbUrl = process.env.DATABASE_URL ?? '';
  const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  if (!isLocalDb && process.env.ALLOW_PROD_RESET !== 'true') {
    console.error('Refusing to reset a non-local database. Set ALLOW_PROD_RESET=true to override.');
    process.exit(1);
  }

  const users = await prisma.user.count();
  const projects = await prisma.project.count();
  const timesheets = await prisma.timesheet.count();
  console.log(`Before: ${users} users (KEPT), ${projects} projects, ${timesheets} timesheets — wiping activity…`);

  // Deleted child → parent so no FK is ever violated. Users stay, so no user-cascade fires;
  // every operational table is cleared explicitly (some — Approval/Comment/AnalyticsEvent/
  // Document/Task-M2M — have no cascade parent, so they must be named here).
  const steps: [string, () => Promise<{ count: number }>][] = [
    // analytics / audit / activity / notifications
    ['userMetricDaily', () => prisma.userMetricDaily.deleteMany()],
    ['analyticsSnapshot', () => prisma.analyticsSnapshot.deleteMany()],
    ['analyticsEvent', () => prisma.analyticsEvent.deleteMany()],
    ['searchIndex', () => prisma.searchIndex.deleteMany()],
    ['activity', () => prisma.activity.deleteMany()],
    ['notification', () => prisma.notification.deleteMany()],
    ['presence', () => prisma.presence.deleteMany()],
    ['auditLog', () => prisma.auditLog.deleteMany()],
    // Every deadline this firm ever moved. Operational history, and the Performance module counts
    // it — leaving it behind would open the new workspace with a slipped-deadline record.
    ['deadlineChange', () => prisma.deadlineChange.deleteMany()],
    // The log of TIMER↔MANUAL switches. The CURRENT mode is Organization.timeTrackingMode, which
    // is configuration and stays; this is only the history of getting there.
    ['timeTrackingModeChange', () => prisma.timeTrackingModeChange.deleteMany()],
    // attendance / leave / expense / time
    ['taskWorkSession', () => prisma.taskWorkSession.deleteMany()],
    ['timesheet', () => prisma.timesheet.deleteMany()],
    ['timesheetBackdateRequest', () => prisma.timesheetBackdateRequest.deleteMany()],
    ['regularizationRequest', () => prisma.regularizationRequest.deleteMany()],
    ['attendance', () => prisma.attendance.deleteMany()],
    ['expense', () => prisma.expense.deleteMany()],
    ['compOffRequest', () => prisma.compOffRequest.deleteMany()],
    ['leaveRequest', () => prisma.leaveRequest.deleteMany()],
    ['wfhRequest', () => prisma.wfhRequest.deleteMany()],
    // A person's claim on an optional holiday is a request. The OptionalHoliday it points at is
    // the company calendar and stays.
    ['optionalHolidayElection', () => prisma.optionalHolidayElection.deleteMany()],
    // discuss / calendar / comms
    ['messageReaction', () => prisma.messageReaction.deleteMany()],
    ['messageMention', () => prisma.messageMention.deleteMany()],
    ['savedMessage', () => prisma.savedMessage.deleteMany()],
    ['messageAttachment', () => prisma.messageAttachment.deleteMany()],
    ['pollVote', () => prisma.pollVote.deleteMany()],
    ['pollOption', () => prisma.pollOption.deleteMany()],
    ['message', () => prisma.message.deleteMany()],
    ['poll', () => prisma.poll.deleteMany()],
    ['channelRead', () => prisma.channelRead.deleteMany()],
    ['channelMember', () => prisma.channelMember.deleteMany()],
    ['channel', () => prisma.channel.deleteMany()],
    ['mentionTagMember', () => prisma.mentionTagMember.deleteMany()],
    ['mentionTag', () => prisma.mentionTag.deleteMany()],
    ['calendarEventAttendee', () => prisma.calendarEventAttendee.deleteMany()],
    ['calendarEvent', () => prisma.calendarEvent.deleteMany()],
    // Personal "do not book me" blocks — one person's diary, not the company's configuration.
    ['calendarBlock', () => prisma.calendarBlock.deleteMany()],
    // approvals / comments
    ['approvalAction', () => prisma.approvalAction.deleteMany()],
    ['approval', () => prisma.approval.deleteMany()],
    ['commentAttachment', () => prisma.commentAttachment.deleteMany()],
    ['comment', () => prisma.comment.deleteMany()],
    // HR comms / appraisals / rewards
    ['policyAcknowledgement', () => prisma.policyAcknowledgement.deleteMany()],
    ['announcement', () => prisma.announcement.deleteMany()],
    ['appraisalGoal', () => prisma.appraisalGoal.deleteMany()],
    // Scores go, the PARAMETERS they score against stay: the parameter list is HR configuration
    // (name, weight, which designations it applies to), exactly like a custom-field definition.
    ['appraisalScore', () => prisma.appraisalScore.deleteMany()],
    ['appraisal', () => prisma.appraisal.deleteMany()],
    ['appraisalCycle', () => prisma.appraisalCycle.deleteMany()],
    ['reward', () => prisma.reward.deleteMany()],
    // Things people said about each other. Operational, and the most personal content here.
    ['feedback', () => prisma.feedback.deleteMany()],
    ['policy', () => prisma.policy.deleteMany()],
    // custom-field values (definitions kept)
    ['customFieldValue', () => prisma.customFieldValue.deleteMany()],
    // issues (before tasks/projects)
    ['issue', () => prisma.issue.deleteMany()],
    // task domain
    ['taskDocument', () => prisma.taskDocument.deleteMany()],
    ['checklist', () => prisma.checklist.deleteMany()],
    ['taskDependency', () => prisma.taskDependency.deleteMany()],
    ['subtaskAssignee', () => prisma.subtaskAssignee.deleteMany()],
    ['subtask', () => prisma.subtask.deleteMany()],
    ['taskAssignee', () => prisma.taskAssignee.deleteMany()],
    // Who stood in for whom while they were away — a record of work, not of structure.
    ['taskCoverage', () => prisma.taskCoverage.deleteMany()],
    // The team↔task join. The TEAM stays; which tasks it happened to hold does not.
    ['teamTask', () => prisma.teamTask.deleteMany()],
    ['projectTask', () => prisma.projectTask.deleteMany()],
    ['task', () => prisma.task.deleteMany()],
    ['taskList', () => prisma.taskList.deleteMany()],
    // project / client / patent / PID
    ['pidRequest', () => prisma.pidRequest.deleteMany()],
    // PIDs minted but not yet spent. Leaving these behind would make the new workspace's first
    // project collide with a reservation from the demo era.
    ['pidReservation', () => prisma.pidReservation.deleteMany()],
    ['projectPatent', () => prisma.projectPatent.deleteMany()],
    ['projectDocument', () => prisma.projectDocument.deleteMany()],
    ['projectMember', () => prisma.projectMember.deleteMany()],
    ['projectDepartment', () => prisma.projectDepartment.deleteMany()],
    ['projectTeam', () => prisma.projectTeam.deleteMany()],
    ['project', () => prisma.project.deleteMany()],
    // Demo patents (packages/db/prisma/seed-patents-demo.ts writes these, with their demo clients)
    // go with everything else: the patent register starts empty.
    ['patent', () => prisma.patent.deleteMany()],
    // BD pipeline. Deleted BEFORE clients — a deal points at the client it became.
    ['dealActivity', () => prisma.dealActivity.deleteMany()],
    ['deal', () => prisma.deal.deleteMany()],
    // A hand-stated billable figure for a client. It only means anything beside the client and
    // the hours it overrides, both of which are going.
    ['clientLedgerOverride', () => prisma.clientLedgerOverride.deleteMany()],
    ['client', () => prisma.client.deleteMany()],
    ['sequenceCounter', () => prisma.sequenceCounter.deleteMany()],
    // documents
    ['documentVersion', () => prisma.documentVersion.deleteMany()],
    ['documentBlob', () => prisma.documentBlob.deleteMany()],
    ['document', () => prisma.document.deleteMany()],
    ['folder', () => prisma.folder.deleteMany()],
  ];

  for (const [name, run] of steps) {
    const { count } = await run();
    if (count) console.log(`  deleted ${count} ${name}`);
  }

  // Clear every profile: the collected PII (address, date of birth, next of kin) is operational
  // content and a fresh workspace should not open holding it.
  //
  // It does NOT touch User.profileCompletedAt. This used to set it back to null to "re-arm the
  // first-login profile gate" — the screen that blocked the app until a person filled their
  // details in. That gate no longer exists, so re-arming it would set a flag nothing reads, and
  // the only thing that could come of that is a future reader believing there is still a gate.
  const profiles = await prisma.userProfile.deleteMany();
  console.log(`  cleared ${profiles.count} user profiles`);

  // DELIBERATELY NOT CLEARED: AuthToken and RefreshToken.
  //
  // Clearing them signs every single person out, mid-sentence, at whatever moment this runs. The
  // rule on this system is that a deploy must not cause a logout blip, and a workspace reset is
  // not a security event — the people are the one thing being kept. Their credentials, roles and
  // sessions all survive; only what they did does not. (If this is ever run BECAUSE of a
  // compromise, revoke sessions explicitly, separately, and on purpose.)

  const usersAfter = await prisma.user.count();
  const projectsAfter = await prisma.project.count();
  console.log(`Done. ${usersAfter} users kept, ${projectsAfter} projects remain. Fresh slate ready.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
