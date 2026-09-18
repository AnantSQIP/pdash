import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/decorators/actor.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { IDLE_MS, MANUAL, inactiveSince, resolvePresence, type PresenceFacts } from './presence-rules';

/** A meeting with no end time is taken to last this long — the calendar's own assumption. */
const DEFAULT_MEETING_MS = 30 * 60_000;

/**
 * Today, as the IST calendar day — the firm's timezone, not the server's.
 *
 * Used to ask "is this person on leave or working from home right now", against date-only columns
 * stored at UTC midnight. Computed in UTC it returned yesterday between 00:00 and 05:30 IST, so on
 * the first morning of someone's leave their presence did not reflect it.
 */
const IST_OFFSET_MS = 5.5 * 3_600_000;
function istToday(): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

type PresenceRow = (NonNullable<PresenceFacts> & { statusMessage: string | null }) | null;

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  private async orgOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    return u?.organizationId ?? null;
  }

  /**
   * Who of these people is in a meeting right now, by the calendar: a MEETING that has started and
   * not ended, which they organised or were invited to and did not decline. Timed meetings only —
   * an all-day entry is a day's plan, not a person in a room.
   */
  private async inMeetingNow(organizationId: string, userIds: string[]): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const now = new Date();
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        organizationId, deletedAt: null, type: 'MEETING', allDay: false,
        startDate: { lte: now, gt: new Date(now.getTime() - 24 * 3_600_000) },
        OR: [
          { endDate: { gt: now } },
          { endDate: null, startDate: { gt: new Date(now.getTime() - DEFAULT_MEETING_MS) } },
        ],
      },
      select: { createdBy: true, attendees: { select: { userId: true, response: true } } },
    });
    const wanted = new Set(userIds);
    const busy = new Set<string>();
    for (const e of events) {
      if (wanted.has(e.createdBy)) busy.add(e.createdBy);
      for (const a of e.attendees) if (a.response !== 'DECLINED' && wanted.has(a.userId)) busy.add(a.userId);
    }
    return busy;
  }

  private validMessage(nowMs: number, p: PresenceRow): string | null {
    if (!p?.statusMessage) return null;
    if (p.statusExpiresAt && p.statusExpiresAt.getTime() <= nowMs) return null;
    return p.statusMessage;
  }

  /**
   * The browser is still here — and, with `idle`, whether its person has gone five minutes without
   * touching the keyboard or mouse. Keeps any manual status.
   *
   * `idle` absent (a browser still running the previous build) reads as active, which is what that
   * build meant by a heartbeat. The idle clock starts when inactivity BEGAN — five minutes before
   * it was reported — and is not restarted by later idle heartbeats.
   */
  async heartbeat(userId: string, idle = false) {
    const now = new Date();
    if (!idle) {
      await this.prisma.presence.upsert({
        where: { userId },
        create: { userId, lastSeenAt: now },
        update: { lastSeenAt: now, idleSince: null },
      });
      return { ok: true, idle: false };
    }
    const since = new Date(now.getTime() - IDLE_MS);
    await this.prisma.presence.upsert({
      where: { userId },
      create: { userId, lastSeenAt: now, idleSince: since },
      update: { lastSeenAt: now },
    });
    await this.prisma.presence.updateMany({ where: { userId, idleSince: null }, data: { idleSince: since } });
    return { ok: true, idle: true };
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
    const today = istToday();
    const orgId = await this.orgOf(userId);
    const [p, leave, meeting] = await Promise.all([
      this.prisma.presence.findUnique({ where: { userId } }),
      this.prisma.leaveRequest.findFirst({ where: { userId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
      orgId ? this.inMeetingNow(orgId, [userId]) : Promise.resolve(new Set<string>()),
    ]);
    const nowMs = Date.now();
    const effective = resolvePresence(nowMs, p, { onLeave: !!leave, inMeeting: meeting.has(userId) });
    return {
      status: p?.status ?? null,
      statusMessage: this.validMessage(nowMs, p),
      statusExpiresAt: p?.statusExpiresAt ?? null,
      effective,
      idle: !!p?.idleSince,
      inactiveSince: inactiveSince(effective, p),
    };
  }

  /**
   * Effective presence for every active member of the actor's org — readable by everyone in it.
   * That is deliberate: who is around right now is the point of the dot.
   */
  async orgPresence(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    const ids = users.map(u => u.id);
    if (!ids.length) return [];
    const today = istToday();
    const [pres, leaves, meeting] = await Promise.all([
      this.prisma.presence.findMany({ where: { userId: { in: ids } } }),
      this.prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { userId: true } }),
      this.inMeetingNow(organizationId, ids),
    ]);
    const pByU = new Map(pres.map(p => [p.userId, p]));
    const onLeave = new Set(leaves.map(l => l.userId));
    const nowMs = Date.now();
    return ids.map(id => {
      const p = pByU.get(id) ?? null;
      const status = resolvePresence(nowMs, p, { onLeave: onLeave.has(id), inMeeting: meeting.has(id) });
      return {
        userId: id,
        status,
        statusMessage: this.validMessage(nowMs, p),
        inactiveSince: inactiveSince(status, p),
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
  heartbeat(@Actor() actorId: string | null, @Body() body: { idle?: unknown } = {}) {
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.svc.heartbeat(actorId, body?.idle === true);
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
