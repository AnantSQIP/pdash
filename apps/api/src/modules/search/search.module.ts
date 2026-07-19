import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { getActorId } from '../../common/context/request-context';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true, designation: true };

/**
 * One global search across the things a person actually works with. Every result set
 * is permission-scoped: channels/messages require membership, tasks require assignment
 * or project membership, people/projects are org-wide (already visible in the app).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(actorId: string, organizationId: string, q: string) {
    const term = (q ?? '').trim();
    const empty = { people: [], projects: [], tasks: [], channels: [], messages: [] };
    if (term.length < 2) return empty;
    const like = { contains: term, mode: 'insensitive' as const };

    const [people, projects, channels, messages, tasks] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId, deletedAt: null, status: 'ACTIVE',
          OR: [{ firstName: like }, { lastName: like }, { email: like }],
        },
        select: USER_SELECT, take: 6,
      }),
      this.prisma.project.findMany({
        where: { deletedAt: null, OR: [{ title: like }, { code: like }] },
        select: { id: true, title: true, code: true, projectPhase: true }, take: 6, orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.channel.findMany({
        where: { organizationId, deletedAt: null, name: like, members: { some: { userId: actorId } } },
        select: { id: true, name: true }, take: 6,
      }),
      this.prisma.message.findMany({
        where: { content: like, deletedAt: null, channel: { deletedAt: null, members: { some: { userId: actorId } } } },
        select: { id: true, channelId: true, content: true, createdAt: true, channel: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' }, take: 8,
      }),
      this.prisma.task.findMany({
        where: {
          deletedAt: null, title: like,
          OR: [
            { assignees: { some: { userId: actorId } } },
            { projectTasks: { some: { project: { members: { some: { userId: actorId } } } } } },
          ],
        },
        select: {
          id: true, title: true, currentStatus: { select: { name: true } },
          projectTasks: { select: { projectId: true }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' }, take: 8,
      }),
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
    if (!actorId) return { people: [], projects: [], tasks: [], channels: [], messages: [] };
    return this.svc.search(actorId, await this.actor.requireOrgId(), q ?? '');
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
