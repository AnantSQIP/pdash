import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChannelDto, UpdateChannelDto, CreateMessageDto } from './dto';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true };

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  listChannels(organizationId: string) {
    return this.prisma.channel.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        _count: { select: { messages: true, members: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { user: { select: USER_SELECT } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getChannel(id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        _count: { select: { messages: true } },
      },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    return channel;
  }

  async createChannel(dto: CreateChannelDto) {
    return this.prisma.channel.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        description: dto.description,
        type: dto.type ?? 'PUBLIC',
        createdBy: dto.createdBy,
        members: { create: { userId: dto.createdBy } },
      },
      include: { _count: { select: { messages: true, members: true } } },
    });
  }

  async updateChannel(id: string, dto: UpdateChannelDto) {
    await this.getChannel(id);
    return this.prisma.channel.update({ where: { id }, data: dto });
  }

  async deleteChannel(id: string) {
    await this.getChannel(id);
    return this.prisma.channel.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  listMessages(channelId: string, limit = 50) {
    return this.prisma.message.findMany({
      where: { channelId },
      include: { user: { select: USER_SELECT } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async createMessage(channelId: string, dto: CreateMessageDto) {
    const channel = await this.getChannel(channelId);
    const msg = await this.prisma.message.create({
      data: { channelId: channel.id, userId: dto.userId, content: dto.content },
      include: { user: { select: USER_SELECT } },
    });
    // Auto-join sender as member
    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: dto.userId } },
      update: {},
      create: { channelId, userId: dto.userId },
    });
    return msg;
  }

  async deleteMessage(channelId: string, messageId: string) {
    return this.prisma.message.deleteMany({ where: { id: messageId, channelId } });
  }

  async joinChannel(channelId: string, userId: string) {
    return this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      update: {},
      create: { channelId, userId },
    });
  }
}
