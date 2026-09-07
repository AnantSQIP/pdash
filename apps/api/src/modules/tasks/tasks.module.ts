import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskTimeService } from './task-time.service';
import { TimesheetsModule } from '../timesheets/timesheets.module';

@Module({
  // TimesheetsModule imports nothing, so this cannot cycle. The timing service needs it because
  // Task.actualHours has exactly one writer — the timesheet sum — and closing a task must feed
  // that ledger rather than keep a rival figure of its own.
  imports: [TimesheetsModule],
  controllers: [TasksController],
  providers: [TasksService, TaskTimeService],
  exports: [TasksService, TaskTimeService],
})
export class TasksModule {}
