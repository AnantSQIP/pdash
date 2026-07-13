// Re-syncs each system role's permissions to match ROLE_PRESETS in
// permissions-catalog.ts, WITHOUT wiping any data (only RolePermission rows are
// rewritten). New catalog codes are upserted into the Permission table first, so
// running this after adding a module (e.g. document.*) works on an existing DB.
// Run after editing the catalog or a role preset:
//   DATABASE_URL=... npx ts-node packages/db/prisma/regrant-roles.ts
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PRESETS, ALL_PERMISSION_CODES } from './permissions-catalog';

const prisma = new PrismaClient();

async function main() {
  // Ensure every catalog code exists (additive — never deletes custom permissions).
  let added = 0;
  for (const p of PERMISSIONS) {
    const existing = await prisma.permission.findUnique({ where: { code: p.code } });
    if (!existing) {
      await prisma.permission.create({ data: { code: p.code, name: p.name, description: p.description } });
      added++;
    }
  }
  if (added) console.log(`  Added ${added} new permission code(s) from the catalog`);

  // Resolve every role's target permission set BEFORE touching anything.
  const plan: { name: string; roleIds: string[]; permIds: string[] }[] = [];
  for (const [name, preset] of Object.entries(ROLE_PRESETS)) {
    const codes = preset === '*' ? ALL_PERMISSION_CODES : (preset as string[]);
    const perms = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true } });
    const roles = await prisma.role.findMany({ where: { name }, select: { id: true } });
    plan.push({ name, roleIds: roles.map(r => r.id), permIds: perms.map(p => p.id) });
  }

  // Rewrite every role in ONE transaction. Each role's rows are deleted and re-created, so
  // outside a transaction there is a window where the role holds NO permissions — and since
  // permissions are read from the DB on every request (no cache), anyone using the app right
  // then is denied. Postgres readers keep seeing the old rows until this commits.
  await prisma.$transaction(async (tx) => {
    for (const { roleIds, permIds } of plan) {
      for (const roleId of roleIds) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (permIds.length) {
          await tx.rolePermission.createMany({
            data: permIds.map(permissionId => ({ roleId, permissionId })),
            skipDuplicates: true,
          });
        }
      }
    }
  });

  for (const { name, roleIds, permIds } of plan) {
    console.log(`  ${name.padEnd(18)} ${roleIds.length} role(s) × ${permIds.length} perms`);
  }
}

main()
  .then(() => console.log('Role permissions re-synced from catalog ✓'))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
