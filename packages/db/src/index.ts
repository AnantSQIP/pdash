// Re-export the generated Prisma client and types so the API depends on
// @pdash/db rather than reaching into @prisma/client directly.
export * from '@prisma/client';
export { PrismaClient } from '@prisma/client';
// Changing an organisation's workspace flow (PROJECTS ⇄ CLIENTS): the one implementation, shared
// by the API (Settings → Workspace flow) and the operator CLI (prisma/convert-workspace-flow.ts).
export * from './workspace-flow-conversion';
