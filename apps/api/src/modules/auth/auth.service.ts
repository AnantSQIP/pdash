import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash as argonHash, hashSync as argonHashSync, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000; // 14 days
const MAX_FAILED = 8;
const LOCK_MS = 15 * 60 * 1000;
// Constant dummy hash so login timing doesn't reveal whether an email exists.
const DUMMY_HASH = argonHashSync('pdash-dummy-password-for-timing');

function sha256(s: string): string { return createHash('sha256').update(s).digest('hex'); }

export type AuthUser = {
  id: string; firstName: string; lastName: string; email: string;
  designation: string | null; status: string; organizationId: string; mustResetPassword: boolean;
};
type Ctx = { ua?: string; ip?: string };

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private toAuthUser(u: any): AuthUser {
    return {
      id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
      designation: u.designation ?? null, status: u.status, organizationId: u.organizationId,
      mustResetPassword: u.mustResetPassword,
    };
  }

  private signAccess(u: { id: string; organizationId: string; securityVersion: number }): string {
    return this.jwt.sign({ sub: u.id, org: u.organizationId, sav: u.securityVersion });
  }

  private async issueRefresh(userId: string, familyId: string, ctx: Ctx) {
    const raw = randomBytes(48).toString('base64url');
    const row = await this.prisma.refreshToken.create({
      data: { userId, tokenHash: sha256(raw), familyId, userAgent: ctx.ua ?? null, ip: ctx.ip ?? null, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    return { raw, id: row.id };
  }

  async login(email: string, password: string, ctx: Ctx) {
    const user = await this.prisma.user.findFirst({ where: { email: email.trim().toLowerCase(), deletedAt: null } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked due to failed attempts. Try again later.');
    }
    let valid = false;
    try { valid = await argonVerify(user?.passwordHash ?? DUMMY_HASH, password); } catch { valid = false; }

    if (!user || !user.passwordHash || !valid) {
      if (user) {
        const failed = user.failedLoginCount + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null },
        });
      }
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const accessToken = this.signAccess(user);
    const refresh = await this.issueRefresh(user.id, randomBytes(16).toString('hex'), ctx);
    return { user: this.toAuthUser(user), accessToken, refreshToken: refresh.raw };
  }

  async refresh(rawToken: string | undefined, ctx: Ctx) {
    if (!rawToken) throw new UnauthorizedException('No refresh token');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');
    // A token that was rotated/revoked is normally a theft signal → kill the whole family.
    // BUT a token revoked just moments ago is almost always a benign concurrent refresh
    // (two requests/tabs raced): reject only this request, don't revoke the session.
    if (row.revokedAt || row.replacedById) {
      const ROTATION_GRACE_MS = 15_000;
      const rotatedRecently = !!row.revokedAt && Date.now() - row.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!rotatedRecently) {
        await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        throw new UnauthorizedException('Refresh token reuse detected — session revoked');
      }
      throw new UnauthorizedException('Refresh token already rotated');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) throw new UnauthorizedException('User not available');

    // Atomically claim this token so two concurrent refreshes can't both rotate it
    // (the loser gets count 0 → 401). Prevents a race that mints two live sessions.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null, replacedById: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('Refresh token already rotated');

    const next = await this.issueRefresh(user.id, row.familyId, ctx);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.id } });
    const accessToken = this.signAccess(user);
    return { user: this.toAuthUser(user), accessToken, refreshToken: next.raw };
  }

  async logout(rawToken?: string) {
    if (rawToken) {
      await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.user.update({ where: { id: userId }, data: { securityVersion: { increment: 1 } } });
    return { ok: true };
  }

  async me(userId: string): Promise<AuthUser> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.deletedAt) throw new UnauthorizedException();
    return this.toAuthUser(u);
  }

  async changePassword(userId: string, current: string, nextPw: string) {
    if (!nextPw || nextPw.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.passwordHash || !(await argonVerify(u.passwordHash, current))) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argonHash(nextPw), passwordChangedAt: new Date(), mustResetPassword: false },
    });
    await this.logoutAll(userId);
    return { ok: true };
  }
}
