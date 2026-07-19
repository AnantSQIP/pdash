import {
  Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Put,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getActorId } from '../../common/context/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────
class TagNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

class TagMembersDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  userIds!: string[];
}

/**
 * Named, @mentionable groups of people (e.g. "@attorneys"). Tags are org-scoped and
 * managed by an admin (user.manage_access); any authenticated user can LIST them so
 * the Discuss composer can offer them for autocomplete. A tag mention only ever
 * notifies members who are also in the channel (resolved in ChannelsService).
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService, private readonly actor: ActorContextService) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  // Tag names may not collide with the reserved group-mention keywords.
  private normalizeName(name: string): string {
    const n = name.trim().replace(/^@+/, '');
    if (!n) throw new ForbiddenException('A tag needs a name.');
    if (/^(channel|everyone)$/i.test(n)) throw new ForbiddenException('"channel" and "everyone" are reserved.');
    if (/\s/.test(n)) throw new ForbiddenException('Tag names cannot contain spaces.');
    return n;
  }

  async list() {
    const organizationId = await this.actor.requireOrgId();
    const tags = await this.prisma.mentionTag.findMany({
      where: { organizationId },
      include: { members: { select: { userId: true } } },
      orderBy: { name: 'asc' },
    });
    return tags.map(t => ({ id: t.id, name: t.name, memberIds: t.members.map(m => m.userId), memberCount: t.members.length }));
  }

  async create(name: string) {
    const organizationId = await this.actor.requireOrgId();
    const clean = this.normalizeName(name);
    const exists = await this.prisma.mentionTag.findFirst({ where: { organizationId, name: clean } });
    if (exists) throw new ForbiddenException(`A tag "@${clean}" already exists.`);
    return this.prisma.mentionTag.create({ data: { organizationId, name: clean, createdBy: this.actorId() } });
  }

  private async ownTag(id: string) {
    const organizationId = await this.actor.requireOrgId();
    const tag = await this.prisma.mentionTag.findFirst({ where: { id, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  async rename(id: string, name: string) {
    await this.ownTag(id);
    const clean = this.normalizeName(name);
    return this.prisma.mentionTag.update({ where: { id }, data: { name: clean } });
  }

  async remove(id: string) {
    await this.ownTag(id);
    await this.prisma.mentionTag.delete({ where: { id } });
    return { ok: true };
  }

  async setMembers(id: string, userIds: string[]) {
    const tag = await this.ownTag(id);
    const organizationId = tag.organizationId;
    // Only real, active users of this org may be tag members.
    const valid = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] }, organizationId }, select: { id: true },
    });
    const ids = valid.map(u => u.id);
    await this.prisma.$transaction([
      this.prisma.mentionTagMember.deleteMany({ where: { tagId: id } }),
      this.prisma.mentionTagMember.createMany({ data: ids.map(userId => ({ tagId: id, userId })), skipDuplicates: true }),
    ]);
    return { ok: true, count: ids.length };
  }
}

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  // Listing is open to any authenticated user (needed for @mention autocomplete).
  @Get()
  list() {
    return this.tags.list();
  }

  @Post() @RequirePermission('user.manage_access')
  create(@Body() dto: TagNameDto) {
    return this.tags.create(dto.name);
  }

  @Patch(':id') @RequirePermission('user.manage_access')
  rename(@Param('id') id: string, @Body() dto: TagNameDto) {
    return this.tags.rename(id, dto.name);
  }

  @Delete(':id') @RequirePermission('user.manage_access')
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }

  @Put(':id/members') @RequirePermission('user.manage_access')
  setMembers(@Param('id') id: string, @Body() dto: TagMembersDto) {
    return this.tags.setMembers(id, dto.userIds);
  }
}

@Module({
  controllers: [TagsController],
  providers: [TagsService],
})
export class TagsModule {}
