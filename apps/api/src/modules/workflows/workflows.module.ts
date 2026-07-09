import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Prisma } from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

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

  /** Resolve the 'default' / 'workflow-default' alias to the GLOBAL workflow id. */
  private async resolveId(id: string): Promise<string> {
    if (id === 'default' || id === 'workflow-default') {
      const wf = await this.prisma.workflow.findFirst({
        where: { type: 'GLOBAL' },
        orderBy: { name: 'asc' },
      });
      if (!wf) throw new NotFoundException('No GLOBAL workflow found. Run seed first.');
      return wf.id;
    }
    return id;
  }

  async get(id: string) {
    const resolvedId = await this.resolveId(id);
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: resolvedId },
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
    const resolvedId = await this.resolveId(workflowId);
    await this.get(resolvedId);
    return this.prisma.workflowStatus.findMany({
      where: { workflowId: resolvedId },
      orderBy: { sequence: 'asc' },
    });
  }

  async createTransition(workflowId: string, dto: CreateWorkflowTransitionDto) {
    await this.get(workflowId);
    // L10: the from/to statuses must belong to THIS workflow (previously unchecked,
    // so a transition could reference statuses from another workflow).
    const ids = [dto.toStatusId, ...(dto.fromStatusId ? [dto.fromStatusId] : [])];
    const valid = await this.prisma.workflowStatus.count({ where: { id: { in: ids }, workflowId } });
    if (valid !== ids.length) {
      throw new BadRequestException('fromStatusId/toStatusId must belong to this workflow.');
    }
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

  @Post() @RequirePermission('settings.update')
  create(@Body() dto: CreateWorkflowDto) {
    return this.service.create(dto);
  }

  @Get(':id/statuses')
  listStatuses(@Param('id') id: string) {
    return this.service.listStatuses(id);
  }

  @Post(':workflowId/transitions') @RequirePermission('settings.update')
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
