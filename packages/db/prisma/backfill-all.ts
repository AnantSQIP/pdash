// One-time backfill so all derived aggregates match reality after the sync fixes:
//   • Project.completionPercentage   (avg of task effective %, CLOSED=100)
//   • Task.actualHours               (SUM of non-deleted timesheet hours)
// Run: npx ts-node packages/db/prisma/backfill-all.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function effPct(where: any) {
  const tasks = await prisma.task.findMany({ where, select: { completionPercentage: true, currentStatus: { select: { type: true } } } });
  const eff = tasks.map(t => (t.currentStatus?.type === 'CLOSED' ? 100 : (t.completionPercentage ?? 0)));
  return { count: tasks.length, pct: eff.length ? Math.round(eff.reduce((s, v) => s + v, 0) / eff.length) : 0 };
}

async function main() {
  const projects = await prisma.project.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const p of projects) {
    const { pct } = await effPct({ deletedAt: null, projectTasks: { some: { projectId: p.id } } });
    await prisma.project.update({ where: { id: p.id }, data: { completionPercentage: pct } });
  }

  const tasks = await prisma.task.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const t of tasks) {
    const agg = await prisma.timesheet.aggregate({ where: { taskId: t.id, deletedAt: null }, _sum: { hoursLogged: true } });
    await prisma.task.update({ where: { id: t.id }, data: { actualHours: agg._sum.hoursLogged ?? 0 } });
  }

  console.log(`Backfilled ${projects.length} projects, ${tasks.length} tasks (actualHours).`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
