import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TaskListsModule } from './modules/tasklists/tasklists.module';
import { MilestonesModule } from './modules/milestones/milestones.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { StatusesModule } from './modules/statuses/statuses.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    // Core project management
    ProjectsModule,
    TaskListsModule,
    MilestonesModule,
    TasksModule,
    // Workflow engine
    WorkflowsModule,
    StatusesModule,
    // Generic/polymorphic
    CommentsModule,
    ApprovalsModule,
    // People & org
    UsersModule,
    DepartmentsModule,
  ],
})
export class AppModule {}
