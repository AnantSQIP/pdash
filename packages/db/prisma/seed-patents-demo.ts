// One-off: (1) backfill PIDs for existing projects (creation order, per financial year),
// and (2) seed the Phase-2 demo clients + confidential patents straight from the source sheet.
// Idempotent: skips projects that already have a code, and clients/patents already present.
//   DATABASE_URL=... npx ts-node packages/db/prisma/seed-patents-demo.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// FY (Apr–Mar) computed in IST — matches apps/api common/financial-year.ts.
function fyLabel(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' }).formatToParts(instant);
  const y = Number(parts.find(p => p.type === 'year')!.value);
  const m = Number(parts.find(p => p.type === 'month')!.value);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}_${String((start + 1) % 100).padStart(2, '0')}`;
}
async function allocate(scope: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "sequence_counter" ("scope", "value") VALUES (${scope}, 1)
    ON CONFLICT ("scope") DO UPDATE SET "value" = "sequence_counter"."value" + 1 RETURNING "value"`;
  return Number(rows[0].value);
}
const pid = (org: string, fy: string, n: number) => `${org}_${fy}_${String(n).padStart(3, '0')}`;

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, code: true } });
  if (!org) throw new Error('no organization');

  // 1) Backfill PIDs — creation order, per-FY serial via the same allocator new creates use.
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, code: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, createdAt: true },
  });
  for (const p of projects) {
    const fy = fyLabel(p.createdAt);
    const n = await allocate(`pid:${org.id}:${fy}`);
    await prisma.project.update({ where: { id: p.id }, data: { code: pid(org.code, fy, n) } });
  }
  console.log(`Backfilled ${projects.length} project PID(s)`);

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
