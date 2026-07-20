import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { PermissionService } from '../permissions/permission.service';
import { getActorId } from '../../common/context/request-context';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true, designation: true };
const EMPTY = { people: [], projects: [], tasks: [], channels: [], messages: [] };

/**
 * One global search across the things a person actually works with. Every result set is
 * GUARDRAILED so the search bar can never surface (or link to) something the actor could
 * not otherwise reach:
 *   • people   → requires user.view (the People directory/admin permission)
 *   • projects → requires project.view, and is scoped to the actor's org
 *   • tasks    → requires task.view, and is scoped to tasks the actor is assigned to or a
 *                member of the project for
 *   • channels/messages → membership-gated (no admin bypass), like the Discuss module
 * Search never widens access beyond these feature permissions.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async search(actorId: string, organizationId: string, q: string) {
    const term = (q ?? '').trim();
    if (term.length < 2) return EMPTY;
    const like = { contains: term, mode: 'insensitive' as const };

    // Resolve the actor's effective permissions ONCE and gate each category by them.
    const eff = await this.permissions.getEffectivePermissions(actorId);
    const can = (code: string) => eff.isSuperAdmin || eff.codes.includes(code);

    const [people, projects, channels, messages, tasks] = await Promise.all([
      // People — only for those who can view the people directory (search links into the
      // admin/user area). Everyone else gets nothing here.
      can('user.view')
        ? this.prisma.user.findMany({
            where: { organizationId, deletedAt: null, status: 'ACTIVE', OR: [{ firstName: like }, { lastName: like }, { email: like }] },
            select: USER_SELECT, take: 6,
          })
        : Promise.resolve([]),
      // Projects — only for project.view holders, scoped to this org's projects.
      can('project.view')
        ? this.prisma.project.findMany({
            where: { deletedAt: null, members: { some: { user: { organizationId } } }, OR: [{ title: like }, { code: like }] },
            select: { id: true, title: true, code: true, projectPhase: true }, take: 6, orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      // Channels — membership-gated (no admin bypass), like the Discuss module.
      this.prisma.channel.findMany({
        where: { organizationId, deletedAt: null, name: like, members: { some: { userId: actorId } } },
        select: { id: true, name: true }, take: 6,
      }),
      // Messages — only in channels the actor belongs to.
      this.prisma.message.findMany({
        where: { content: like, deletedAt: null, channel: { deletedAt: null, members: { some: { userId: actorId } } } },
        select: { id: true, channelId: true, content: true, createdAt: true, channel: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' }, take: 8,
      }),
      // Tasks — task.view holders, further scoped to tasks the actor is assigned to or a
      // member of the owning project.
      can('task.view')
        ? this.prisma.task.findMany({
            where: {
              deletedAt: null, title: like,
              OR: [
                { assignees: { some: { userId: actorId } } },
                { projectTasks: { some: { project: { members: { some: { userId: actorId } } } } } },
              ],
            },
            select: { id: true, title: true, currentStatus: { select: { name: true } }, projectTasks: { select: { projectId: true }, take: 1 } },
            orderBy: { updatedAt: 'desc' }, take: 8,
          })
        : Promise.resolve([]),
    ]);

    return {
      people,
      projects,
      channels,
      messages: messages.map(m => ({
        id: m.id, channelId: m.channelId, channelName: m.channel.name,
        author: `${m.user.firstName} ${m.user.lastName ?? ''}`.trim(),
        content: m.content.length > 120 ? m.content.slice(0, 120) + '…' : m.content,
        createdAt: m.createdAt,
      })),
      tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.currentStatus?.name ?? null, projectId: t.projectTasks[0]?.projectId ?? null })),
    };
  }
}

@Controller('search')
class SearchController {
  constructor(private readonly svc: SearchService, private readonly actor: ActorContextService) {}

  @Get()
  async search(@Query('q') q: string) {
    const actorId = getActorId();
    if (!actorId) return EMPTY;
    return this.svc.search(actorId, await this.actor.requireOrgId(), q ?? '');
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
