import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

// Windows for deriving activity from the last heartbeat.
const ONLINE_MS = 3 * 60_000;   // seen within 3 min → online
const AWAY_MS = 10 * 60_000;    // seen within 10 min → away; older → offline
// Availability values a user may set manually. OFFLINE = "appear offline".
const MANUAL = new Set(['AVAILABLE', 'BUSY', 'DND', 'BRB', 'OFFLINE']);

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

type PresenceRow = { status: string | null; statusMessage: string | null; statusExpiresAt: Date | null; lastSeenAt: Date } | null;

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  private async orgOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  /**
   * The presence shown to others, resolved on read:
   *   1. "Appear offline" always wins (privacy).
   *   2. An unexpired manual status is respected WHILE the person is active.
   *   3. Otherwise: on approved leave today → On leave; active → Available;
   *      recently active → Away; else Offline.
   */
  private effective(nowMs: number, p: PresenceRow, onLeave: boolean): string {
    const age = p?.lastSeenAt ? nowMs - p.lastSeenAt.getTime() : Number.MAX_SAFE_INTEGER;
    const active = age < ONLINE_MS;
    const recent = age < AWAY_MS;
    const manualValid = !!p?.status && MANUAL.has(p.status) && (!p.statusExpiresAt || p.statusExpiresAt.getTime() > nowMs);
    const manual = manualValid ? p!.status : null;
    if (manual === 'OFFLINE') return 'OFFLINE';
    if (manual && active) return manual;
    if (onLeave) return 'ON_LEAVE';
    if (active) return 'AVAILABLE';
    if (recent) return 'AWAY';
    return 'OFFLINE';
  }

  private validMessage(nowMs: number, p: PresenceRow): string | null {
    if (!p?.statusMessage) return null;
    if (p.statusExpiresAt && p.statusExpiresAt.getTime() <= nowMs) return null;
    return p.statusMessage;
  }

  /** Record that the actor is active right now (keeps any manual status). */
  async heartbeat(userId: string) {
    const now = new Date();
    await this.prisma.presence.upsert({
      where: { userId },
      create: { userId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
    return { ok: true };
  }

  async setStatus(userId: string, data: { status: string; message?: string; expiryMinutes?: number }) {
    const status = (data.status ?? '').toUpperCase();
    if (!MANUAL.has(status)) throw new BadRequestException(`status must be one of: ${[...MANUAL].join(', ')}`);
    const message = data.message?.trim() ? data.message.trim().slice(0, 140) : null;
    const mins = Number(data.expiryMinutes);
    const expiresAt = Number.isFinite(mins) && mins > 0 ? new Date(Date.now() + mins * 60_000) : null;
    await this.prisma.presence.upsert({
      where: { userId },
      create: { userId, status, statusMessage: message, statusExpiresAt: expiresAt, lastSeenAt: new Date() },
      update: { status, statusMessage: message, statusExpiresAt: expiresAt },
    });
    return this.myPresence(userId);
  }

  /** Drop the manual status/message → presence reverts to auto (activity + leave). */
  async clearStatus(userId: string) {
    await this.prisma.presence.upsert({
      where: { userId },
      create: { userId, lastSeenAt: new Date() },
      update: { status: null, statusMessage: null, statusExpiresAt: null },
    });
    return this.myPresence(userId);
  }

  async myPresence(userId: string) {
    const today = utcToday();
    const [p, leave, wfh] = await Promise.all([
      this.prisma.presence.findUnique({ where: { userId } }),
      this.prisma.leaveRequest.findFirst({ where: { userId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
      this.prisma.wfhRequest.findFirst({ where: { userId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
    ]);
    const nowMs = Date.now();
    return {
      status: p?.status ?? null,
      statusMessage: this.validMessage(nowMs, p),
      statusExpiresAt: p?.statusExpiresAt ?? null,
      effective: this.effective(nowMs, p, !!leave),
      workMode: wfh ? 'WFH' : 'OFFICE',
    };
  }

  /** Effective presence for every active member of the actor's org. */
  async orgPresence(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    const ids = users.map(u => u.id);
    if (!ids.length) return [];
    const today = utcToday();
    const [pres, leaves, wfhs] = await Promise.all([
      this.prisma.presence.findMany({ where: { userId: { in: ids } } }),
      this.prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { userId: true } }),
      this.prisma.wfhRequest.findMany({ where: { userId: { in: ids }, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { userId: true } }),
    ]);
    const pByU = new Map(pres.map(p => [p.userId, p]));
    const onLeave = new Set(leaves.map(l => l.userId));
    const onWfh = new Set(wfhs.map(w => w.userId));
    const nowMs = Date.now();
    return ids.map(id => {
      const p = pByU.get(id) ?? null;
      return {
        userId: id,
        status: this.effective(nowMs, p, onLeave.has(id)),
        workMode: onWfh.has(id) ? 'WFH' : 'OFFICE',
        statusMessage: this.validMessage(nowMs, p),
      };
    });
  }
}

@Controller('presence')
class PresenceController {
  constructor(
    private readonly svc: PresenceService,
    private readonly actor: ActorContextService,
  ) {}

  @Post('heartbeat')
  heartbeat(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.heartbeat(actorId);
  }

  @Get('me')
  me(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.myPresence(actorId);
  }

  // Org scoped from the SESSION, never a client param — no cross-tenant read.
  @Get('org')
  async org() {
    return this.svc.orgPresence(await this.actor.requireOrgId());
  }

  @Post()
  setStatus(@Actor() actorId: string | null, @Body() body: { status: string; message?: string; expiryMinutes?: number }) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.setStatus(actorId, body);
  }

  @Post('clear')
  clearStatus(@Actor() actorId: string | null) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.clearStatus(actorId);
  }
}

@Module({
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
