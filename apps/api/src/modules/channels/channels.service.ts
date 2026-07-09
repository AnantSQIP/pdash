import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChannelDto, UpdateChannelDto, CreateMessageDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true };

/**
 * Discussions are PRIVATE and MEMBER-GATED. Access is governed purely by channel
 * membership — NOT by any permission. This is deliberate: because there is no
 * permission short-circuit here, even a Super Admin cannot read or post in a
 * discussion they were not added to. The CREATOR owns the channel and is the only
 * one who can add/remove members, rename, or delete it.
 */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private actor(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  /** Verify the channel exists and the actor is a member; otherwise 404/403. No admin bypass. */
  private async assertMember(channelId: string): Promise<{ channel: { id: string; createdBy: string }; actorId: string }> {
    const actorId = this.actor();
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, deletedAt: null }, select: { id: true, createdBy: true } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    const member = await this.prisma.channelMember.findUnique({ where: { channelId_userId: { channelId, userId: actorId } } });
    if (!member) throw new ForbiddenException('You are not a member of this discussion.');
    return { channel, actorId };
  }

  /** Verify the actor is the channel owner (creator); otherwise 404/403. */
  private async assertOwner(channelId: string): Promise<{ channel: { id: string; createdBy: string }; actorId: string }> {
    const actorId = this.actor();
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, deletedAt: null }, select: { id: true, createdBy: true } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    if (channel.createdBy !== actorId) throw new ForbiddenException('Only the discussion owner can do this.');
    return { channel, actorId };
  }

  /** Only the discussions the actor has been added to. */
  listChannels(organizationId: string) {
    const actorId = this.actor();
    return this.prisma.channel.findMany({
      where: { organizationId, deletedAt: null, members: { some: { userId: actorId } } },
      include: {
        _count: { select: { messages: true, members: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { user: { select: USER_SELECT } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getChannel(id: string) {
    await this.assertMember(id);
    return this.prisma.channel.findFirst({
      where: { id, deletedAt: null },
      include: { members: { include: { user: { select: USER_SELECT } } }, _count: { select: { messages: true } } },
    });
  }

  async createChannel(dto: CreateChannelDto) {
    const actorId = this.actor();
    // Owner = creator. Members = creator + everyone explicitly invited.
    const memberIds = [...new Set([actorId, ...(dto.memberIds ?? [])])];
    const channel = await this.prisma.channel.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        description: dto.description,
        type: 'PRIVATE',
        createdBy: actorId,
        members: { create: memberIds.map(userId => ({ userId })) },
      },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        _count: { select: { messages: true, members: true } },
      },
    });
    // Tell the invited people they were added (the creator is excluded automatically).
    await this.notifications.notify(dto.memberIds ?? [], {
      type: 'discussion.added', title: 'Added to a discussion',
      message: `You were added to the discussion "${channel.name}".`,
    });
    return channel;
  }

  async updateChannel(id: string, dto: UpdateChannelDto) {
    await this.assertOwner(id);
    return this.prisma.channel.update({ where: { id }, data: dto });
  }

  async deleteChannel(id: string) {
    await this.assertOwner(id);
    return this.prisma.channel.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listMessages(channelId: string, limit = 50) {
    await this.assertMember(channelId);
    // Fetch the LATEST `limit` messages (newest-first), then reverse so the client
    // renders oldest→newest. Ordering asc + take returned the OLDEST 50, so past 50
    // messages a channel never showed anything new.
    const rows = await this.prisma.message.findMany({
      where: { channelId },
      include: { user: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  async createMessage(channelId: string, dto: CreateMessageDto) {
    // Posting requires membership — there is NO auto-join (that would defeat privacy).
    const { actorId } = await this.assertMember(channelId);
    return this.prisma.message.create({
      data: { channelId, userId: actorId, content: dto.content },
      include: { user: { select: USER_SELECT } },
    });
  }

  async deleteMessage(channelId: string, messageId: string) {
    await this.assertMember(channelId);
    const actorId = this.actor();
    const msg = await this.prisma.message.findFirst({ where: { id: messageId, channelId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.userId !== actorId) throw new ForbiddenException('You can only delete your own messages.');
    return this.prisma.message.delete({ where: { id: msg.id } });
  }

  // ── Member management (owner-only) ──────────────────────────────────────────
  async getMembers(channelId: string) {
    const { channel } = await this.assertMember(channelId);
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: { select: USER_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });
    return { ownerId: channel.createdBy, members };
  }

  async addMembers(channelId: string, userIds: string[]) {
    const { channel } = await this.assertOwner(channelId);
    const data = [...new Set(userIds.filter(Boolean))].map(userId => ({ channelId, userId }));
    if (data.length) {
      await this.prisma.channelMember.createMany({ data, skipDuplicates: true });
      const ch = await this.prisma.channel.findUnique({ where: { id: channel.id }, select: { name: true } });
      await this.notifications.notify(data.map(d => d.userId), {
        type: 'discussion.added', title: 'Added to a discussion',
        message: `You were added to the discussion "${ch?.name ?? ''}".`,
      });
    }
    return { ok: true, count: data.length };
  }

  async removeMember(channelId: string, userId: string) {
    const { channel } = await this.assertOwner(channelId);
    if (userId === channel.createdBy) throw new ForbiddenException('The owner cannot be removed from their own discussion.');
    await this.prisma.channelMember.deleteMany({ where: { channelId, userId } });
    return { ok: true };
  }
}
