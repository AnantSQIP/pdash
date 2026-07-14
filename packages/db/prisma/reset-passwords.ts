// Reset EVERY user's password in the organization to a fresh, memorable
// "<FirstName><digits>" credential, and write them to SquarkIP-credentials.csv
// (git-ignored) for distribution. Each user can then change their own password
// from Settings → Change Password. Any active sessions are invalidated
// (securityVersion bump), exactly like a normal password change.
//
// SAFETY: this rewrites live passwords, so it only applies with an explicit --yes.
// Without --yes it prints a dry run (the users it WOULD reset) and changes nothing.
//
// Local:
//   DATABASE_URL=... npx ts-node packages/db/prisma/reset-passwords.ts --yes
// Production (inside the api container):
//   docker compose -f docker-compose.prod.yml --env-file .env.production \
//     exec api node packages/db/prisma/dist/reset-passwords.js --yes
//   docker compose -f docker-compose.prod.yml cp api:/app/SquarkIP-credentials.csv ./
//
// Flags:
//   --yes           actually apply the reset (required)
//   --force-reset   also require each user to set a new password on next login

import { PrismaClient } from '@prisma/client';
import { hash as argonHash } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const prisma = new PrismaClient();
const OUT_FILE = resolve(process.cwd(), 'SquarkIP-credentials.csv');

/**
 * "<Capitalised first name><random digits>" — always >= 9 chars so it also
 * satisfies the 8-char minimum a user faces when they later change it.
 * e.g. "Anant" -> "Anant4821", "Asha" -> "Asha83017".
 */
function makePassword(firstName: string | null | undefined): string {
  const clean = (firstName ?? '').replace(/[^A-Za-z]/g, '');
  const name = clean ? clean[0].toUpperCase() + clean.slice(1).toLowerCase() : 'User';
  const digitCount = Math.max(4, 9 - name.length);
  let digits = '';
  for (let i = 0; i < digitCount; i++) digits += randomInt(0, 10).toString();
  return `${name}${digits}`;
}

const csvCell = (v: string): string => `"${(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const apply = process.argv.includes('--yes');
  const forceReset = process.argv.includes('--force-reset');

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, designation: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  if (users.length === 0) {
    console.log('No active users found — nothing to do.');
    return;
  }

  if (!apply) {
    console.log(`DRY RUN — would reset ${users.length} passwords. Re-run with --yes to apply.\n`);
    for (const u of users) console.log(`  • ${u.firstName} ${u.lastName} <${u.email}>`);
    return;
  }

  const rows: string[] = ['Name,Email,Designation,Temporary Password'];
  let done = 0;
  for (const u of users) {
    const pw = makePassword(u.firstName);
    await prisma.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await argonHash(pw),
        passwordChangedAt: new Date(),
        mustResetPassword: forceReset,
        securityVersion: { increment: 1 }, // log out any active sessions
      },
    });
    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    rows.push([name, u.email, u.designation ?? '', pw].map(csvCell).join(','));
    done++;
  }

  // Leading BOM so Excel opens the UTF-8 CSV without mangling characters.
  writeFileSync(OUT_FILE, '﻿' + rows.join('\r\n') + '\r\n', 'utf8');

  // Deliberately DO NOT print the passwords — they must not leak into container logs.
  console.log(`✓ Reset ${done} password(s). Credentials written to ${OUT_FILE}`);
  console.log('  This file is git-ignored — distribute it securely, then delete it.');
  console.log(forceReset
    ? '  Users must set a new password on first login.'
    : '  Users can change their password anytime under Settings > Change Password.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
