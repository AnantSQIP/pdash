import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizationId: string) {
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
            dueDate: { lt: new Date() },
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
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
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
        _count: { select: { projectTasks: true, members: true } },
        currentStatus: { select: { name: true, colorHex: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return projects;
  }

  async getTimesheetSummary(organizationId: string, from?: string, to?: string) {
    const entries = await this.prisma.timesheet.findMany({
      where: {
        deletedAt: null,
        user: { organizationId },
        ...(from || to
          ? { date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }
          : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { date: 'desc' },
    });

    const byUser: Record<string, { name: string; hours: number; billableHours: number }> = {};
    for (const e of entries) {
      const name = `${e.user.firstName} ${e.user.lastName}`;
      if (!byUser[e.userId]) byUser[e.userId] = { name, hours: 0, billableHours: 0 };
      byUser[e.userId].hours += e.hoursLogged;
      if (e.billable) byUser[e.userId].billableHours += e.hoursLogged;
    }

    return {
      totalHours: entries.reduce((s, e) => s + e.hoursLogged, 0),
      billableHours: entries.filter(e => e.billable).reduce((s, e) => s + e.hoursLogged, 0),
      byUser: Object.values(byUser),
      entries,
    };
  }
}
