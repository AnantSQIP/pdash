import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { DeadlineVisibilityService } from '../deadlines/deadline-visibility.service';
import { WorkspaceFlowService } from '../workspace-flow/workspace-flow.service';
import { timesheetInFlow } from '../../common/flow-scope';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly access: ProjectAccessService,
    private readonly deadlines: DeadlineVisibilityService,
    private readonly flows: WorkspaceFlowService,
  ) {}

  /**
   * The set of projects the current actor may see, as a Prisma Project where-fragment.
   * A delivery lead (oversight) sees every project in their org; everyone else sees only
   * the matters they are actively staffed on. This is the SAME conflict-wall rule the
   * Projects list enforces, so an employee's Home never reflects firm-wide totals for
   * matters they are not on. Org identity comes from the session, never a query param.
   *
   * The workspace flow belongs here for the same reason (docs/WORKSPACE_FLOWS.md): this fragment
   * is the one definition of "the matters in scope", and every read built on it — the project
   * counts, the task counts, the overdue and due-today tiles, the reports table — inherits it.
   * Putting the flow anywhere else would mean remembering it five times.
   */
  private async actorProjectWhere() {
    const actorId = this.actor.requireActorId();
    const organizationId = await this.actor.requireOrgId();
    const flow = await this.flows.flowOf(organizationId);
    const oversight = await this.access.hasOversight(actorId);
    const memberScope = oversight
      ? { members: { some: { user: { organizationId } } } }
      : { members: { some: { userId: actorId, isActive: true } } };
    return { actorId, organizationId, oversight, flow, projectWhere: { deletedAt: null, workspaceFlow: flow, ...memberScope } };
  }

  async getDashboard() {
    const { actorId, organizationId, oversight, flow, projectWhere } = await this.actorProjectWhere();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Tasks and time are scoped the same way: a lead sees the org's, a member sees their
    // own. Time-logged reflects the actor's own hours for a member (their week), the whole
    // org for a lead (the team's week) — never another employee's hours to a member.
    // Tasks are counted as DISTINCT tasks (a task attached to two in-scope projects via the
    // ProjectTask M2M must not be counted twice), so these reconcile with the /projects list.
    // This inherits the flow from projectWhere, and stays PROJECT-ONLY on purpose: these tiles
    // have always counted matter work, so widening them to admit team-space tasks (which belong
    // to both flows) would change what the dashboard says under cover of a flow fix.
    const inScope = { deletedAt: null, projectTasks: { some: { project: projectWhere } } } as const;

    const [projects, taskCounts, timesheetHours, overdueCount, dueTodayCount] = await Promise.all([
      this.prisma.project.findMany({
        where: projectWhere,
        select: { id: true, projectPhase: true, completionPercentage: true, dueDate: true },
      }),

      this.prisma.task.count({ where: inScope }),

      // The one read on this dashboard that does NOT go through projectWhere, so it needs the
      // flow said again: it is keyed on the person, not on a project, and the hours it shows sit
      // next to task counts that are scoped — a week's total that included work the tiles beside
      // it cannot count would be a figure nothing on the page adds up to.
      this.prisma.timesheet.aggregate({
        where: {
          deletedAt: null,
          ...timesheetInFlow(flow),
          date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 6) },
          ...(oversight ? { user: { organizationId } } : { userId: actorId }),
        },
        _sum: { hoursLogged: true },
      }),

      // A task with NO status is unfinished, not excluded. Written as a bare relation filter it
      // was dropped from the count entirely — the same NULL-shaped hole the rest of the codebase
      // already writes around (capacity, the digest and the overdue sweep all use this OR form).
      // Nothing in this database currently has a null status, so this changes no number today; it
      // stops one hiding the first time something does.
      this.prisma.task.count({
        where: {
          ...inScope, dueDate: { lt: startOfToday },
          OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
        },
      }),

      this.prisma.task.count({
        where: {
          ...inScope,
          dueDate: { gte: startOfToday, lt: endOfToday },
          OR: [{ currentStatus: { type: { not: 'CLOSED' } } }, { currentStatus: null }],
          // completionPercentage is a non-nullable Int, so `not` is safe here.
          completionPercentage: { not: 100 },
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
    // `include` returns every scalar column, and one of them is now `workspaceFlow`. The flow is
    // a backend concept nobody outside Settings is meant to know exists, so it is removed here
    // rather than carried to a reports table, a CSV or a PDF.
    const withoutFlow = projects.map(({ workspaceFlow: _flow, ...p }) => p);
    return this.deadlines.redactProjects(withoutFlow, scope);
  }

  async getTimesheetSummary(from?: string, to?: string) {
    const organizationId = await this.actor.requireOrgId();
    const flow = await this.flows.flowOf(organizationId);
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException('The "from" date must be on or before the "to" date.');
    }
    // One `where` for all three reads below, and the entries read returns TASK TITLES — so this
    // is where a report of the firm's time would otherwise name the other flow's work outright.
    // A team-space entry has no project and belongs to both flows, which timesheetInFlow admits.
    const where = {
      deletedAt: null,
      user: { organizationId },
      ...timesheetInFlow(flow),
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
