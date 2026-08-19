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

  async use(req: Request, res: Response, next: NextFunction) {
    let actorId: string | null = null;
    let mustResetPassword = false;

    const token = (req as any).cookies?.access_token as string | undefined;
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub?: string; sav?: number; sid?: string }>(token);
        const sub = payload?.sub ?? null;
        if (sub) {
          // Honour the signed securityVersion (sav): logout-all and password-change
          // bump User.securityVersion, which must invalidate already-issued access
          // tokens. Also stops tokens for deleted/inactive users.
          const user = await this.prisma.user.findUnique({
            where: { id: sub },
            select: { securityVersion: true, status: true, deletedAt: true, mustResetPassword: true },
          });
          const savOk = payload.sav == null || payload.sav === user?.securityVersion;

          // Honour the signed session id (sid): signing out revokes that session's refresh
          // family, and an access token whose session is gone must stop working at once.
          // Without this, logout revoked the refresh token while the access token kept working
          // until it expired — a signed-out session that was not actually signed out.
          //
          // A token with no `sid` predates this and is accepted on `sav` alone, so shipping the
          // change does not sign everybody out. The lookup is one indexed read on familyId.
          let sessionOk = true;
          if (savOk && user && payload.sid) {
            const live = await this.prisma.refreshToken.findFirst({
              where: { familyId: payload.sid, userId: sub, revokedAt: null },
              select: { id: true },
            });
            sessionOk = !!live;
          }

          if (user && user.deletedAt == null && user.status === 'ACTIVE' && savOk && sessionOk) {
            actorId = sub;
            mustResetPassword = user.mustResetPassword;
          }
        }
      } catch {
        actorId = null; // expired/invalid → unauthenticated
      }
    }

    // A user who still owes a forced password change (e.g. after an admin reset, when the
    // admin knows the temp password) may READ (to render the "set a new password" screen) and
    // use /auth/* (to actually change it), but may NOT make changes anywhere else until they do.
    if (actorId && mustResetPassword) {
      const method = req.method.toUpperCase();
      const isWrite = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
      if (isWrite && !/\/auth\//.test(req.path)) {
        res.status(403).json({ statusCode: 403, message: 'Set a new password before making changes.' });
        return;
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
