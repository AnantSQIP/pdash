import { Module } from '@nestjs/common';
import { AdminDataController, ProjectPurgeController, TaskPurgeController } from './admin-data.controller';
import { PurgeService } from './purge.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  // TasksModule for TaskTimeService: a purge has to withdraw the task's hours from the learned
  // standards before the rows go, and that service is the only thing that knows how.
  imports: [TasksModule],
  controllers: [AdminDataController, ProjectPurgeController, TaskPurgeController],
  providers: [PurgeService],
  exports: [PurgeService],
})
export class AdminDataModule {}
