import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ClientsProjectsService } from './projects.clients.service';

/**
 * Projects (PROJECTS flow, ProjectsService) and clients (CLIENTS flow, ClientsProjectsService) —
 * one controller dispatching on the organisation's workspace flow. See projects.controller.ts.
 */
@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ClientsProjectsService],
  exports: [ProjectsService, ClientsProjectsService],
})
export class ProjectsModule {}
