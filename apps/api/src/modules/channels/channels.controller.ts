import { Body, Controller, Delete, Get, Param, Post, Patch, Query } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, UpdateChannelDto, CreateMessageDto } from './dto';

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
    return this.channels.listMessages(id, limit ? parseInt(limit) : 50);
  }

  @Post(':id/messages')
  createMessage(@Param('id') channelId: string, @Body() dto: CreateMessageDto) {
    return this.channels.createMessage(channelId, dto);
  }

  @Delete(':channelId/messages/:messageId')
  deleteMessage(@Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.channels.deleteMessage(channelId, messageId);
  }

  @Post(':id/join')
  join(@Param('id') channelId: string, @Body('userId') userId: string) {
    return this.channels.joinChannel(channelId, userId);
  }
}
