import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

class AddApprovalActionDto {
  @IsString()
  userId!: string;

  @IsIn(['APPROVE', 'REJECT', 'COMMENT', 'DELEGATE'])
  action!: string;

  @IsOptional()
  @IsString()
  comments?: string;
}

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.get(id);

    const action = await this.prisma.approvalAction.create({
      data: {
        approvalId: id,
        userId: dto.userId,
        action: dto.action,
        comments: dto.comments ?? null,
      },
    });

    if (dto.action === 'APPROVE' || dto.action === 'REJECT') {
      const newStatus = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await this.prisma.approval.update({
        where: { id },
        data: { status: newStatus },
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
