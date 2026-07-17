// One-off, idempotent data fix (2026-07):
//   1. Activates any project still stuck in PLANNING (the approval gate was removed —
//      projects are now created ACTIVE, so nothing should sit in PLANNING).
//   2. Corrects every member's designation to the official org roster.
// Safe to re-run. Run on an existing DB (e.g. Contabo) with:
//   DATABASE_URL=... npx ts-node packages/db/prisma/update-designations-2026-07.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Official designations, keyed by the member's stored "First Last" name.
const DESIGNATIONS: Record<string, string> = {
  'Mohit Kalra': 'VP',
  'Yash Bhargava': 'AVP',
  'Shaveta Sharma': 'HR Specialist',
  'Basant Goyal': 'Senior Research Associate',
  'Neha Shukla': 'Senior Consultant',
  'Amritpal Kaur': 'Senior Research Associate',
  'Khushi Gupta': 'Senior Research Associate',
  'Meetu Singh': 'Consultant',
  'Divyanshu Saxena': 'Research Associate',
  'Nitin Goel': 'Manager (Delivery)',
  'Drishti Jain': 'Research Associate',
  'Ronak Khandelwal': 'Research Associate',
  'Ankit Verma': 'Product Development & Research Associate',
  'Ajay Sharma': 'Senior Associate Consultant',
  'Ritik Sharma': 'Senior BD Executive',
  'Sugandh Raghav': 'Research Associate',
  'Poorvi Gupta': 'Intern- Research Associate',
  'Arjun Ghosh': 'Research Associate',
  'Vandana Boora': 'Research Associate',
  'Ragini Kumari': 'Intern- Research Associate',
  'Anant Gupta': 'Intern- Product Development & Research',
  'Vijay Mishra': 'Consultant',
  'Rajesh Joshi': 'Intern- Research Associate',
  'Ketan Dagar': 'Senior Research Associate',
  'Aman Sharma': 'Intern- Research Associate',
  'Geetesh Rathore': 'Intern- Research Associate',
};

async function main() {
  const activated = await prisma.project.updateMany({
    where: { projectPhase: 'PLANNING', deletedAt: null },
    data: { projectPhase: 'ACTIVE' },
  });
  console.log(`Activated ${activated.count} project(s) that were stuck in PLANNING.`);

  let updated = 0;
  const missing: string[] = [];
  for (const [name, designation] of Object.entries(DESIGNATIONS)) {
    const [firstName, ...rest] = name.split(' ');
    const lastName = rest.join(' ');
    const res = await prisma.user.updateMany({
      where: { firstName, lastName, deletedAt: null },
      data: { designation },
    });
    if (res.count === 0) missing.push(name);
    else updated += res.count;
  }
  console.log(`Updated designations for ${updated} member(s).`);
  if (missing.length) console.warn(`No user matched: ${missing.join(', ')}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
