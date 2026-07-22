import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly access: ProjectAccessService,
    private readonly deadlines: DeadlineVisibilityService,
  ) {}

  /**
   * The set of projects the current actor may see, as a Prisma Project where-fragment.
   * A delivery lead (oversight) sees every project in their org; everyone else sees only
   * the matters they are actively staffed on. This is the SAME conflict-wall rule the
   * Projects list enforces, so an employee's Home never reflects firm-wide totals for
   * matters they are not on. Org identity comes from the session, never a query param.
   */
  private async actorProjectWhere() {
    const actorId = this.actor.requireActorId();
    const organizationId = await this.actor.requireOrgId();
    const oversight = await this.access.hasOversight(actorId);
    const memberScope = oversight
      ? { members: { some: { user: { organizationId } } } }
      : { members: { some: { userId: actorId, isActive: true } } };
    return { actorId, organizationId, oversight, projectWhere: { deletedAt: null, ...memberScope } };
  }

  async getDashboard() {
    const { actorId, organizationId, oversight, projectWhere } = await this.actorProjectWhere();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Tasks and time are scoped the same way: a lead sees the org's, a member sees their
    // own. Time-logged reflects the actor's own hours for a member (their week), the whole
    // org for a lead (the team's week) — never another employee's hours to a member.
    const taskProjectWhere = { project: projectWhere, task: { deletedAt: null } };

    const [projects, taskCounts, timesheetHours, overdueCount, dueTodayCount] = await Promise.all([
      this.prisma.project.findMany({
        where: projectWhere,
        select: { id: true, projectPhase: true, completionPercentage: true, dueDate: true },
      }),

      this.prisma.projectTask.count({ where: taskProjectWhere }),

      this.prisma.timesheet.aggregate({
        where: {
          deletedAt: null,
          date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 6) },
          ...(oversight ? { user: { organizationId } } : { userId: actorId }),
        },
        _sum: { hoursLogged: true },
      }),

      this.prisma.projectTask.count({
        where: {
          project: projectWhere,
          task: { deletedAt: null, dueDate: { lt: startOfToday }, currentStatus: { type: { not: 'CLOSED' } } },
        },
      }),

      this.prisma.projectTask.count({
        where: {
          project: projectWhere,
          task: {
            deletedAt: null,
            dueDate: { gte: startOfToday, lt: endOfToday },
            currentStatus: { type: { not: 'CLOSED' } },
            completionPercentage: { not: 100 },
          },
        },
      }),
    ]);

    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.projectPhase === 'ACTIVE').length;
    const avgCompletion = totalProjects > 0
      ? Math.round(projects.reduce((s, p) => s + p.completionPercentage, 0) / totalProjects)
      : 0;

    return {
      totalProjects,
      activeProjects,
      avgCompletion,
      totalTasks: taskCounts,
      overdueCount,
      tasksDueToday: dueTodayCount,
      hoursLoggedThisWeek: timesheetHours._sum.hoursLogged ?? 0,
    };
  }

  async getProjectStats() {
    const { actorId, projectWhere } = await this.actorProjectWhere();
    const projects = await this.prisma.project.findMany({
      where: projectWhere,
      include: {
        // L8: count only join rows whose task is not soft-deleted, so the reports
        // "Tasks" column / CSV / PDF don't overcount archived tasks.
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: true } },
        currentStatus: { select: { name: true, colorHex: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    // The client-facing deadline is restricted the same way the /projects module strips
    // it — analytics must not become a redaction bypass.
    const scope = await this.deadlines.scope(actorId);
    return this.deadlines.redactProjects(projects, scope);
  }

  async getTimesheetSummary(from?: string, to?: string) {
    const organizationId = await this.actor.requireOrgId();
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException('The "from" date must be on or before the "to" date.');
    }
    const where = {
      deletedAt: null,
      user: { organizationId },
      ...(from || to
        ? { date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }
        : {}),
    };

    const [totals, grouped, entries] = await Promise.all([
      this.prisma.timesheet.aggregate({
        where,
        _sum: { hoursLogged: true },
      }),
      this.prisma.timesheet.groupBy({
        by: ['userId', 'billable'],
        where,
        _sum: { hoursLogged: true },
      }),
      this.prisma.timesheet.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { date: 'desc' },
        take: 200,
      }),
    ]);

    const userIds = [...new Set(grouped.map(g => g.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const byUser: Record<string, { name: string; hours: number; billableHours: number }> = {};
    let billableHours = 0;
    for (const g of grouped) {
      const sum = g._sum.hoursLogged ?? 0;
      if (!byUser[g.userId]) {
        byUser[g.userId] = { name: nameById.get(g.userId) ?? '', hours: 0, billableHours: 0 };
      }
      byUser[g.userId].hours += sum;
      if (g.billable) {
        byUser[g.userId].billableHours += sum;
        billableHours += sum;
      }
    }

    return {
      totalHours: totals._sum.hoursLogged ?? 0,
      billableHours,
      byUser: Object.values(byUser),
      entries,
    };
  }
}
