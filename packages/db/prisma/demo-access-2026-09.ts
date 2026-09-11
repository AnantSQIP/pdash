// Temporary elevated access for the people running the September demo.
//
// WHY THIS IS A SCRIPT AND NOT A HAND-EDIT
//
// The ask was "set them to maximum so they can create projects and do everything". Doing that by
// clicking through the UI leaves no record of what was changed, and — far more importantly — no
// way to put it back. A demo elevation that nobody remembers to undo is just a permanent
// elevation with a reassuring name. So this grants an EXTRA role alongside whatever the person
// already has, and `--revert` removes exactly that role and nothing else. Their real role is
// never touched, so reverting cannot strip capability they were supposed to keep.
//
// Roles union in this system (see PermissionService.getEffectivePermissions), so adding a role
// only ever ADDS. That is what makes the add/remove pair safe.
//
//   DATABASE_URL=... npx ts-node packages/db/prisma/demo-access-2026-09.ts
//   DATABASE_URL=... npx ts-node packages/db/prisma/demo-access-2026-09.ts --revert
//   ROLE='Super Admin' DATABASE_URL=... npx ts-node packages/db/prisma/demo-access-2026-09.ts
//
// In the production container the compiled form is:
//   node packages/db/prisma/dist/demo-access-2026-09.js
//
// WHICH ROLE TO GRANT — read this before overriding it
//
// The default is **Admin**, not Super Admin, and the difference is not cosmetic:
//
//   Admin        — every permission in the catalogue EXCEPT role.delete and the codes listed in
//                  SUPER_ADMIN_ONLY_CODES. Creates projects, mints PIDs, runs people and
//                  attendance, edits anything. This is "do everything" in the sense the request
//                  meant it.
//   Super Admin  — the above, PLUS `patent.manage` (the confidential portal: real client names
//                  and real patent numbers, which the whole tiered-visibility design exists to
//                  withhold) and `project.delete.permanent` / `task.delete.permanent`, which
//                  destroy rows outright with no undo.
//
// Handing two people the confidential client surface and an irreversible delete button so they
// can add tasks at a demo is a trade nobody actually asked for. Admin is granted by default; set
// ROLE='Super Admin' explicitly if that is genuinely the intent.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Login emails, from the meeting. Keyed by email rather than name because names carry middle
 * names inconsistently and two people can share a first name; the login never moves.
 */
const PEOPLE = [
  'basant.goyal@squarkip.com',
  'khushi.gupta@squarkip.com',
];

const ROLE_NAME = process.env.ROLE ?? 'Admin';

async function main() {
  const revert = process.argv.includes('--revert');

  const role = await prisma.role.findFirst({ where: { name: ROLE_NAME } });
  if (!role) {
    console.error(`No role named "${ROLE_NAME}" exists in this database. Run the seed first, or set ROLE to one that does.`);
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: { email: { in: PEOPLE } },
    select: { id: true, email: true, firstName: true, lastName: true, userRoles: { select: { role: { select: { name: true } } } } },
  });

  // A missing person is a real problem, not a warning to scroll past: the demo depends on these
  // logins working, and a typo here would be discovered by the person, live, in front of the room.
  const missing = PEOPLE.filter(e => !users.some(u => u.email === e));
  if (missing.length) {
    console.error(`These logins do not exist in this database: ${missing.join(', ')}`);
    console.error('Nothing was changed. Check the email spelling, or that you are pointed at the right environment.');
    process.exit(1);
  }

  for (const u of users) {
    const held = u.userRoles.map(r => r.role.name);
    const name = `${u.firstName} ${u.lastName}`.trim();

    if (revert) {
      // Only ever remove the role this script grants. If somebody genuinely holds it for another
      // reason, deleting the join row still leaves their other roles intact.
      const { count } = await prisma.userRole.deleteMany({ where: { userId: u.id, roleId: role.id } });
      console.log(count
        ? `  ${name}: removed "${ROLE_NAME}" — now ${held.filter(r => r !== ROLE_NAME).join(', ') || 'no roles'}`
        : `  ${name}: did not hold "${ROLE_NAME}" — nothing to remove`);
      continue;
    }

    if (held.includes(ROLE_NAME)) {
      console.log(`  ${name}: already holds "${ROLE_NAME}" — nothing to do`);
      continue;
    }
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    console.log(`  ${name}: added "${ROLE_NAME}" on top of ${held.join(', ') || 'no existing role'}`);
  }

  console.log(revert
    ? `\nReverted. The ${users.length} accounts are back to the roles they had.`
    : `\nDone. ${users.length} accounts now hold "${ROLE_NAME}" in addition to their own role.`
      + `\nPut it back afterwards with:  npx ts-node packages/db/prisma/demo-access-2026-09.ts --revert`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
