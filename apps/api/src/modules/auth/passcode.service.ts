import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { PrismaService } from '../../prisma/prisma.service';

/** Brute-force policy for the org step-up passcode. */
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const MIN_PASSCODE_LEN = 6;

export type PasscodeCheck =
  | { ok: true }
  | { ok: false; reason: 'INVALID' | 'LOCKED'; lockedUntil?: Date; remaining?: number };

/**
 * Owns the organization "big change" step-up passcode: verification (with
 * brute-force lockout), configuration status, and change. The passcode is a
 * SECOND factor required — on top of RBAC — for sensitive org/people/RBAC
 * mutations, so even a compromised admin session or an over-permissioned account
 * cannot make large-scale changes without it.
 *
 * Lockout state is in-memory, keyed by organizationId (single-org, single-instance
 * deployment). It caps guessing at MAX_FAILED tries per LOCK_MS window and resets
 * on any successful verification.
 */
@Injectable()
export class PasscodeService {
  private readonly lockouts = new Map<string, { fails: number; lockedUntil: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** organizationId of the given actor, or null. */
  async orgIdOf(actorId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: actorId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  /** Is a passcode configured for this org? (When false, the guard is a no-op.) */
  async isConfigured(orgId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { securityPasscodeHash: true } });
    return !!org?.securityPasscodeHash;
  }

  private lockState(orgId: string): { locked: boolean; lockedUntil?: Date } {
    const rec = this.lockouts.get(orgId);
    if (rec && rec.lockedUntil > Date.now()) return { locked: true, lockedUntil: new Date(rec.lockedUntil) };
    return { locked: false };
  }

  private recordFailure(orgId: string): { locked: boolean; lockedUntil?: Date; remaining: number } {
    const rec = this.lockouts.get(orgId) ?? { fails: 0, lockedUntil: 0 };
    rec.fails += 1;
    if (rec.fails >= MAX_FAILED) {
      rec.lockedUntil = Date.now() + LOCK_MS;
      rec.fails = 0;
      this.lockouts.set(orgId, rec);
      return { locked: true, lockedUntil: new Date(rec.lockedUntil), remaining: 0 };
    }
    this.lockouts.set(orgId, rec);
    return { locked: false, remaining: MAX_FAILED - rec.fails };
  }

  private reset(orgId: string) {
    this.lockouts.delete(orgId);
  }

  /**
   * Verify a candidate passcode for an org. Enforces lockout. When the org has no
   * passcode configured, verification is not applicable and returns ok (the guard
   * treats "not configured" as allow separately, so this only matters for the UX
   * pre-check endpoint).
   */
  async verify(orgId: string, passcode: string): Promise<PasscodeCheck> {
    const lock = this.lockState(orgId);
    if (lock.locked) return { ok: false, reason: 'LOCKED', lockedUntil: lock.lockedUntil };

    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { securityPasscodeHash: true } });
    const hash = org?.securityPasscodeHash;
    if (!hash) return { ok: true }; // not configured → nothing to verify

    let valid = false;
    try { valid = await argonVerify(hash, passcode ?? ''); } catch { valid = false; }
    if (valid) { this.reset(orgId); return { ok: true }; }

    const f = this.recordFailure(orgId);
    return f.locked
      ? { ok: false, reason: 'LOCKED', lockedUntil: f.lockedUntil }
      : { ok: false, reason: 'INVALID', remaining: f.remaining };
  }

  /**
   * Change (or first-time set) the org passcode. Requires the CURRENT passcode when
   * one is already configured — that current passcode is itself the step-up factor,
   * so knowing it is required to rotate it. A forgotten passcode is reset out-of-band
   * with the set-passcode.ts script (DB access = break-glass).
   */
  async change(orgId: string, current: string | undefined, next: string): Promise<{ ok: true }> {
    if (!next || next.length < MIN_PASSCODE_LEN) {
      throw new BadRequestException(`New passcode must be at least ${MIN_PASSCODE_LEN} characters.`);
    }
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { securityPasscodeHash: true } });
    if (!org) throw new NotFoundException('Organization not found.');
    if (org.securityPasscodeHash) {
      const check = await this.verify(orgId, current ?? '');
      if (!check.ok) {
        if (check.reason === 'LOCKED') throw new ForbiddenException('Too many attempts. Try again later.');
        throw new ForbiddenException('Current passcode is incorrect.');
      }
    }
    await this.prisma.organization.update({ where: { id: orgId }, data: { securityPasscodeHash: await argonHash(next) } });
    this.reset(orgId);
    return { ok: true };
  }
}
