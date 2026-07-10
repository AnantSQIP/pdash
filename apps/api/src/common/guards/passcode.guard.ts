import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_PASSCODE_KEY } from '../decorators/require-passcode.decorator';
import { getActorId } from '../context/request-context';
import { PasscodeService } from '../../modules/auth/passcode.service';

const HEADER = 'x-org-passcode';

/**
 * Globally installed but OPT-IN: routes without @RequirePasscode() pass through.
 * Where present, the route is a "big change" that requires the organization step-up
 * passcode (a second factor on top of RBAC). Runs LAST — after AuthGuard and
 * PermissionGuard — so a caller who isn't authenticated or lacks the permission is
 * rejected on those grounds first (they never get a passcode prompt).
 *
 * No-op when the org has no passcode configured, so deploying this changes nothing
 * until a passcode is set.
 */
@Injectable()
export class PasscodeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly passcode: PasscodeService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_PASSCODE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true;

    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const orgId = await this.passcode.orgIdOf(actorId);
    if (!orgId) return true; // no org to scope the passcode to → cannot enforce
    if (!(await this.passcode.isConfigured(orgId))) return true; // feature not configured → no-op

    const req = ctx.switchToHttp().getRequest<Request>();
    const raw = req.headers[HEADER];
    const supplied = (Array.isArray(raw) ? raw[0] : raw) ?? '';
    if (!supplied) {
      throw new ForbiddenException({ statusCode: 403, code: 'PASSCODE_REQUIRED', message: 'This action requires the organization passcode.' });
    }

    const check = await this.passcode.verify(orgId, supplied);
    if (check.ok) return true;
    if (check.reason === 'LOCKED') {
      throw new ForbiddenException({ statusCode: 403, code: 'PASSCODE_LOCKED', message: 'Too many incorrect passcode attempts. Please try again later.', lockedUntil: check.lockedUntil });
    }
    throw new ForbiddenException({ statusCode: 403, code: 'PASSCODE_INVALID', message: 'Incorrect organization passcode.', remaining: check.remaining });
  }
}
