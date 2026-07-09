import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

class CreateTaskListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  milestoneId?: string;
}

class UpdateTaskListDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  milestoneId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

@Injectable()
export class TaskListsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateTaskListDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const count = await this.prisma.taskList.count({ where: { projectId, deletedAt: null } });
    return this.prisma.taskList.create({
      data: {
        projectId,
        name: dto.name,
        milestoneId: dto.milestoneId,
        sequence: count,
      },
    });
  }

  list(projectId: string, milestoneId?: string) {
    return this.prisma.taskList.findMany({
      where: { projectId, milestoneId, deletedAt: null },
      orderBy: { sequence: 'asc' },
      include: { _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } } },
    });
  }

  async get(projectId: string, id: string) {
    const list = await this.prisma.taskList.findFirst({
      where: { id, projectId, deletedAt: null },
      include: { _count: { select: { projectTasks: { where: { task: { deletedAt: null } } } } } },
    });
    if (!list) throw new NotFoundException(`Task list ${id} not found`);
    return list;
  }

  async update(projectId: string, id: string, dto: UpdateTaskListDto) {
    const list = await this.get(projectId, id);
    if (list.isDefault && dto.name && dto.name !== list.name) {
      throw new BadRequestException('Cannot rename the default "General" task list.');
    }
    return this.prisma.taskList.update({
      where: { id },
      data: { name: dto.name, milestoneId: dto.milestoneId, sequence: dto.sequence },
    });
  }

  async remove(projectId: string, id: string) {
    const list = await this.get(projectId, id);
    if (list.isDefault) {
      throw new BadRequestException('The default "General" task list cannot be deleted.');
    }
    // L2: move this list's tasks onto the default list instead of orphaning the
    // ProjectTask join rows (which pointed at a now-soft-deleted list).
    const def = await this.prisma.taskList.findFirst({ where: { projectId, isDefault: true, deletedAt: null } });
    const [, updated] = await this.prisma.$transaction([
      this.prisma.projectTask.updateMany({ where: { taskListId: id }, data: { taskListId: def?.id ?? null } }),
      this.prisma.taskList.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    return updated;
  }
}

@Controller('projects/:projectId/tasklists')
class TaskListsController {
  constructor(private readonly service: TaskListsService) {}

  @Post() @RequirePermission('tasklist.create')
  create(@Param('projectId') projectId: string, @Body() dto: CreateTaskListDto) {
    return this.service.create(projectId, dto);
  }

  @Get()
  list(@Param('projectId') projectId: string, @Query('milestoneId') milestoneId?: string) {
    return this.service.list(projectId, milestoneId);
  }

  @Get(':id')
  get(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.get(projectId, id);
  }

  @Patch(':id') @RequirePermission('tasklist.update')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateTaskListDto) {
    return this.service.update(projectId, id, dto);
  }

  @Delete(':id') @RequirePermission('tasklist.delete')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.remove(projectId, id);
  }
}

@Module({
  controllers: [TaskListsController],
  providers: [TaskListsService],
  exports: [TaskListsService],
})
export class TaskListsModule {}
