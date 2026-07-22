import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateIssueDto, UpdateIssueDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { ProjectAccessService } from '../../common/access/project-access.module';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true };
const TS_SELECT = { id: true, hoursLogged: true, billable: true, date: true } as const;

/**
 * "Issues" are now TECHNICAL ISSUES / glitches a person hit while working — not a bug
 * tracker. Raising one records the time it cost as a NON-BILLABLE timesheet entry (the
 * issue IS the time entry), so it shows up under the non-billable timesheets section.
 */
@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly access: ProjectAccessService,
  ) {}

  /** Resolve an issue's project, then assert the actor may access that project. */
  private async assertIssueAccess(id: string): Promise<{ projectId: string }> {
    const issue = await this.prisma.issue.findFirst({ where: { id, deletedAt: null }, select: { projectId: true } });
    if (!issue) throw new NotFoundException(`Issue ${id} not found`);
    await this.access.assertProjectAccess(getActorId(), issue.projectId);
    return issue;
  }

  private include = {
    reporter: { select: USER_SELECT },
    timesheets: { where: { deletedAt: null }, select: TS_SELECT },
  } as const;

  /** Flatten the linked non-billable entry's hours onto the issue for the UI. */
  private shape<T extends { timesheets: { hoursLogged: number }[] }>(issue: T) {
    const { timesheets, ...rest } = issue;
    return { ...rest, hours: timesheets.reduce((s, t) => s + t.hoursLogged, 0) };
  }

  async list(projectId: string) {
    if (!projectId) return [];
    await this.access.assertProjectAccess(getActorId(), projectId);
    const rows = await this.prisma.issue.findMany({
      where: { projectId, deletedAt: null },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => this.shape(r));
  }

  async get(id: string) {
    await this.assertIssueAccess(id);
    const issue = await this.prisma.issue.findFirst({ where: { id, deletedAt: null }, include: this.include });
    if (!issue) throw new NotFoundException(`Issue ${id} not found`);
    return this.shape(issue);
  }

  /** Raise a technical issue → also logs the time it cost as a non-billable timesheet. */
  async create(dto: CreateIssueDto) {
    await this.access.assertProjectAccess(getActorId(), dto.projectId);
    const reportedBy = getActorId() ?? 'system';
    const hours = dto.hours && dto.hours > 0 ? dto.hours : 0;
    const date = dto.date ? new Date(dto.date) : new Date();
    const issue = await this.prisma.$transaction(async (tx) => {
      const created = await tx.issue.create({
        data: { projectId: dto.projectId, title: dto.title, description: dto.description ?? null, reportedBy },
      });
      // The issue's cost is recorded as NON-BILLABLE time against the issue (no task).
      if (hours > 0) {
        await tx.timesheet.create({
          data: { userId: reportedBy, issueId: created.id, taskId: null, date, hoursLogged: hours, billable: false, notes: dto.title },
        });
      }
      return tx.issue.findUnique({ where: { id: created.id }, include: this.include });
    });
    await this.events.emit({
      action: EVENTS.ISSUE_CREATED, entityType: 'ISSUE', entityId: issue!.id,
      metadata: { projectId: dto.projectId, title: issue!.title, hours },
    });
    return this.shape(issue!);
  }

  async update(id: string, dto: UpdateIssueDto) {
    await this.get(id);
    const issue = await this.prisma.issue.update({
      where: { id },
      data: { title: dto.title, description: dto.description },
      include: this.include,
    });
    await this.events.emit({
      action: EVENTS.ISSUE_UPDATED, entityType: 'ISSUE', entityId: id,
      metadata: { projectId: issue.projectId, title: issue.title },
    });
    return this.shape(issue);
  }

  /** Soft-delete the issue and its non-billable time entry together. */
  async softDelete(id: string) {
    await this.get(id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.timesheet.updateMany({ where: { issueId: id, deletedAt: null }, data: { deletedAt: now } }),
      this.prisma.issue.update({ where: { id }, data: { deletedAt: now } }),
    ]);
    return { ok: true };
  }
}
