import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';
import {
  CreateGroupDto, CreatePermissionDto, CreateRoleDto, SetMembersDto,
  SetPermissionsDto, UpdateGroupDto, UpdatePermissionDto, UpdateRoleDto,
} from './dto';

@Controller('permissions')
export class PermissionCatalogController {
  constructor(private readonly rbac: RbacService) {}

  @Get() @RequirePermission('permission.view')
  list() { return this.rbac.listPermissions(); }

  @Post() @RequirePermission('permission.create') @RequirePasscode()
  create(@Body() dto: CreatePermissionDto) { return this.rbac.createPermission(dto); }

  @Patch(':id') @RequirePermission('permission.update') @RequirePasscode()
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) { return this.rbac.updatePermission(id, dto); }

  @Delete(':id') @RequirePermission('permission.delete') @RequirePasscode()
  remove(@Param('id') id: string) { return this.rbac.deletePermission(id); }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly rbac: RbacService) {}

  @Get() @RequirePermission('role.view')
  list(@Query('organizationId') organizationId: string) { return this.rbac.listRoles(organizationId); }

  @Post() @RequirePermission('role.create') @RequirePasscode()
  create(@Body() dto: CreateRoleDto) { return this.rbac.createRole(dto); }

  @Patch(':id') @RequirePermission('role.update') @RequirePasscode()
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) { return this.rbac.updateRole(id, dto); }

  @Delete(':id') @RequirePermission('role.delete') @RequirePasscode()
  remove(@Param('id') id: string) { return this.rbac.deleteRole(id); }

  @Put(':id/permissions') @RequirePermission('role.update') @RequirePasscode()
  setPermissions(@Param('id') id: string, @Body() dto: SetPermissionsDto) { return this.rbac.setRolePermissions(id, dto); }
}

@Controller('permission-groups')
export class GroupsController {
  constructor(private readonly rbac: RbacService) {}

  @Get() @RequirePermission('group.view')
  list(@Query('organizationId') organizationId: string) { return this.rbac.listGroups(organizationId); }

  @Post() @RequirePermission('group.create') @RequirePasscode()
  create(@Body() dto: CreateGroupDto) { return this.rbac.createGroup(dto); }

  @Patch(':id') @RequirePermission('group.update') @RequirePasscode()
  update(@Param('id') id: string, @Body() dto: UpdateGroupDto) { return this.rbac.updateGroup(id, dto); }

  @Delete(':id') @RequirePermission('group.delete') @RequirePasscode()
  remove(@Param('id') id: string) { return this.rbac.deleteGroup(id); }

  @Put(':id/permissions') @RequirePermission('group.update') @RequirePasscode()
  setPermissions(@Param('id') id: string, @Body() dto: SetPermissionsDto) { return this.rbac.setGroupPermissions(id, dto); }

  @Put(':id/members') @RequirePermission('group.manage_members') @RequirePasscode()
  setMembers(@Param('id') id: string, @Body() dto: SetMembersDto) { return this.rbac.setGroupMembers(id, dto); }
}
