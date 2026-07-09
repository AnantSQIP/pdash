import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from './permission.service';
import { EVENTS } from '../../common/events/canonical-events';
import { getActorId } from '../../common/context/request-context';
import {
  CreateGroupDto, CreatePermissionDto, CreateRoleDto, SetMembersDto,
  SetPermissionsDto, UpdateGroupDto, UpdatePermissionDto, UpdateRoleDto,
} from './dto';

const SUPER_ADMIN_ROLE = 'Super Admin';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
  ) {}

  // ── anti-privilege-escalation helpers ───────────────────────────────────────
  // The RBAC setters below rewrite role/group permissions and membership from
  // caller-supplied ids. Without these checks a non-Super-Admin holding
  // role.update / group.update / group.manage_members could grant a role/group a
  // permission they do not themselves hold (e.g. role.delete), rename a role to
  // the reserved "Super Admin" (which the resolver treats as all-powerful), or
  // add themselves to a more-privileged group — i.e. escalate. Super Admins bypass.
  private async actorPerms() {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    return { actorId, perms: await this.permissions.getEffectivePermissions(actorId) };
  }

  /** A non-Super-Admin may only grant permission codes they themselves hold. */
  private async assertMayGrantPermissionIds(permissionIds: string[]) {
    const { perms } = await this.actorPerms();
    if (perms.isSuperAdmin || !permissionIds.length) return;
    const held = new Set(perms.codes);
    const target = await this.prisma.permission.findMany({ where: { id: { in: permissionIds } }, select: { code: true } });
    const exceeding = [...new Set(target.map(p => p.code).filter(c => !held.has(c)))];
    if (exceeding.length) {
      throw new ForbiddenException(`You cannot grant permissions you do not hold: ${exceeding.slice(0, 5).join(', ')}`);
    }
  }

  /** Only a Super Admin may create/rename to — or edit — the reserved Super Admin role. */
  private async assertMayMutateRole(current: { name: string } | null, nextName?: string) {
    const { perms } = await this.actorPerms();
    if (perms.isSuperAdmin) return;
    if (current?.name === SUPER_ADMIN_ROLE) {
      throw new ForbiddenException('Only a Super Admin may modify the Super Admin role.');
    }
    if (nextName === SUPER_ADMIN_ROLE) {
      throw new ForbiddenException('Only a Super Admin may assign the reserved name "Super Admin".');
    }
  }

  /** A non-Super-Admin may not manage membership of a group whose permissions exceed their own. */
  private async assertMayManageGroupMembers(groupId: string) {
    const { perms } = await this.actorPerms();
    if (perms.isSuperAdmin) return;
    const held = new Set(perms.codes);
    const gp = await this.prisma.permissionGroupPermission.findMany({ where: { groupId }, select: { permission: { select: { code: true } } } });
    const exceeding = [...new Set(gp.map(p => p.permission.code).filter(c => !held.has(c)))];
    if (exceeding.length) {
      throw new ForbiddenException(`You cannot manage membership of a group whose permissions exceed your own: ${exceeding.slice(0, 5).join(', ')}`);
    }
  }

  // ── Permission catalog ─────────────────────────────────────────────────────
  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async createPermission(dto: CreatePermissionDto) {
    const perm = await this.prisma.permission.create({ data: dto });
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'Permission', entityId: perm.id, metadata: { code: perm.code, op: 'create' } });
    return perm;
  }

  async updatePermission(id: string, dto: UpdatePermissionDto) {
    await this.mustPermission(id);
    const perm = await this.prisma.permission.update({ where: { id }, data: dto });
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'Permission', entityId: id, metadata: { op: 'update' } });
    return perm;
  }

  async deletePermission(id: string) {
    await this.mustPermission(id);
    await this.prisma.permission.delete({ where: { id } });
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'Permission', entityId: id, metadata: { op: 'delete' } });
    return { ok: true };
  }

  // ── Roles ──────────────────────────────────────────────────────────────────
  async listRoles(organizationId: string) {
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: { select: { permissionId: true, permission: { select: { code: true } } } },
        _count: { select: { userRoles: true } },
      },
    });
    return roles.map(r => ({
      id: r.id, name: r.name, description: r.description,
      memberCount: r._count.userRoles,
      permissionIds: r.rolePermissions.map(rp => rp.permissionId),
      permissionCodes: r.rolePermissions.map(rp => rp.permission.code),
    }));
  }

  async createRole(dto: CreateRoleDto) {
    await this.assertMayMutateRole(null, dto.name);
    await this.assertMayGrantPermissionIds(dto.permissionIds ?? []);
    const role = await this.prisma.role.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        description: dto.description,
        rolePermissions: dto.permissionIds?.length
          ? { create: dto.permissionIds.map(permissionId => ({ permissionId })) }
          : undefined,
      },
    });
    await this.events.emit({ action: EVENTS.ROLE_CREATED, entityType: 'Role', entityId: role.id, organizationId: dto.organizationId, metadata: { name: role.name } });
    return role;
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const current = await this.mustRole(id);
    await this.assertMayMutateRole(current, dto.name);
    const role = await this.prisma.role.update({ where: { id }, data: dto });
    await this.events.emit({ action: EVENTS.ROLE_UPDATED, entityType: 'Role', entityId: id, metadata: { name: role.name } });
    return role;
  }

  async deleteRole(id: string) {
    const role = await this.mustRole(id);
    await this.prisma.role.delete({ where: { id } });
    await this.events.emit({ action: EVENTS.ROLE_DELETED, entityType: 'Role', entityId: id, metadata: { name: role.name } });
    return { ok: true };
  }

  async setRolePermissions(id: string, dto: SetPermissionsDto) {
    const role = await this.mustRole(id);
    await this.assertMayMutateRole(role);
    await this.assertMayGrantPermissionIds(dto.permissionIds);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map(permissionId => ({ roleId: id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'Role', entityId: id, metadata: { op: 'set-permissions', count: dto.permissionIds.length } });
    return { ok: true, count: dto.permissionIds.length };
  }

  // ── Permission groups ───────────────────────────────────────────────────────
  async listGroups(organizationId: string) {
    const groups = await this.prisma.permissionGroup.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        permissionGroupPermissions: { select: { permissionId: true } },
        members: { select: { userId: true } },
        _count: { select: { members: true } },
      },
    });
    return groups.map(g => ({
      id: g.id, name: g.name, description: g.description, isSystemGroup: g.isSystemGroup,
      memberCount: g._count.members,
      memberIds: g.members.map(m => m.userId),
      permissionIds: g.permissionGroupPermissions.map(p => p.permissionId),
    }));
  }

  async createGroup(dto: CreateGroupDto) {
    const group = await this.prisma.permissionGroup.create({
      data: { organizationId: dto.organizationId, name: dto.name, description: dto.description },
    });
    await this.events.emit({ action: EVENTS.GROUP_CHANGED, entityType: 'PermissionGroup', entityId: group.id, organizationId: dto.organizationId, metadata: { op: 'create', name: group.name } });
    return group;
  }

  async updateGroup(id: string, dto: UpdateGroupDto) {
    await this.mustGroup(id);
    const group = await this.prisma.permissionGroup.update({ where: { id }, data: dto });
    await this.events.emit({ action: EVENTS.GROUP_CHANGED, entityType: 'PermissionGroup', entityId: id, metadata: { op: 'update' } });
    return group;
  }

  async deleteGroup(id: string) {
    await this.mustGroup(id);
    await this.prisma.permissionGroup.delete({ where: { id } });
    await this.events.emit({ action: EVENTS.GROUP_CHANGED, entityType: 'PermissionGroup', entityId: id, metadata: { op: 'delete' } });
    return { ok: true };
  }

  async setGroupPermissions(id: string, dto: SetPermissionsDto) {
    await this.mustGroup(id);
    await this.assertMayManageGroupMembers(id); // may not edit a group already above your authority
    await this.assertMayGrantPermissionIds(dto.permissionIds);
    await this.prisma.$transaction([
      this.prisma.permissionGroupPermission.deleteMany({ where: { groupId: id } }),
      this.prisma.permissionGroupPermission.createMany({
        data: dto.permissionIds.map(permissionId => ({ groupId: id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
    await this.events.emit({ action: EVENTS.GROUP_CHANGED, entityType: 'PermissionGroup', entityId: id, metadata: { op: 'set-permissions', count: dto.permissionIds.length } });
    return { ok: true, count: dto.permissionIds.length };
  }

  async setGroupMembers(id: string, dto: SetMembersDto) {
    await this.mustGroup(id);
    await this.assertMayManageGroupMembers(id);
    await this.prisma.$transaction([
      this.prisma.permissionGroupMember.deleteMany({ where: { groupId: id } }),
      this.prisma.permissionGroupMember.createMany({
        data: dto.userIds.map(userId => ({ groupId: id, userId })),
        skipDuplicates: true,
      }),
    ]);
    await this.events.emit({ action: EVENTS.GROUP_CHANGED, entityType: 'PermissionGroup', entityId: id, metadata: { op: 'set-members', count: dto.userIds.length } });
    return { ok: true, count: dto.userIds.length };
  }

  // ── guards ──────────────────────────────────────────────────────────────────
  private async mustPermission(id: string) {
    const p = await this.prisma.permission.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`Permission ${id} not found`);
    return p;
  }
  private async mustRole(id: string) {
    const r = await this.prisma.role.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`Role ${id} not found`);
    return r;
  }
  private async mustGroup(id: string) {
    const g = await this.prisma.permissionGroup.findUnique({ where: { id } });
    if (!g) throw new NotFoundException(`Permission group ${id} not found`);
    return g;
  }
}
