// Offboarding — REPORT ONLY. Writes nothing.
//
// Answers one question before anybody deletes anyone: what exactly is attached to this person,
// and what would be destroyed if their row were removed?
//
// It matters here because User has 47 relations declared `onDelete: Cascade`. Deleting the row
// takes all of them with it — timesheets, attendance, leave, expenses, comments, punches. It has
// happened on this system once already: removing one person destroyed 83 timesheets, and the
// hours they had logged left the reports along with them.
//
// One relation is different: audit_log is `onDelete: Restrict`, so the database REFUSES to delete
// a user who has any audit history. That is deliberate — the audit log exists to record who did
// what, and a record that disappears when the person leaves is not an audit log. "Erase them
// completely" therefore means deleting their audit trail first, as a separate decision.
//
//   DATABASE_URL=... npx ts-node packages/db/prisma/offboard-report.ts "Arjun Ghosh" "Nitin Goel"
// or, in the production container:
//   node packages/db/prisma/dist/offboard-report.js "Arjun Ghosh" "Nitin Goel"
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Tables that vanish with the user. Label → counting function. */
const CASCADES: [string, (id: string) => Promise<number>][] = [
  ['timesheets',            id => prisma.timesheet.count({ where: { userId: id } })],
  ['attendance days',       id => prisma.attendance.count({ where: { userId: id } })],
  ['leave requests',        id => prisma.leaveRequest.count({ where: { userId: id } })],
  ['expenses',              id => prisma.expense.count({ where: { userId: id } })],
  ['task assignments',      id => prisma.taskAssignee.count({ where: { userId: id } })],
  ['project memberships',   id => prisma.projectMember.count({ where: { userId: id } })],
  ['comments',              id => prisma.comment.count({ where: { userId: id } })],
  ['activity entries',      id => prisma.activity.count({ where: { actorId: id } })],
  ['notifications',         id => prisma.notification.count({ where: { userId: id } })],
  ['role assignments',      id => prisma.userRole.count({ where: { userId: id } })],
  ['reporting lines',       id => prisma.userManager.count({ where: { userId: id } })],
  ['people reporting to them', id => prisma.userManager.count({ where: { managerId: id } })],
];

/** Rows the database will REFUSE to cascade — these block a delete outright. */
const BLOCKERS: [string, (id: string) => Promise<number>][] = [
  ['audit log entries', id => prisma.auditLog.count({ where: { userId: id } })],
];

async function main() {
  const names = process.argv.slice(2);
  if (!names.length) {
    console.error('Usage: offboard-report "First Last" ["First Last" …]');
    process.exit(1);
  }

  for (const name of names) {
    const [first, ...rest] = name.trim().split(/\s+/);
    const last = rest.join(' ');
    const people = await prisma.user.findMany({
      where: { firstName: { equals: first, mode: 'insensitive' }, lastName: { equals: last, mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true, email: true, status: true, deletedAt: true },
    });

    console.log(`\n${'='.repeat(72)}\n${name}`);
    if (!people.length) { console.log('  NOT FOUND — nothing to remove.'); continue; }
    if (people.length > 1) console.log(`  WARNING: ${people.length} accounts match this name.`);

    for (const p of people) {
      console.log(`  ${p.email}   status=${p.status}${p.deletedAt ? '  (already soft-deleted)' : ''}`);
      let destroyed = 0;
      for (const [label, count] of CASCADES) {
        const n = await count(p.id);
        destroyed += n;
        if (n) console.log(`    ${String(n).padStart(6)}  ${label}`);
      }
      console.log(`    ${String(destroyed).padStart(6)}  TOTAL rows destroyed by a hard delete`);
      for (const [label, count] of BLOCKERS) {
        const n = await count(p.id);
        if (n) console.log(`    ${String(n).padStart(6)}  ${label}  <-- BLOCKS the delete; erasing means destroying these too`);
      }
    }
  }
  console.log(`\n${'='.repeat(72)}`);
  console.log('Nothing was changed. This script only reads.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
