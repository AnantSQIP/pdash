import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller()
export class PermissionsController {
  constructor(private readonly permissions: PermissionService) {}

  /** The current actor's own effective permissions (used by the frontend gate). */
  @Get('me/effective-permissions')
  async me(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated (missing x-actor-id).');
    return this.permissions.getEffectivePermissions(actorId);
  }

  /** Effective permissions for any user — admin preview. */
  @Get('users/:id/effective-permissions')
  @RequirePermission('user.view', 'permission.view')
  async forUser(@Param('id') id: string) {
    return this.permissions.getEffectivePermissions(id);
  }
}
