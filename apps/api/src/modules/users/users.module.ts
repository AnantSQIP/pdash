import {
  Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';

class CreateUserDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(1) @MaxLength(60) firstName!: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
  @IsString() @MinLength(3) @MaxLength(160) email!: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roleIds?: string[];
}

class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED']) status?: string;
}

class SetRolesDto {
  @IsArray() @IsString({ each: true }) roleIds!: string[];
}
class SetUserPermissionsDto {
  @IsArray() @IsString({ each: true }) permissionIds!: string[];
}
class OverrideItem {
  @IsString() permissionId!: string;
  @IsIn(['ALLOW', 'DENY']) effect!: string;
}
class SetUserOverridesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => OverrideItem) overrides!: OverrideItem[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  list(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, status: 'ACTIVE', deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true, organizationId: true, employeeCode: true, firstName: true, lastName: true,
        email: true, phone: true, designation: true, profilePhoto: true, joiningDate: true,
        status: true, createdAt: true,
      },
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
        departmentMemberships: { include: { department: true } },
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          organizationId: dto.organizationId,
          firstName: dto.firstName,
          lastName: dto.lastName ?? '',
          email: dto.email.trim().toLowerCase(),
          designation: dto.designation,
          phone: dto.phone,
          status: 'ACTIVE',
          userRoles: dto.roleIds?.length ? { create: dto.roleIds.map(roleId => ({ roleId })) } : undefined,
        },
      });
      await this.events.emit({
        action: EVENTS.USER_CREATED, entityType: 'User', entityId: user.id,
        organizationId: dto.organizationId, metadata: { email: user.email, roleIds: dto.roleIds ?? [] },
      });
      return user;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A user with this email already exists in the organization.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.get(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { firstName: dto.firstName, lastName: dto.lastName, designation: dto.designation, phone: dto.phone, status: dto.status },
    });
    await this.events.emit({ action: EVENTS.USER_UPDATED, entityType: 'User', entityId: id, metadata: { fields: Object.keys(dto) } });
    return user;
  }

  async setRoles(id: string, roleIds: string[]) {
    await this.get(id);
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({ data: roleIds.map(roleId => ({ userId: id, roleId })), skipDuplicates: true }),
    ]);
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'User', entityId: id, metadata: { op: 'set-roles', roleIds } });
    return { ok: true, count: roleIds.length };
  }

  async setPermissions(id: string, permissionIds: string[]) {
    await this.get(id);
    const grantedBy = getActorId() ?? 'system';
    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId: id } }),
      this.prisma.userPermission.createMany({
        data: permissionIds.map(permissionId => ({ userId: id, permissionId, grantedBy })),
        skipDuplicates: true,
      }),
    ]);
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'User', entityId: id, metadata: { op: 'set-direct-permissions', count: permissionIds.length } });
    return { ok: true, count: permissionIds.length };
  }

  async setOverrides(id: string, overrides: { permissionId: string; effect: string }[]) {
    await this.get(id);
    const createdBy = getActorId() ?? 'system';
    await this.prisma.$transaction([
      this.prisma.permissionOverride.deleteMany({ where: { userId: id } }),
      this.prisma.permissionOverride.createMany({
        data: overrides.map(o => ({ userId: id, permissionId: o.permissionId, effect: o.effect, createdBy })),
      }),
    ]);
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'User', entityId: id, metadata: { op: 'set-overrides', count: overrides.length } });
    return { ok: true, count: overrides.length };
  }
}

@Controller('users')
class UsersController {
  constructor(private readonly service: UsersService) {}

  // Read endpoints stay open — the app resolves the current user from the user list.
  @Get()
  list(@Query('organizationId') organizationId: string) { return this.service.list(organizationId); }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.get(id); }

  @Post() @RequirePermission('user.create')
  create(@Body() dto: CreateUserDto) { return this.service.create(dto); }

  @Patch(':id') @RequirePermission('user.update')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) { return this.service.update(id, dto); }

  @Put(':id/roles') @RequirePermission('user.manage_access')
  setRoles(@Param('id') id: string, @Body() dto: SetRolesDto) { return this.service.setRoles(id, dto.roleIds); }

  @Put(':id/permissions') @RequirePermission('user.manage_access')
  setPermissions(@Param('id') id: string, @Body() dto: SetUserPermissionsDto) { return this.service.setPermissions(id, dto.permissionIds); }

  @Put(':id/overrides') @RequirePermission('user.manage_access')
  setOverrides(@Param('id') id: string, @Body() dto: SetUserOverridesDto) { return this.service.setOverrides(id, dto.overrides); }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
