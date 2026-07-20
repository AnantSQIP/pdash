import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true, designation: true };

// Recognition categories (card-like). Labels are mirrored on the frontend.
const REWARD_CATEGORIES = ['STAR_PERFORMER', 'TEAM_PLAYER', 'ABOVE_AND_BEYOND', 'INNOVATION', 'LEADERSHIP', 'APPRECIATION'];
const REWARD_LABELS: Record<string, string> = {
  STAR_PERFORMER: 'Star Performer', TEAM_PLAYER: 'Team Player', ABOVE_AND_BEYOND: 'Above & Beyond',
  INNOVATION: 'Innovation', LEADERSHIP: 'Leadership', APPRECIATION: 'Appreciation',
};

// The Indian financial year runs Apr 1 → Mar 31. offset 0 = current FY, -1 = last FY.
function financialYearWindow(offset = 0) {
  const now = new Date();
  const startYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offset;
  return {
    start: new Date(startYear, 3, 1),        // Apr 1
    end: new Date(startYear + 1, 3, 1),      // next Apr 1 (exclusive)
    label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
  };
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
class RewardDto {
  @IsString() recipientId!: string;
  @IsIn(REWARD_CATEGORIES) category!: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
class AnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}
class PolicyDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(50000) body?: string;
  @IsOptional() @IsString() documentId?: string;
  @IsOptional() @IsBoolean() requiresAck?: boolean;
}

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly notifications: NotificationsService,
  ) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  // ── announcements ─────────────────────────────────────────────────────────────
  async listAnnouncements() {
    const organizationId = await this.actor.requireOrgId();
    const rows = await this.prisma.announcement.findMany({
      where: { organizationId },
      orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
    });
    // Attach author summaries (authorId is a plain column, resolved here).
    const authorIds = [...new Set(rows.map(r => r.authorId))];
    const authors = await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: USER_SELECT });
    const byId = new Map(authors.map(a => [a.id, a]));
    return rows.map(r => ({ ...r, author: byId.get(r.authorId) ?? null }));
  }

  async createAnnouncement(dto: AnnouncementDto) {
    const organizationId = await this.actor.requireOrgId();
    const authorId = this.actorId();
    const a = await this.prisma.announcement.create({
      data: { organizationId, authorId, title: dto.title.trim(), body: dto.body, pinnedAt: dto.pinned ? new Date() : null },
    });
    // Broadcast to everyone active in the org (except the author).
    const recipients = await this.prisma.user.findMany({
      where: { organizationId, status: 'ACTIVE', deletedAt: null, id: { not: authorId } }, select: { id: true },
    });
    await this.notifications.notify(recipients.map(u => u.id), {
      type: 'announcement.posted', title: 'New announcement', message: a.title, link: '/company',
    });
    return a;
  }

  private async ownAnnouncement(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const a = await this.prisma.announcement.findFirst({ where: { id, organizationId } });
    if (!a) throw new NotFoundException('Announcement not found');
    return a;
  }
  async updateAnnouncement(id: string, dto: AnnouncementDto) {
    await this.ownAnnouncement(id);
    return this.prisma.announcement.update({
      where: { id },
      data: { title: dto.title.trim(), body: dto.body, ...(dto.pinned !== undefined ? { pinnedAt: dto.pinned ? new Date() : null } : {}) },
    });
  }
  async togglePin(id: string) {
    const a = await this.ownAnnouncement(id);
    return this.prisma.announcement.update({ where: { id }, data: { pinnedAt: a.pinnedAt ? null : new Date() } });
  }
  async deleteAnnouncement(id: string) {
    await this.ownAnnouncement(id);
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  // ── celebrations (upcoming anniversaries + birthdays) ──────────────────────────
  // Birthdays expose only month/day (never the year/age) — the celebration-calendar
  // norm — so this stays clear of the DOB PII boundary.
  async celebrations(days = 30) {
    const organizationId = await this.actor.requireOrgId();
    const users = await this.prisma.user.findMany({
      where: { organizationId, status: 'ACTIVE', deletedAt: null },
      select: { ...USER_SELECT, joiningDate: true, profile: { select: { dateOfBirth: true } } },
    });
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // The next calendar occurrence of month/day (this year if still ahead, else next year).
    const nextOccurrence = (month: number, day: number) => {
      const thisYear = new Date(now.getFullYear(), month, day);
      return thisYear < startOfToday ? new Date(now.getFullYear() + 1, month, day) : thisYear;
    };
    const daysUntil = (month: number, day: number) =>
      Math.round((nextOccurrence(month, day).getTime() - startOfToday.getTime()) / 86_400_000);
    const anniversaries = users
      .filter(u => u.joiningDate)
      .map(u => {
        const j = new Date(u.joiningDate!);
        const d = daysUntil(j.getMonth(), j.getDate());
        // Years of service completed AT the upcoming anniversary (its year − joining year).
        const years = nextOccurrence(j.getMonth(), j.getDate()).getFullYear() - j.getFullYear();
        return { user: this.pick(u), inDays: d, month: j.getMonth() + 1, day: j.getDate(), years };
      })
      .filter(x => x.inDays <= days && x.years >= 1)
      .sort((a, b) => a.inDays - b.inDays);
    const birthdays = users
      .filter(u => u.profile?.dateOfBirth)
      .map(u => {
        const b = new Date(u.profile!.dateOfBirth!);
        return { user: this.pick(u), inDays: daysUntil(b.getMonth(), b.getDate()), month: b.getMonth() + 1, day: b.getDate() };
      })
      .filter(x => x.inDays <= days)
      .sort((a, b) => a.inDays - b.inDays);
    return { anniversaries, birthdays };
  }
  private pick(u: { id: string; firstName: string; lastName: string; email: string; profilePhoto: string | null; designation: string | null }) {
    return { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, profilePhoto: u.profilePhoto, designation: u.designation };
  }

  // ── company directory (everyone: name, designation, email, contact number) ──────
  async directory() {
    const organizationId = await this.actor.requireOrgId();
    const users = await this.prisma.user.findMany({
      where: { organizationId, status: 'ACTIVE', deletedAt: null },
      select: { ...USER_SELECT, phone: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map(u => ({ ...this.pick(u), phone: u.phone }));
  }

  // ── recognition / rewards (everyone views; admins/HR/managers give) ──────────────
  async listRewards(period?: string) {
    const organizationId = await this.actor.requireOrgId();
    const { start, end, label } = financialYearWindow(period === 'last' ? -1 : 0);
    const rewards = await this.prisma.reward.findMany({
      where: { organizationId, awardedAt: { gte: start, lt: end } },
      include: { recipient: { select: USER_SELECT }, giver: { select: USER_SELECT } },
      orderBy: { awardedAt: 'desc' },
      take: 500,
    });
    // Leaderboard = recognition count per recipient, most-awarded first.
    const counts = new Map<string, { user: (typeof rewards)[number]['recipient']; count: number }>();
    for (const r of rewards) {
      const e = counts.get(r.recipientId) ?? { user: r.recipient, count: 0 };
      e.count++; counts.set(r.recipientId, e);
    }
    const leaderboard = [...counts.values()].sort((a, b) => b.count - a.count);
    return { financialYear: label, period: period === 'last' ? 'last' : 'current', total: rewards.length, leaderboard, rewards };
  }

  async giveReward(dto: RewardDto) {
    const organizationId = await this.actor.requireOrgId();
    const givenById = this.actorId();
    if (dto.recipientId === givenById) throw new BadRequestException('You cannot give recognition to yourself.');
    const recipient = await this.prisma.user.findFirst({ where: { id: dto.recipientId, organizationId, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!recipient) throw new NotFoundException('Employee not found');
    const reward = await this.prisma.reward.create({
      data: { organizationId, recipientId: dto.recipientId, givenById, category: dto.category, message: dto.message?.trim() || null },
      include: { recipient: { select: USER_SELECT }, giver: { select: USER_SELECT } },
    });
    await this.notifications.notify([dto.recipientId], {
      type: 'reward.received', title: 'You received recognition 🎉',
      message: `You were recognised — ${REWARD_LABELS[dto.category] ?? 'Appreciation'}${reward.message ? `: ${reward.message}` : ''}.`,
      link: '/company',
    });
    return reward;
  }

  async deleteReward(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const r = await this.prisma.reward.findFirst({ where: { id, organizationId } });
    if (!r) throw new NotFoundException('Reward not found');
    await this.prisma.reward.delete({ where: { id } });
    return { ok: true };
  }

  // ── HR policy library ──────────────────────────────────────────────────────────
  async listPolicies() {
    const organizationId = await this.actor.requireOrgId();
    const actorId = this.actorId();
    const rows = await this.prisma.policy.findMany({
      where: { organizationId },
      include: {
        document: { select: { id: true, name: true, fileUrl: true, mimeType: true, fileSize: true, deletedAt: true } },
        acknowledgements: { select: { userId: true } },
        _count: { select: { acknowledgements: true } },
      },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
    return rows.map(({ acknowledgements, document, ...p }) => ({
      ...p,
      document: document && !document.deletedAt ? document : null,
      ackCount: acknowledgements.length,
      acknowledgedByMe: acknowledgements.some(a => a.userId === actorId),
    }));
  }

  async createPolicy(dto: PolicyDto) {
    const organizationId = await this.actor.requireOrgId();
    if (!dto.body?.trim() && !dto.documentId) throw new BadRequestException('A policy needs a document or some text.');
    if (dto.documentId) {
      const doc = await this.prisma.document.findFirst({ where: { id: dto.documentId, deletedAt: null }, select: { id: true } });
      if (!doc) throw new BadRequestException('Attached document not found.');
    }
    return this.prisma.policy.create({
      data: {
        organizationId, publishedBy: this.actorId(), title: dto.title.trim(),
        description: dto.description?.trim() || null, category: dto.category?.trim() || null,
        body: dto.body?.trim() || null, documentId: dto.documentId || null, requiresAck: !!dto.requiresAck,
      },
    });
  }

  private async ownPolicy(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const p = await this.prisma.policy.findFirst({ where: { id, organizationId } });
    if (!p) throw new NotFoundException('Policy not found');
    return p;
  }
  async updatePolicy(id: string, dto: PolicyDto) {
    await this.ownPolicy(id);
    return this.prisma.policy.update({
      where: { id },
      data: {
        title: dto.title.trim(), description: dto.description?.trim() || null, category: dto.category?.trim() || null,
        ...(dto.body !== undefined ? { body: dto.body?.trim() || null } : {}),
        ...(dto.documentId !== undefined ? { documentId: dto.documentId || null } : {}),
        ...(dto.requiresAck !== undefined ? { requiresAck: !!dto.requiresAck } : {}),
      },
    });
  }
  async deletePolicy(id: string) {
    await this.ownPolicy(id);
    await this.prisma.policy.delete({ where: { id } });
    return { ok: true };
  }
  async acknowledgePolicy(id: string) {
    const actorId = this.actorId();
    await this.ownPolicy(id); // also asserts same org
    await this.prisma.policyAcknowledgement.upsert({
      where: { policyId_userId: { policyId: id, userId: actorId } },
      create: { policyId: id, userId: actorId }, update: {},
    });
    return { ok: true };
  }
  /** Who has / hasn't acknowledged — HR view of compliance. */
  async policyAckStatus(id: string) {
    const organizationId = await this.actor.requireOrgId();
    await this.ownPolicy(id);
    const [acks, users] = await Promise.all([
      this.prisma.policyAcknowledgement.findMany({ where: { policyId: id }, select: { userId: true, acknowledgedAt: true } }),
      this.prisma.user.findMany({ where: { organizationId, status: 'ACTIVE', deletedAt: null }, select: USER_SELECT }),
    ]);
    const ackMap = new Map(acks.map(a => [a.userId, a.acknowledgedAt]));
    return users.map(u => ({ user: u, acknowledgedAt: ackMap.get(u.id) ?? null }));
  }
}

@Controller('company')
export class CompanyController {
  constructor(private readonly svc: CompanyService) {}

  // ── reads: open to any authenticated user ──────────────────────────────────────
  @Get('announcements') listAnnouncements() { return this.svc.listAnnouncements(); }
  @Get('celebrations') celebrations() { return this.svc.celebrations(); }
  @Get('directory') directory() { return this.svc.directory(); }
  @Get('rewards') listRewards(@Query('period') period?: string) { return this.svc.listRewards(period); }
  @Get('policies') listPolicies() { return this.svc.listPolicies(); }
  @Post('policies/:id/acknowledge') acknowledge(@Param('id') id: string) { return this.svc.acknowledgePolicy(id); }

  // ── recognition (give/delete gated by reward.give) ──────────────────────────────
  @Post('rewards') @RequirePermission('reward.give')
  giveReward(@Body() dto: RewardDto) { return this.svc.giveReward(dto); }
  @Delete('rewards/:id') @RequirePermission('reward.give')
  deleteReward(@Param('id') id: string) { return this.svc.deleteReward(id); }

  // ── announcements (HR) ──────────────────────────────────────────────────────────
  @Post('announcements') @RequirePermission('announcement.manage')
  createAnnouncement(@Body() dto: AnnouncementDto) { return this.svc.createAnnouncement(dto); }
  @Patch('announcements/:id') @RequirePermission('announcement.manage')
  updateAnnouncement(@Param('id') id: string, @Body() dto: AnnouncementDto) { return this.svc.updateAnnouncement(id, dto); }
  @Post('announcements/:id/pin') @RequirePermission('announcement.manage')
  pin(@Param('id') id: string) { return this.svc.togglePin(id); }
  @Delete('announcements/:id') @RequirePermission('announcement.manage')
  deleteAnnouncement(@Param('id') id: string) { return this.svc.deleteAnnouncement(id); }

  // ── policies (HR) ────────────────────────────────────────────────────────────────
  @Post('policies') @RequirePermission('policy.manage')
  createPolicy(@Body() dto: PolicyDto) { return this.svc.createPolicy(dto); }
  @Patch('policies/:id') @RequirePermission('policy.manage')
  updatePolicy(@Param('id') id: string, @Body() dto: PolicyDto) { return this.svc.updatePolicy(id, dto); }
  @Delete('policies/:id') @RequirePermission('policy.manage')
  deletePolicy(@Param('id') id: string) { return this.svc.deletePolicy(id); }
  @Get('policies/:id/acknowledgements') @RequirePermission('policy.manage')
  ackStatus(@Param('id') id: string) { return this.svc.policyAckStatus(id); }
}

@Module({
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
