// Reset the workspace to ONE project — delete every OTHER project and the data created for it
// (tasks, subtasks, timesheets, issues, comments, project members/lists/PID requests) plus the
// activity/audit/analytics log entries that reference those deleted items — and reset the PID
// serial. Everything else is left completely untouched.
//
// KEEPS (untouched): every user + login + PROFILE (no PII cleared, gate NOT re-armed), all RBAC
//   (roles, permissions, grants, groups, overrides), org structure, all HR/attendance/leave/
//   expense/discuss/calendar/patent/client data, AND the one kept project with ALL of its data.
//
// DELETES: all OTHER projects and their tasks/subtasks/timesheets/issues/comments/members/task-
//   lists/PID-requests/patent-links/documents/approvals, the log rows that reference those
//   deleted entities, and every PID reservation not attached to the kept project. Resets the
//   legacy PID sequence counter.
//
// The project to KEEP is matched by a case-insensitive substring of its title (KEEP_TITLE,
// default "Yahoo-EOUs"). EXACTLY ONE non-deleted project must match, or the script aborts.
//
// SAFETY: DRY-RUN by default — prints the full plan and deletes NOTHING. Pass --confirm to
//   actually delete. A non-local database additionally requires ALLOW_PROD_RESET=true, so a
//   stray --confirm pointed at production still can't wipe it. Idempotent.
//
//   Dry run (prod):  NODE_ENV=production ALLOW_PROD_RESET=true KEEP_TITLE="Yahoo-EOUs" \
//                    docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api \
//                    node packages/db/prisma/dist/reset-keep-one-project.js
//   Execute (prod):  ... same ... node packages/db/prisma/dist/reset-keep-one-project.js --confirm
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const confirmed = process.argv.includes('--confirm');
  const keepTitle = (process.env.KEEP_TITLE ?? 'Yahoo-EOUs').trim();

  const dbUrl = process.env.DATABASE_URL ?? '';
  const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  if (confirmed && !isLocalDb && process.env.ALLOW_PROD_RESET !== 'true') {
    console.error('Refusing to modify a non-local database. Set ALLOW_PROD_RESET=true to override.');
    process.exit(1);
  }

  const mode = confirmed ? 'EXECUTE (deleting)' : 'DRY-RUN (no changes)';
  console.log(`\n=== reset-keep-one-project · ${mode} · KEEP_TITLE="${keepTitle}" ===\n`);

  // ── Identify the ONE project to keep ────────────────────────────────────────────────
  const matches = await prisma.project.findMany({
    where: { deletedAt: null, title: { contains: keepTitle, mode: 'insensitive' } },
    select: { id: true, title: true, code: true },
  });
  if (matches.length === 0) {
    console.error(`No non-deleted project matches title ~ "${keepTitle}". Set KEEP_TITLE to the exact project.`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Ambiguous — ${matches.length} projects match "${keepTitle}":`);
    matches.forEach(m => console.error(`   - "${m.title}" (code ${m.code ?? '—'})`));
    console.error('Refusing to run. Make KEEP_TITLE unique.');
    process.exit(1);
  }
  const keep = matches[0];
  console.log(`KEEPING project: "${keep.title}"  (code ${keep.code ?? '— none'}, id ${keep.id})\n`);

  // ── Compute the delete sets ─────────────────────────────────────────────────────────
  const allProjects = await prisma.project.findMany({ select: { id: true, title: true } }); // incl. soft-deleted
  const delProjectIds = allProjects.filter(p => p.id !== keep.id).map(p => p.id);

  const keepTaskLinks = await prisma.projectTask.findMany({ where: { projectId: keep.id }, select: { taskId: true } });
  const keepTaskIds = new Set(keepTaskLinks.map(l => l.taskId));
  const allTasks = await prisma.task.findMany({ select: { id: true } });
  const delTaskIds = allTasks.map(t => t.id).filter(id => !keepTaskIds.has(id));

  const keepIssues = await prisma.issue.findMany({ where: { projectId: keep.id }, select: { id: true } });
  const keepIssueIds = new Set(keepIssues.map(i => i.id));
  const allIssues = await prisma.issue.findMany({ select: { id: true } });
  const delIssueIds = allIssues.map(i => i.id).filter(id => !keepIssueIds.has(id));

  // Keep only timesheets on the kept project (by projectId or one of its tasks). Delete the rest
  // (other projects' time, buffer/"Other"/issue entries — all test noise).
  const keepTs = await prisma.timesheet.findMany({
    where: { OR: [{ projectId: keep.id }, { taskId: { in: [...keepTaskIds] } }] }, select: { id: true },
  });
  const keepTsIds = new Set(keepTs.map(t => t.id));
  const allTs = await prisma.timesheet.findMany({ select: { id: true } });
  const delTsIds = allTs.map(t => t.id).filter(id => !keepTsIds.has(id));

  const delSubtasks = await prisma.subtask.findMany({ where: { taskId: { in: delTaskIds } }, select: { id: true } });
  const delSubtaskIds = delSubtasks.map(s => s.id);

  // Comments/logs are polymorphic (entityType + entityId). Anything pointing at a deleted
  // project/task/subtask/issue/timesheet is removed; Yahoo's + all non-project logs are kept.
  const deletedEntityIds = [...delProjectIds, ...delTaskIds, ...delSubtaskIds, ...delIssueIds, ...delTsIds];
  const delComments = await prisma.comment.findMany({ where: { entityId: { in: deletedEntityIds } }, select: { id: true } });
  const delCommentIds = delComments.map(c => c.id);

  console.log('WILL DELETE:');
  console.log(`  projects:            ${delProjectIds.length}  (of ${allProjects.length} total)`);
  console.log(`  tasks:               ${delTaskIds.length}`);
  console.log(`  subtasks:            ${delSubtaskIds.length}`);
  console.log(`  issues:              ${delIssueIds.length}`);
  console.log(`  timesheets:          ${delTsIds.length}`);
  console.log(`  comments:            ${delCommentIds.length}`);
  const logCount = async (m: any, key = 'entityId') => (deletedEntityIds.length ? m.count({ where: { [key]: { in: deletedEntityIds } } }) : 0);
  console.log(`  activity rows:       ${await logCount(prisma.activity)}`);
  console.log(`  audit-log rows:      ${await logCount(prisma.auditLog)}`);
  console.log(`  analytics-events:    ${await logCount(prisma.analyticsEvent)}`);
  const kept = await prisma.user.count();
  console.log(`\nWILL KEEP: ${kept} users (all, with profiles), all RBAC, and "${keep.title}" + its data.\n`);

  if (!confirmed) {
    console.log('DRY-RUN complete — nothing was changed. Re-run with --confirm to execute.\n');
    await prisma.$disconnect();
    return;
  }

  // ── Execute, child → parent (never violate an FK) ───────────────────────────────────
  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    const { count } = await fn();
    if (count) console.log(`  deleted ${count} ${label}`);
  };
  const inTasks = { taskId: { in: delTaskIds } };
  await del('taskDocument', () => prisma.taskDocument.deleteMany({ where: inTasks }));
  await del('checklist', () => prisma.checklist.deleteMany({ where: inTasks }));
  await del('taskDependency', () => prisma.taskDependency.deleteMany({ where: { OR: [{ predecessorTaskId: { in: delTaskIds } }, { successorTaskId: { in: delTaskIds } }] } }));
  await del('subtaskAssignee', () => prisma.subtaskAssignee.deleteMany({ where: { subtaskId: { in: delSubtaskIds } } }));
  await del('subtask', () => prisma.subtask.deleteMany({ where: inTasks }));
  await del('taskAssignee', () => prisma.taskAssignee.deleteMany({ where: inTasks }));
  await del('commentAttachment', () => prisma.commentAttachment.deleteMany({ where: { commentId: { in: delCommentIds } } }));
  await del('comment', () => prisma.comment.deleteMany({ where: { id: { in: delCommentIds } } }));
  await del('timesheet', () => prisma.timesheet.deleteMany({ where: { id: { in: delTsIds } } }));
  await del('issue', () => prisma.issue.deleteMany({ where: { id: { in: delIssueIds } } }));
  await del('projectTask', () => prisma.projectTask.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('task', () => prisma.task.deleteMany({ where: { id: { in: delTaskIds } } }));
  await del('taskList', () => prisma.taskList.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('pidRequest', () => prisma.pidRequest.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('projectPatent', () => prisma.projectPatent.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('projectDocument', () => prisma.projectDocument.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('projectDepartment', () => prisma.projectDepartment.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('projectTeam', () => prisma.projectTeam.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('projectMember', () => prisma.projectMember.deleteMany({ where: { projectId: { in: delProjectIds } } }));
  await del('project', () => prisma.project.deleteMany({ where: { id: { in: delProjectIds } } }));
  // Logs referencing any deleted entity.
  if (deletedEntityIds.length) {
    await del('activity', () => prisma.activity.deleteMany({ where: { entityId: { in: deletedEntityIds } } }));
    await del('auditLog', () => prisma.auditLog.deleteMany({ where: { entityId: { in: deletedEntityIds } } }));
    await del('analyticsEvent', () => prisma.analyticsEvent.deleteMany({ where: { entityId: { in: deletedEntityIds } } }));
  }
  // PID reset: drop every reservation not attached to the kept project, and clear the legacy
  // sequence counter so the allocator re-derives from what remains.
  await del('pidReservation', () => prisma.pidReservation.deleteMany({ where: { NOT: { projectId: keep.id } } }));
  try { await del('sequenceCounter', () => prisma.sequenceCounter.deleteMany()); } catch { /* table may not exist */ }

  const projLeft = await prisma.project.count({ where: { deletedAt: null } });
  console.log(`\nDone. ${projLeft} active project(s) remain; ${kept} users kept (profiles intact).`);
  console.log(`Kept project "${keep.title}" has code ${keep.code ?? '— none'}. Next generated PID will follow from that.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
