// One-off, idempotent roster fix (2026-07):
//   1. Realigns role ASSIGNMENTS to each member's designation — Senior Research Associates
//      onto the new "Senior Research Associate" role, and the Product-Dev intern back to
//      Employee (was Manager). Requires the role to exist first, so run regrant-roles.ts
//      BEFORE this (it creates + grants the new role from the catalog):
//        DATABASE_URL=... npx ts-node packages/db/prisma/regrant-roles.ts
//        DATABASE_URL=... npx ts-node packages/db/prisma/roster-fix-2026-07.ts
//   2. Clears the SEED-GENERATED activity history (timesheets, task assignments,
//      attendance, leave, comp-off, WFH, regularisations) for a set of members, so they
//      start from a clean slate. Their account, login, profile and project memberships are
//      KEPT. Task.actualHours is recomputed for any task whose timesheets were removed.
// Safe to re-run.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// email → the role that matches the member's designation.
const ROLE_ASSIGNMENTS: Record<string, string> = {
  'basant.goyal@squarkip.com': 'Senior Research Associate',
  'ketan.dagar@squarkip.com': 'Senior Research Associate',
  'khushi.gupta@squarkip.com': 'Senior Research Associate',
  'amritpal.kaur@squarkip.com': 'Senior Research Associate',
  'anant.gupta@squarkip.com': 'Employee',
};

// Members whose seed-generated activity history is cleared (account + memberships kept).
const CLEAR_HISTORY_EMAILS = [
  'meetu.singh@squarkip.com', 'anant.gupta@squarkip.com', 'rajesh.joshi@squarkip.com',
  'arjun.ghosh@squarkip.com', 'ketan.dagar@squarkip.com', 'sugandh.raghav@squarkip.com',
  'basant.goyal@squarkip.com', 'ajay.sharma@squarkip.com', 'aman.sharma@squarkip.com',
];

async function main() {
  // ── 1) Realign role assignments ────────────────────────────────────────────
  for (const [email, roleName] of Object.entries(ROLE_ASSIGNMENTS)) {
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
    const role = await prisma.role.findFirst({ where: { name: roleName }, select: { id: true } });
    if (!user) { console.warn(`  skip role: no user ${email}`); continue; }
    if (!role) { console.warn(`  skip role: role "${roleName}" missing — run regrant-roles.ts first`); continue; }
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: user.id } }),
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
    ]);
    console.log(`  role: ${email} → ${roleName}`);
  }

  // ── 2) Clear seed-generated activity history ─────────────────────────────────
  const users = await prisma.user.findMany({ where: { email: { in: CLEAR_HISTORY_EMAILS } }, select: { id: true, email: true } });
  const userIds = users.map(u => u.id);
  console.log(`\n  clearing history for ${users.length} member(s)`);

  // Capture tasks whose actualHours must be recomputed once their timesheets are gone.
  const affectedTs = await prisma.timesheet.findMany({
    where: { userId: { in: userIds }, taskId: { not: null } }, select: { taskId: true },
  });
  const affectedTaskIds = [...new Set(affectedTs.map(t => t.taskId).filter((x): x is string => !!x))];

  const [ts, ta, att, lv, co, wfh, reg] = await prisma.$transaction([
    prisma.timesheet.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.taskAssignee.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.attendance.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.leaveRequest.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.compOffRequest.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.wfhRequest.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.regularizationRequest.deleteMany({ where: { userId: { in: userIds } } }),
  ]);
  console.log(`  removed: timesheets=${ts.count} taskAssignees=${ta.count} attendance=${att.count} leaves=${lv.count} compoff=${co.count} wfh=${wfh.count} regularisations=${reg.count}`);

  // ── 3) Recompute Task.actualHours for tasks that lost timesheets ─────────────
  for (const taskId of affectedTaskIds) {
    const agg = await prisma.timesheet.aggregate({ where: { taskId, deletedAt: null }, _sum: { hoursLogged: true } });
    await prisma.task.update({ where: { id: taskId }, data: { actualHours: agg._sum.hoursLogged ?? 0 } });
  }
  console.log(`  recomputed actualHours for ${affectedTaskIds.length} task(s)`);

  // ── 4) Clear each member's PERSONAL activity/content (performance feed, notifications,
  //       discuss messages, comments, calendar events, raised issues, presence, votes,
  //       recognitions) so they start clean for real-data testing. SHARED entities
  //       (projects/tasks/channels others use) are left intact. ────────────────────────
  const msgs = await prisma.message.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const msgIds = msgs.map(m => m.id);
  await prisma.messageReaction.deleteMany({ where: { OR: [{ messageId: { in: msgIds } }, { userId: { in: userIds } }] } });
  await prisma.messageMention.deleteMany({ where: { OR: [{ messageId: { in: msgIds } }, { userId: { in: userIds } }] } });
  await prisma.savedMessage.deleteMany({ where: { OR: [{ messageId: { in: msgIds } }, { userId: { in: userIds } }] } });
  await prisma.messageAttachment.deleteMany({ where: { messageId: { in: msgIds } } });
  await prisma.message.deleteMany({ where: { id: { in: msgIds } } });

  const events = await prisma.calendarEvent.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } });
  const eventIds = events.map(e => e.id);
  await prisma.calendarEventAttendee.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { userId: { in: userIds } }] } });
  await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });

  const cmts = await prisma.comment.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const cmtIds = cmts.map(c => c.id);
  await prisma.commentAttachment.deleteMany({ where: { commentId: { in: cmtIds } } });
  await prisma.comment.deleteMany({ where: { id: { in: cmtIds } } });

  const raised = await prisma.issue.findMany({ where: { reportedBy: { in: userIds } }, select: { id: true } });
  const raisedIds = raised.map(i => i.id);
  await prisma.comment.deleteMany({ where: { entityType: 'ISSUE', entityId: { in: raisedIds } } });
  await prisma.issue.deleteMany({ where: { id: { in: raisedIds } } });
  await prisma.issue.updateMany({ where: { assigneeId: { in: userIds } }, data: { assigneeId: null } });

  const cleared = {
    analytics: (await prisma.analyticsEvent.deleteMany({ where: { userId: { in: userIds } } })).count,
    metrics: (await prisma.userMetricDaily.deleteMany({ where: { userId: { in: userIds } } })).count,
    activity: (await prisma.activity.deleteMany({ where: { actorId: { in: userIds } } })).count,
    notifications: (await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })).count,
    presence: (await prisma.presence.deleteMany({ where: { userId: { in: userIds } } })).count,
    pollVotes: (await prisma.pollVote.deleteMany({ where: { userId: { in: userIds } } })).count,
    rewards: (await prisma.reward.deleteMany({ where: { OR: [{ recipientId: { in: userIds } }, { givenById: { in: userIds } }] } })).count,
  };
  console.log(`  cleared activity: messages=${msgIds.length} events=${eventIds.length} comments=${cmtIds.length} issues=${raisedIds.length} analytics=${cleared.analytics} metrics=${cleared.metrics} activity=${cleared.activity} notifications=${cleared.notifications}`);
}

main()
  .then(() => console.log('\nRoster fix applied ✓'))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
