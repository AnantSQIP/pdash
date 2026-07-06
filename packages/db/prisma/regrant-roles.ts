// Re-syncs each system role's permissions to match ROLE_PRESETS in
// permissions-catalog.ts, WITHOUT wiping any data (only RolePermission rows are
// rewritten). Run after editing a role preset:
//   DATABASE_URL=... npx ts-node packages/db/prisma/regrant-roles.ts
import { PrismaClient } from '@prisma/client';
import { ROLE_PRESETS, ALL_PERMISSION_CODES } from './permissions-catalog';

const prisma = new PrismaClient();

async function main() {
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
