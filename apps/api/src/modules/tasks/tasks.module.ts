import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskTimeService } from './task-time.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskTimeService],
  exports: [TasksService, TaskTimeService],
})
export class TasksModule {}
