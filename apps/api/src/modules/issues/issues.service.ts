import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIssueDto, UpdateIssueDto } from './dto';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true };

@Injectable()
export class IssuesService {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: string, status?: string) {
    return this.prisma.issue.findMany({
      where: { projectId, deletedAt: null, status },
      include: {
        reporter: { select: USER_SELECT },
        assignee: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const issue = await this.prisma.issue.findFirst({
      where: { id, deletedAt: null },
      include: {
        reporter: { select: USER_SELECT },
        assignee: { select: USER_SELECT },
      },
    });
    if (!issue) throw new NotFoundException(`Issue ${id} not found`);
    return issue;
  }

  create(dto: CreateIssueDto) {
    return this.prisma.issue.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity ?? 'MINOR',
        reportedBy: dto.reportedBy,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: {
        reporter: { select: USER_SELECT },
        assignee: { select: USER_SELECT },
      },
    });
  }

  async update(id: string, dto: UpdateIssueDto) {
    await this.get(id);
    return this.prisma.issue.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        status: dto.status,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: {
        reporter: { select: USER_SELECT },
        assignee: { select: USER_SELECT },
      },
    });
  }

  async softDelete(id: string) {
    await this.get(id);
    return this.prisma.issue.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
