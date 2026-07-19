import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService, MeetingReminderService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, MeetingReminderService],
})
export class EventsModule {}
