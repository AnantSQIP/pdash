// One-time backfill: recompute every project's completionPercentage from its tasks,
// matching the live logic in TasksService.recomputeProjectProgress (a task is 100%
// when CLOSED, else its own completionPercentage; project = average across tasks).
// Run once after deploying the progress-sync fix:  npx ts-node packages/db/prisma/backfill-progress.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, title: true } });
  console.log(`Recomputing progress for ${projects.length} projects…`);
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
