import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import {
  CreateGroupDto, CreatePermissionDto, CreateRoleDto, SetMembersDto,
  SetPermissionsDto, UpdateGroupDto, UpdatePermissionDto, UpdateRoleDto,
} from './dto';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

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
    await this.mustRole(id);
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
    await this.mustRole(id);
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
