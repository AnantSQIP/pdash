import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from '../context/request-context';
import { PrismaService } from '../../prisma/prisma.service';

// Dev-only escape hatch so curl/smoke tests can still impersonate via x-actor-id.
// NEVER honoured in production, and OFF unless explicitly enabled.
const TRUST_HEADER = process.env.AUTH_DEV_TRUST_HEADER === 'true' && process.env.NODE_ENV !== 'production';

/**
 * Derives the per-request actor from the VERIFIED access-token cookie and runs the
 * rest of the request inside an AsyncLocalStorage scope. This is the single point
 * where identity is established — everything downstream (PermissionGuard, @Actor,
 * EventService) reads `getActorId()` unchanged.
 */
@Injectable()
export class CurrentActorMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    let actorId: string | null = null;

    const token = (req as any).cookies?.access_token as string | undefined;
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub?: string; sav?: number }>(token);
        const sub = payload?.sub ?? null;
        if (sub) {
          // Honour the signed securityVersion (sav): logout-all and password-change
          // bump User.securityVersion, which must invalidate already-issued access
          // tokens. Also stops tokens for deleted/inactive users.
          const user = await this.prisma.user.findUnique({
            where: { id: sub },
            select: { securityVersion: true, status: true, deletedAt: true },
          });
          const savOk = payload.sav == null || payload.sav === user?.securityVersion;
          if (user && user.deletedAt == null && user.status === 'ACTIVE' && savOk) {
            actorId = sub;
          }
        }
      } catch {
        actorId = null; // expired/invalid → unauthenticated
      }
    }

    if (!actorId && TRUST_HEADER) {
      const h = req.headers['x-actor-id'];
      actorId = (Array.isArray(h) ? h[0] : h) || null;
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    requestContext.run({ actorId, ip }, () => next());
  }
}
