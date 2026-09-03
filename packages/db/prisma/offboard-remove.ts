// Offboarding — removes people from the system. WRITES. Read offboard-report.ts first.
//
// Three modes, because "remove them" means three different things and the difference is not
// recoverable once chosen:
//
//   --retire      (default, reversible)
//       The account is closed: signed out, cannot log in, gone from every list and picker.
//       Their work stays attached to their name, so past timesheets, attendance and reports
//       still add up. This is what almost everyone means by "remove someone".
//
//   --anonymise   (irreversible for the identity, keeps the work)
//       Retire, and replace the person's identity — name, email, phone, photo, and the whole
//       personal-details record (address, date of birth, next of kin) — with "Former Employee
//       N". Nothing on any screen names them again, while the HOURS remain, so no historical
//       total silently changes. This is the honest reading of "erase their existence".
//
//   --purge       (irreversible, DESTROYS WORK)
//       Delete the row. User has 47 relations declared onDelete: Cascade, so this also deletes
//       their timesheets, attendance, leave, expenses, comments and punches. It has happened
//       here before: one removal destroyed 83 timesheets, and the hours left the reports with
//       them. Every report covering a period they worked will change.
//
//       audit_log is onDelete: Restrict, so the database refuses the delete outright while any
//       audit history exists. Purging therefore deletes the audit trail too — the record of who
//       did what, which is the one thing an audit log exists to survive. Requires
//       --i-understand-this-destroys-their-work on top of --purge.
//
// TAKE A BACKUP FIRST. ./scripts/backup.sh
//
//   DATABASE_URL=... npx ts-node packages/db/prisma/offboard-remove.ts --retire "Arjun Ghosh"
//   node packages/db/prisma/dist/offboard-remove.js --anonymise "Arjun Ghosh" "Nitin Goel"
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Mode = 'retire' | 'anonymise' | 'purge';

async function findPeople(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return prisma.user.findMany({
    where: { firstName: { equals: first, mode: 'insensitive' }, lastName: { equals: rest.join(' '), mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, email: true, status: true, deletedAt: true },
  });
}

/** Ends every session immediately: bumping securityVersion invalidates live access tokens. */
async function cutAccess(tx: any, id: string) {
  await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.user.update({
    where: { id },
    data: {
      status: 'INACTIVE',
      deletedAt: new Date(),
      passwordHash: null,
      mustResetPassword: false,
      securityVersion: { increment: 1 },
    },
  });
}

async function retire(id: string) {
  await prisma.$transaction(async tx => { await cutAccess(tx, id); });
}

async function anonymise(id: string, seq: number) {
  await prisma.$transaction(async tx => {
    await cutAccess(tx, id);
    // The personal-details record is the sensitive half — address, date of birth, next of kin.
    // Deleted outright rather than blanked: there is no reason to keep an empty shell of it.
    await tx.userProfile.deleteMany({ where: { userId: id } });
    await tx.user.update({
      where: { id },
      data: {
        firstName: 'Former',
        lastName: `Employee ${seq}`,
        // Unique, non-routable, and obviously not a real address to anyone reading the table.
        email: `former.employee.${seq}.${id.slice(-6)}@invalid.local`,
        phone: null, profilePhoto: null, employeeCode: null, designation: null,
        exitReason: 'Anonymised on offboarding',
      },
    });
  });
}

async function purge(id: string) {
  await prisma.$transaction(async tx => {
    // audit_log is Restrict: it blocks the delete, so it goes first — deliberately, and only
    // under the extra flag, because this is the record of what this person did.
    await tx.auditLog.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const mode: Mode = argv.includes('--purge') ? 'purge'
    : argv.includes('--anonymise') ? 'anonymise' : 'retire';
  const confirmed = argv.includes('--i-understand-this-destroys-their-work');
  const names = argv.filter(a => !a.startsWith('--'));

  if (!names.length) {
    console.error('Usage: offboard-remove [--retire|--anonymise|--purge] "First Last" …');
    process.exit(1);
  }
  if (mode === 'purge' && !confirmed) {
    console.error('REFUSING: --purge deletes their timesheets, attendance, leave, expenses and');
    console.error('audit history. Run offboard-report.ts to see the row counts, take a backup,');
    console.error('then re-run with --i-understand-this-destroys-their-work.');
    process.exit(1);
  }

  console.log(`mode: ${mode}\n`);
  let seq = Math.floor(Date.now() / 1000) % 100000; // stable-ish, unique per run
  for (const name of names) {
    const people = await findPeople(name);
    if (!people.length) { console.log(`${name}: NOT FOUND — skipped.`); continue; }
    if (people.length > 1) { console.log(`${name}: ${people.length} accounts match — REFUSING, resolve by hand.`); continue; }
    const p = people[0];
    if (mode === 'retire') { await retire(p.id); console.log(`${name} <${p.email}>: retired — signed out, hidden, history intact.`); }
    else if (mode === 'anonymise') { await anonymise(p.id, seq); console.log(`${name} <${p.email}>: anonymised as "Former Employee ${seq}" — hours kept.`); seq++; }
    else { await purge(p.id); console.log(`${name} <${p.email}>: PURGED — row and all cascading records deleted.`); }
  }
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
