// Set / reset the organization step-up "big change" passcode on an EXISTING database
// (the seed already sets it on fresh DBs). This is also the break-glass reset if the
// passcode is forgotten — it requires only DB access, no current passcode.
//
// The passcode is a SECOND factor required (on top of RBAC) for sensitive
// org/people/RBAC mutations. Stored only as an argon2id hash.
//
// SAFETY: rewrites live security state, so it only applies with an explicit --yes.
// Without --yes it prints a dry run and changes nothing.
//
// Local:
//   PDASH_PASSCODE='sqip@infinity' DATABASE_URL=... npx ts-node packages/db/prisma/set-passcode.ts --yes
// Production (inside the api container, after a deploy):
//   docker compose -f docker-compose.prod.yml --env-file .env.production \
//     exec -e PDASH_PASSCODE='sqip@infinity' api node packages/db/prisma/dist/set-passcode.js --yes
//
// Flags:
//   --yes           actually apply (required)
//   --org <code>    limit to one org by code (default: all orgs)

import { PrismaClient } from '@prisma/client';
import { hash as argonHash } from '@node-rs/argon2';

const prisma = new PrismaClient();
const MIN_LEN = 6;

async function main() {
  const apply = process.argv.includes('--yes');
  const orgFlagIdx = process.argv.indexOf('--org');
  const orgCode = orgFlagIdx >= 0 ? process.argv[orgFlagIdx + 1] : undefined;
  const passcode = process.env.PDASH_PASSCODE ?? 'sqip@infinity';

  if (passcode.length < MIN_LEN) {
    console.error(`Passcode must be at least ${MIN_LEN} characters (set PDASH_PASSCODE).`);
    process.exit(1);
  }

  const orgs = await prisma.organization.findMany({
    where: orgCode ? { code: orgCode } : {},
    select: { id: true, name: true, code: true, securityPasscodeHash: true },
  });
  if (orgs.length === 0) {
    console.log(orgCode ? `No org with code "${orgCode}".` : 'No organizations found.');
    return;
  }

  if (!apply) {
    console.log(`DRY RUN — would set the step-up passcode on ${orgs.length} org(s). Re-run with --yes to apply.\n`);
    for (const o of orgs) console.log(`  • ${o.name} (${o.code})  ${o.securityPasscodeHash ? '[already set — would overwrite]' : '[not set]'}`);
    console.log(`\n  Passcode source: ${process.env.PDASH_PASSCODE ? 'PDASH_PASSCODE env' : "default 'sqip@infinity'"}`);
    return;
  }

  const hash = await argonHash(passcode);
  for (const o of orgs) {
    await prisma.organization.update({ where: { id: o.id }, data: { securityPasscodeHash: hash } });
    console.log(`  ✓ ${o.name} (${o.code})`);
  }
  // Deliberately never print the passcode itself.
  console.log(`\nSet the step-up passcode on ${orgs.length} org(s) ✓  (source: ${process.env.PDASH_PASSCODE ? 'PDASH_PASSCODE env' : "default"})`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
