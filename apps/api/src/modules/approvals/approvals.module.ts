import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { getActorId } from '../../common/context/request-context';

class AddApprovalActionDto {
  // IGNORED — the actor is derived from the authenticated session, never the body.
  @IsOptional()
  @IsString()
  userId?: string;

  @IsIn(['APPROVE', 'REJECT', 'COMMENT', 'DELEGATE'])
  action!: string;

  @IsOptional()
  @IsString()
  comments?: string;
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  list(entityType: string, entityId: string) {
    return this.prisma.approval.findMany({
      where: { entityType, entityId },
      include: { actions: { orderBy: { timestamp: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const approval = await this.prisma.approval.findUnique({
      where: { id },
      include: { actions: { orderBy: { timestamp: 'asc' } } },
    });
    if (!approval) throw new NotFoundException(`Approval ${id} not found`);
    return approval;
  }

  async addAction(id: string, dto: AddApprovalActionDto) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const approval = await this.get(id);
    const isDecision = dto.action === 'APPROVE' || dto.action === 'REJECT';

    if (isDecision) {
      // Project approvals are decided ONLY via ProjectsService.decide() (which also
      // advances the project phase). A second writer here flips Approval.status and
      // bricks that lookup, leaving projects stuck — so reject them here.
      if (approval.entityType === 'PROJECT') {
        throw new ForbiddenException('Decide project approvals via POST /projects/:id/approve or /reject.');
      }
      if (approval.status !== 'PENDING') {
        throw new BadRequestException('Only a pending approval can be decided.');
      }
      if (approval.requestedBy && approval.requestedBy === actorId) {
        throw new ForbiddenException('You cannot review your own request.');
      }
      const perms = await this.permissions.getEffectivePermissions(actorId);
      const mayDecide = perms.isSuperAdmin
        || perms.codes.includes('approval.decide')
        || perms.codes.includes('project.approve');
      if (!mayDecide) throw new ForbiddenException('You do not have permission to decide approvals.');
    }

    const action = await this.prisma.approvalAction.create({
      data: {
        approvalId: id,
        userId: actorId,
        action: dto.action,
        comments: dto.comments ?? null,
      },
    });

    if (isDecision) {
      await this.prisma.approval.update({
        where: { id },
        data: { status: dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED' },
      });
    }

    return action;
  }
}

@Controller('approvals')
class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get()
  list(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.service.list(entityType, entityId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/actions')
  addAction(@Param('id') id: string, @Body() dto: AddApprovalActionDto) {
    return this.service.addAction(id, dto);
  }
}

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
