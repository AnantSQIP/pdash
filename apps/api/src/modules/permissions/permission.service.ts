import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SUPER_ADMIN_ROLE = 'Super Admin';

export interface EffectivePermissions {
  userId: string;
  isSuperAdmin: boolean;
  codes: string[];
  /** code → where it was granted (role/group/direct/override) for the admin preview UI */
  sources: Record<string, string>;
}

/**
 * Resolves effective permissions per the Permission Matrix spec §6:
 *   DENY override → ALLOW override → direct user → group → role → default DENY.
 * Super Admin short-circuits to all permissions.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
        permissionGroupMembers: { include: { group: { include: { permissionGroupPermissions: { include: { permission: true } } } } } },
        userPermissions: { include: { permission: true } },
        permissionOverrides: { include: { permission: true } },
      },
    });

    if (!user) return { userId, isSuperAdmin: false, codes: [], sources: {} };

    const isSuperAdmin = user.userRoles.some(ur => ur.role.name === SUPER_ADMIN_ROLE);
    if (isSuperAdmin) {
      const all = await this.prisma.permission.findMany({ select: { code: true } });
      const sources: Record<string, string> = {};
      all.forEach(p => { sources[p.code] = 'super-admin'; });
      return { userId, isSuperAdmin: true, codes: all.map(p => p.code), sources };
    }

    const sources: Record<string, string> = {};
    const allow = new Set<string>();

    // role → group → direct (lower precedence first so higher overwrites the source label)
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) { allow.add(rp.permission.code); sources[rp.permission.code] = `role:${ur.role.name}`; }
    }
    for (const m of user.permissionGroupMembers) {
      for (const gp of m.group.permissionGroupPermissions) { allow.add(gp.permission.code); sources[gp.permission.code] = `group:${m.group.name}`; }
    }
    for (const up of user.userPermissions) { allow.add(up.permission.code); sources[up.permission.code] = 'direct'; }

    // overrides win
    for (const ov of user.permissionOverrides) {
      if (ov.effect === 'ALLOW') { allow.add(ov.permission.code); sources[ov.permission.code] = 'override:ALLOW'; }
    }
    for (const ov of user.permissionOverrides) {
      if (ov.effect === 'DENY') { allow.delete(ov.permission.code); delete sources[ov.permission.code]; }
    }

    return { userId, isSuperAdmin: false, codes: [...allow].sort(), sources };
  }

  /** True if the user is allowed the given permission code (any-of supported via check loop in the guard). */
  async check(userId: string, code: string): Promise<boolean> {
    const eff = await this.getEffectivePermissions(userId);
    if (eff.isSuperAdmin) return true;
    if (eff.codes.includes(code)) return true;
    // wildcard safety net (not seeded by default): '*' or 'module.*'
    if (eff.codes.includes('*')) return true;
    const moduleWildcard = `${code.split('.')[0]}.*`;
    return eff.codes.includes(moduleWildcard);
  }
}
