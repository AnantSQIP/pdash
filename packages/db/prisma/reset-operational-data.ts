// Reset the workspace to a clean slate WITHOUT losing people.
//
// KEEPS: the organization, every user + their login credentials, all RBAC (roles,
// permissions, grants, groups, overrides), org structure (departments, teams, reporting
// lines) and configuration (workflows, leave types, holidays, tags, custom-field defs,
// integrations, dashboards, notification prefs).
//
// DELETES: every piece of operational / activity content — projects, tasks, subtasks,
// patents, clients, PID requests, timesheets, attendance, leave/comp-off/WFH/expense,
// notifications, discussions, calendar, approvals, comments, issues, announcements,
// policies, appraisals, rewards, analytics/audit/activity, documents — and RESETS every
// user's profile (clears PII + re-arms the first-login profile gate) and the PID / patent
// serial counters.
//
// SAFETY: refuses to run without `--yes`, and additionally requires ALLOW_PROD_RESET=true
// when NODE_ENV=production. Idempotent — safe to run more than once.
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
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_RESET !== 'true') {
    console.error('Refusing to reset in production. Set ALLOW_PROD_RESET=true to override.');
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
    // attendance / leave / expense / time
    ['timesheet', () => prisma.timesheet.deleteMany()],
    ['regularizationRequest', () => prisma.regularizationRequest.deleteMany()],
    ['attendance', () => prisma.attendance.deleteMany()],
    ['expense', () => prisma.expense.deleteMany()],
    ['compOffRequest', () => prisma.compOffRequest.deleteMany()],
    ['wfhRequest', () => prisma.wfhRequest.deleteMany()],
    ['leaveRequest', () => prisma.leaveRequest.deleteMany()],
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
    // approvals / comments
    ['approvalAction', () => prisma.approvalAction.deleteMany()],
    ['approval', () => prisma.approval.deleteMany()],
    ['commentAttachment', () => prisma.commentAttachment.deleteMany()],
    ['comment', () => prisma.comment.deleteMany()],
    // HR comms / appraisals / rewards
    ['policyAcknowledgement', () => prisma.policyAcknowledgement.deleteMany()],
    ['announcement', () => prisma.announcement.deleteMany()],
    ['appraisalGoal', () => prisma.appraisalGoal.deleteMany()],
    ['appraisal', () => prisma.appraisal.deleteMany()],
    ['appraisalCycle', () => prisma.appraisalCycle.deleteMany()],
    ['reward', () => prisma.reward.deleteMany()],
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
    ['projectTask', () => prisma.projectTask.deleteMany()],
    ['task', () => prisma.task.deleteMany()],
    ['taskList', () => prisma.taskList.deleteMany()],
    // project / client / patent / PID
    ['pidRequest', () => prisma.pidRequest.deleteMany()],
    ['projectPatent', () => prisma.projectPatent.deleteMany()],
    ['projectDocument', () => prisma.projectDocument.deleteMany()],
    ['projectMember', () => prisma.projectMember.deleteMany()],
    ['projectDepartment', () => prisma.projectDepartment.deleteMany()],
    ['projectTeam', () => prisma.projectTeam.deleteMany()],
    ['project', () => prisma.project.deleteMany()],
    ['patent', () => prisma.patent.deleteMany()],
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

  // Reset every profile: remove the collected PII and re-arm the first-login profile gate
  // (AppShell blocks the app until profileCompletedAt is set again).
  const profiles = await prisma.userProfile.deleteMany();
  const rearmed = await prisma.user.updateMany({ data: { profileCompletedAt: null } });
  console.log(`  cleared ${profiles.count} user profiles; re-armed the profile gate for ${rearmed.count} users`);

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
