import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from './request-context';

/**
 * The authenticated actor's identity, resolved from the session — never from a request
 * body or query string.
 *
 * Endpoints used to take `organizationId` as a query parameter and trust it. That is a
 * cross-tenant IDOR: a user in one org could pass another org's id and read its data. The
 * organization a request runs in is a property of WHO is calling, so it must be derived
 * from the verified session actor. This service is the single source of that truth.
 */
@Injectable()
export class ActorContextService {
  // actorId -> organizationId. A user's org is immutable for the process's lifetime, so a
  // per-instance cache is safe and avoids a lookup on every scoped request.
  private readonly orgCache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  /** The current actor's id, or throw — every scoped route runs behind the global AuthGuard. */
  requireActorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('You must be signed in.');
    return id;
  }

  /** The current actor's organization id, resolved from the session. Throws if unresolved. */
  async requireOrgId(): Promise<string> {
    const actorId = this.requireActorId();
    const cached = this.orgCache.get(actorId);
    if (cached) return cached;
    const user = await this.prisma.user.findFirst({
      where: { id: actorId, deletedAt: null },
      select: { organizationId: true },
    });
    if (!user?.organizationId) throw new ForbiddenException('Your account is not attached to an organization.');
    this.orgCache.set(actorId, user.organizationId);
    return user.organizationId;
  }
}

@Global()
@Module({
  providers: [ActorContextService],
  exports: [ActorContextService],
})
export class ActorContextModule {}
