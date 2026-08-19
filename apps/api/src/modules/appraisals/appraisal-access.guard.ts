import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { getActorId } from '../../common/context/request-context';

/**
 * Refuses access to somebody else's appraisal BEFORE the request body is validated.
 *
 * WHY THIS EXISTS
 *
 * The authorization for these routes lives inside the service, which necessarily runs after the
 * validation pipe. So probing a colleague's appraisal with a malformed body answered
 * "property selfComment should not exist" rather than "not allowed" — a refusal that quietly
 * confirmed the appraisal existed and described the shape of the request that would reach it.
 *
 * Nest runs guards before pipes, so putting the ownership test in a guard reverses that: an
 * outsider is turned away without learning anything, and only a person entitled to be there gets
 * as far as being told their field name was wrong.
 *
 * DELIBERATELY NARROW. This is not a general reordering of validation and authorization across the
 * API — that would be a large change to hide field names that are not secret anyway, since the
 * browser bundle contains them. Appraisals are the exception worth the guard: they carry somebody's
 * rating and their manager's written remarks, so even the existence of one is worth not confirming.
 *
 * The service keeps its own checks. This guard is an earlier gate, not a replacement — remove it
 * tomorrow and nothing becomes accessible that was not accessible before.
 */
@Injectable()
export class AppraisalAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const id: string | undefined = req.params?.id;
    // Routes without an :id (listing your own, the cycle endpoints) are guarded elsewhere.
    if (!id) return true;

    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');

    const appraisal = await this.prisma.appraisal.findUnique({
      where: { id },
      select: { employeeId: true, reviewerId: true },
    });
    // Say the same thing for "does not exist" and "not yours" — the difference is exactly what
    // an outsider is fishing for.
    if (!appraisal) throw new ForbiddenException('You cannot view this appraisal.');

    if (appraisal.employeeId === actorId || appraisal.reviewerId === actorId) return true;
    if (await this.permissions.check(actorId, 'appraisal.manage')) return true;

    throw new ForbiddenException('You cannot view this appraisal.');
  }
}
