import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService, ChannelRetentionService } from './channels.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelRetentionService],
})
export class ChannelsModule {}
