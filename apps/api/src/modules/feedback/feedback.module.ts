import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { PermissionService } from '../permissions/permission.service';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';

/**
 * Feedback about a colleague — anyone, at any time, about anyone.
 *
 * The system had no way to record an observation about a person outside an appraisal. An appraisal
 * runs twice a year between one person and their manager; this is the other thing entirely — what
 * somebody noticed in March about a colleague on another team, which by October nobody remembers
 * precisely enough to be fair about, and which currently lives in somebody's memory or not at all.
 *
 * WHO CAN READ IT
 *
 *   • the author — you can see what you wrote
 *   • HR (`appraisal.manage`) — the queue this exists to feed
 *   • the subject's REPORTING MANAGER — the person who has to act on it
 *
 * NOT the subject, and not their colleagues.
 *
 * That was the instruction and it is implemented as given, but the trade-off deserves saying out
 * loud rather than burying: feedback a person cannot see is feedback they cannot answer, correct
 * or act on. It suits "HR should know this happened" and it does not suit "I want this person to
 * improve" — for the second, the appraisal cycle already exists and shows people their remarks.
 * The composer says this where somebody is writing, so the choice is made knowingly rather than
 * by accident.
 */

const KINDS = ['PRAISE', 'CONCERN', 'OBSERVATION'] as const;

class CreateFeedbackDto {
  @IsString() aboutUserId!: string;
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsString() @MinLength(3) @MaxLength(4000) body!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}

class UpdateFeedbackDto {
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(4000) body?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}

const PERSON = { id: true, firstName: true, lastName: true, designation: true, profilePhoto: true } as const;

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
  ) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  /** Everyone whose feedback this actor may read, expressed as a Prisma filter. */
  private async visibilityWhere(actorId: string) {
    if (await this.permissions.check(actorId, 'appraisal.manage')) return {}; // HR sees all
    const reports = await this.prisma.userManager.findMany({
      where: { managerId: actorId }, select: { userId: true },
    });
    return {
      OR: [
        { authorId: actorId },                                   // what I wrote
        { aboutUserId: { in: reports.map(r => r.userId) } },     // about someone who reports to me
      ],
    };
  }

  async create(dto: CreateFeedbackDto) {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();

    if (dto.aboutUserId === actorId) {
      throw new BadRequestException('Feedback is about a colleague — use your self-assessment for your own.');
    }
    const about = await this.prisma.user.findFirst({
      where: { id: dto.aboutUserId, organizationId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, firstName: true },
    });
    if (!about) throw new BadRequestException('That person is not an active member of this organisation.');

    const row = await this.prisma.feedback.create({
      data: {
        organizationId, aboutUserId: about.id, authorId: actorId,
        kind: dto.kind ?? 'OBSERVATION',
        body: dto.body.trim(),
        rating: dto.rating ?? null,
      },
      include: { about: { select: PERSON }, author: { select: PERSON } },
    });

    // HR and the subject's manager are told — otherwise this is a box things are posted into and
    // never read from, which is how a feedback feature dies.
    const [hr, line] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId, status: 'ACTIVE', deletedAt: null,
          userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'appraisal.manage' } } } } } },
        },
        select: { id: true },
      }),
      this.prisma.userManager.findFirst({ where: { userId: about.id }, select: { managerId: true } }),
    ]);
    const recipients = [...new Set([...hr.map(u => u.id), ...(line?.managerId ? [line.managerId] : [])])]
      .filter(id => id !== actorId);
    if (recipients.length) {
      await this.notifications.notify(recipients, {
        type: 'feedback.recorded',
        title: 'Feedback recorded',
        // The subject and the kind, never the body — a notification is read over shoulders and on
        // lock screens, and the content of this is not for that.
        message: `Feedback was recorded about ${about.firstName}.`,
        link: '/feedback',
      });
    }
    return row;
  }

  /** The feedback this actor may read, newest first. */
  async list(opts: { aboutUserId?: string; mine?: boolean } = {}) {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    const scope = await this.visibilityWhere(actorId);
    return this.prisma.feedback.findMany({
      where: {
        organizationId, deletedAt: null,
        ...(opts.mine ? { authorId: actorId } : scope),
        ...(opts.aboutUserId ? { aboutUserId: opts.aboutUserId } : {}),
      },
      include: { about: { select: PERSON }, author: { select: PERSON } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  /** Counts for the HR queue — what is waiting, and what has been dealt with. */
  async summary() {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    const scope = await this.visibilityWhere(actorId);
    const base = { organizationId, deletedAt: null, ...scope };
    const [total, open, byKind] = await Promise.all([
      this.prisma.feedback.count({ where: base }),
      this.prisma.feedback.count({ where: { ...base, acknowledgedAt: null } }),
      this.prisma.feedback.groupBy({ by: ['kind'], where: base, _count: { _all: true } }),
    ]);
    return {
      total, open,
      byKind: KINDS.map(k => ({ kind: k, count: byKind.find(b => b.kind === k)?._count._all ?? 0 })),
    };
  }

  private async load(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const row = await this.prisma.feedback.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { about: { select: PERSON }, author: { select: PERSON } },
    });
    if (!row) throw new NotFoundException('Feedback not found.');
    return row;
  }

  /** Only the author may edit, and only what they wrote. */
  async update(id: string, dto: UpdateFeedbackDto) {
    const actorId = this.actorId();
    const row = await this.load(id);
    if (row.authorId !== actorId) {
      throw new ForbiddenException('Only the person who wrote this can change it.');
    }
    return this.prisma.feedback.update({
      where: { id },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
      },
      include: { about: { select: PERSON }, author: { select: PERSON } },
    });
  }

  /** HR marks it dealt with, so the queue drains rather than growing forever. */
  async acknowledge(id: string) {
    const actorId = this.actorId();
    if (!(await this.permissions.check(actorId, 'appraisal.manage'))) {
      throw new ForbiddenException('Only HR can mark feedback as handled.');
    }
    await this.load(id);
    return this.prisma.feedback.update({
      where: { id },
      data: { acknowledgedAt: new Date(), acknowledgedBy: actorId },
      include: { about: { select: PERSON }, author: { select: PERSON } },
    });
  }

  /**
   * The author may withdraw what they wrote; HR may remove anything.
   *
   * Soft delete, because "who said what about whom, and then unsaid it" is exactly the history an
   * HR record exists to keep.
   */
  async remove(id: string) {
    const actorId = this.actorId();
    const row = await this.load(id);
    const isHr = await this.permissions.check(actorId, 'appraisal.manage');
    if (row.authorId !== actorId && !isHr) {
      throw new ForbiddenException('Only the author or HR can remove this.');
    }
    await this.prisma.feedback.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}

@Controller('feedback')
class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  // No @RequirePermission: writing feedback about a colleague is something anybody may do, and
  // reading is narrowed inside the service to what this actor is entitled to see.
  @Get() list(@Query('aboutUserId') aboutUserId?: string, @Query('mine') mine?: string) {
    return this.svc.list({ aboutUserId, mine: mine === 'true' });
  }
  @Get('summary') summary() { return this.svc.summary(); }
  @Post() create(@Body() dto: CreateFeedbackDto) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) { return this.svc.update(id, dto); }
  @Post(':id/acknowledge') acknowledge(@Param('id') id: string) { return this.svc.acknowledge(id); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
