import { Body, Controller, Delete, Get, Param, Post, Patch, Put, Query } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, UpdateChannelDto, CreateMessageDto, SetChannelMembersDto } from './dto';

// Discussions are PRIVATE + member-gated. Authorization is enforced in the service by
// CHANNEL MEMBERSHIP / OWNERSHIP — not by RBAC permissions — so a Super Admin who was
// not invited cannot read or post here. Any authenticated user may create a discussion.
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  listChannels(@Query('organizationId') organizationId: string) {
    return this.channels.listChannels(organizationId);
  }

  @Get(':id')
  getChannel(@Param('id') id: string) {
    return this.channels.getChannel(id);
  }

  @Post()
  createChannel(@Body() dto: CreateChannelDto) {
    return this.channels.createChannel(dto);
  }

  @Patch(':id')
  updateChannel(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.channels.updateChannel(id, dto);
  }

  @Delete(':id')
  deleteChannel(@Param('id') id: string) {
    return this.channels.deleteChannel(id);
  }

  @Get(':id/messages')
  listMessages(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.channels.listMessages(id, limit ? parseInt(limit, 10) : 50);
  }

  @Post(':id/messages')
  createMessage(@Param('id') channelId: string, @Body() dto: CreateMessageDto) {
    return this.channels.createMessage(channelId, dto);
  }

  @Delete(':channelId/messages/:messageId')
  deleteMessage(@Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.channels.deleteMessage(channelId, messageId);
  }

  // ── Member management (owner-only, enforced in the service) ──────────────────
  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.channels.getMembers(id);
  }

  @Put(':id/members')
  addMembers(@Param('id') id: string, @Body() dto: SetChannelMembersDto) {
    return this.channels.addMembers(id, dto.userIds);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.channels.removeMember(id, userId);
  }
}
