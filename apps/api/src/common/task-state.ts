import type { Prisma } from '@pdash/db';

/**
 * A task that is still to do: it has no status yet, or its status is not a CLOSED one.
 *
 * The capacity board has always meant exactly this by "open". Task groups now ask the same
 * question — "may this group be marked complete?", "how much of this client is left?" — and a
 * second definition written from memory is how two screens come to disagree about one task.
 */
export const OPEN_TASK_WHERE: Prisma.TaskWhereInput = {
  OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
};
