import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { NotificationsService } from '../notifications/notifications.module';
import { EVENTS } from '../../common/events/canonical-events';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';

class CreateCommentDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  // Deprecated/ignored — the author is taken from the verified cookie actor.
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @MinLength(1)
  content!: string;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Who to notify about a new comment: task assignees, or an issue's assignee + reporter. */
  private async commentRecipients(entityType: string, entityId: string): Promise<string[]> {
    const ids = new Set<string>();
    if (entityType === 'TASK') {
      const task = await this.prisma.task.findUnique({ where: { id: entityId }, select: { assignees: { select: { userId: true } } } });
      task?.assignees.forEach(a => ids.add(a.userId));
    } else if (entityType === 'ISSUE') {
      const issue = await this.prisma.issue.findUnique({ where: { id: entityId }, select: { assigneeId: true, reportedBy: true } });
      if (issue?.assigneeId) ids.add(issue.assigneeId);
      if (issue?.reportedBy) ids.add(issue.reportedBy);
    }
    return [...ids];
  }

  list(entityType: string, entityId: string) {
    return this.prisma.comment.findMany({
      where: { entityType, entityId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateCommentDto) {
    // Author is the verified cookie actor — never a client-supplied id.
    const userId = getActorId() ?? dto.userId ?? 'system';
    const comment = await this.prisma.comment.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        userId,
        content: dto.content,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.events.emit({
      action: EVENTS.COMMENT_CREATED,
      entityType: dto.entityType,
      entityId: dto.entityId,
      metadata: {
        projectId: dto.entityType === 'PROJECT' ? dto.entityId : undefined,
        commentId: comment.id,
        snippet: dto.content.slice(0, 140),
      },
    });
    // M13: notify the entity's participants (previously posting a comment notified no one).
    const recipients = (await this.commentRecipients(dto.entityType, dto.entityId)).filter(uid => uid !== userId);
    if (recipients.length) {
      const who = `${comment.user.firstName} ${comment.user.lastName ?? ''}`.trim();
      await this.notifications.notify(recipients, {
        type: 'comment.created',
        title: 'New comment',
        message: `${who} commented: "${dto.content.slice(0, 100)}"`,
      });
    }
    return comment;
  }

  async softDelete(id: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException(`Comment ${id} not found`);
    return this.prisma.comment.update({
      where: { id },
      data: { content: '[deleted]' },
    });
  }
}

@Controller('comments')
class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get()
  list(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.service.list(entityType, entityId);
  }

  @Post() @RequirePermission('comment.create')
  create(@Body() dto: CreateCommentDto) {
    return this.service.create(dto);
  }

  @Delete(':id') @RequirePermission('comment.delete')
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}

@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
