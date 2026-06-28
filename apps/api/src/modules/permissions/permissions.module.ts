import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { RbacService } from './rbac.service';
import { PermissionsController } from './permissions.controller';
import { PermissionCatalogController, RolesController, GroupsController } from './rbac.controller';

/**
 * Global so PermissionService is injectable anywhere (guard, services).
 */
@Global()
@Module({
  controllers: [PermissionsController, PermissionCatalogController, RolesController, GroupsController],
  providers: [PermissionService, RbacService],
  exports: [PermissionService],
})
export class PermissionsModule {}
