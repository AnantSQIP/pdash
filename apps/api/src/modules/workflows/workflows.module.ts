import { Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Prisma } from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';

class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsIn(['GLOBAL', 'PROJECT_SPECIFIC'])
  type?: string;
}

class CreateWorkflowStatusDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  colorHex?: string;

  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  type?: string;
}

class CreateWorkflowTransitionDto {
  @IsOptional()
  @IsString()
  fromStatusId?: string;

  @IsString()
  toStatusId!: string;

  @IsOptional()
  conditions?: Prisma.InputJsonValue;

  @IsOptional()
  allowedRoles?: Prisma.InputJsonValue;
}

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.workflow.findMany({
      include: {
        statuses: { orderBy: { sequence: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        statuses: { orderBy: { sequence: 'asc' } },
        transitions: {
          include: {
            fromStatus: true,
            toStatus: true,
          },
        },
      },
    });
    if (!workflow) throw new NotFoundException(`Workflow ${id} not found`);
    return workflow;
  }

  create(dto: CreateWorkflowDto) {
    return this.prisma.workflow.create({
      data: {
        name: dto.name,
        type: dto.type ?? 'GLOBAL',
      },
    });
  }

  async listStatuses(workflowId: string) {
    await this.get(workflowId);
    return this.prisma.workflowStatus.findMany({
      where: { workflowId },
      orderBy: { sequence: 'asc' },
    });
  }

  async createTransition(workflowId: string, dto: CreateWorkflowTransitionDto) {
    await this.get(workflowId);
    return this.prisma.workflowTransition.create({
      data: {
        workflowId,
        fromStatusId: dto.fromStatusId ?? null,
        toStatusId: dto.toStatusId,
        conditions: dto.conditions ?? undefined,
        allowedRoles: dto.allowedRoles ?? undefined,
      },
      include: {
        fromStatus: true,
        toStatus: true,
      },
    });
  }
}

@Controller('workflows')
class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.service.create(dto);
  }

  @Get(':id/statuses')
  listStatuses(@Param('id') id: string) {
    return this.service.listStatuses(id);
  }

  @Post(':workflowId/transitions')
  createTransition(
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateWorkflowTransitionDto,
  ) {
    return this.service.createTransition(workflowId, dto);
  }
}

@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
