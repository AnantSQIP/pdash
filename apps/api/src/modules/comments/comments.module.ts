import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { NotificationsService } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentsService, DOC_SELECT } from '../documents/documents.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
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

  // Optional so an attachment-only comment is valid; the service requires
  // content OR at least one attachment.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  // Ids of documents the actor uploaded via POST /documents (unattached).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  documentIds?: string[];

  // User ids this message @mentions. Server-validated: only actual members of the comment's
  // project are notified; anything else is ignored.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  mentionedUserIds?: string[];
}

// Attachment projection on comments — deleted documents drop out automatically.
const ATTACHMENTS_INCLUDE = {
  where: { document: { deletedAt: null } },
  select: { document: { select: DOC_SELECT } },
} as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
    private readonly access: ProjectAccessService,
  ) {}

  /** The project a comment's entity belongs to — mentions are scoped to that project's members. */
  private async projectIdOfEntity(entityType: string, entityId: string): Promise<string | null> {
    if (entityType === 'PROJECT') return entityId;
    if (entityType === 'TASK') {
      const pt = await this.prisma.projectTask.findFirst({ where: { taskId: entityId }, select: { projectId: true } });
      return pt?.projectId ?? null;
    }
    if (entityType === 'ISSUE') {
      const issue = await this.prisma.issue.findUnique({ where: { id: entityId }, select: { projectId: true } });
      return issue?.projectId ?? null;
    }
    return null;
  }

  /** Resolve requested @mentions to REAL, active members of the comment's project (drops anyone
   *  else). This is what scopes "tag project members" — you can't mention a non-member. */
  private async resolveMentions(entityType: string, entityId: string, requested: string[]): Promise<string[]> {
    if (!requested.length) return [];
    const projectId = await this.projectIdOfEntity(entityType, entityId);
    if (!projectId) return [];
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, isActive: true, userId: { in: [...new Set(requested)] } },
      select: { userId: true },
    });
    return members.map(m => m.userId);
  }

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

  async list(entityType: string, entityId: string) {
    // A comment thread is only for people who can access the underlying matter — otherwise
    // any user could read a confidential project/task/issue discussion by entityId (IDOR).
    await this.access.assertEntityAccess(getActorId(), entityType, entityId);
    return this.prisma.comment.findMany({
      where: { entityType, entityId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        attachments: ATTACHMENTS_INCLUDE,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Comment attachments must also surface in the project's "Files" tab, so a
   * PROJECT comment links its documents via ProjectDocument and a TASK comment
   * via TaskDocument (which the Files listing aggregates through ProjectTask).
   */
  private async linkAttachmentsToEntity(entityType: string, entityId: string, documentIds: string[]) {
    if (!documentIds.length) return;
    const type = entityType.toUpperCase();
    if (type === 'PROJECT') {
      const project = await this.prisma.project.findFirst({ where: { id: entityId, deletedAt: null }, select: { id: true } });
      if (!project) return;
      await this.prisma.projectDocument.createMany({
        data: documentIds.map(documentId => ({ projectId: entityId, documentId })),
        skipDuplicates: true,
      });
    } else if (type === 'TASK') {
      const task = await this.prisma.task.findFirst({ where: { id: entityId, deletedAt: null }, select: { id: true } });
      if (!task) return;
      await this.prisma.taskDocument.createMany({
        data: documentIds.map(documentId => ({ taskId: entityId, documentId })),
        skipDuplicates: true,
      });
    }
  }

  async create(dto: CreateCommentDto) {
    // Author is the verified cookie actor — never a client-supplied id.
    const userId = getActorId() ?? dto.userId ?? 'system';
    // Can't post into (or notify the participants of) a matter you have no access to.
    await this.access.assertEntityAccess(getActorId(), dto.entityType, dto.entityId);
    const content = dto.content?.trim() ?? '';
    // Attachments must be the actor's own, still-unattached uploads.
    const documentIds = await this.documents.assertAttachable(dto.documentIds ?? [], userId);
    if (!content && !documentIds.length) throw new BadRequestException('Comment is empty.');
    const comment = await this.prisma.comment.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        userId,
        content,
        attachments: documentIds.length ? { create: documentIds.map(documentId => ({ documentId })) } : undefined,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        attachments: ATTACHMENTS_INCLUDE,
      },
    });
    await this.linkAttachmentsToEntity(dto.entityType, dto.entityId, documentIds);
    await this.events.emit({
      action: EVENTS.COMMENT_CREATED,
      entityType: dto.entityType,
      entityId: dto.entityId,
      metadata: {
        projectId: dto.entityType === 'PROJECT' ? dto.entityId : undefined,
        commentId: comment.id,
        snippet: content.slice(0, 140),
        attachmentCount: documentIds.length || undefined,
      },
    });
    const who = `${comment.user.firstName} ${comment.user.lastName ?? ''}`.trim();
    // @mentions: only real project members can be tagged; each gets a high-signal "mentioned you"
    // notification linking straight to the project discussion.
    const mentioned = (await this.resolveMentions(dto.entityType, dto.entityId, dto.mentionedUserIds ?? []))
      .filter(uid => uid !== userId);
    const mentionedSet = new Set(mentioned);
    if (mentioned.length) {
      await this.notifications.notify(mentioned, {
        type: 'comment.mention',
        title: `${who} mentioned you`,
        message: content ? `"${content.slice(0, 120)}"` : `${who} tagged you on a file.`,
        link: dto.entityType === 'PROJECT' ? `/projects/${dto.entityId}` : undefined,
      });
    }
    // M13: notify the entity's other participants (task assignees / issue participants). Anyone
    // already @mentioned is skipped so they don't get two notifications for one message.
    const recipients = (await this.commentRecipients(dto.entityType, dto.entityId))
      .filter(uid => uid !== userId && !mentionedSet.has(uid));
    if (recipients.length) {
      await this.notifications.notify(recipients, {
        type: 'comment.created',
        title: 'New comment',
        message: content
          ? `${who} commented: "${content.slice(0, 100)}"`
          : `${who} shared ${documentIds.length === 1 ? 'a file' : `${documentIds.length} files`}.`,
      });
    }
    return comment;
  }

  async softDelete(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: { attachments: { select: { documentId: true } } },
    });
    if (!comment) throw new NotFoundException(`Comment ${id} not found`);
    await this.access.assertEntityAccess(getActorId(), comment.entityType, comment.entityId);
    const updated = await this.prisma.comment.update({
      where: { id },
      data: { content: '[deleted]' },
    });
    // Retire the files too: drop the join rows and soft-delete the documents so
    // they also disappear from the project's Files tab.
    if (comment.attachments.length) {
      await this.prisma.commentAttachment.deleteMany({ where: { commentId: id } });
      await this.documents.softDeleteAttached(comment.attachments.map(a => a.documentId));
    }
    return updated;
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
  imports: [DocumentsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
