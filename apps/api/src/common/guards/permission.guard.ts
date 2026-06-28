import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { getActorId } from '../context/request-context';
import { PermissionService } from '../../modules/permissions/permission.service';

/**
 * Globally installed but OPT-IN: routes without @RequirePermission pass through.
 * Where present, the actor (x-actor-id) must hold at least one of the required
 * permission codes (any-of). Deny-by-default flip is a Phase 7 change.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true; // opt-in: no requirement → allow

    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated (missing x-actor-id).');

    for (const code of required) {
      if (await this.permissions.check(actorId, code)) return true;
    }
    throw new ForbiddenException(`Missing permission: ${required.join(' or ')}`);
  }
}
