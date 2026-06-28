import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { getActorId } from '../context/request-context';

/**
 * Global, deny-by-default authentication guard. Every route requires a verified
 * actor (set by CurrentActorMiddleware from the access-token cookie) UNLESS it is
 * marked @Public(). Authorization (permissions) is still handled by PermissionGuard.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    if (!getActorId()) throw new UnauthorizedException('Authentication required');
    return true;
  }
}
