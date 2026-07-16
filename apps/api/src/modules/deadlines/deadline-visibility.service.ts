import { BadRequestException, ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { getActorId } from '../../common/context/request-context';

/**
 * Governs the CLIENT-facing deadline (`clientDueDate` on Project/Task), which is
 * restricted while the INTERNAL deadline (`dueDate`) stays visible to everyone.
 *
 * An actor may see (and set) a client deadline when they either
 *   • hold `deadline.view.client` — Manager, Senior Consultant, Admin, Super Admin; or
 *   • are a MANAGER member of the project in question (so the person running a project
 *     always sees its client date, even if their org role is junior).
 *
 * Redaction happens SERVER-SIDE: the field is stripped from the response payload, so a
 * normal employee can never read a client deadline by inspecting network traffic.
 */
export interface DeadlineScope {
  /** Holds deadline.view.client → sees every client deadline in the org. */
  global: boolean;
  /** Project ids where the actor is the (a) designated MANAGER. */
  managed: Set<string>;
}

/** Shapes we redact — anything carrying a clientDueDate, optionally with project links. */
type WithClientDue = { clientDueDate?: Date | null } & Record<string, unknown>;

@Injectable()
export class DeadlineVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  /** Resolve what the CURRENT actor may see. Call once per request, reuse for a list. */
  async scope(actorId?: string | null): Promise<DeadlineScope> {
    const id = actorId ?? getActorId();
    if (!id) return { global: false, managed: new Set() };
    const [global, memberships] = await Promise.all([
      this.permissions.check(id, 'deadline.view.client'),
      this.prisma.projectMember.findMany({
        where: { userId: id, projectRole: 'MANAGER', isActive: true },
        select: { projectId: true },
      }),
    ]);
    return { global, managed: new Set(memberships.map(m => m.projectId)) };
  }

  /** True when the actor may see/set the client deadline of these project(s). */
  canSee(scope: DeadlineScope, projectIds: string[]): boolean {
    return scope.global || projectIds.some(pid => scope.managed.has(pid));
  }

  /** Strip clientDueDate from a project payload unless the actor may see it. */
  redactProject<T extends WithClientDue & { id: string }>(project: T, scope: DeadlineScope): T {
    if (this.canSee(scope, [project.id])) return project;
    const { clientDueDate: _hidden, ...rest } = project;
    return rest as T;
  }

  redactProjects<T extends WithClientDue & { id: string }>(projects: T[], scope: DeadlineScope): T[] {
    return projects.map(p => this.redactProject(p, scope));
  }

  /**
   * Guard a WRITE of clientDueDate: only someone who may see the client deadline for
   * these projects may set one. `projectIds` is empty for a brand-new project (no
   * management relationship exists yet), so only the global permission qualifies.
   */
  async assertMaySetClientDue(projectIds: string[], scope?: DeadlineScope): Promise<void> {
    const s = scope ?? (await this.scope());
    if (!this.canSee(s, projectIds)) {
      throw new ForbiddenException('You are not allowed to set a client deadline.');
    }
  }

  /**
   * The internal deadline is the team's earlier, buffered date — it must never fall
   * AFTER the date promised to the client.
   */
  assertOrdered(internal?: Date | null, client?: Date | null): void {
    if (internal && client && internal > client) {
      throw new BadRequestException('The internal deadline cannot be after the client deadline.');
    }
  }
}

/** Global so Projects/Tasks (and anything else with deadlines) can inject it directly. */
@Global()
@Module({
  providers: [DeadlineVisibilityService],
  exports: [DeadlineVisibilityService],
})
export class DeadlinesModule {}
