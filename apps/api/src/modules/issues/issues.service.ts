import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { CreateIssueDto, UpdateIssueDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { serialize, dayKeyFor } from '../../common/db/serialize';
import { startOfIstDay } from '../../common/dates';
import { MAX_HOURS_PER_DAY } from '../timesheets/timesheets.service';

// A person cannot log more than a full day across all entries — same cap as timesheets.
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
    await this.access.assertProjectWritable(dto.projectId); // no new issue-time on completed/closed projects
    const reportedBy = getActorId() ?? 'system';
    const hours = dto.hours && dto.hours > 0 ? dto.hours : 0;
    // Issue time feeds capacity/performance exactly like a timesheet, so it must obey the same
    // rules: normalise to the IST calendar day (the org's day, not UTC's — a UTC "today" is
    // still yesterday until 05:30 IST), reject a future date, and enforce the same 16h/day cap
    // across ALL the user's entries.
    const today = startOfIstDay(new Date());
    const entryDay = dto.date ? new Date(String(dto.date).slice(0, 10)) : today;
    if (isNaN(entryDay.getTime())) throw new BadRequestException('A valid date is required.');
    if (entryDay > today) throw new BadRequestException('You cannot log time for a future date.');
    // The cap check, the issue and its time entry in ONE transaction under the same
    // per-person-per-day lock every timesheet write takes (common/db/serialize.ts). Read outside
    // the lock, the check was the exact race it exists to prevent: simultaneous submissions all
    // saw the same total and all passed.
    const issue = await serialize(this.prisma, dayKeyFor(reportedBy, entryDay), async (tx) => {
      if (hours > 0) {
        const dayAgg = await tx.timesheet.aggregate({
          where: { userId: reportedBy, date: entryDay, deletedAt: null }, _sum: { hoursLogged: true },
        });
        if ((dayAgg._sum.hoursLogged ?? 0) + hours > MAX_HOURS_PER_DAY) {
          const left = Math.max(0, MAX_HOURS_PER_DAY - (dayAgg._sum.hoursLogged ?? 0));
          throw new BadRequestException(`That would exceed ${MAX_HOURS_PER_DAY}h logged for the day — ${left}h remaining.`);
        }
      }
      const created = await tx.issue.create({
        data: { projectId: dto.projectId, title: dto.title, description: dto.description ?? null, reportedBy },
      });
      // The issue's cost is recorded as NON-BILLABLE time against the issue (also carries the
      // projectId so issue time is attributed in project/performance reports).
      if (hours > 0) {
        await tx.timesheet.create({
          data: { userId: reportedBy, issueId: created.id, taskId: null, projectId: dto.projectId, date: entryDay, hoursLogged: hours, billable: false, notes: dto.title },
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
    const cur = await this.prisma.issue.findFirst({ where: { id, deletedAt: null }, select: { projectId: true } });
    if (cur) await this.access.assertProjectWritable(cur.projectId); // no edits on a completed/closed matter
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
