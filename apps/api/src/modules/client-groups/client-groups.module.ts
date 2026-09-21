import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { PermissionService } from '../permissions/permission.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { getActorId } from '../../common/context/request-context';
import { CidService } from '../../common/cid/cid.service';

/**
 * CLIENTS-FLOW: groups of clients.
 *
 * A client is a project row; a client group is a named shelf those rows are filed on — "Law
 * firms", "Samsung family", "Litigation". It is optional: a client with no group is ungrouped,
 * which is where every client that existed before this feature starts.
 *
 * WHAT A GROUP DELIBERATELY IS NOT
 *
 * It grants nothing. Who may open a client is still decided by the project wall — membership, or
 * oversight — and a group cannot widen that. So the counts this module returns are counted INSIDE
 * the caller's own project scope: telling a consultant that "Litigation" holds nine clients when
 * they can see two would announce seven matters they are walled off from.
 *
 * WHY ARCHIVE AND NOT DELETE
 *
 * Nothing is lost by archiving: the group keeps its row, its clients move to ungrouped (they are
 * never touched otherwise), and a restore brings the name back. A deletion would have to decide
 * what becomes of the clients, and the only safe answer is the same one.
 */

const toTrimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class CreateClientGroupDto {
  @IsString() @Transform(toTrimmed) @MinLength(1) @MaxLength(80)
  name!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
}

class UpdateClientGroupDto {
  @IsOptional() @IsString() @Transform(toTrimmed) @MinLength(1) @MaxLength(80)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10_000)
  sequence?: number;
}

@Injectable()
export class ClientGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly cid: CidService,
  ) {}

  private async actor() {
    const id = getActorId();
    const u = id ? await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, organizationId: true } }) : null;
    if (!u) throw new ForbiddenException('You must be signed in.');
    return u;
  }

  /** A group of the actor's organisation, archived or not — or a 404 that says nothing more. */
  private async find(organizationId: string, id: string) {
    const g = await this.prisma.clientGroup.findFirst({ where: { id, organizationId } });
    if (!g) throw new NotFoundException('Client group not found.');
    return g;
  }

  /**
   * Refuse a name another LIVE group already carries, whatever its case or spacing. The partial
   * unique index is the backstop for a race; this is what turns the common case into words.
   */
  private async assertNameFree(organizationId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.clientGroup.findFirst({
      where: {
        organizationId, archivedAt: null,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException(`There is already a client group called "${name.trim()}".`);
  }

  /** Map a race on the partial unique index to the same sentence the pre-check gives. */
  private duplicate(e: any, name: string): never {
    if (e?.code === 'P2002') throw new BadRequestException(`There is already a client group called "${name.trim()}".`);
    throw e;
  }

  /**
   * Every live group, with how many of the caller's VISIBLE clients sit in it. Archived groups
   * are included only for people who may manage groups, and only when asked for.
   */
  async list(includeArchived: boolean) {
    const me = await this.actor();
    const mayManage = await this.permissions.check(me.id, 'project.approve');
    const groups = await this.prisma.clientGroup.findMany({
      where: { organizationId: me.organizationId, ...(includeArchived && mayManage ? {} : { archivedAt: null }) },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    });
    const scope = await this.access.projectScopeWhere(me.id, me.organizationId);
    const counts = await this.prisma.project.groupBy({
      by: ['clientGroupId'],
      where: { deletedAt: null, clientGroupId: { in: groups.map(g => g.id) }, ...scope },
      _count: { _all: true },
    });
    const by = new Map(counts.map(c => [c.clientGroupId, c._count._all]));
    return groups.map(g => ({ ...g, clientCount: by.get(g.id) ?? 0 }));
  }

  async create(dto: CreateClientGroupDto) {
    const me = await this.actor();
    await this.assertNameFree(me.organizationId, dto.name);
    const last = await this.prisma.clientGroup.aggregate({
      where: { organizationId: me.organizationId, archivedAt: null },
      _max: { sequence: true },
    });
    let group;
    try {
      group = await this.prisma.clientGroup.create({
        data: {
          organizationId: me.organizationId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          sequence: (last._max.sequence ?? -1) + 1,
          createdBy: me.id,
        },
      });
    } catch (e) { this.duplicate(e, dto.name); }
    await this.events.emit({
      action: EVENTS.CLIENT_GROUP_CREATED, entityType: 'CLIENT_GROUP', entityId: group.id,
      organizationId: me.organizationId, metadata: { name: group.name },
    });
    return { ...group, clientCount: 0 };
  }

  async update(id: string, dto: UpdateClientGroupDto) {
    const me = await this.actor();
    const g = await this.find(me.organizationId, id);
    if (g.archivedAt) throw new BadRequestException('Restore this group before changing it.');
    if (dto.name !== undefined && dto.name.trim().toLowerCase() !== g.name.trim().toLowerCase()) {
      await this.assertNameFree(me.organizationId, dto.name, id);
    }
    let updated;
    try {
      updated = await this.prisma.clientGroup.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        },
      });
    } catch (e) { this.duplicate(e, dto.name ?? g.name); }
    await this.events.emit({
      action: EVENTS.CLIENT_GROUP_UPDATED, entityType: 'CLIENT_GROUP', entityId: id,
      organizationId: me.organizationId,
      metadata: { name: updated.name, ...(dto.name !== undefined && dto.name.trim() !== g.name ? { previousName: g.name } : {}) },
    });
    return updated;
  }

  /**
   * Archive a group. Its clients are un-filed — moved to ungrouped — in the same transaction, so
   * no client can be left pointing at a group nobody can see or choose.
   */
  async archive(id: string) {
    const me = await this.actor();
    const g = await this.find(me.organizationId, id);
    if (g.archivedAt) return { ...g, movedClients: 0 };
    const [moved, archived] = await this.prisma.$transaction(async tx => {
      const clients = await tx.project.findMany({ where: { clientGroupId: id }, select: { id: true, code: true, title: true } });
      const un = await tx.project.updateMany({ where: { clientGroupId: id }, data: { clientGroupId: null } });
      const done = await tx.clientGroup.update({ where: { id }, data: { archivedAt: new Date() } });
      // Each client's move to "ungrouped" is a change to that client, and the CID ledger keeps it.
      for (const c of clients) {
        if (!c.code) continue;
        await this.cid.recordInTx(tx, {
          organizationId: me.organizationId, cid: c.code, projectId: c.id, clientTitle: c.title,
          type: 'CLIENT_GROUP_CHANGED',
          metadata: { fromGroupId: id, fromGroup: g.name, toGroupId: null, toGroup: null, reason: 'the group was archived' },
        });
      }
      return [un, done] as const;
    });
    await this.events.emit({
      action: EVENTS.CLIENT_GROUP_ARCHIVED, entityType: 'CLIENT_GROUP', entityId: id,
      organizationId: me.organizationId, metadata: { name: g.name, movedClients: moved.count },
    });
    return { ...archived, movedClients: moved.count };
  }

  /** Bring an archived group back — empty; the clients it held stay where they now are. */
  async restore(id: string) {
    const me = await this.actor();
    const g = await this.find(me.organizationId, id);
    if (!g.archivedAt) return g;
    await this.assertNameFree(me.organizationId, g.name, id);
    let restored;
    try {
      restored = await this.prisma.clientGroup.update({ where: { id }, data: { archivedAt: null } });
    } catch (e) { this.duplicate(e, g.name); }
    await this.events.emit({
      action: EVENTS.CLIENT_GROUP_UPDATED, entityType: 'CLIENT_GROUP', entityId: id,
      organizationId: me.organizationId, metadata: { name: g.name, restored: true },
    });
    return restored;
  }
}

@Controller('client-groups')
class ClientGroupsController {
  constructor(private readonly service: ClientGroupsService) {}

  // Anyone who can see clients can see what shelves they are filed on.
  @Get() @RequirePermission('project.view')
  list(@Query('includeArchived') includeArchived?: string) {
    return this.service.list(includeArchived === 'true');
  }

  // Arranging the shelves is a delivery lead's job — the same people who may run a client.
  @Post() @RequirePermission('project.approve')
  create(@Body() dto: CreateClientGroupDto) {
    return this.service.create(dto);
  }

  @Patch(':id') @RequirePermission('project.approve')
  update(@Param('id') id: string, @Body() dto: UpdateClientGroupDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/archive') @RequirePermission('project.approve')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }

  @Post(':id/restore') @RequirePermission('project.approve')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }
}

@Module({
  controllers: [ClientGroupsController],
  providers: [ClientGroupsService],
  exports: [ClientGroupsService],
})
export class ClientGroupsModule {}
