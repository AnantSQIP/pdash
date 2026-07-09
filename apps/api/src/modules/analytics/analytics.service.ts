import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizationId: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [projects, taskCounts, timesheetHours, overdueCount, dueTodayCount] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          deletedAt: null,
          members: { some: { user: { organizationId } } },
        },
        select: {
          id: true,
          projectPhase: true,
          completionPercentage: true,
          dueDate: true,
        },
      }),

      this.prisma.projectTask.count({
        where: {
          project: {
            deletedAt: null,
            members: { some: { user: { organizationId } } },
          },
          task: { deletedAt: null },
        },
      }),

      this.prisma.timesheet.aggregate({
        where: {
          deletedAt: null,
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 6),
          },
          user: { organizationId },
        },
        _sum: { hoursLogged: true },
      }),

      this.prisma.projectTask.count({
        where: {
          project: {
            deletedAt: null,
            members: { some: { user: { organizationId } } },
          },
          task: {
            deletedAt: null,
            dueDate: { lt: startOfToday },
            currentStatus: { type: { not: 'CLOSED' } },
          },
        },
      }),

      this.prisma.projectTask.count({
        where: {
          project: {
            deletedAt: null,
            members: { some: { user: { organizationId } } },
          },
          task: {
            deletedAt: null,
            dueDate: {
              gte: startOfToday,
              lt: endOfToday,
            },
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

  async getProjectStats(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        members: { some: { user: { organizationId } } },
      },
      include: {
        // L8: count only join rows whose task is not soft-deleted, so the reports
        // "Tasks" column / CSV / PDF don't overcount archived tasks.
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: true } },
        currentStatus: { select: { name: true, colorHex: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return projects;
  }

  async getTimesheetSummary(organizationId: string, from?: string, to?: string) {
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
