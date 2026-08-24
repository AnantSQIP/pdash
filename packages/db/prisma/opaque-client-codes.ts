// Re-code clients whose code can be guessed from their name.
//
// WHY THIS EXISTS
//
// A patent handle is Pat_<clientCode>_<serial>, and the early codes were derived from the client's
// name: Malikie -> MLK, WiLan -> WLN, Adoc -> ADC. Anybody who works out one pairing can read it on
// every handle thereafter.
//
// That did not matter much while a real patent number needed a Super Admin and a passcode. It
// matters now: any colleague can resolve a handle to its number, which is correct — a patent number
// is public information — but it means a guessable code turns "Pat_MLK_1 -> US123" into "Malikie's
// patent is US123". The client association is the one fact this system exists to protect, and a
// mnemonic code leaks it without anybody having to breach anything.
//
// WHAT THIS CHANGES, AND WHAT IT DOES NOT
//
// Renaming a client code re-mints its handles and pushes the old ones into `formerHandles`. So:
//
//   * nothing breaks internally — every screen resolves the new handle;
//   * an ID quoted from an old email still resolves, because `formerHandles` is searched;
//   * documents you send from now on carry the new ID.
//
// That last point is the reason this is not run automatically. Patent IDs already printed on
// reports sent to clients will not match the ones the system issues next. That is a decision for
// whoever owns the client relationship, not for a migration.
//
// USAGE
//
//   DATABASE_URL=... npx ts-node packages/db/prisma/opaque-client-codes.ts           # dry run
//   DATABASE_URL=... npx ts-node packages/db/prisma/opaque-client-codes.ts --yes     # apply
//   ... --only MLK,WLN                                                              # a subset
//
// Without --yes it prints the plan and changes nothing.

import { PrismaClient } from '@prisma/client';
import { opaqueClientCode, suggestClientCode } from '../../../apps/api/src/common/client-code';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--yes');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > -1 && process.argv[onlyArg + 1]
  ? new Set(process.argv[onlyArg + 1].split(',').map(c => c.trim().toUpperCase()))
  : null;

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/**
 * Is this code readable off the client's name?
 *
 * Two ways it can be, and both count:
 *   • it matches what the mnemonic generator would have produced, or shares its opening — the
 *     direct derivation;
 *   • it contains a vowel, so it can be pronounced, remembered and repeated. A code that reads as
 *     a word is a code somebody carries out of the building in their head.
 */
function isGuessable(code: string, name: string | null): { risky: boolean; why: string } {
  if ([...code.toUpperCase()].some(ch => VOWELS.has(ch))) {
    return { risky: true, why: 'pronounceable' };
  }
  if (!name) return { risky: false, why: '' };
  const m = suggestClientCode(name, []);
  if (m && (m === code.toUpperCase() || code.toUpperCase().startsWith(m.slice(0, 2)))) {
    return { risky: true, why: `derives from "${name}"` };
  }
  return { risky: false, why: '' };
}

/** Rewrite one client's code and every handle built from it, in a single transaction. */
async function recode(clientId: string, oldCode: string, newCode: string) {
  await prisma.$transaction(async tx => {
    await tx.client.update({ where: { id: clientId }, data: { code: newCode } });
    const patents = await tx.patent.findMany({
      where: { clientId, deletedAt: null },
      select: { id: true, serial: true, handle: true, formerHandles: true },
    });
    for (const p of patents) {
      const next = `Pat_${newCode}_${String(p.serial).padStart(3, '0')}`;
      if (next === p.handle) continue;
      // Keep the ID we already issued. Renaming back and forth must not leave the live handle
      // sitting in its own history, nor stack duplicates — so rebuild from a set.
      const former = [...p.formerHandles.filter(h => h !== p.handle && h !== next), p.handle];
      await tx.patent.update({
        where: { id: p.id },
        data: { handle: next, formerHandles: [...new Set(former)].filter(h => h !== next) },
      });
    }
    // A large portfolio re-mints many rows; give the interactive transaction room so it does not
    // hit the 5s default and roll the whole rename back.
  }, { timeout: 120_000, maxWait: 10_000 });
}

async function main() {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: {
      id: true, code: true, name: true, organizationId: true,
      _count: { select: { patents: true } },
    },
    orderBy: { code: 'asc' },
  });

  const taken = new Set(clients.map(c => c.code.toUpperCase()));
  const plan: { id: string; from: string; to: string; name: string; why: string; patents: number }[] = [];

  for (const c of clients) {
    if (ONLY && !ONLY.has(c.code.toUpperCase())) continue;
    const { risky, why } = isGuessable(c.code, c.name);
    if (!risky) continue;
    const next = opaqueClientCode(taken);
    if (!next) {
      console.log(`  ! ${c.code} — could not generate a free opaque code, skipped`);
      continue;
    }
    taken.add(next);
    plan.push({ id: c.id, from: c.code, to: next, name: c.name ?? '(no name)', why, patents: c._count.patents });
  }

  if (!plan.length) {
    console.log('Every client code is already opaque. Nothing to do.');
    return;
  }

  console.log(APPLY ? 'APPLYING:' : 'DRY RUN — nothing will change. Re-run with --yes to apply.\n');
  console.log('  CODE  ->  NEW   CLIENT                     PATENTS  WHY');
  console.log('  ' + '-'.repeat(68));
  for (const p of plan) {
    console.log(`  ${p.from.padEnd(5)} ->  ${p.to.padEnd(5)} ${p.name.slice(0, 25).padEnd(25)} ${String(p.patents).padStart(7)}  ${p.why}`);
  }
  console.log('  ' + '-'.repeat(68));
  const handles = plan.reduce((n, p) => n + p.patents, 0);
  console.log(`  ${plan.length} client(s), ${handles} patent handle(s) would be re-minted.`);
  console.log('  Old handles stay resolvable via formerHandles — nothing breaks internally.');
  console.log('  Patent IDs already sent to clients will differ from the ones issued from now on.');

  if (!APPLY) return;

  for (const p of plan) {
    await recode(p.id, p.from, p.to);
    console.log(`  ✓ ${p.from} -> ${p.to}`);
  }
  console.log(`\nDone. ${plan.length} client(s) re-coded.`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
