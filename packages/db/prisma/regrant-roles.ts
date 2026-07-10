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

  for (const [name, preset] of Object.entries(ROLE_PRESETS)) {
    const codes = preset === '*' ? ALL_PERMISSION_CODES : (preset as string[]);
    const perms = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true } });
    const roles = await prisma.role.findMany({ where: { name } });
    for (const r of roles) {
      await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
      if (perms.length) {
        await prisma.rolePermission.createMany({
          data: perms.map(p => ({ roleId: r.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
    }
    console.log(`  ${name.padEnd(18)} ${roles.length} role(s) × ${perms.length} perms`);
  }
}

main()
  .then(() => console.log('Role permissions re-synced from catalog ✓'))
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
