// Re-export the generated Prisma client and types so the API depends on
// @pdash/db rather than reaching into @prisma/client directly.
export * from '@prisma/client';
export { PrismaClient } from '@prisma/client';
