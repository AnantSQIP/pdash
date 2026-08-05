/**
 * Correct office assignments.
 *
 * Office is no longer only a label on a profile: a project's office decides whether its PID
 * supports multiple rounds (Jaipur) or behaves as a single project (Gurgaon). A wrong office
 * therefore gives someone the wrong project structure, so the roster has to actually be right.
 *
 * Mohit Kalra was recorded as JAIPUR but works out of Gurgaon.
 *
 * Idempotent — safe to run repeatedly, and it reports what it changed rather than failing
 * silently if a name no longer matches.
 *
 *   npx tsx packages/db/scripts/fix-office-assignments.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** email → the office they actually sit in. */
const CORRECTIONS: { email: string; office: 'GURGAON' | 'JAIPUR' }[] = [
  { email: 'mohit@squarkip.com', office: 'GURGAON' },
];

async function main() {
  for (const { email, office } of CORRECTIONS) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true, office: true },
    });
    if (!user) {
      console.warn(`  SKIP  ${email} — no such user`);
      continue;
    }
    const name = `${user.firstName} ${user.lastName}`.trim();
    if (user.office === office) {
      console.log(`  OK    ${name} is already ${office}`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { office } });
    console.log(`  FIXED ${name}: ${user.office ?? '(none)'} → ${office}`);
  }

  const counts = await prisma.user.groupBy({
    by: ['office'],
    where: { status: 'ACTIVE', deletedAt: null },
    _count: { _all: true },
  });
  console.log('\nActive roster by office:');
  counts.forEach(c => console.log(`  ${c.office ?? '(none)'}: ${c._count._all}`));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
