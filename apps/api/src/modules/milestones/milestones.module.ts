import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

class CreateMilestoneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

class UpdateMilestoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercentage?: number;
}

@Injectable()
export class MilestonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateMilestoneDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const count = await this.prisma.milestone.count({ where: { projectId, deletedAt: null } });
    return this.prisma.milestone.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        ownerId: dto.ownerId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        sequence: count,
      },
    });
  }

  list(projectId: string) {
    return this.prisma.milestone.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { sequence: 'asc' },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        currentStatus: true,
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, taskLists: true } },
      },
    });
  }

  async get(projectId: string, id: string) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, projectId, deletedAt: null },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        currentStatus: true,
        taskLists: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } },
      },
    });
    if (!milestone) throw new NotFoundException(`Milestone ${id} not found`);
    return milestone;
  }

  async update(projectId: string, id: string, dto: UpdateMilestoneDto) {
    await this.get(projectId, id);
    return this.prisma.milestone.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        ownerId: dto.ownerId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        completionPercentage: dto.completionPercentage,
      },
    });
  }

  async softDelete(projectId: string, id: string) {
    const milestone = await this.get(projectId, id);
    return this.prisma.milestone.update({
      where: { id: milestone.id },
      data: { deletedAt: new Date() },
    });
  }

  /** All tasks under a milestone (via ProjectTask join). */
  async tasks(projectId: string, id: string) {
    await this.get(projectId, id);
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        projectTasks: { some: { projectId, milestoneId: id } },
      },
      orderBy: { createdAt: 'asc' },
      include: { currentStatus: true, assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
    });
  }
}

@Controller('projects/:projectId/milestones')
class MilestonesController {
  constructor(private readonly service: MilestonesService) {}

  @Post() @RequirePermission('milestone.create')
  create(@Param('projectId') projectId: string, @Body() dto: CreateMilestoneDto) {
    return this.service.create(projectId, dto);
  }

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':id')
  get(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.get(projectId, id);
  }

  @Patch(':id') @RequirePermission('milestone.update')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateMilestoneDto) {
    return this.service.update(projectId, id, dto);
  }

  @Delete(':id') @RequirePermission('milestone.delete')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.softDelete(projectId, id);
  }

  @Get(':id/tasks')
  tasks(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.tasks(projectId, id);
  }
}

@Module({
  controllers: [MilestonesController],
  providers: [MilestonesService],
  exports: [MilestonesService],
})
export class MilestonesModule {}
