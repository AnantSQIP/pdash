// One-off: seed the Phase-2 demo clients + confidential patents straight from the source sheet.
// (Step 1, a PID backfill, is retired: CIDs are issued on create and backfilled by migration.)
// Idempotent: skips clients/patents already present.
//   DATABASE_URL=... npx ts-node packages/db/prisma/seed-patents-demo.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function allocate(scope: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "sequence_counter" ("scope", "value") VALUES (${scope}, 1)
    ON CONFLICT ("scope") DO UPDATE SET "value" = "sequence_counter"."value" + 1 RETURNING "value"`;
  return Number(rows[0].value);
}

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, code: true } });
  if (!org) throw new Error('no organization');

  // 1) (Retired.) This used to backfill PIDs through the sequence counter. Every client is now given
  //    its CID when it is created, and the migration 20261020120000_cid_auto_mint_and_ledger backfilled
  //    the rest into the CID registry and ledger — a second issuer here could only disagree with it.

  // 2) Demo clients + patents (Malikie is verbatim from the sheet).
  const MALIKIE = [123, 1234, 2345, 3456, 4567, 5678, 6789, 7900, 9011, 10122, 11233, 12344,
    13455, 14566, 15677, 16788, 17899, 19010, 20121, 21232, 22343].map(n => `US${n}`);
  const specs = [
    { name: 'Malikie', code: 'MLK', numbers: MALIKIE },
    { name: 'WiLan',   code: 'WLN', numbers: ['US8100001', 'US8100002', 'US8100003'] },
    { name: 'Adoc',    code: 'ADC', numbers: ['US8200001', 'US8200002'] },
    { name: 'Mailike', code: 'MLE', numbers: ['US8300001', 'US8300002', 'US8300003', 'US8300004'] },
  ];
  const admin = await prisma.user.findFirst({ where: { organizationId: org.id }, select: { id: true } });
  const by = admin?.id ?? 'system';

  for (const spec of specs) {
    let client = await prisma.client.findFirst({ where: { organizationId: org.id, code: spec.code, deletedAt: null } });
    if (!client) client = await prisma.client.create({ data: { organizationId: org.id, name: spec.name, code: spec.code, createdBy: by } });
    const already = await prisma.patent.count({ where: { clientId: client.id, deletedAt: null } });
    if (already === 0) {
      for (const realNumber of spec.numbers) {
        const serial = await allocate(`pat:${client.id}`);
        await prisma.patent.create({
          data: { organizationId: org.id, clientId: client.id, serial, handle: `Pat_${spec.code}_${serial}`, realNumber, createdBy: by },
        });
      }
    }
    console.log(`Client ${spec.name.padEnd(8)} (${spec.code}) → ${already === 0 ? spec.numbers.length : already} patents`);
  }
}

main().then(() => console.log('Patent demo seed ✓')).catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
