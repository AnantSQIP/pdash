import type { Prisma, PrismaClient } from '@pdash/db';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * CLIENTS-FLOW: a completed task group holds no open work. That is the rule that makes
 * "completed" mean something, and there are exactly two ways a task inside one can open again —
 * an ordinary status change and the timer's Reopen. Both call this, straight after the task row
 * is written, and the group goes back to ACTIVE with it.
 *
 * Re-opening the group rather than refusing the task: somebody reopening work has decided there
 * is more to do, and the group saying "complete" over an open task would be the lie.
 *
 * Returns the groups it re-opened, so the caller can say so in the activity feed.
 *
 * Both callers ask this only when the organisation runs the CLIENTS flow — task groups exist
 * nowhere else — so the flow is written here as the constant it is: a group this re-opens is
 * always a client's.
 */
export async function reactivateGroupsOfTask(db: Db, taskId: string): Promise<{ id: string; name: string; projectId: string | null }[]> {
  const links = await db.projectTask.findMany({
    where: { taskId, taskList: { status: 'COMPLETED', deletedAt: null }, project: { workspaceFlow: 'CLIENTS' } },
    select: { taskList: { select: { id: true, name: true, projectId: true } } },
  });
  const groups = links.map(l => l.taskList).filter((g): g is NonNullable<typeof g> => !!g);
  if (!groups.length) return [];
  await db.taskList.updateMany({
    where: { id: { in: groups.map(g => g.id) }, status: 'COMPLETED' },
    data: { status: 'ACTIVE', completedAt: null },
  });
  return groups;
}
