import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PidRequestMonitorService } from './pid-request-monitor.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, PidRequestMonitorService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
