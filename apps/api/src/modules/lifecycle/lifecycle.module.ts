import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString,
  MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';

const PROCESS_TYPES = ['ONBOARDING', 'OFFBOARDING'];
const LETTER_TYPES = ['OFFER', 'APPOINTMENT', 'CONFIRMATION', 'RELIEVING', 'EXPERIENCE', 'OTHER'];
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true, designation: true };

// ── DTOs ─────────────────────────────────────────────────────────────────────
class StartProcessDto {
  @IsString() userId!: string;
  @IsIn(PROCESS_TYPES) type!: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsDateString() lastWorkingDay?: string;
}
class TaskDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}
class TemplateItemDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsInt() @Min(0) dueDays?: number;
}
class TemplateDto {
  @IsIn(PROCESS_TYPES) type!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}
class TemplateItemsDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TemplateItemDto)
  items!: TemplateItemDto[];
}
class LetterDto {
  @IsString() userId!: string;
  @IsIn(LETTER_TYPES) type!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
}

@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly notifications: NotificationsService,
  ) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  private taskProgress(tasks: { done: boolean }[]) {
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    return { total, done };
  }

  // ── processes (manager/HR view) ─────────────────────────────────────────────
  async list(type?: string) {
    const organizationId = await this.actor.requireOrgId();
    const rows = await this.prisma.lifecycleProcess.findMany({
      where: { organizationId, ...(type && PROCESS_TYPES.includes(type) ? { type } : {}) },
      include: { user: { select: USER_SELECT }, tasks: { select: { done: true } } },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
    });
    return rows.map(({ tasks, ...p }) => ({ ...p, progress: this.taskProgress(tasks) }));
  }

  private async getProcess(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const p = await this.prisma.lifecycleProcess.findFirst({
      where: { id, organizationId },
      include: { user: { select: USER_SELECT }, tasks: { orderBy: [{ sequence: 'asc' }, { dueDate: 'asc' }] } },
    });
    if (!p) throw new NotFoundException('Process not found');
    return p;
  }
  get(id: string) { return this.getProcess(id); }

  async start(dto: StartProcessDto) {
    const organizationId = await this.actor.requireOrgId();
    const startedBy = this.actorId();
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, organizationId }, select: { id: true, firstName: true } });
    if (!user) throw new NotFoundException('Employee not found');
    // Guard against a duplicate open process of the same type.
    const open = await this.prisma.lifecycleProcess.findFirst({ where: { organizationId, userId: dto.userId, type: dto.type, status: 'IN_PROGRESS' } });
    if (open) throw new BadRequestException(`An open ${dto.type.toLowerCase()} process already exists for this person.`);

    const startedAt = new Date();
    let taskData: { title: string; description: string | null; dueDate: Date | null; sequence: number }[] = [];
    if (dto.templateId) {
      const tpl = await this.prisma.checklistTemplate.findFirst({
        where: { id: dto.templateId, organizationId, type: dto.type },
        include: { items: { orderBy: { sequence: 'asc' } } },
      });
      if (!tpl) throw new BadRequestException('Template not found for this process type.');
      taskData = tpl.items.map((it, i) => ({
        title: it.title,
        description: it.description ?? null,
        dueDate: it.dueDays != null ? new Date(startedAt.getTime() + it.dueDays * 24 * 60 * 60_000) : null,
        sequence: i,
      }));
    }
    const process = await this.prisma.lifecycleProcess.create({
      data: {
        organizationId, userId: dto.userId, type: dto.type, startedBy, startedAt,
        notes: dto.notes ?? null, reason: dto.reason ?? null,
        lastWorkingDay: dto.lastWorkingDay ? new Date(dto.lastWorkingDay) : null,
        tasks: taskData.length ? { create: taskData } : undefined,
      },
    });
    const verb = dto.type === 'ONBOARDING' ? 'Onboarding' : 'Offboarding';
    await this.notifications.notify([dto.userId], {
      type: 'lifecycle.started', title: `${verb} started`,
      message: `Your ${verb.toLowerCase()} process has been started${taskData.length ? ` with ${taskData.length} task(s)` : ''}.`,
      link: '/my-hr',
    });
    return this.getProcess(process.id);
  }

  async addTask(processId: string, dto: TaskDto) {
    const p = await this.getProcess(processId);
    const max = await this.prisma.lifecycleTask.aggregate({ where: { processId }, _max: { sequence: true } });
    await this.prisma.lifecycleTask.create({
      data: {
        processId: p.id, title: dto.title.trim(), description: dto.description?.trim() || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null, sequence: (max._max.sequence ?? -1) + 1,
      },
    });
    return this.getProcess(processId);
  }

  async updateTask(processId: string, taskId: string, dto: UpdateTaskDto) {
    await this.getProcess(processId);
    const task = await this.prisma.lifecycleTask.findFirst({ where: { id: taskId, processId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.prisma.lifecycleTask.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.done !== undefined ? { done: dto.done, doneAt: dto.done ? new Date() : null, doneBy: dto.done ? this.actorId() : null } : {}),
      },
    });
    return this.getProcess(processId);
  }

  async deleteTask(processId: string, taskId: string) {
    await this.getProcess(processId);
    await this.prisma.lifecycleTask.deleteMany({ where: { id: taskId, processId } });
    return this.getProcess(processId);
  }

  async complete(id: string) {
    const p = await this.getProcess(id);
    if (p.status !== 'IN_PROGRESS') throw new BadRequestException('This process is already closed.');
    await this.prisma.lifecycleProcess.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    // Completing an offboarding deactivates the person (a real exit route — not a delete,
    // so all their history is preserved).
    if (p.type === 'OFFBOARDING') {
      await this.prisma.user.update({ where: { id: p.userId }, data: { status: 'INACTIVE' } });
    }
    const verb = p.type === 'ONBOARDING' ? 'Onboarding' : 'Offboarding';
    await this.notifications.notify([p.userId], {
      type: 'lifecycle.completed', title: `${verb} completed`,
      message: `Your ${verb.toLowerCase()} process is complete.`, link: '/my-hr',
    });
    return this.getProcess(id);
  }

  async cancel(id: string) {
    const p = await this.getProcess(id);
    if (p.status !== 'IN_PROGRESS') throw new BadRequestException('This process is already closed.');
    await this.prisma.lifecycleProcess.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
    return this.getProcess(id);
  }

  // ── the actor's OWN lifecycle (no permission — own data) ─────────────────────
  async listMine() {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.lifecycleProcess.findMany({
      where: { organizationId, userId: actorId },
      include: { tasks: { orderBy: [{ sequence: 'asc' }, { dueDate: 'asc' }] } },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** The subject ticks off their own onboarding task. */
  async toggleMyTask(taskId: string, done: boolean) {
    const actorId = this.actorId();
    const task = await this.prisma.lifecycleTask.findUnique({ where: { id: taskId }, include: { process: { select: { userId: true } } } });
    if (!task || task.process.userId !== actorId) throw new NotFoundException('Task not found');
    await this.prisma.lifecycleTask.update({
      where: { id: taskId },
      data: { done, doneAt: done ? new Date() : null, doneBy: done ? actorId : null },
    });
    return { ok: true, done };
  }

  // ── checklist templates (HR) ────────────────────────────────────────────────
  async listTemplates(type?: string) {
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.checklistTemplate.findMany({
      where: { organizationId, ...(type && PROCESS_TYPES.includes(type) ? { type } : {}) },
      include: { items: { orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }
  async createTemplate(dto: TemplateDto) {
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.checklistTemplate.create({ data: { organizationId, type: dto.type, name: dto.name.trim() }, include: { items: true } });
  }
  private async ownTemplate(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const t = await this.prisma.checklistTemplate.findFirst({ where: { id, organizationId } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }
  async renameTemplate(id: string, name: string) {
    await this.ownTemplate(id);
    return this.prisma.checklistTemplate.update({ where: { id }, data: { name: name.trim() }, include: { items: { orderBy: { sequence: 'asc' } } } });
  }
  async deleteTemplate(id: string) {
    await this.ownTemplate(id);
    await this.prisma.checklistTemplate.delete({ where: { id } });
    return { ok: true };
  }
  async setTemplateItems(id: string, items: TemplateItemDto[]) {
    await this.ownTemplate(id);
    await this.prisma.$transaction([
      this.prisma.checklistTemplateItem.deleteMany({ where: { templateId: id } }),
      this.prisma.checklistTemplateItem.createMany({
        data: items.map((it, i) => ({ templateId: id, title: it.title.trim(), description: it.description?.trim() || null, dueDays: it.dueDays ?? null, sequence: i })),
      }),
    ]);
    return this.prisma.checklistTemplate.findUnique({ where: { id }, include: { items: { orderBy: { sequence: 'asc' } } } });
  }

  // ── HR letters ──────────────────────────────────────────────────────────────
  async listLetters(userId?: string) {
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.hrLetter.findMany({
      where: { organizationId, ...(userId ? { userId } : {}) },
      include: { user: { select: USER_SELECT } },
      orderBy: { issuedAt: 'desc' },
    });
  }
  async listMyLetters() {
    const actorId = this.actorId();
    const organizationId = await this.actor.requireOrgId();
    return this.prisma.hrLetter.findMany({ where: { organizationId, userId: actorId }, orderBy: { issuedAt: 'desc' } });
  }
  async issueLetter(dto: LetterDto) {
    const organizationId = await this.actor.requireOrgId();
    const issuedBy = this.actorId();
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, organizationId }, select: { id: true } });
    if (!user) throw new NotFoundException('Employee not found');
    const letter = await this.prisma.hrLetter.create({
      data: { organizationId, userId: dto.userId, type: dto.type, title: dto.title.trim(), body: dto.body, issuedBy },
    });
    await this.notifications.notify([dto.userId], {
      type: 'letter.issued', title: 'A letter was issued to you',
      message: `"${letter.title}" is available in your HR letters.`, link: '/my-hr',
    });
    return letter;
  }
  async acknowledgeLetter(id: string) {
    const actorId = this.actorId();
    const letter = await this.prisma.hrLetter.findUnique({ where: { id } });
    if (!letter || letter.userId !== actorId) throw new NotFoundException('Letter not found');
    if (letter.acknowledgedAt) return letter;
    return this.prisma.hrLetter.update({ where: { id }, data: { acknowledgedAt: new Date() } });
  }
  async deleteLetter(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const letter = await this.prisma.hrLetter.findFirst({ where: { id, organizationId } });
    if (!letter) throw new NotFoundException('Letter not found');
    await this.prisma.hrLetter.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('lifecycle')
export class LifecycleController {
  constructor(private readonly svc: LifecycleService) {}

  // ── own surfaces (any authenticated user) — declared before ':id' routes ─────
  @Get('me') listMine() { return this.svc.listMine(); }
  @Get('me/letters') listMyLetters() { return this.svc.listMyLetters(); }
  @Post('me/tasks/:taskId/toggle')
  toggleMyTask(@Param('taskId') taskId: string, @Body() body: { done: boolean }) { return this.svc.toggleMyTask(taskId, !!body.done); }
  @Post('letters/:id/acknowledge') acknowledge(@Param('id') id: string) { return this.svc.acknowledgeLetter(id); }

  // ── templates (HR) ───────────────────────────────────────────────────────────
  @Get('templates') @RequirePermission('lifecycle.manage')
  listTemplates(@Query('type') type?: string) { return this.svc.listTemplates(type); }
  @Post('templates') @RequirePermission('lifecycle.manage')
  createTemplate(@Body() dto: TemplateDto) { return this.svc.createTemplate(dto); }
  @Patch('templates/:id') @RequirePermission('lifecycle.manage')
  renameTemplate(@Param('id') id: string, @Body() dto: { name: string }) { return this.svc.renameTemplate(id, dto.name); }
  @Delete('templates/:id') @RequirePermission('lifecycle.manage')
  deleteTemplate(@Param('id') id: string) { return this.svc.deleteTemplate(id); }
  @Put('templates/:id/items') @RequirePermission('lifecycle.manage')
  setTemplateItems(@Param('id') id: string, @Body() dto: TemplateItemsDto) { return this.svc.setTemplateItems(id, dto.items); }

  // ── letters (HR) ──────────────────────────────────────────────────────────────
  @Get('letters') @RequirePermission('lifecycle.manage')
  listLetters(@Query('userId') userId?: string) { return this.svc.listLetters(userId); }
  @Post('letters') @RequirePermission('lifecycle.manage')
  issueLetter(@Body() dto: LetterDto) { return this.svc.issueLetter(dto); }
  @Delete('letters/:id') @RequirePermission('lifecycle.manage')
  deleteLetter(@Param('id') id: string) { return this.svc.deleteLetter(id); }

  // ── processes (HR view/manage) ────────────────────────────────────────────────
  @Get() @RequirePermission('lifecycle.view')
  list(@Query('type') type?: string) { return this.svc.list(type); }
  @Post() @RequirePermission('lifecycle.manage')
  start(@Body() dto: StartProcessDto) { return this.svc.start(dto); }
  @Get(':id') @RequirePermission('lifecycle.view')
  get(@Param('id') id: string) { return this.svc.get(id); }
  @Post(':id/tasks') @RequirePermission('lifecycle.manage')
  addTask(@Param('id') id: string, @Body() dto: TaskDto) { return this.svc.addTask(id, dto); }
  @Patch(':id/tasks/:taskId') @RequirePermission('lifecycle.manage')
  updateTask(@Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) { return this.svc.updateTask(id, taskId, dto); }
  @Delete(':id/tasks/:taskId') @RequirePermission('lifecycle.manage')
  deleteTask(@Param('id') id: string, @Param('taskId') taskId: string) { return this.svc.deleteTask(id, taskId); }
  @Post(':id/complete') @RequirePermission('lifecycle.manage')
  complete(@Param('id') id: string) { return this.svc.complete(id); }
  @Post(':id/cancel') @RequirePermission('lifecycle.manage')
  cancel(@Param('id') id: string) { return this.svc.cancel(id); }
}

@Module({
  controllers: [LifecycleController],
  providers: [LifecycleService],
})
export class LifecycleModule {}
