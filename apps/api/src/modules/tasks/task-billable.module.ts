import { BadRequestException, Body, Controller, ForbiddenException, Injectable, NotFoundException, Param, Patch } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { getActorId } from '../../common/context/request-context';
import { ProjectAccessService } from '../../common/access/project-access.module';

export class SetBillableDto {
  @IsBoolean()
  billable!: boolean;
}

/**
 * Billable or not, per TASK.
 *
 * Every task starts billable. Anybody associated with it — on its client (an active member, or
 * delivery oversight), or staffed on the task — may mark it non-billable, and back. The task is
 * the authority for its time: an entry logged against it takes the task's flag, and changing the
 * flag re-marks the task's existing entries in the same transaction, so a report can never show a
 * non-billable task carrying billable hours.
 *
 * Kept out of TasksService on purpose: it touches the task row and the timesheet ledger together,
 * and nothing else about a task depends on it.
 *
 * Refused where the ledger is frozen (a completed client — reopen it first) and for team-space
 * work, which has no client to bill and is never billable.
 */
@Injectable()
export class TaskBillableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly access: ProjectAccessService,
  ) {}

  private actor(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  async setTask(taskId: string, billable: boolean) {
    const actorId = this.actor();
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true, title: true,
        projectTasks: { where: { project: { deletedAt: null } }, select: { projectId: true }, take: 1 },
        teamTasks: { select: { teamId: true }, take: 1 },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    const projectId = task.projectTasks[0]?.projectId ?? null;
    if (!projectId && task.teamTasks.length) {
      throw new BadRequestException('Team-space work is internal and is never billable.');
    }
    // Associated = can reach it through its client (member or oversight), or staffed on it.
    const associated = (await this.access.canAccessTask(actorId, taskId)) || (await this.access.isTaskAssignee(actorId, taskId));
    if (!associated) throw new ForbiddenException('Only people on this client or on this task can change whether it is billable.');
    if (projectId) await this.access.assertProjectWritable(projectId);

    const outcome = await this.prisma.$transaction(async tx => {
      // Lock the task row: an entry being logged against it reads the flag under a share lock, so
      // either it lands first and is re-marked below, or it waits and reads the new flag.
      const rows = await tx.$queryRaw<{ billable: boolean }[]>`SELECT "billable" FROM "task" WHERE "id" = ${taskId} FOR UPDATE`;
      const from = rows[0]?.billable ?? true;
      if (from === billable) return { changed: false, from, entriesUpdated: 0 };
      await tx.task.update({
        where: { id: taskId },
        data: { billable, billableChangedAt: new Date(), billableChangedById: actorId },
      });
      const re = await tx.timesheet.updateMany({
        where: { taskId, deletedAt: null, teamId: null, billable: !billable },
        data: { billable },
      });
      return { changed: true, from, entriesUpdated: re.count };
    });

    if (outcome.changed) {
      await this.events.emit({
        action: EVENTS.TASK_BILLABLE_CHANGED,
        entityType: 'TASK',
        entityId: taskId,
        actorId,
        oldValue: { billable: outcome.from },
        newValue: { billable },
        metadata: { projectId, title: task.title, entriesUpdated: outcome.entriesUpdated },
      });
    }
    return { id: taskId, billable, changed: outcome.changed, entriesUpdated: outcome.entriesUpdated };
  }

  /** Every task in a task group at once — "this whole piece of work is not billable". */
  async setGroup(taskListId: string, billable: boolean) {
    const actorId = this.actor();
    const group = await this.prisma.taskList.findFirst({
      where: { id: taskListId, deletedAt: null },
      select: { id: true, name: true, projectId: true, teamId: true },
    });
    if (!group) throw new NotFoundException('Task group not found.');
    if (!group.projectId) throw new BadRequestException('Team-space work is internal and is never billable.');
    if (!(await this.access.canAccessProject(actorId, group.projectId))) {
      throw new ForbiddenException('Only people on this client can change whether its work is billable.');
    }
    await this.access.assertProjectWritable(group.projectId);

    const outcome = await this.prisma.$transaction(async tx => {
      // The same row locks a single task takes, in id order so two overlapping bulk changes cannot
      // deadlock each other.
      const locked = await tx.$queryRaw<{ id: string; billable: boolean }[]>`
        SELECT t."id", t."billable" FROM "task" t
         WHERE t."deletedAt" IS NULL
           AND t."id" IN (SELECT pt."taskId" FROM "project_task" pt WHERE pt."taskListId" = ${taskListId})
         ORDER BY t."id"
         FOR UPDATE`;
      const toChange = locked.filter(t => t.billable !== billable).map(t => t.id);
      if (!toChange.length) return { tasksChanged: 0, entriesUpdated: 0, tasksInGroup: locked.length };
      await tx.task.updateMany({
        where: { id: { in: toChange } },
        data: { billable, billableChangedAt: new Date(), billableChangedById: actorId },
      });
      const re = await tx.timesheet.updateMany({
        where: { taskId: { in: toChange }, deletedAt: null, teamId: null, billable: !billable },
        data: { billable },
      });
      return { tasksChanged: toChange.length, entriesUpdated: re.count, tasksInGroup: locked.length };
    });

    if (outcome.tasksChanged) {
      await this.events.emit({
        action: EVENTS.TASKGROUP_BILLABLE_CHANGED,
        entityType: 'TASK_GROUP',
        entityId: taskListId,
        actorId,
        newValue: { billable },
        metadata: { projectId: group.projectId, name: group.name, ...outcome },
      });
    }
    return { taskListId, billable, ...outcome };
  }
}

@Controller('tasks')
export class TaskBillableController {
  constructor(private readonly billable: TaskBillableService) {}

  /**
   * Mark one task billable / non-billable.
   *
   * No role permission on purpose: the rule is ASSOCIATION with the work, decided per task in the
   * service (on its client, or staffed on it). A role gate would shut out somebody staffed on a
   * task whose role happens not to carry task.view — the very person the owner named.
   */
  @Patch(':id/billable')
  setTask(@Param('id') id: string, @Body() dto: SetBillableDto) {
    return this.billable.setTask(id, dto.billable);
  }

  /** Every task in a task group at once — for anybody on the client (see above). */
  @Patch('groups/:taskListId/billable')
  setGroup(@Param('taskListId') taskListId: string, @Body() dto: SetBillableDto) {
    return this.billable.setGroup(taskListId, dto.billable);
  }
}
