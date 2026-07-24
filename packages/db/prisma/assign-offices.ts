// Assign every member to an office/branch for the capacity board grouping.
// Gurgaon = the explicit list below; everyone else = Jaipur. Keyed by email, so it is
// idempotent and safe to run on both local and Contabo (the real roster).
//
//   DATABASE_URL=... npx ts-node packages/db/prisma/assign-offices.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The eight Gurgaon members (by login email). "Ankit Kumar Verma" = ankit.verma,
// "Vijay" = the one Vijay Mishra — both verified as the only match in the roster.
const GURGAON = [
  'anant.gupta@squarkip.com',
  'ankit.verma@squarkip.com',
  'rajesh.joshi@squarkip.com',
  'meetu.singh@squarkip.com',
  'nitin.goel@squarkip.com',
  'arjun.ghosh@squarkip.com',
  'vijay.mishra@squarkip.com',
  'ketan.dagar@squarkip.com',
];

async function main() {
  // Warn about any Gurgaon email that doesn't match a real user (roster drift).
  const found = await prisma.user.findMany({
    where: { email: { in: GURGAON } },
    select: { email: true },
  });
  const foundEmails = new Set(found.map((u) => u.email));
  const missing = GURGAON.filter((e) => !foundEmails.has(e));
  if (missing.length) console.warn(`  WARNING: no user found for: ${missing.join(', ')}`);

  const gur = await prisma.user.updateMany({
    where: { email: { in: GURGAON } },
    data: { office: 'GURGAON' },
  });
  // Everyone who isn't in the Gurgaon list works from Jaipur.
  const jai = await prisma.user.updateMany({
    where: { email: { notIn: GURGAON } },
    data: { office: 'JAIPUR' },
  });

  console.log(`Offices set — GURGAON: ${gur.count}, JAIPUR: ${jai.count}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
