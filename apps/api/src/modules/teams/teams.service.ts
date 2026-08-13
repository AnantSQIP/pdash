import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from '../permissions/permission.service';
import { NotificationsService } from '../notifications/notifications.module';
import { getActorId } from '../../common/context/request-context';
import {
  CreateTeamDto, UpdateTeamDto, TeamMemberDto, CreateTeamListDto, UpdateTeamListDto, CreateTeamTaskDto,
} from './dto';

/**
 * Team spaces — where work that is not client delivery lives.
 *
 * The access model is deliberately the same shape as a project's: **membership decides**, with an
 * oversight bypass for people who administer spaces (`team.manage`). It is not a second security
 * model to reason about, and a space grants nobody any capability over work they did not already
 * have — creating and editing tasks inside one still needs the ordinary `task.*` permissions.
 *
 * What a team space never does is behave like a project. It has no PID, no client, no billability
 * decision and no client deadline, and nothing here writes to the client ledger, the PID ledger or
 * delivery reporting. That separation is the entire point: HR and BD work stopped having to
 * masquerade as a patent matter in order to exist.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Access ────────────────────────────────────────────────────────────────
  /** Everyone who administers spaces sees all of them; everyone else sees the ones they are in. */
  private async isOverseer(actorId: string): Promise<boolean> {
    return this.permissions.check(actorId, 'team.manage');
  }

  /**
   * A space you are not in is a space you cannot read. Mirrors assertProjectAccess so nobody has
   * to learn a second rule — and so "I can see the module" never implies "I can see everything
   * in it", which is what makes team.view safe to hand to everyone.
   */
  private async assertAccess(teamId: string): Promise<string> {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('You must be signed in.');
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, deletedAt: null }, select: { id: true },
    });
    if (!team) throw new NotFoundException('Team space not found.');
    if (await this.isOverseer(actorId)) return actorId;
    const member = await this.prisma.teamMember.findFirst({
      where: { teamId, userId: actorId }, select: { id: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this team space.');
    return actorId;
  }

  /** Changing the space itself — renaming, archiving, who is in it — needs team.manage. */
  private async assertManage(): Promise<string> {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('You must be signed in.');
    if (!(await this.isOverseer(actorId))) {
      throw new ForbiddenException('You are not permitted to manage team spaces.');
    }
    return actorId;
  }

  /** An archived space is retired: readable, not writable. The same meaning as on a client. */
  private async assertWritable(teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, deletedAt: null }, select: { name: true, archivedAt: true },
    });
    if (!team) throw new NotFoundException('Team space not found.');
    if (team.archivedAt) {
      throw new BadRequestException(`"${team.name}" is archived — restore it to add work.`);
    }
  }

  // ── Spaces ────────────────────────────────────────────────────────────────
  async list(organizationId: string) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('You must be signed in.');
    const overseer = await this.isOverseer(actorId);
    const teams = await this.prisma.team.findMany({
      where: {
        organizationId, deletedAt: null,
        ...(overseer ? {} : { members: { some: { userId: actorId } } }),
      },
      select: {
        id: true, name: true, description: true, archivedAt: true, createdAt: true,
        members: {
          select: { userId: true, roleInTeam: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
        },
        _count: { select: { teamTasks: true } },
      },
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    });
    // Open task counts are what people actually scan for, and a raw total including finished
    // work makes a wound-down space look as busy as a live one.
    const openByTeam = await this.openTaskCounts(teams.map(t => t.id));
    return teams.map(t => ({ ...t, openTasks: openByTeam.get(t.id) ?? 0 }));
  }

  private async openTaskCounts(teamIds: string[]): Promise<Map<string, number>> {
    if (!teamIds.length) return new Map();
    const rows = await this.prisma.teamTask.findMany({
      where: { teamId: { in: teamIds }, task: { deletedAt: null, OR: [{ currentStatus: null }, { currentStatus: { type: { not: 'CLOSED' } } }] } },
      select: { teamId: true },
    });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.teamId, (out.get(r.teamId) ?? 0) + 1);
    return out;
  }

  async get(teamId: string) {
    await this.assertAccess(teamId);
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, deletedAt: null },
      select: {
        id: true, name: true, description: true, archivedAt: true, createdAt: true, createdBy: true,
        members: {
          select: { userId: true, roleInTeam: true, joinedAt: true, user: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true, designation: true } } },
        },
        taskLists: {
          where: { deletedAt: null },
          orderBy: { sequence: 'asc' },
          select: { id: true, name: true, isDefault: true, sequence: true },
        },
      },
    });
    if (!team) throw new NotFoundException('Team space not found.');
    return team;
  }

  async create(organizationId: string, dto: CreateTeamDto) {
    const actorId = await this.assertManage();
    const name = dto.name.trim();
    const clash = await this.prisma.team.findFirst({
      where: { organizationId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) throw new BadRequestException(`A team space called "${name}" already exists.`);

    const team = await this.prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          organizationId, name, description: dto.description?.trim() || null, createdBy: actorId,
          // The creator is a member from the start. A space whose creator has to add themselves
          // is a space that reads as empty the moment it is made.
          members: { create: { userId: actorId, roleInTeam: 'LEAD' } },
        },
        select: { id: true, name: true },
      });
      // A board with no columns cannot hold anything, so give it the three that every team
      // rediscovers for itself within a week.
      await tx.taskList.createMany({
        data: ['To do', 'In progress', 'Done'].map((n, i) => ({
          teamId: created.id, name: n, isDefault: i === 0, sequence: i,
        })),
      });
      return created;
    });

    if (dto.memberIds?.length) await this.setMembers(team.id, dto.memberIds, actorId, organizationId);
    await this.events.emit({
      action: 'team.created', entityType: 'TEAM', entityId: team.id, organizationId,
      metadata: { name: team.name },
    });
    return this.get(team.id);
  }

  async update(teamId: string, dto: UpdateTeamDto) {
    await this.assertManage();
    await this.assertAccess(teamId);
    const data: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (!Object.keys(data).length) return this.get(teamId);
    await this.prisma.team.update({ where: { id: teamId }, data });
    await this.events.emit({ action: 'team.updated', entityType: 'TEAM', entityId: teamId, metadata: data });
    return this.get(teamId);
  }

  /** Archive/restore — reversible, destroys nothing, same meaning as on a client. */
  async setArchived(teamId: string, archived: boolean) {
    await this.assertManage();
    await this.assertAccess(teamId);
    await this.prisma.team.update({
      where: { id: teamId }, data: { archivedAt: archived ? new Date() : null },
    });
    await this.events.emit({
      action: archived ? 'team.archived' : 'team.restored', entityType: 'TEAM', entityId: teamId,
    });
    return this.get(teamId);
  }

  /**
   * Soft-delete a space and everything filed in it. Deliberately NOT a hard delete: the tasks
   * carry comments and logged time that people may still need to account for, and archive already
   * covers "we are done with this".
   */
  async remove(teamId: string) {
    await this.assertManage();
    await this.assertAccess(teamId);
    const now = new Date();
    const taskIds = (await this.prisma.teamTask.findMany({
      where: { teamId }, select: { taskId: true },
    })).map(t => t.taskId);
    await this.prisma.$transaction([
      this.prisma.team.update({ where: { id: teamId }, data: { deletedAt: now } }),
      this.prisma.taskList.updateMany({ where: { teamId, deletedAt: null }, data: { deletedAt: now } }),
      ...(taskIds.length ? [this.prisma.task.updateMany({ where: { id: { in: taskIds }, deletedAt: null }, data: { deletedAt: now } })] : []),
    ]);
    await this.events.emit({
      action: 'team.deleted', entityType: 'TEAM', entityId: teamId, metadata: { tasks: taskIds.length },
    });
    return { ok: true };
  }

  // ── Members ───────────────────────────────────────────────────────────────
  async setMembers(teamId: string, userIds: string[], actorId?: string, organizationId?: string) {
    const actor = actorId ?? await this.assertManage();
    if (!actorId) await this.assertAccess(teamId);
    const wanted = [...new Set(userIds.filter(Boolean))];
    const orgId = organizationId ?? (await this.prisma.team.findUnique({
      where: { id: teamId }, select: { organizationId: true },
    }))?.organizationId;
    // Everyone in a space must be in the organisation that owns it — the same cross-org guard
    // project membership applies.
    const valid = await this.prisma.user.findMany({
      where: { id: { in: wanted }, deletedAt: null, ...(orgId ? { organizationId: orgId } : {}) },
      select: { id: true },
    });
    if (valid.length !== wanted.length) {
      throw new BadRequestException('One or more people are not in this organisation.');
    }
    const current = (await this.prisma.teamMember.findMany({
      where: { teamId }, select: { userId: true },
    })).map(m => m.userId);
    const added = wanted.filter(u => !current.includes(u));
    const removed = current.filter(u => !wanted.includes(u) && u !== actor);

    await this.prisma.$transaction([
      ...(removed.length ? [this.prisma.teamMember.deleteMany({ where: { teamId, userId: { in: removed } } })] : []),
      ...(added.length ? [this.prisma.teamMember.createMany({
        data: added.map(userId => ({ teamId, userId })), skipDuplicates: true,
      })] : []),
    ]);
    if (added.length) {
      const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
      await this.notifications.notify(added, {
        type: 'team.added',
        title: 'Added to a team space',
        message: `You were added to "${team?.name ?? 'a team space'}".`,
        link: `/teams/${teamId}`,
      });
    }
    return this.get(teamId);
  }

  async addMember(teamId: string, dto: TeamMemberDto) {
    await this.assertManage();
    await this.assertAccess(teamId);
    const current = (await this.prisma.teamMember.findMany({
      where: { teamId }, select: { userId: true },
    })).map(m => m.userId);
    return this.setMembers(teamId, [...current, dto.userId]);
  }

  async removeMember(teamId: string, userId: string) {
    await this.assertManage();
    await this.assertAccess(teamId);
    const current = (await this.prisma.teamMember.findMany({
      where: { teamId }, select: { userId: true },
    })).map(m => m.userId);
    if (current.length <= 1 && current.includes(userId)) {
      throw new BadRequestException('A team space needs at least one member.');
    }
    await this.prisma.teamMember.deleteMany({ where: { teamId, userId } });
    // Leaving a space unassigns you from its work — otherwise a non-member stays selected on
    // tasks and every later assignee edit fails validation.
    const taskIds = (await this.prisma.teamTask.findMany({ where: { teamId }, select: { taskId: true } })).map(t => t.taskId);
    if (taskIds.length) {
      await this.prisma.taskAssignee.deleteMany({ where: { userId, taskId: { in: taskIds } } });
    }
    return this.get(teamId);
  }

  // ── Lists (the board's columns) ────────────────────────────────────────────
  async createList(teamId: string, dto: CreateTeamListDto) {
    await this.assertAccess(teamId);
    await this.assertWritable(teamId);
    const sequence = await this.prisma.taskList.count({ where: { teamId, deletedAt: null } });
    await this.prisma.taskList.create({
      data: { teamId, name: dto.name.trim(), sequence },
    });
    return this.get(teamId);
  }

  async updateList(teamId: string, listId: string, dto: UpdateTeamListDto) {
    await this.assertAccess(teamId);
    const list = await this.prisma.taskList.findFirst({
      where: { id: listId, teamId, deletedAt: null }, select: { id: true },
    });
    if (!list) throw new NotFoundException('List not found in this team space.');
    await this.prisma.taskList.update({
      where: { id: listId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
      },
    });
    return this.get(teamId);
  }

  async removeList(teamId: string, listId: string) {
    await this.assertAccess(teamId);
    const list = await this.prisma.taskList.findFirst({
      where: { id: listId, teamId, deletedAt: null }, select: { id: true },
    });
    if (!list) throw new NotFoundException('List not found in this team space.');
    const held = await this.prisma.teamTask.count({ where: { teamId, taskListId: listId } });
    if (held) {
      throw new BadRequestException(`That list still holds ${held} task${held === 1 ? '' : 's'} — move them first.`);
    }
    await this.prisma.taskList.update({ where: { id: listId }, data: { deletedAt: new Date() } });
    return this.get(teamId);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  /** Every task in a space, shaped exactly like a project's tasks so the same UI renders them. */
  async tasks(teamId: string) {
    await this.assertAccess(teamId);
    const links = await this.prisma.teamTask.findMany({
      where: { teamId, task: { deletedAt: null } },
      orderBy: [{ sequence: 'asc' }],
      select: {
        taskListId: true, sequence: true,
        task: {
          select: {
            id: true, title: true, description: true, priority: true,
            startDate: true, dueDate: true, estimatedHours: true, actualHours: true,
            completionPercentage: true, createdBy: true, createdAt: true,
            currentStatus: { select: { id: true, name: true, colorHex: true, type: true } },
            assignees: {
              select: { userId: true, role: true, user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
            },
            _count: { select: { subtasks: true } },
          },
        },
      },
    });
    return links.map(l => ({ ...l.task, taskListId: l.taskListId, sequence: l.sequence }));
  }

  async createTask(teamId: string, dto: CreateTeamTaskDto) {
    const actorId = await this.assertAccess(teamId);
    await this.assertWritable(teamId);
    // Creating work inside a space needs the ordinary task permission — belonging to a space
    // grants no authority the person did not already have.
    if (!(await this.permissions.check(actorId, 'task.create'))) {
      throw new ForbiddenException('You are not permitted to create tasks.');
    }
    const list = await this.prisma.taskList.findFirst({
      where: { id: dto.taskListId, teamId, deletedAt: null }, select: { id: true },
    });
    if (!list) throw new BadRequestException('That list does not belong to this team space.');

    // Assignees must be in the space. Unlike a project, this does NOT auto-add them: a team
    // space is a standing group of people, not a staffing decision made task by task.
    const assigneeIds = [...new Set(dto.assigneeIds ?? [])];
    if (assigneeIds.length) {
      const members = (await this.prisma.teamMember.findMany({
        where: { teamId, userId: { in: assigneeIds } }, select: { userId: true },
      })).map(m => m.userId);
      if (members.length !== assigneeIds.length) {
        throw new BadRequestException('Everyone assigned must be a member of this team space.');
      }
    }

    const wf = await this.prisma.workflow.findFirst({
      where: { type: 'GLOBAL' }, orderBy: { name: 'asc' }, select: { id: true },
    });

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title.trim(),
          description: dto.description,
          priority: dto.priority ?? 'MEDIUM',
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          estimatedHours: dto.estimatedHours,
          createdBy: actorId,
          assignedById: assigneeIds.length ? actorId : null,
          workflowId: wf?.id,
          assignees: assigneeIds.length ? { create: assigneeIds.map(userId => ({ userId })) } : undefined,
        },
        select: { id: true, title: true },
      });
      // Sequence computed INSIDE the transaction, so two people adding at once do not collide.
      const sequence = await tx.teamTask.count({ where: { teamId, taskListId: dto.taskListId } });
      await tx.teamTask.create({
        data: { teamId, taskId: created.id, taskListId: dto.taskListId, sequence },
      });
      return created;
    });

    await this.events.emit({
      action: 'team.task_created', entityType: 'TASK', entityId: task.id, metadata: { teamId, title: task.title },
    });
    if (assigneeIds.length) {
      await this.notifications.notify(assigneeIds, {
        type: 'task.assigned', title: 'New task assigned',
        message: `You were assigned to "${task.title}".`,
        link: `/teams/${teamId}`,
      });
    }
    return this.tasks(teamId);
  }

  /** Move a task between the space's lists (the board drag), or reorder within one. */
  async moveTask(teamId: string, taskId: string, taskListId: string, sequence?: number) {
    await this.assertAccess(teamId);
    await this.assertWritable(teamId);
    const link = await this.prisma.teamTask.findFirst({
      where: { teamId, taskId }, select: { id: true },
    });
    if (!link) throw new NotFoundException('That task is not in this team space.');
    const list = await this.prisma.taskList.findFirst({
      where: { id: taskListId, teamId, deletedAt: null }, select: { id: true },
    });
    // The database enforces this too (composite FK), but a clear message beats a constraint error.
    if (!list) throw new BadRequestException('That list does not belong to this team space.');
    await this.prisma.teamTask.update({
      where: { id: link.id },
      data: { taskListId, ...(sequence !== undefined ? { sequence } : {}) },
    });
    return this.tasks(teamId);
  }

  /** Remove a task from a space. Soft-deletes the task, since it exists only here. */
  async removeTask(teamId: string, taskId: string) {
    const actorId = await this.assertAccess(teamId);
    if (!(await this.permissions.check(actorId, 'task.delete'))) {
      throw new ForbiddenException('You are not permitted to delete tasks.');
    }
    const link = await this.prisma.teamTask.findFirst({ where: { teamId, taskId }, select: { id: true } });
    if (!link) throw new NotFoundException('That task is not in this team space.');
    await this.prisma.$transaction([
      this.prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } }),
      this.prisma.teamTask.delete({ where: { id: link.id } }),
    ]);
    await this.events.emit({ action: 'team.task_deleted', entityType: 'TASK', entityId: taskId, metadata: { teamId } });
    return this.tasks(teamId);
  }
}
