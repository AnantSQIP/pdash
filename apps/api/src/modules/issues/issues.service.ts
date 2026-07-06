import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateIssueDto, UpdateIssueDto } from './dto';
import { getActorId } from '../../common/context/request-context';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true };

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  list(projectId: string, status?: string) {
    // Require an explicit project scope — never return every project's issues.
    if (!projectId) return [];
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

  async create(dto: CreateIssueDto) {
    // Reporter is the verified cookie actor — never a client-supplied id.
    const reportedBy = getActorId() ?? dto.reportedBy ?? 'system';
    const issue = await this.prisma.issue.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity ?? 'MINOR',
        reportedBy,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: {
        reporter: { select: USER_SELECT },
        assignee: { select: USER_SELECT },
      },
    });
    await this.events.emit({
      action: EVENTS.ISSUE_CREATED,
      entityType: 'ISSUE',
      entityId: issue.id,
      metadata: { projectId: dto.projectId, title: issue.title, severity: issue.severity },
    });
    return issue;
  }

  async update(id: string, dto: UpdateIssueDto) {
    const existing = await this.get(id);
    const issue = await this.prisma.issue.update({
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
    const resolved = dto.status === 'RESOLVED' && existing.status !== 'RESOLVED';
    await this.events.emit({
      action: resolved ? EVENTS.ISSUE_RESOLVED : EVENTS.ISSUE_UPDATED,
      entityType: 'ISSUE',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: issue.status },
      metadata: { projectId: issue.projectId, title: issue.title },
    });
    return issue;
  }

  async softDelete(id: string) {
    await this.get(id);
    return this.prisma.issue.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
