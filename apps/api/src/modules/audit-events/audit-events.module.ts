import { Global, Module } from '@nestjs/common';
import { EventService } from './event.service';

/**
 * Global event spine. Exports EventService so any module can emit audit /
 * activity / analytics events without importing this module explicitly.
 */
@Global()
@Module({
  providers: [EventService],
  exports: [EventService],
})
export class AuditEventsModule {}
