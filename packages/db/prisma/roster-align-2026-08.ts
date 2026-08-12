// Roster alignment (2026-08) — the official list, applied to the database.
//
// Roles had drifted from designations: the seed gave Ankit the Manager role while his title
// says Research Associate, and nobody could tell from the app which was intended. This script
// makes the roster below the single source of truth for BOTH designation and role, so the
// question "why can this person do that?" always has the same answer.
//
// Idempotent — safe to run repeatedly. Run against any environment with:
//   DATABASE_URL=... npx ts-node packages/db/prisma/roster-align-2026-08.ts
// or, in the production container:
//   node packages/db/prisma/dist/roster-align-2026-08.js
//
// It does NOT touch permissions. Roles carry the permissions; run regrant-roles.ts for those.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Person = { designation: string; role: string };

/**
 * The official roster, keyed by login email (stable — names carry middle names inconsistently).
 *
 * ROLE CHOICES worth knowing, because they decide what each person can do:
 *   • Senior Associate Consultant → Consultant. Creates and edits tasks, runs task lists,
 *     requests projects. Cannot assign tasks or approve a project.
 *   • Senior BD Executive → Consultant. Business development sits outside the research ladder;
 *     Consultant is the nearest band that is not a plain contributor.
 *   • Product Development & Research Associate → Senior Research Associate. A senior individual
 *     contributor: creates/edits tasks, triages issues, exports reports. No delivery authority.
 *   • Interns and Research Associates → Employee. They log time, raise issues, comment, and
 *     move their own work along; they do not create or edit tasks.
 *
 * Change a role here and re-run — that is the whole interface.
 */
const ROSTER: Record<string, Person> = {
  'mohit@squarkip.com':               { designation: 'VP',                                     role: 'Super Admin' },
  'yash@squarkip.com':                { designation: 'AVP',                                    role: 'Super Admin' },
  'shavetasharma@squarkip.com':       { designation: 'HR Specialist',                          role: 'HR' },
  'nitin.goel@squarkip.com':          { designation: 'Manager (Delivery)',                     role: 'Manager' },
  'neha.shukla@squarkip.com':         { designation: 'Senior Consultant',                      role: 'Senior Consultant' },

  // Not plain employees — see the note above.
  'ajay.sharma@squarkip.com':         { designation: 'Senior Associate Consultant',            role: 'Consultant' },
  'ritik.sharma@squarkip.com':        { designation: 'Senior BD Executive',                    role: 'Consultant' },
  'ankit.verma@squarkip.com':         { designation: 'Product Development & Research Associate', role: 'Senior Research Associate' },

  'meetu.singh@squarkip.com':         { designation: 'Consultant',                             role: 'Consultant' },
  'vijay.mishra@squarkip.com':        { designation: 'Consultant',                             role: 'Consultant' },

  'basant.goyal@squarkip.com':        { designation: 'Senior Research Associate',              role: 'Senior Research Associate' },
  'amritpal.kaur@squarkip.com':       { designation: 'Senior Research Associate',              role: 'Senior Research Associate' },
  'khushi.gupta@squarkip.com':        { designation: 'Senior Research Associate',              role: 'Senior Research Associate' },
  'ketan.dagar@squarkip.com':         { designation: 'Senior Research Associate',              role: 'Senior Research Associate' },

  'divyanshu.saxena@squarkip.com':    { designation: 'Research Associate',                     role: 'Employee' },
  'drishti.jain@squarkip.com':        { designation: 'Research Associate',                     role: 'Employee' },
  'ronak.khandelwal@squarkip.com':    { designation: 'Research Associate',                     role: 'Employee' },
  'sugandh.raghav@squarkip.com':      { designation: 'Research Associate',                     role: 'Employee' },
  'arjun.ghosh@squarkip.com':         { designation: 'Research Associate',                     role: 'Employee' },
  'vandana.boora@squarkip.com':       { designation: 'Research Associate',                     role: 'Employee' },

  'poorvi.gupta@squarkip.com':        { designation: 'Intern- Research Associate',             role: 'Employee' },
  'ragini.kumari@squarkip.com':       { designation: 'Intern- Research Associate',             role: 'Employee' },
  'rajesh.joshi@squarkip.com':        { designation: 'Intern- Research Associate',             role: 'Employee' },
  'aman.sharma@squarkip.com':         { designation: 'Intern- Research Associate',             role: 'Employee' },
  'geetesh.rathore@squarkip.com':     { designation: 'Intern- Research Associate',             role: 'Employee' },
  'anant.gupta@squarkip.com':         { designation: 'Intern- Product Development & Research', role: 'Employee' },
};

/**
 * People who have left. DEACTIVATED, never deleted: 25 foreign keys cascade off `user`,
 * including timesheet, attendance and leave_request, so a delete takes their history with it —
 * which is how a previous offboarding destroyed 83 timesheets. INACTIVE blocks sign-in (the
 * auth middleware requires status ACTIVE) and keeps the record.
 */
const LEAVERS = ['tanisha.jain@squarkip.com'];

async function main() {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleByName = new Map(roles.map(r => [r.name, r.id]));

  const missingRoles = [...new Set(Object.values(ROSTER).map(p => p.role))].filter(r => !roleByName.has(r));
  if (missingRoles.length) throw new Error(`These roles do not exist in the database: ${missingRoles.join(', ')}`);

  let changed = 0;
  for (const [email, want] of Object.entries(ROSTER)) {
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, firstName: true, lastName: true, designation: true, status: true,
                userRoles: { select: { role: { select: { name: true } } } } },
    });
    if (!user) { console.log(`  SKIP  ${email} — not in this database`); continue; }

    const name = `${user.firstName} ${user.lastName ?? ''}`.trim();
    const currentRoles = user.userRoles.map(ur => ur.role.name);
    const roleOk = currentRoles.length === 1 && currentRoles[0] === want.role;
    const desigOk = user.designation === want.designation;
    if (roleOk && desigOk && user.status === 'ACTIVE') continue;

    if (!desigOk || user.status !== 'ACTIVE') {
      await prisma.user.update({ where: { id: user.id }, data: { designation: want.designation, status: 'ACTIVE' } });
    }
    if (!roleOk) {
      // Exactly one role per person — stacked roles were how HR ended up with delivery rights.
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleByName.get(want.role)! } });
    }
    changed++;
    console.log(`  SET   ${name.padEnd(20)} ${want.designation.padEnd(42)} ${currentRoles.join(',') || 'none'} -> ${want.role}`);
  }

  for (const email of LEAVERS) {
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true, firstName: true, lastName: true, status: true } });
    if (!user) { console.log(`  SKIP  ${email} — not in this database`); continue; }
    if (user.status === 'INACTIVE') continue;
    await prisma.$transaction([
      // Bumping securityVersion invalidates access tokens already issued, so they stop working
      // now rather than whenever the current one happens to expire.
      prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE', securityVersion: { increment: 1 } } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);
    changed++;
    console.log(`  LEFT  ${`${user.firstName} ${user.lastName ?? ''}`.trim()} -> INACTIVE (record kept, sessions revoked)`);
  }

  const active = await prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } });
  console.log(`\n${changed} change(s). ${active} active member(s).`);
  console.log('Roles carry permissions — run regrant-roles.ts if the permission matrix also changed.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
