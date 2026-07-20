import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '@pdash/db';
import { hash as argonHash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';
import { getActorId } from '../../common/context/request-context';
import { PermissionService } from '../permissions/permission.service';
import { NotificationsService } from '../notifications/notifications.module';

/** Generate a readable, shareable temporary password (no ambiguous chars). */
function generateTempPassword(): string {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
  const bytes = randomBytes(10);
  let pw = '';
  for (let i = 0; i < bytes.length; i++) pw += charset[bytes[i] % charset.length];
  return `Sqip-${pw}`;
}

class CreateUserDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(1) @MaxLength(60) firstName!: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
  // Only company addresses may be added — no personal gmail/yahoo/etc.
  @IsEmail() @MaxLength(160)
  @Matches(/@squarkip\.com$/i, { message: 'Only @squarkip.com email addresses can be added.' })
  email!: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phone?: string;
  // Optional admin-set initial password; if omitted a temp one is generated.
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) password?: string;
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
class SetPhotoDto {
  // Data URL (data:image/...;base64,...) or empty to clear. Capped to keep DB rows small.
  @IsOptional() @IsString() @MaxLength(900_000) profilePhoto?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * SECURITY (anti-privilege-escalation): a non-Super-Admin actor may not
   *  (a) modify their own roles/permissions (no self-escalation),
   *  (b) assign the Super Admin role, or
   *  (c) grant any role/permission carrying a code they do not themselves hold
   *      ("grant only a subset of your own authority").
   * Super Admins bypass all three. DENY overrides are never restricted (they only reduce).
   */
  private async assertActorMayGrant(targetUserId: string, opts: { roleIds?: string[]; permissionIds?: string[] }) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const actor = await this.permissions.getEffectivePermissions(actorId);
    if (actor.isSuperAdmin) return;

    if (actorId === targetUserId) {
      throw new ForbiddenException('You cannot modify your own roles or permissions.');
    }
    const actorCodes = new Set(actor.codes);
    const overreach = (codes: string[]) => [...new Set(codes.filter(c => !actorCodes.has(c)))];

    if (opts.roleIds?.length) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: opts.roleIds } },
        select: { name: true, rolePermissions: { select: { permission: { select: { code: true } } } } },
      });
      if (roles.some(r => r.name === 'Super Admin')) {
        throw new ForbiddenException('Only a Super Admin may assign the Super Admin role.');
      }
      const exceeding = overreach(roles.flatMap(r => r.rolePermissions.map(rp => rp.permission.code)));
      if (exceeding.length) {
        throw new ForbiddenException(`You cannot grant a role with permissions you do not hold: ${exceeding.slice(0, 5).join(', ')}`);
      }
    }

    if (opts.permissionIds?.length) {
      const perms = await this.prisma.permission.findMany({ where: { id: { in: opts.permissionIds } }, select: { code: true } });
      const exceeding = overreach(perms.map(p => p.code));
      if (exceeding.length) {
        throw new ForbiddenException(`You cannot grant permissions you do not hold: ${exceeding.slice(0, 5).join(', ')}`);
      }
    }
  }

  list(organizationId: string, opts?: { includeInactive?: boolean }) {
    // #4: admin can opt into inactive/suspended users so they remain manageable
    // (default stays ACTIVE-only for the rest of the app).
    return this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, ...(opts?.includeInactive ? {} : { status: 'ACTIVE' }) },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true, organizationId: true, employeeCode: true, firstName: true, lastName: true,
        email: true, phone: true, designation: true, profilePhoto: true, joiningDate: true,
        status: true, createdAt: true,
      },
    });
  }

  async get(id: string) {
    // SECURITY: use an explicit `select` (never a bare `include`) so credential
    // and account-security columns (passwordHash, securityVersion, failedLoginCount,
    // lockedUntil, passwordChangedAt, mustResetPassword) are NEVER serialized to clients.
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, organizationId: true, employeeCode: true, firstName: true, lastName: true,
        email: true, phone: true, designation: true, profilePhoto: true, joiningDate: true,
        status: true, lastLoginAt: true, createdAt: true, updatedAt: true,
        userRoles: { include: { role: true } },
        departmentMemberships: { include: { department: true } },
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    // Privilege-check the assigned roles BEFORE creating (no self-target — new user).
    // Reuses the anti-escalation rules: can't assign Super Admin / a role exceeding your own.
    if (dto.roleIds?.length) await this.assertActorMayGrant('', { roleIds: dto.roleIds });

    // The new user gets a working login: an admin-set password or a generated temp one,
    // argon2id-hashed, with a forced reset on first sign-in.
    const tempPassword = dto.password && dto.password.length >= 8 ? dto.password : generateTempPassword();
    const passwordHash = await argonHash(tempPassword);

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
          passwordHash,
          mustResetPassword: true,
          userRoles: dto.roleIds?.length ? { create: dto.roleIds.map(roleId => ({ roleId })) } : undefined,
        },
      });
      await this.events.emit({
        action: EVENTS.USER_CREATED, entityType: 'User', entityId: user.id,
        organizationId: dto.organizationId, metadata: { email: user.email, roleIds: dto.roleIds ?? [] },
      });
      // Return the temp password ONCE so the admin can share it; never store/log it plaintext,
      // and strip the hash from the response.
      const { passwordHash: _ph, ...safe } = user;
      return { ...safe, tempPassword };
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
    // Tell the user an administrator changed their account (actor excluded if it's a self-edit).
    await this.notifications.notify(id, {
      type: 'account.updated', title: 'Account updated',
      message: dto.status ? `An administrator set your account status to ${dto.status}.` : 'An administrator updated your account details.',
    });
    return user;
  }

  /**
   * M30: admin resets another user's password to a fresh generated temp one, forces a
   * reset on next sign-in, and bumps securityVersion (invalidating that user's existing
   * access tokens). Returns the temp password ONCE so the admin can share it.
   *
   * The lockout counters are cleared too. login() checks lockedUntil BEFORE it checks the
   * password, so without this a reset does not actually let the user back in — and being
   * locked out by failed attempts is the single most common reason to ask for a reset.
   */
  /** People who asked for a reset from the login page and are still waiting on an admin. */
  pendingPasswordResets() {
    return this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE', passwordResetRequestedAt: { not: null } },
      select: {
        id: true, firstName: true, lastName: true, email: true, designation: true,
        profilePhoto: true, passwordResetRequestedAt: true,
      },
      orderBy: { passwordResetRequestedAt: 'asc' },
    });
  }

  async resetPassword(id: string) {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException(`User ${id} not found`);
    const tempPassword = generateTempPassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await argonHash(tempPassword),
        mustResetPassword: true,
        passwordChangedAt: new Date(),
        securityVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
        passwordResetRequestedAt: null, // their request has now been answered
      },
    });
    await this.events.emit({ action: EVENTS.USER_UPDATED, entityType: 'User', entityId: id, metadata: { op: 'password-reset' } });
    await this.notifications.notify(id, {
      type: 'account.updated', title: 'Password reset',
      message: 'An administrator reset your password. Use the temporary password you were given to sign in.',
    });
    return { email: target.email, tempPassword };
  }

  async setRoles(id: string, roleIds: string[]) {
    await this.get(id);
    await this.assertActorMayGrant(id, { roleIds });
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({ data: roleIds.map(roleId => ({ userId: id, roleId })), skipDuplicates: true }),
    ]);
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'User', entityId: id, metadata: { op: 'set-roles', roleIds } });
    await this.notifications.notify(id, { type: 'access.changed', title: 'Your access changed', message: 'An administrator updated your roles.' });
    return { ok: true, count: roleIds.length };
  }

  async setPermissions(id: string, permissionIds: string[]) {
    await this.get(id);
    await this.assertActorMayGrant(id, { permissionIds });
    const grantedBy = getActorId() ?? 'system';
    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId: id } }),
      this.prisma.userPermission.createMany({
        data: permissionIds.map(permissionId => ({ userId: id, permissionId, grantedBy })),
        skipDuplicates: true,
      }),
    ]);
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'User', entityId: id, metadata: { op: 'set-direct-permissions', count: permissionIds.length } });
    await this.notifications.notify(id, { type: 'access.changed', title: 'Your access changed', message: 'An administrator updated your direct permissions.' });
    return { ok: true, count: permissionIds.length };
  }

  async setOverrides(id: string, overrides: { permissionId: string; effect: string }[]) {
    await this.get(id);
    // Only ALLOW overrides can escalate; DENY overrides only restrict and are unrestricted.
    await this.assertActorMayGrant(id, { permissionIds: overrides.filter(o => o.effect === 'ALLOW').map(o => o.permissionId) });
    const createdBy = getActorId() ?? 'system';
    // Last-write-wins dedup so the same permission can't appear twice in one save.
    const deduped = [...new Map(overrides.map(o => [o.permissionId, o])).values()];
    await this.prisma.$transaction([
      this.prisma.permissionOverride.deleteMany({ where: { userId: id } }),
      this.prisma.permissionOverride.createMany({
        data: deduped.map(o => ({ userId: id, permissionId: o.permissionId, effect: o.effect, createdBy })),
      }),
    ]);
    await this.events.emit({ action: EVENTS.PERMISSION_CHANGED, entityType: 'User', entityId: id, metadata: { op: 'set-overrides', count: deduped.length } });
    await this.notifications.notify(id, { type: 'access.changed', title: 'Your access changed', message: 'An administrator updated your permission overrides.' });
    return { ok: true, count: deduped.length };
  }

  /** Existing overrides for a user (so the admin UI can preload before a replace-save). */
  getOverrides(id: string) {
    return this.prisma.permissionOverride.findMany({
      where: { userId: id },
      select: { permissionId: true, effect: true },
    });
  }

  /** A user sets their OWN profile photo (data URL) or clears it. Self-only. */
  async setMyPhoto(profilePhoto?: string) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const value = (profilePhoto ?? '').trim();
    if (value && !value.startsWith('data:image/')) {
      throw new BadRequestException('Profile photo must be an image data URL.');
    }
    if (value.length > 900_000) throw new BadRequestException('Image too large (please use a smaller picture).');
    await this.prisma.user.update({ where: { id: actorId }, data: { profilePhoto: value || null } });
    return { ok: true };
  }
}

@Controller('users')
class UsersController {
  constructor(private readonly service: UsersService) {}

  // Read endpoints stay open — the app resolves the current user from the user list.
  @Get()
  list(@Query('organizationId') organizationId: string, @Query('includeInactive') includeInactive?: string) {
    return this.service.list(organizationId, { includeInactive: includeInactive === 'true' });
  }

  // MUST stay above @Get(':id'), or that route captures this literal path as an id.
  // Restricted: who is locked out is only the business of the people who can act on it.
  @Get('password-reset-requests') @RequirePermission('user.manage_access')
  pendingPasswordResets() { return this.service.pendingPasswordResets(); }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.get(id); }

  // Adding, editing (incl. deactivating), and resetting credentials for a person in
  // the org, plus any change to their roles/permissions, are "big changes" — they
  // also require the org passcode (@RequirePasscode), on top of RBAC.
  @Post() @RequirePermission('user.create') @RequirePasscode()
  create(@Body() dto: CreateUserDto) { return this.service.create(dto); }

  @Patch(':id') @RequirePermission('user.update') @RequirePasscode()
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) { return this.service.update(id, dto); }

  @Post(':id/reset-password') @RequirePermission('user.manage_access') @RequirePasscode()
  resetPassword(@Param('id') id: string) { return this.service.resetPassword(id); }

  @Put(':id/roles') @RequirePermission('user.manage_access') @RequirePasscode()
  setRoles(@Param('id') id: string, @Body() dto: SetRolesDto) { return this.service.setRoles(id, dto.roleIds); }

  @Put(':id/permissions') @RequirePermission('user.manage_access') @RequirePasscode()
  setPermissions(@Param('id') id: string, @Body() dto: SetUserPermissionsDto) { return this.service.setPermissions(id, dto.permissionIds); }

  @Put(':id/overrides') @RequirePermission('user.manage_access') @RequirePasscode()
  setOverrides(@Param('id') id: string, @Body() dto: SetUserOverridesDto) { return this.service.setOverrides(id, dto.overrides); }

  @Get(':id/overrides') @RequirePermission('user.view', 'permission.view')
  getOverrides(@Param('id') id: string) { return this.service.getOverrides(id); }

  // Self-service: any authenticated user sets/clears THEIR OWN profile photo.
  @Put('me/photo')
  setMyPhoto(@Body() dto: SetPhotoDto) { return this.service.setMyPhoto(dto.profilePhoto); }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
