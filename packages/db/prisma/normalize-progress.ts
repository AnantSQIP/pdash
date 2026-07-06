// Cleanup + normalize after the progress-sync fix:
//  1. restore tasks soft-deleted in the last 15 min (verification deletions),
//  2. reset completionPercentage to 0 for any task that is OPEN but still stored at
//     100% (stale state from the old reopen bug),
//  3. recompute every project's completionPercentage from its tasks.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const restored = await prisma.task.updateMany({ where: { deletedAt: { gte: cutoff } }, data: { deletedAt: null } });
  console.log(`Restored ${restored.count} recently-deleted task(s).`);

  // Open tasks wrongly stored at 100% → reset to 0.
  const openTasks = await prisma.task.findMany({
    where: { deletedAt: null, completionPercentage: { gte: 100 }, currentStatus: { type: { not: 'CLOSED' } } },
    select: { id: true },
  });
  if (openTasks.length) {
    await prisma.task.updateMany({ where: { id: { in: openTasks.map(t => t.id) } }, data: { completionPercentage: 0 } });
  }
  console.log(`Reset ${openTasks.length} open-but-100% task(s) to 0%.`);

  const projects = await prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, title: true } });
  for (const p of projects) {
    const tasks = await prisma.task.findMany({
      where: { deletedAt: null, projectTasks: { some: { projectId: p.id } } },
      select: { completionPercentage: true, currentStatus: { select: { type: true } } },
    });
    const eff = tasks.map(t => (t.currentStatus?.type === 'CLOSED' ? 100 : (t.completionPercentage ?? 0)));
    const pct = eff.length ? Math.round(eff.reduce((s, v) => s + v, 0) / eff.length) : 0;
    await prisma.project.update({ where: { id: p.id }, data: { completionPercentage: pct } });
    console.log(`  ${pct.toString().padStart(3)}%  ${p.title}  (${tasks.length} tasks)`);
  }
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
