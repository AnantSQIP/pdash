import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto, ApprovalDto } from './dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * D2: any user may request project creation. Project starts with no workflow
   * status (pending approval). A generic Approval record is created, which an
   * admin action will resolve via ApprovalAction.
   * The mandatory "General" task list is also created in the same transaction.
   */
  async create(organizationId: string, dto: CreateProjectDto) {
    const creator = await this.prisma.user.findFirst({
      where: { id: dto.createdBy, organizationId, deletedAt: null },
    });
    if (!creator) throw new BadRequestException(`User ${dto.createdBy} not in organization`);

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          title: dto.title,
          description: dto.description,
          projectPhase: 'PLANNING',
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          createdBy: dto.createdBy,
          members: {
            create: { userId: dto.createdBy, projectRole: 'MANAGER' },
          },
          taskLists: {
            create: { name: 'General', isDefault: true, sequence: 0 },
          },
        },
        include: { taskLists: true },
      });

      // D2: create generic Approval record for this project
      await tx.approval.create({
        data: {
          entityType: 'PROJECT',
          entityId: project.id,
          status: 'PENDING',
          requestedBy: dto.createdBy,
        },
      });

      return project;
    });
  }

  list(organizationId: string, opts: { phase?: string } = {}) {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        members: { some: { user: { organizationId } } },
        projectPhase: opts.phase,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { projectTasks: true, members: true } },
      },
    });
  }

  async get(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        currentStatus: true,
        taskLists: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
        milestones: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
        _count: { select: { projectTasks: true, members: true } },
      },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.get(id);
    return this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        projectPhase: dto.projectPhase,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  /**
   * D2: approve or reject a project via the generic Approval entity.
   * The acting user must have project.approve permission; for now
   * we enforce Admin role lookup until the PermissionGuard is wired (M5).
   */
  async decide(id: string, approve: boolean, dto: ApprovalDto) {
    const project = await this.get(id);

    const approval = await this.prisma.approval.findFirst({
      where: { entityType: 'PROJECT', entityId: id, status: 'PENDING' },
    });
    if (!approval) {
      throw new BadRequestException(`No pending approval for project ${id}.`);
    }

    await this.assertHasProjectApprovePermission(dto.actingUserId);

    return this.prisma.$transaction(async (tx) => {
      const newStatus = approve ? 'APPROVED' : 'REJECTED';

      await tx.approvalAction.create({
        data: {
          approvalId: approval.id,
          userId: dto.actingUserId,
          action: approve ? 'APPROVE' : 'REJECT',
          comments: dto.reason,
        },
      });

      await tx.approval.update({
        where: { id: approval.id },
        data: { status: newStatus },
      });

      // Advance project phase to ACTIVE on approval, back to PLANNING on rejection
      return tx.project.update({
        where: { id },
        data: { projectPhase: approve ? 'ACTIVE' : 'PLANNING' },
      });
    });
  }

  async softDelete(id: string) {
    await this.get(id);
    return this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date(), projectPhase: 'ARCHIVED' },
    });
  }

  private async assertHasProjectApprovePermission(userId: string) {
    // Temporary: check for Admin/Super Admin role until PermissionGuard lands in M5.
    // Replace with PermissionService.check(userId, 'project.approve') in M5.
    const adminRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: { name: { in: ['Admin', 'Super Admin'] } },
      },
      include: { role: true },
    });
    if (!adminRole) {
      throw new ForbiddenException('project.approve permission required.');
    }
  }
}
