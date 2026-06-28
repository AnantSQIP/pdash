import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';

class CreateCommentDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsString()
  userId!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

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
    const comment = await this.prisma.comment.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        userId: dto.userId,
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
      actorId: dto.userId,
      metadata: {
        projectId: dto.entityType === 'PROJECT' ? dto.entityId : undefined,
        commentId: comment.id,
        snippet: dto.content.slice(0, 140),
      },
    });
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

  @Post()
  create(@Body() dto: CreateCommentDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
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
